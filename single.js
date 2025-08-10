/* ===== 常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買','新賣'], EXIT_L = ['平賣','強制平倉'], EXIT_S = ['平買','強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');
const errBox = document.getElementById('errBox');
const kpiBlocks = document.getElementById('kpiBlocks');

let chart;

/* ===== 事件 ===== */
document.getElementById('btn-clip').addEventListener('click', async (e) => {
  try {
    const txt = await navigator.clipboard.readText();
    if (!txt.trim()) return showErr('剪貼簿是空的。');
    run(txt);
    flash(e.target);
  } catch (err) { showErr('讀取剪貼簿失敗：' + err.message); }
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const text = await readFileWithFallback(f);
    if (!text.trim()) return showErr('檔案內容為空。');
    run(text);
    flash(document.getElementById('pick'));
  } catch (err) { showErr('讀檔失敗：' + err.message); }
});

/* ===== 讀檔（big5 → utf-8 回退） ===== */
function readFileWithFallback(file) {
  const read = (enc) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  return (async () => { try { return await read('big5'); } catch { return await read(); } })();
}

/* ===== 主流程 ===== */
function run(raw) {
  hideErr();
  const parsed = analyse(raw);
  if (!parsed) return;
  const { tsArr, seq, trades, kpi } = parsed;

  drawChart(tsArr, seq.tot, seq.lon, seq.sho, seq.sli);
  renderTopKPI(kpi);
  renderTrades(trades);
}

/* ===== 解析 ===== */
function analyse(raw) {
  const rows = raw.trim().split(/\r?\n/).filter(Boolean);
  if (!rows.length) { showErr('空檔案。'); return null; }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (const r of rows) {
    const parts = r.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [tsRaw, pStr, act] = parts;
    const price = +pStr; if (!Number.isFinite(price)) continue;

    if (ENTRY.includes(act)) { q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw }); continue; }

    const qi = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (qi === -1) continue;

    const pos = q.splice(qi, 1)[0];
    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2;
    const tax  = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side === 'L' ? cumL += gain : cumS += gain;

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip, fee, tax });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }

  if (!tr.length) { showErr('沒有成功配對的交易。'); return null; }

  const kpi = buildKPI(tr, { tot, lon, sho, sli });
  return { tsArr, seq:{ tot, lon, sho, sli }, trades:tr, kpi };
}

/* ===== KPI（與批量版一致） ===== */
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

  const make = (list, seqArr) => {
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
      maxRunUp:runUp(seqArr||[]), maxDrawdown:drawDn(seqArr||[]),
      pf, avgW, avgL, rr, expectancy:exp, maxWinStreak:mw, maxLossStreak:ml
    };
  };

  return { 全部: make(tr, seq.tot), 多單: make(longs, seq.lon), 空單: make(shorts, seq.sho) };
}
function emptyStats(){
  return { n:0, winRate:'0.0%', lossRate:'0.0%',
    posPts:0, negPts:0, sumPts:0, sumGain:0, sumGainSlip:0,
    maxDay:0, minDay:0, maxRunUp:0, maxDrawdown:0,
    pf:'—', avgW:0, avgL:0, rr:'—', expectancy:0, maxWinStreak:0, maxLossStreak:0 };
}

function renderTopKPI(kpi){
  if (!kpi) { kpiBlocks.innerHTML=''; return; }
  const groups = ['全部','多單','空單'];
  const line = (obj)=> KPI_ORDER.map(([label,key]) =>
    `<span class="kpi-item"><span class="kpi-key">${label}</span>：<span class="kpi-val">${fmt(obj[key])}</span></span>`
  ).join('');
  kpiBlocks.innerHTML = groups.map(g=>`
    <div class="kpi-block"><div class="kpi-title">${g}</div><div class="kpi-line">${line(kpi[g]||{})}</div></div>
  `).join('');
}

/* ===== 交易表 ===== */
function renderTrades(list) {
  const body = tbl.querySelector('tbody'); body.innerHTML = '';
  let cumGain=0, cumSlip=0;
  list.forEach((t, i) => {
    cumGain += t.gain; cumSlip += t.gainSlip;
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i + 1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${fmt(t.pos.pIn)}</td><td>${t.pos.side === 'L' ? '新買' : '新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${fmt(t.priceOut)}</td><td>${t.pos.side === 'L' ? '平賣' : '平買'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(cumGain)}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(cumSlip)}</td>
      </tr>
    `);
  });
  tbl.hidden = false;
}

/* ===== 圖表（總=黃、多=綠、空=紅、滑價=黑） ===== */
function drawChart(tsArr, T, L, S, P) {
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
      const {ctx}=c, ds=c.data.datasets; ctx.save();
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
        scales:{ x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{callback:(v,i)=>months[i]??''}},
                 y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}} }
      },
      plugins:[stripes,lastLabels]
    });
  }catch(err){ showErr('畫圖失敗：' + err.message); }
}

/* ===== 工具 ===== */
function fmt(n){return (typeof n==='number' && isFinite(n)) ? n.toLocaleString('zh-TW',{maximumFractionDigits:0}) : (typeof n==='string' ? n : '—');}
function fmtTs(s){return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;}
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
function showErr(msg){errBox.textContent=msg; errBox.style.display='block';}
function hideErr(){errBox.style.display='none'; errBox.textContent='';}
