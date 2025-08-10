/* ===== 成本與滑價參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const CFG = { feeBothSides:true, taxOnExitOnly:true, slipMode:'total' };
const ENTRY = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉'];
const EXIT_S = ['平買','強制平倉'];

/* ===== UI ===== */
const filesInput = document.getElementById('filesInput');
const btnClear   = document.getElementById('btn-clear');
const tbl        = document.getElementById('tblBatch');
const thead      = tbl.querySelector('thead');
const tbody      = tbl.querySelector('tbody');
const cvs        = document.getElementById('equityChart');
const loadStat   = document.getElementById('loadStat');
const tradesBody = document.getElementById('tradesBody');
const kpiGrid    = document.getElementById('kpiGrid');

let chart;

/* ===== KPI 欄位定義 ===== */
const KPI_ORDER = [
  ['交易數','n'], ['勝率','winRate'], ['敗率','lossRate'],
  ['正點數','posPts'], ['負點數','negPts'], ['總點數','sumPts'],
  ['累積獲利','sumGain'], ['滑價累計獲利','sumGainSlip'],
  ['單日最大獲利','maxDay'], ['單日最大虧損','minDay'],
  ['區間最大獲利','maxRunUp'], ['區間最大回撤','maxDrawdown'],
  ['Profit Factor','pf'], ['平均獲利','avgW'], ['平均虧損','avgL'],
  ['盈虧比','rr'], ['期望值(每筆)','expectancy'],
  ['最大連勝','maxWinStreak'], ['最大連敗','maxLossStreak']
];
const GROUPS = ['全部','多單','空單'];

/* ===== 狀態（排序/畫圖/檔案參考） ===== */
let rowsData = []; // { filename, shortName, paramsText, fileRef, kpi, sortCache, equitySeq?, tsSeq?, trades? }

/* ===== 事件：選檔（逐檔 await） ===== */
filesInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  buildHeader();
  rowsData = [];
  tbody.innerHTML = '';
  updateLoadStat(0, files.length, 0);

  let failed = 0;
  let firstDrawn = false;

  for (const [idx, f] of files.entries()) {
    try {
      const { shortName, paramsText } = parseFilename(f.name);
      const needFull = !firstDrawn;
      const text = await readFileWithFallback(f);
      const { kpi, equitySeq, tsSeq, trades } = analyse(text, { needFull });

      rowsData.push({
        filename: f.name, shortName, paramsText, fileRef: f,
        kpi, sortCache: buildSortCache(kpi),
        equitySeq: needFull ? equitySeq : null,
        tsSeq:     needFull ? tsSeq     : null,
        trades:    needFull ? trades    : null
      });

      appendRow(shortName, paramsText, kpi);

      if (needFull && tsSeq && tsSeq.length && equitySeq?.tot?.length) {
        drawChart(tsSeq, equitySeq.tot, equitySeq.lon, equitySeq.sho, equitySeq.sli);
        renderTrades(trades);
        renderTopKPI(kpi);
        firstDrawn = true;
      }
    } catch (err) {
      console.error('解析失敗：', f.name, err);
      const { shortName, paramsText } = parseFilename(f.name);
      rowsData.push({ filename: f.name, shortName, paramsText, fileRef: f, kpi: null, sortCache: null });
      appendErrorRow(shortName, paramsText, err);
      failed++;
    } finally {
      updateLoadStat(idx+1, files.length, failed);
    }
  }
});

btnClear.addEventListener('click', () => {
  filesInput.value = '';
  thead.innerHTML = '';
  tbody.innerHTML = '';
  rowsData = [];
  updateLoadStat(0,0,0);
  if (chart) chart.destroy();
  tradesBody.innerHTML = `<tr><td colspan="11" style="color:#777">尚未載入</td></tr>`;
  kpiGrid.innerHTML = '';
});

/* ===== 讀檔（big5→utf-8 回退） ===== */
function readFileWithFallback(file) {
  const read = (enc) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  return (async () => { try { return await read('big5'); } catch { return await read(); } })();
}

/* ===== 檔名解析：短檔名 + 參數列 ===== */
function parseFilename(name='') {
  const base = name.replace(/\.[^.]+$/, ''); // 去副檔名
  const parts = base.split('_').filter(Boolean);
  const short = parts.slice(0,3).join('_') || base;         // 取前三段：日期_時間_策略縮碼
  const params = parts.slice(3).join(' / ') || '—';         // 其餘段落當參數列
  return { shortName: short, paramsText: params };
}

