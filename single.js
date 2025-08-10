/* ===== 常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買','新賣'], EXIT_L = ['平賣','強制平倉'], EXIT_S = ['平買','強制平倉'];
const ACTION_MAP = new Map([
  ['新買','新買'], ['買進','新買'], ['作多','新買'], ['多單','新買'], ['新多','新買'],
  ['新賣','新賣'], ['賣出','新賣'], ['作空','新賣'], ['空單','新賣'], ['新空','新賣'],
  ['平買','平買'], ['平多','平賣'], ['平倉多','平賣'],
  ['平賣','平賣'], ['平空','平買'], ['平倉空','平買'],
  ['強制平倉','強制平倉'], ['強平','強制平倉'], ['強制','強制平倉'],
  ['平倉','平倉']
]);
const normAct = s => ACTION_MAP.get((s||'').trim()) || (s||'').trim();

/* ===== DOM ===== */
const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');
const kpiBlocks = document.getElementById('kpiBlocks');
const paramBar = document.getElementById('paramBar');
const pName = document.getElementById('pName');
const pParams = document.getElementById('pParams');
const errBox = document.getElementById('errBox');
let chart;

/* ===== 事件 ===== */
document.getElementById('btn-clip').addEventListener('click', async e => {
  try{
    const t = await navigator.clipboard.readText();
    if(!t.trim()) return showErr('剪貼簿是空的');
    run(t, { filename:'剪貼簿' }); flash(e.target);
  }catch(err){ console.error(err); showErr('讀取剪貼簿失敗：'+err.message); }
});
document.getElementById('fileInput').addEventListener('change', async e=>{
  const f = e.target.files?.[0]; if(!f) return;
  try{
    const raw = await readFile(f);
    run(raw, { filename:f.name }); flash(document.getElementById('pick'));
  }catch(err){ console.error(err); showErr('讀檔失敗：'+err.message); }
});

/* ===== 檔案讀取（big5 fallback） ===== */
function readFile(file){
  const read = enc => new Promise((ok,no)=>{ const r=new FileReader();
    r.onload=()=>ok(r.result); r.onerror=()=>no(r.error); enc? r.readAsText(file,enc): r.readAsText(file);});
  return (async()=>{ try{ return await read('big5'); }catch{ return await read(); } })();
}

/* ===== 參數整數顯示 ===== */
function formatParamsDisplay(s){
  if(!s) return '—';
  const tokens = s.replace(/[，,]/g,' ').trim().split(/\s+/).filter(Boolean);
  const allNum = tokens.length>0 && tokens.every(x=>/^[-+]?\d+(?:\.\d+)?$/.test(x));
  return allNum ? tokens.map(x=>String(Math.trunc(parseFloat(x)))).join(' / ') : s;
}

/* ===== 交易行解析（寬鬆） ===== */
function parseTradeLine(line){
  if(!line) return null;
  const s = line.replace(/[，,]/g,' ').replace(/\t+/g,' ').replace(/\s+/g,' ').trim();
  const m = s.match(/^(\d{8}|\d{12}|\d{14})\s+(-?\d+(?:\.\d+)?)\s+(\S+)/);
  if(!m) return null;
  const ts = m[1]; const price = parseFloat(m[2].replace(/,/g,''));
  const act = normAct(m[3]);
  const valid = new Set(['新買','新賣','平買','平賣','強制平倉','平倉']);
  if(!valid.has(act) || !isFinite(price)) return null;
  return { ts, price, act };
}

/* ===== 主流程 ===== */
function run(raw, meta={}){
  try{
    hideErr();
    const out = analyse(raw, meta);
    if(!out){ return; }
    const { tsArr, seq, trades, kpi, shortName, paramsText } = out;
    drawChart(tsArr, seq.tot, seq.lon, seq.sho, seq.sli);
    renderTopKPI(kpi);
    renderParamBar(shortName, paramsText);
    renderTrades(trades);
  }catch(err){ console.error(err); showErr('處理資料錯誤：'+err.message); }
}

