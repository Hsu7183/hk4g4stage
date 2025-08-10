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

/* ===== 狀態（給排序用） ===== */
let rowsData = []; // 每筆：{ filename, kpi, sortCache, equitySeq, tsSeq }

/* ===== 檔案事件 ===== */
filesInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // 建表頭（含排序）
  buildHeader();

  rowsData = [];
  tbody.innerHTML = '';

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const text = await readFileWithFallback(f);
      const { kpi, equitySeq, tsSeq } = analyse(text, { needSeq: i === 0 }); // 第一筆要保留序列畫圖
      rowsData.push({ filename: f.name, kpi, sortCache: buildSortCache(kpi), equitySeq, tsSeq });
      appendRow(f.name, kpi);
      if (i === 0) drawChart(tsSeq, equitySeq.tot, equitySeq.lon, equitySeq.sho, equitySeq.sli);
    } catch (err) {
      rowsData.push({ filename: f.name, kpi: null, sortCache: null });
      appendErrorRow(f.name, err);
    }
  }
});

btnClear.addEventListener('click', () => {
  filesInput.value = '';
  thead.innerHTML = '';
  tbody.innerHTML = '';
  rowsData = [];
  if (chart) chart.destroy();
});

/* ===== 讀檔（big5→utf-8 回退） ===== */
function readFileWithFallback(file) {
  const read = (enc) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  return (async () => {
    try { return await read('big5'); } catch { return await read(); }
  })();
}

/* ===== 解析：回傳 KPI 與（可選）收益序列 ===== */
function analyse(raw, opts={needSeq:false}) {
  const rows = (raw || '').trim().split(/\r?\n/).filter(Boolean);
  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (const r of rows) {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/);
    if (!act) continue;
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

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });

    if (opts.needSeq) {
      tsArr.push(tsRaw);
      tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
    }
  }

  const kpi = buildKPI(tr, { tot, lon, sho, sli });
  const equitySeq = opts.needSeq ? { tot, lon, sho, sli } : null;
  const tsSeq = opts.needSeq ? tsArr : null;
  return { kpi, equitySeq, tsSeq };
}

/* ===== KPI ===== */
function buildKPI(tr, seq) {
  const sum = a => a.reduce((x,y)=>x+y,0);
  const pct = x => (x*100).toFixed(1)+'%';
  const safeMax = a => a.length ? Math.max(...a) : 0;
  const safeMin = a => a.length ? Math.min(...a) : 0;

  const byDay = list => {
    const m={}; for (const t of list){ const d = (t.tsOut||'').slice(0,8); m[d]=(m[d]||0)+(t.gain||0); }
    return Object.values(m);
  };
  const runUp = s => { if(!s.length) return 0; let m=s[0], up=0; for(const v of s){ m=Math.min(m,v); up=Math.max(up,v-m);} return up; };
  const drawDn= s => { if(!s.length) return 0; let p=s[0], dn=0; for(const v of s){ p=Math.max(p,v); dn=Math.min(dn,v-p);} return dn; };
  const streaks = list => { let cw=0,cl=0,mw=0,ml=0; for(const t of list){ if(t.gain>0){cw++;cl=0;mw=Math.max(mw,cw);} else if(t.gain<0){cl++;cw=0;ml=Math.max(ml,cl);} } return {mw,ml}; };

  const longs  = tr.filter(t => t.pos?.side==='L');
  const shorts = tr.filter(t => t.pos?.side==='S');

  const make = (list, seq) => {
    if (!list.length) return emptyStats();
    const win = list.filter(t=>t.gain>0), loss = list.filter(t=>t.gain<0);
    const winAmt = sum(win.map(t=>t.gain)), lossAmt = -sum(loss.map(t=>t.gain));
    const pf = lossAmt===0 ? (winAmt>0?'∞':'—') : (winAmt/lossAmt).toFixed(2);
    const avgW = win.length?winAmt/win.length:0;
    const avgL = loss.length?-(lossAmt/loss.length):0;
    const rr   = avgL===0 ? '—' : Math.abs(avgW/avgL).toFixed(2);
    const exp  = (win.length+loss.length)?(winAmt-lossAmt)/(win.length+loss.length):0;
    const {mw,ml} = streaks(list);
    return {
      n:list.length, winRate:pct(win.length/list.length), lossRate:pct(loss.length/list.length),
      posPts:sum(win.map(t=>t.pts)), negPts:sum(loss.map(t=>t.pts)), sumPts:sum(list.map(t=>t.pts)),
      sumGain:sum(list.map(t=>t.gain)), sumGainSlip:sum(list.map(t=>t.gainSlip)),
      maxDay:safeMax(byDay(list)), minDay:safeMin(byDay(list)),
      maxRunUp:runUp(seq||[]), maxDrawdown:drawDn(seq||[]),
      pf, avgW, avgL, rr, expectancy:exp, maxWinStreak:mw, maxLossStreak:ml
    };
  };

  return { 全部:make(tr,seq.tot), 多單:make(longs,seq.lon), 空單:make(shorts,seq.sho) };
}
function emptyStats(){
  return { n:0, winRate:'0.0%', lossRate:'0.0%',
    posPts:0, negPts:0, sumPts:0, sumGain:0, sumGainSlip:0,
    maxDay:0, minDay:0, maxRunUp:0, maxDrawdown:0,
    pf:'—', avgW:0, avgL:0, rr:'—', expectancy:0, maxWinStreak:0, maxLossStreak:0 };
}