/* ===== 解析：可選擇只算 KPI 或完整（序列 + 交易） ===== */
function analyse(raw, opts={ needFull:false }) {
  const rows = (raw || '').trim().split(/\r?\n/).filter(Boolean);
  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (const r of rows) {
    const parts = r.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [tsRaw, pStr, act] = parts;
    const price = +pStr;
    if (!Number.isFinite(price)) continue;

    if (ENTRY.includes(act)) { q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw }); continue; }

    const qi = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (qi === -1) continue;

    const pos = q.splice(qi, 1)[0];
    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;

    const fee = (CFG.feeBothSides ? FEE * 2 : FEE);
    const tax = TAX ? (CFG.taxOnExitOnly ? Math.round(price * MULT * TAX) : Math.round((pos.pIn + price) * MULT * TAX)) : 0;

    const gain = pts * MULT - fee - tax;
    const slipMoney = (CFG.slipMode === 'half-per-fill') ? (SLIP * MULT * 2) : (SLIP * MULT);
    const gainSlip  = gain - slipMoney;

    const t = { pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip, fee, tax };
    tr.push(t);

    cum += gain; cumSlip += gainSlip;
    (pos.side === 'L') ? (cumL += gain) : (cumS += gain);

    if (opts.needFull) {
      tsArr.push(tsRaw);
      tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
    }
  }

  const kpi = buildKPI(tr, { tot, lon, sho, sli });
  const equitySeq = opts.needFull ? { tot, lon, sho, sli } : null;
  const tsSeq = opts.needFull ? tsArr : null;
  const trades = opts.needFull ? tr : null;
  return { kpi, equitySeq, tsSeq, trades };
}

/* ===== KPI ===== */
function buildKPI(tr, seq) {
  const sum = a => a.reduce((x,y)=>x+y,0);
  const pct = x => (x*100).toFixed(1)+'%';
  const safeMax = a => a.length ? Math.max(...a) : 0;
  const safeMin = a => a.length ? Math.min(...a) : 0;

  const byDay = list => { const m={}; for (const t of list){ const d=(t.tsOut||'').slice(0,8); m[d]=(m[d]||0)+(t.gain||0);} return Object.values(m); };
  const runUp = s => { if(!s.length) return 0; let m=s[0], up=0; for(const v of s){ m=Math.min(m,v); up=Math.max(up,v-m);} return up; };
  const drawDn= s => { if(!s.length) return 0; let p=s[0], dn=0; for(const v of s){ p=Math.max(p,v); dn=Math.min(dn,v-p);} return dn; };
  const streaks = list => { let cw=0,cl=0,mw=0,ml=0; for(const t of list){ if(t.gain>0){cw++;cl=0;mw=Math.max(mw,cw);} else if(t.gain<0){cl++;cw=0;ml=Math.max(ml,cl);} } return {mw,ml}; };

  const longs  = tr.filter(t => t.pos?.side==='L');
  const shorts = tr.filter(t => t.pos?.side==='S');

  const make = (list, seq) => {
    if (!list.length) return emptyStats();
    const sumN = a => a.reduce((x,y)=>x+y,0);
    const win = list.filter(t=>t.gain>0), loss = list.filter(t=>t.gain<0);
    const winAmt = sumN(win.map(t=>t.gain)), lossAmt = -sumN(loss.map(t=>t.gain));
    const pf = lossAmt===0 ? (winAmt>0?'∞':'—') : (winAmt/lossAmt).toFixed(2);
    const avgW = win.length?winAmt/win.length:0;
    const avgL = loss.length?-(lossAmt/loss.length):0;
    const rr   = avgL===0 ? '—' : Math.abs(avgW/avgL).toFixed(2);
    const exp  = (win.length+loss.length)?(winAmt-lossAmt)/(win.length+loss.length):0;
    const {mw,ml} = streaks(list);
    return {
      n:list.length, winRate:pct(win.length/list.length), lossRate:pct(loss.length/list.length),
      posPts:sumN(win.map(t=>t.pts)), negPts:sumN(loss.map(t=>t.pts)), sumPts:sumN(list.map(t=>t.pts)),
      sumGain:sumN(list.map(t=>t.gain)), sumGainSlip:sumN(list.map(t=>t.gainSlip)),
      maxDay:safeMax(byDay(list)), minDay:safeMin(byDay(list)),
      maxRunUp:runUp(seq?.tot||[]), maxDrawdown:drawDn(seq?.tot||[]),
      pf, avgW, avgL, rr, expectancy:exp, maxWinStreak:mw, maxLossStreak:ml
    };
  };

  return { 全部:make(tr,seq), 多單:make(longs, {tot:seq?.lon}), 空單:make(shorts, {tot:seq?.sho}) };
}
function emptyStats(){
  return { n:0, winRate:'0.0%', lossRate:'0.0%',
    posPts:0, negPts:0, sumPts:0, sumGain:0, sumGainSlip:0,
    maxDay:0, minDay:0, maxRunUp:0, maxDrawdown:0,
    pf:'—', avgW:0, avgL:0, rr:'—', expectancy:0, maxWinStreak:0, maxLossStreak:0 };
}