function analyse(raw, meta={}){
  const rows = (raw||'').replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
  if(!rows.length){ showErr('空檔案'); return null; }

  let paramLine=''; if(!parseTradeLine(rows[0])) paramLine = rows.shift();

  const q=[], tr=[], tsArr=[], tot=[], lon=[], sho=[], sli=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0, skipped=0;

  for(const r of rows){
    const trow = parseTradeLine(r); if(!trow){ skipped++; continue; }
    let { ts:tsRaw, price, act } = trow;

    if(ENTRY.includes(act)){ q.push({ side: act==='新買'?'L':'S', pIn:price, tsIn:tsRaw }); continue; }

    const qi = q.findIndex(o =>
      (o.side==='L' && (EXIT_L.includes(act) || act==='平倉')) ||
      (o.side==='S' && (EXIT_S.includes(act) || act==='平倉'))
    );
    if(qi===-1) continue;

    const pos = q.splice(qi,1)[0];
    const pts = pos.side==='L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE*2;
    const tax = Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax;
    const gainSlip = gain - SLIP*MULT;

    cum += gain; cumSlip += gainSlip; (pos.side==='L') ? cumL+=gain : cumS+=gain;

    tr.push({ pos, tsOut:tsRaw, priceOut:price, pts, gain, gainSlip, fee, tax, cum, cumSlip });
    tsArr.push(tsRaw); tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }

  if(!tr.length){ showErr('沒有成功配對的交易'); console.warn('略過行數：', skipped); return null; }

  const kpi = buildKPI(tr, { tot, lon, sho, sli });
  const { shortName, paramsText: nameParams } = parseFilename(meta.filename||'');
  const paramsText = formatParamsDisplay(paramLine || nameParams);
  return { tsArr, seq:{tot,lon,sho,sli}, trades:tr, kpi, shortName, paramsText };
}

/* ===== KPI ===== */
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

function buildKPI(tr, seq){
  const sum=a=>a.reduce((x,y)=>x+y,0), pct=x=>(x*100).toFixed(1)+'%';
  const safeMax=a=>a.length?Math.max(...a):0, safeMin=a=>a.length?Math.min(...a):0;
  const byDay=list=>{const m={};for(const t of list){const d=(t.tsOut||'').slice(0,8);m[d]=(m[d]||0)+(t.gain||0);}return Object.values(m);}
  const runUp=s=>{if(!s.length)return 0;let m=s[0],up=0;for(const v of s){m=Math.min(m,v);up=Math.max(up,v-m);}return up;}
  const drawDn=s=>{if(!s.length)return 0;let p=s[0],dn=0;for(const v of s){p=Math.max(p,v);dn=Math.min(dn,v-p);}return dn;}
  const streaks=list=>{let cw=0,cl=0,mw=0,ml=0;for(const t of list){if(t.gain>0){cw++;cl=0;mw=Math.max(mw,cw);}else if(t.gain<0){cl++;cw=0;ml=Math.max(ml,cl);}}return{mw,ml}}
  const longs=tr.filter(t=>t.pos?.side==='L'), shorts=tr.filter(t=>t.pos?.side==='S');

  const make=(list, seqArr)=>{ if(!list.length) return emptyStats();
    const win=list.filter(t=>t.gain>0), loss=list.filter(t=>t.gain<0);
    const winAmt=sum(win.map(t=>t.gain)), lossAmt=-sum(loss.map(t=>t.gain));
    const pf=lossAmt===0?(winAmt>0?'∞':'—'):(winAmt/lossAmt).toFixed(2);
    const avgW=win.length?winAmt/win.length:0, avgL=loss.length?-(lossAmt/loss.length):0;
    const rr=avgL===0?'—':Math.abs(avgW/avgL).toFixed(2);
    const exp=(win.length+loss.length)?(winAmt-lossAmt)/(win.length+loss.length):0;
    const {mw,ml}=streaks(list);
    return { n:list.length, winRate:pct(win.length/list.length), lossRate:pct(loss.length/list.length),
      posPts:sum(win.map(t=>t.pts)), negPts:sum(loss.map(t=>t.pts)), sumPts:sum(list.map(t=>t.pts)),
      sumGain:sum(list.map(t=>t.gain)), sumGainSlip:sum(list.map(t=>t.gainSlip)),
      maxDay:safeMax(byDay(list)), minDay:safeMin(byDay(list)), maxRunUp:runUp(seqArr||[]), maxDrawdown:drawDn(seqArr||[]),
      pf, avgW, avgL, rr, expectancy:exp, maxWinStreak:mw, maxLossStreak:ml };
  };

  return { 全部:make(tr,seq.tot), 多單:make(longs,seq.lon), 空單:make(shorts,seq.sho) };
}
function emptyStats(){return{n:0,winRate:'0.0%',lossRate:'0.0%',posPts:0,negPts:0,sumPts:0,sumGain:0,sumGainSlip:0,maxDay:0,minDay:0,maxRunUp:0,maxDrawdown:0,pf:'—',avgW:0,avgL:0,rr:'—',expectancy:0,maxWinStreak:0,maxLossStreak:0}}