/* ===== 表頭（可排序） ===== */
function buildHeader(){
  const cells = ['<th class="nowrap sortable" data-key="__filename">檔名</th>'];
  for (const g of GROUPS) for (const [label, key] of KPI_ORDER)
    cells.push(`<th class="nowrap sortable" data-key="${g}.${key}">${g}-${label}</th>`);
  thead.innerHTML = `<tr>${cells.join('')}</tr>`;

  // 事件：點表頭排序
  let currentKey = null, currentDir = 'asc';
  thead.querySelectorAll('th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      // 交替方向
      if (currentKey === key) currentDir = (currentDir==='asc' ? 'desc' : 'asc');
      else { currentKey = key; currentDir = 'asc'; }
      // 樣式
      thead.querySelectorAll('th.sortable').forEach(h=>h.classList.remove('asc','desc'));
      th.classList.add(currentDir);

      sortRows(currentKey, currentDir);
    });
  });
}

/* ===== 排序實作 ===== */
function buildSortCache(kpi){
  const flat = {};
  for (const g of GROUPS) {
    for (const [,key] of KPI_ORDER) {
      flat[`${g}.${key}`] = parseForSort(kpi?.[g]?.[key]);
    }
  }
  flat['__filename'] = ''; // 檔名用時現取
  return flat;
}
function parseForSort(v){
  if (v===null || v===undefined) return -Infinity;
  if (typeof v === 'number') return v;
  if (typeof v === 'string'){
    if (v.endsWith('%')) return parseFloat(v);
    if (v === '—' || v === '∞') return v === '∞' ? Number.POSITIVE_INFINITY : -Infinity;
    return parseFloat(v.replaceAll(',',''));
  }
  return +v || 0;
}
function sortRows(key, dir){
  const factor = dir==='asc' ? 1 : -1;
  rowsData.sort((a,b)=>{
    let av, bv;
    if (key === '__filename'){ av = a.filename.toLowerCase(); bv = b.filename.toLowerCase(); return av < bv ? -1*factor : av > bv ? 1*factor : 0; }
    av = a.sortCache?.[key] ?? -Infinity;
    bv = b.sortCache?.[key] ?? -Infinity;
    return (av - bv) * factor || a.filename.localeCompare(b.filename)*factor;
  });
  // 重畫表格
  tbody.innerHTML = '';
  for (const r of rowsData) {
    if (!r.kpi) appendErrorRow(r.filename, new Error('解析失敗'));
    else appendRow(r.filename, r.kpi);
  }
}

/* ===== 填表 ===== */
function appendRow(filename, kpi){
  const tds = [`<td class="nowrap">${escapeHTML(filename)}</td>`];
  for (const g of GROUPS) {
    const obj = kpi[g] || {};
    for (const [, key] of KPI_ORDER) tds.push(`<td>${fmt(obj[key])}</td>`);
  }
  tbody.insertAdjacentHTML('beforeend', `<tr>${tds.join('')}</tr>`);
}
function appendErrorRow(filename, err){
  const colSpan = 1 + GROUPS.length * KPI_ORDER.length;
  const row = `<tr><td class="nowrap">${escapeHTML(filename)}</td><td colspan="${colSpan-1}" style="color:#c00;text-align:left">讀取/解析失敗：${escapeHTML(err?.message||'未知錯誤')}</td></tr>`;
  tbody.insertAdjacentHTML('beforeend', row);
}

/* ===== 圖表（只畫第一筆） ===== */
function drawChart(tsArr, T, L, S, P){
  if (chart) chart.destroy();
  if (!tsArr?.length) return;

  // X 軸（月序 + 月內比例）
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

  const maxI = T.indexOf(Math.max(...T));
  const minI = T.indexOf(Math.min(...T));

  const stripe={id:'stripe',beforeDraw(c){const{ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
  const mmLabel={id:'mmLabel',afterDraw(c){const{ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
    months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

  const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,pointRadius:0});
  const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:5,pointBackgroundColor:col,pointBorderColor:col});

  chart = new Chart(cvs, {
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(T,'#fbc02d'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121'),
        mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:60}},
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}} ,
      scales:{ x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
               y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}} }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

/* ===== 工具 ===== */
const fmt = n => (typeof n==='number' && isFinite(n)) ? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : (n ?? '—');
function escapeHTML(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