/* ===== 表頭（可排序；含短檔名/參數） ===== */
function buildHeader(){
  const cells = [
    '<th class="nowrap sortable" data-key="__filename">短檔名</th>',
    '<th class="nowrap sortable" data-key="__params">參數</th>'
  ];
  for (const g of GROUPS) for (const [label, key] of KPI_ORDER)
    cells.push(`<th class="nowrap sortable" data-key="${g}.${key}">${g}-${label}</th>`);
  thead.innerHTML = `<tr>${cells.join('')}</tr>`;

  // 排序事件：排序後即時切換到第一列資料（圖 + 交易表 + KPI）
  let currentKey = null, currentDir = 'asc';
  thead.querySelectorAll('th.sortable').forEach(th=>{
    th.addEventListener('click', async ()=>{
      const key = th.dataset.key;
      if (currentKey === key) currentDir = (currentDir==='asc' ? 'desc' : 'asc');
      else { currentKey = key; currentDir = 'asc'; }
      thead.querySelectorAll('th.sortable').forEach(h=>h.classList.remove('asc','desc'));
      th.classList.add(currentDir);
      sortRows(currentKey, currentDir);
      await redrawFromTopRow();
    });
  });
}

/* ===== 排序 ===== */
function buildSortCache(kpi){
  const flat = {};
  for (const g of GROUPS) for (const [,key] of KPI_ORDER)
    flat[`${g}.${key}`] = parseForSort(kpi?.[g]?.[key]);
  return flat;
}
function parseForSort(v){
  if (v===null || v===undefined) return -Infinity;
  if (typeof v === 'number') return v;
  if (typeof v === 'string'){
    if (v.endsWith?.('%')) return parseFloat(v);
    if (v === '—' || v === '∞') return v === '∞' ? Number.POSITIVE_INFINITY : -Infinity;
    return parseFloat(v.replaceAll?.(',','') ?? v);
  }
  return +v || 0;
}
function sortRows(key, dir){
  const factor = dir==='asc' ? 1 : -1;
  rowsData.sort((a,b)=>{
    if (key === '__filename'){
      const av=a.shortName.toLowerCase(), bv=b.shortName.toLowerCase();
      return (av<bv?-1:av>bv?1:0)*factor;
    }
    if (key === '__params'){
      const av=a.paramsText.toLowerCase(), bv=b.paramsText.toLowerCase();
      return (av<bv?-1:av>bv?1:0)*factor;
    }
    const av = a.sortCache?.[key] ?? -Infinity;
    const bv = b.sortCache?.[key] ?? -Infinity;
    return (av - bv) * factor || a.shortName.localeCompare(b.shortName)*factor;
  });
  tbody.innerHTML = '';
  for (const r of rowsData) r.kpi ? appendRow(r.shortName, r.paramsText, r.kpi) : appendErrorRow(r.shortName, r.paramsText, new Error('解析失敗'));
}

/* ===== 依第一列重畫（若未載入過，動態讀檔解析） ===== */
async function redrawFromTopRow(){
  const first = rowsData.find(r => r.kpi); // 第一個成功的
  if (!first) {
    if (chart) chart.destroy();
    tradesBody.innerHTML = `<tr><td colspan="11" style="color:#777">沒有可用資料</td></tr>`;
    kpiGrid.innerHTML = '';
    return;
  }
  if (!first.tsSeq || !first.equitySeq || !first.trades) {
    try {
      const text = await readFileWithFallback(first.fileRef);
      const { equitySeq, tsSeq, trades } = analyse(text, { needFull:true });
      first.equitySeq = equitySeq; first.tsSeq = tsSeq; first.trades = trades;
    } catch (err) {
      console.error('重算第一列失敗：', first.filename, err);
      return;
    }
  }
  const { tsSeq, equitySeq:{tot,lon,sho,sli}, trades } = first;
  drawChart(tsSeq, tot, lon, sho, sli);
  renderTrades(trades);
  renderTopKPI(first.kpi);
}