/* ===== 渲染 ===== */
function renderTopKPI(kpi){
  if(!kpi){ kpiBlocks.innerHTML=''; return; }
  const groups=['全部','多單','空單'];
  const line=obj=>KPI_ORDER.map(([lab,key])=>`<span class="kpi-item"><span class="kpi-key">${lab}</span>：<span class="kpi-val">${fmt(obj[key])}</span></span>`).join('');
  kpiBlocks.innerHTML = groups.map(g=>`<div class="kpi-block"><div class="kpi-title">${g}</div><div class="kpi-line">${line(kpi[g]||{})}</div></div>`).join('');
}
function renderParamBar(shortName, paramsText){
  pName.textContent = shortName || '—';
  pParams.textContent = paramsText || '—';
  paramBar.hidden = false;
}
function renderTrades(list){
  const body = tbl.querySelector('tbody'); body.innerHTML='';
  let cg=0, cs=0;
  list.forEach((t,i)=>{ cg+=t.gain; cs+=t.gainSlip;
    const dir=t.pos.side==='L'?'多':'空';
    body.insertAdjacentHTML('beforeend',`
      <tr>
        <td>${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${fmt(t.pos.pIn)}</td>
        <td>${fmtTs(t.tsOut)}</td><td>${fmt(t.priceOut)}</td>
        <td>${dir}</td><td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(cg)}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(cs)}</td>
      </tr>`);});
  tbl.hidden=false;
}

/* ===== 圖表（總=黃、多=綠、空=紅、滑價=黑） ===== */
function drawChart(tsArr, T,L,S,P){
  if(chart) chart.destroy();
  if(!tsArr?.length) return;
  const ym2Date=ym=>new Date(+ym.slice(0,4),+ym.slice(4,6)-1);
  const addM=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const start=addM(ym2Date(tsArr[0].slice(0,6)),-1);
  const months=[]; for(let d=start; months.length<26; d=addM(d,1)) months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
  const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);
  const dim=(y,m)=>new Date(y,m,0).getDate();
  const X=tsArr.map(ts=>{const y=+ts.slice(0,4),m=+ts.slice(4,6),d=+ts.slice(6,8),hh=+ts.slice(8,10),mm=+ts.slice(10,12);
    return mIdx[ts.slice(0,6)]+(d-1+(hh+mm/60)/24)/dim(y,m);});
  const mk=(d,c)=>({data:d,stepped:true,borderColor:c,borderWidth:2,pointRadius:3});
  chart=new Chart(cvs,{type:'line',data:{labels:X,datasets:[mk(T,'#f6b300'),mk(L,'#2e7d32'),mk(S,'#d32f2f'),mk(P,'#000')]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}}},
      scales:{x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{callback:(v,i)=>months[i]??''}},y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}});
}

/* ===== 工具 ===== */
function fmt(n){return (typeof n==='number'&&isFinite(n))?n.toLocaleString('zh-TW',{maximumFractionDigits:0}):(typeof n==='string'?n:'—')}
function fmtTs(s){return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`}
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600)}
function showErr(m){errBox.textContent=m;errBox.style.display='inline-block'}
function hideErr(){errBox.style.display='none';errBox.textContent=''}
function parseFilename(name=''){const base=name.replace(/\.[^.]+$/,'');const parts=base.split('_').filter(Boolean);
  const short=parts.slice(0,3).join('_')||base; const params=parts.slice(3).join(' ／ ')||'—'; return {shortName:short, paramsText:formatParamsDisplay(params)};}
