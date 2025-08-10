/* ===== 成本與滑價參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const CFG = { feeBothSides:true, taxOnExitOnly:true, slipMode:'total' };
const ENTRY = ['新買','新賣'], EXIT_L = ['平賣','強制平倉'], EXIT_S = ['平買','強制平倉'];

/* ===== UI ===== */
const filesInput = document.getElementById('filesInput');
const btnClear   = document.getElementById('btn-clear');
const tbl        = document.getElementById('tblBatch');
const thead      = tbl.querySelector('thead');
const tbody      = tbl.querySelector('tbody');
const cvs        = document.getElementById('equityChart');
const loadStat   = document.getElementById('loadStat');
const tradesBody = document.getElementById('tradesBody');
const kpiBlocks  = document.getElementById('kpiBlocks');
const paramBar   = document.getElementById('paramBar');
const pName      = document.getElementById('pName');
const pParams    = document.getElementById('pParams');

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

/* ===== 預宣告（避免未定義錯誤） ===== */
function renderTopKPI(kpi){
  if (!kpi) { kpiBlocks.innerHTML=''; return; }
  const html = ['全部','多單','空單'].map(g=>{
    const obj = kpi[g] || {};
    const line = KPI_ORDER.map(([label,key]) => `
      <span class="kpi-item"><span class="kpi-key">${label}</span>：<span class="kpi-val">${fmt(obj[key])}</span></span>
    `).join('');
    return `<div class="kpi-block"><div class="kpi-title">${g}</div><div class="kpi-line">${line}</div></div>`;
  }).join('');
  kpiBlocks.innerHTML = html;
}
function renderParamBar(shortName, paramsText){
  pName.textContent   = shortName || '—';
  pParams.textContent = paramsText || '—';
  paramBar.hidden = false;
}

/* ===== 狀態 ===== */
let rowsData = []; // { filename, shortName, paramsText, fileRef, kpi, sortCache, equitySeq?, tsSeq?, trades? }

/* ===== 事件：選檔 ===== */
filesInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  buildHeader();
  rowsData = [];
  tbody.innerHTML = '';
  updateLoadStat(0, files.length, 0);
  let failed = 0, firstDrawn = false;

  for (const [idx, f] of files.entries()) {
    try {
      const text = await readFileWithFallback(f);
      const needFull = !firstDrawn;
      const { kpi, equitySeq, tsSeq, trades, shortName, paramsText } = analyse(text, { needFull, filename: f.name });

      rowsData.push({
        filename: f.name, shortName, paramsText, fileRef: f,
        kpi, sortCache: buildSortCache(kpi),
        equitySeq: needFull ? equitySeq : null,
        tsSeq:     needFull ? tsSeq     : null,
        trades:    needFull ? trades    : null
      });

      appendRow(shortName, paramsText, kpi);

      if (needFull && tsSeq?.length && equitySeq?.tot?.length) {
        drawChart(tsSeq, equitySeq.tot, equitySeq.lon, equitySeq.sho, equitySeq.sli);
        renderTrades(trades);
        renderTopKPI(kpi);
        renderParamBar(shortName, paramsText);
        firstDrawn = true;
      }
    } catch (err) {
      console.error('解析失敗：', f.name, err);
      failed++; // 不插錯誤列
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
  tradesBody.innerHTML = `<tr><td colspan="13" style="color:#777">尚未載入</td></tr>`;
  kpiBlocks.innerHTML = '';
  paramBar.hidden = true;
});

/* ===== 讀檔 ===== */
function readFileWithFallback(file) {
  const read = (enc) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  return (async () => { try { return await read('big5'); } catch { return await read(); } })();
}

/* ===== 檔名備援：短檔名 / 參數 ===== */
function parseFilename(name='') {
  const base = name.replace(/\.[^.]+$/, '');
  const parts = base.split('_').filter(Boolean);
  const short = parts.slice(0,3).join('_') || base;   // 例：20250810_025945_P
  const params = parts.slice(3).join(' ／ ') || '—';
  return { shortName: short, paramsText: params };
}

/* ===== 判斷交易行 ===== */
function isTradeLine(line){
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 3) return false;
  const [ts, p, act] = parts;
  const tsOk = /^\d{12,14}$/.test(ts);
  const pOk  = /^-?\d+(\.\d+)?$/.test(p);
  const actOk= ENTRY.includes(act) || EXIT_L.includes(act) || EXIT_S.includes(act);
  return tsOk && pOk && actOk;
}