/* ===== 渲染下方表 ===== */
function appendRow(shortName, paramsText, kpi){
  const tds = [
    `<td class="nowrap" title="${escapeHTML(shortName)}">${escapeHTML(shortName)}</td>`,
    `<td class="nowrap" title="${escapeHTML(paramsText)}">${escapeHTML(paramsText)}</td>`
  ];
  for (const g of GROUPS) {
    const obj = kpi[g] || {};
    for (const [, key] of KPI_ORDER) tds.push(`<td>${fmt(obj[key])}</td>`);
  }
  tbody.insertAdjacentHTML('beforeend', `<tr>${tds.join('')}</tr>`);
}
function appendErrorRow(shortName, paramsText, err){
  const colSpan = 2 + GROUPS.length * KPI_ORDER.length;
  const row = `<tr><td class="nowrap">${escapeHTML(shortName)}</td><td class="nowrap">${escapeHTML(paramsText)}</td><td colspan="${colSpan-2}" style="color:#c00;text-align:left">讀取/解析失敗：${escapeHTML(err?.message||'未知錯誤')}</td></tr>`;
  tbody.insertAdjacentHTML('beforeend', row);
}

/* ===== 上方：圖表 + 交易明細 + KPI ===== */
function drawChart(tsArr, T, L, S, P){
  try{
    if (chart) chart.destroy();
    if (!tsArr?.length) return;

    const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
    const addM = (d,n)=> new Date(d.getFullYear(), d.getMonth()+n);
    const start = addM(ym2Date(tsArr[0].slice(0,6)), -1);
    const months=[]; for(let d=start; months.length<26; d=addM(d,1)) months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
    const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);
    const daysInMonth=(y,m)=> new Date(y,m,0).getDate();
    const X = tsArr.map(ts=>{
      const y=+ts.slice(0,4), m=+ts.slice(4,6), d=+ts.slice(6,8), hh=+ts.slice(8,10), mm=+ts.slice(10,12);
      return mIdx[ts.slice(0,6)] + (d-1 + (hh+mm/60)/24) / daysInMonth(y,m);
    });

    const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,pointRadius:0});

    chart = new Chart(cvs, {
      type:'line',
      data:{ labels:X, datasets:[ mkLine(T,'#fbc02d'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121') ] },
      options:{
        responsive:true, maintainAspectRatio:false,
        layout:{padding:{bottom:42,right:60}},
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}} },
        scales:{ x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
                 y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}} }
      }
    });
  }catch(err){
    console.error('畫圖發生錯誤：', err);
  }
}

function renderTrades(trades){
  if (!trades?.length) {
    tradesBody.innerHTML = `<tr><td colspan="11" style="color:#777">此檔沒有成功配對的交易</td></tr>`;
    return;
  }
  const rows = trades.map((t, i) => {
    const side = t.pos.side === 'L' ? '多' : '空';
    return `
    <tr>
      <td>${i+1}</td>
      <td>${fmtTs(t.pos.tsIn)}</td>
      <td>${fmt(t.pos.pIn)}</td>
      <td>${side}</td>
      <td>${fmtTs(t.tsOut)}</td>
      <td>${fmt(t.priceOut)}</td>
      <td>${fmt(t.pts)}</td>
      <td>${fmt(t.fee)}</td>
      <td>${fmt(t.tax)}</td>
      <td>${fmt(t.gain)}</td>
      <td>${fmt(t.gainSlip)}</td>
    </tr>`;
  }).join('');
  tradesBody.innerHTML = rows;
}

function renderTopKPI(kpi){
  if (!kpi) { kpiGrid.innerHTML=''; return; }
  const groups = ['全部','多單','空單'];
  const html = groups.map(g=>{
    const obj = kpi[g] || {};
    const items = KPI_ORDER.map(([label,key]) => `
      <div class="kpi-item"><span class="kpi-key">${label}</span>：<span class="kpi-val">${fmt(obj[key])}</span></div>
    `).join('');
    return `<div class="kpi-card"><h3>${g}</h3>${items}</div>`;
  }).join('');
  kpiGrid.innerHTML = html;
}

/* ===== 小工具 ===== */
function updateLoadStat(done, total, failed){
  if (!total) { loadStat.textContent = ''; return; }
  loadStat.textContent = `載入：${done}/${total}，成功：${done - failed}，失敗：${failed}`;
}
const fmt = n => (typeof n==='number' && isFinite(n)) ? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : (n ?? '—');
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function escapeHTML(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