/* ===== 解析（第一行優先視為參數） ===== */
function analyse(raw, opts={ needFull:false, filename:'' }) {
  const rows = (raw || '').trim().split(/\r?\n/).filter(Boolean);
  if (!rows.length) throw new Error('空檔案');

  let paramLine = '';
  if (!isTradeLine(rows[0])) { paramLine = rows.shift(); }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (const r of rows) {
    if (!isTradeLine(r)) continue;
    const [tsRaw, pStr, act] = r.trim().split(/\s+/);
    const price = +pStr;

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

    cum += gain; cumSlip += gainSlip;
    (pos.side === 'L') ? (cumL += gain) : (cumS += gain);

    const t = { pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip, fee, tax, cum, cumSlip };
    tr.push(t);

    if (opts.needFull) {
      tsArr.push(tsRaw);
      tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
    }
  }

  const kpi = buildKPI(tr, { tot, lon, sho, sli });
  const equitySeq = opts.needFull ? { tot, lon, sho, sli } : null;
  const tsSeq = opts.needFull ? tsArr : null;
  const trades = opts.needFull ? tr : null;

  const { shortName, paramsText: fnParams } = parseFilename(opts.filename || '');
  const paramsText = paramLine || fnParams;

  return { kpi, equitySeq, tsSeq, trades, shortName, paramsText };
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

  const make = (list, seqWrap) => {
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
      maxRunUp:runUp(seqWrap?.tot||[]), maxDrawdown:drawDn(seqWrap?.tot||[]),
      pf, avgW, avgL, rr, expectancy:exp, maxWinStreak:mw, maxLossStreak:ml
    };
  };

  return {
    全部:make(tr, seq),
    多單:make(longs, {tot:seq?.lon}),
    空單:make(shorts, {tot:seq?.sho})
  };
}
function emptyStats(){
  return { n:0, winRate:'0.0%', lossRate:'0.0%',
    posPts:0, negPts:0, sumPts:0, sumGain:0, sumGainSlip:0,
    maxDay:0, minDay:0, maxRunUp:0, maxDrawdown:0,
    pf:'—', avgW:0, avgL:0, rr:'—', expectancy:0, maxWinStreak:0, maxLossStreak:0 };
}

/* ===== 表頭與排序 ===== */
function buildHeader(){
  const cells = [
    '<th class="nowrap sortable" data-key="__filename">短檔名</th>',
    '<th class="nowrap sortable" data-key="__params">參數</th>'
  ];
  for (const g of GROUPS) for (const [label, key] of KPI_ORDER)
    cells.push(`<th class="nowrap sortable" data-key="${g}.${key}">${g}-${label}</th>`);
  thead.innerHTML = `<tr>${cells.join('')}</tr>`;

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
  for (const r of rowsData) if (r.kpi) appendRow(r.shortName, r.paramsText, r.kpi);
}

/* ===== 排序後把第一列搬到上方 ===== */
async function redrawFromTopRow(){
  const first = rowsData.find(r => r.kpi);
  if (!first) {
    if (chart) chart.destroy();
    tradesBody.innerHTML = `<tr><td colspan="13" style="color:#777">沒有可用資料</td></tr>`;
    kpiBlocks.innerHTML = '';
    paramBar.hidden = true;
    return;
  }
  if (!first.tsSeq || !first.equitySeq || !first.trades) {
    try {
      const text = await readFileWithFallback(first.fileRef);
      const { equitySeq, tsSeq, trades } = analyse(text, { needFull:true, filename:first.filename });
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
  renderParamBar(first.shortName, first.paramsText);
}

/* ===== 下方彙總表渲染 ===== */
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

/* ===== 上方：圖表（總=黃、多=綠、空=紅、滑價=黑） ===== */
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

    const stripes = {id:'stripes', beforeDraw(c){const {ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
      ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.06)':'transparent';ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
    const lastLabels = {id:'lastLabels', afterDatasetsDraw(c){
      const {ctx} = c, ds=c.data.datasets; ctx.save();
      ctx.font='12px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.fillStyle='#111';
      for(let k=0;k<ds.length;k++){ const m=c.getDatasetMeta(k); const p=m?.data?.[m.data.length-1]; if(!p) continue;
        const val=ds[k].data[ds[k].data.length-1]; if(val==null) continue;
        ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(Number(val).toLocaleString('zh-TW'), p.x+6, p.y); }
      ctx.restore();
    }};

    const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,pointRadius:3,pointHoverRadius:4});
    chart = new Chart(cvs, {
      type:'line',
      data:{ labels:X, datasets:[
        mkLine(T,'#f6b300'), // 總（黃）
        mkLine(L,'#2e7d32'), // 多（綠）
        mkLine(S,'#d32f2f'), // 空（紅）
        mkLine(P,'#000000')  // 滑價（黑）
      ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        layout:{padding:{bottom:42,right:60}},
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}} },
        scales:{
          x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{callback:(v,i)=>months[i]??''}},
          y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
        }
      },
      plugins:[stripes,lastLabels]
    });
  }catch(err){
    console.error('畫圖發生錯誤：', err);
  }
}

/* ===== 上方：交易紀錄（單列） ===== */
function renderTrades(trades){
  if (!trades?.length) {
    tradesBody.innerHTML = `<tr><td colspan="13" style="color:#777">此檔沒有成功配對的交易</td></tr>`;
    return;
  }
  let cumGain = 0, cumSlip = 0;
  const rows = trades.map((t, i) => {
    cumGain += t.gain; cumSlip += t.gainSlip;
    const dir = t.pos.side==='L' ? '多' : '空';
    return `
      <tr>
        <td>${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${fmt(t.pos.pIn)}</td>
        <td>${fmtTs(t.tsOut)}</td><td>${fmt(t.priceOut)}</td>
        <td>${dir}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(cumGain)}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(cumSlip)}</td>
      </tr>`;
  }).join('');
  tradesBody.innerHTML = rows;
}

/* ===== 小工具 ===== */
function updateLoadStat(done, total, failed){
  if (!total) { loadStat.textContent = ''; return; }
  loadStat.textContent = `載入：${done}/${total}，成功：${done - failed}，失敗：${failed}`;
}
const fmt = n => (typeof n==='number' && isFinite(n)) ? n.toLocaleString('zh-TW',{maximumFractionDigits:0}) : (n ?? '—');
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function escapeHTML(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ===== 排序與重繪需要用到 ===== */
function buildSortCache(kpi){
  const flat = {};
  for (const g of ['全部','多單','空單']) for (const [,key] of KPI_ORDER)
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
