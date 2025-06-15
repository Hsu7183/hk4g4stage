/* ===== 參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'],
      EXIT_L = ['平賣', '強制平倉'],
      EXIT_S = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ---------- KPI 容器 ---------- */
let statBox = document.getElementById('stats');
if (!statBox) {
  statBox = document.createElement('div');
  statBox.id = 'stats';
  statBox.style.maxWidth = '1200px';
  statBox.style.margin   = '1rem auto';
  statBox.style.fontSize = '.84rem';
  statBox.style.lineHeight = '1.4';
  document.querySelector('header').after(statBox);

  /* 一次性樣式 */
  const style = document.createElement('style');
  style.innerHTML = `
    #stats section{margin-bottom:.9rem}
    #stats h3{margin:.3rem 0;font-size:.95rem;border-bottom:1px solid #e0e0e0;padding-bottom:.2rem}
    .stat-grid{display:flex;flex-wrap:wrap;gap:.6rem .9rem}
    .stat-item{min-width:110px;white-space:nowrap}
    .stat-key{color:#555}
    .stat-val{font-weight:600}
  `;
  document.head.appendChild(style);
}

/* ---------- 讀取剪貼簿 / 檔案 ---------- */
document.getElementById('btn-clip').onclick = async e => {
  try { analyse(await navigator.clipboard.readText()); flash(e.target); }
  catch (err) { alert(err.message); }
};
document.getElementById('fileInput').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const read = enc => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result); r.onerror = () => no(r.error);
    enc ? r.readAsText(f, enc) : r.readAsText(f);
  });
  (async () => {
    try { analyse(await read('big5')); } catch { analyse(await read()); }
    flash(e.target.parentElement);
  })();
};

/* ---------- 主分析 ---------- */
function analyse (raw) {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) { alert('空檔案'); return; }

  const q  = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach((r, idx) => {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/); if (!act) return;
    const price = +pStr;

    /* 進場 */
    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw, inIdx: idx, typeIn: act });
      return;
    }
    /* 出場 */
    const idxQ = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (idxQ === -1) return;
    const pos = q.splice(idxQ, 1)[0];

    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2,
          tax  = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax,
          gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side === 'L' ? cumL += gain : cumS += gain;

    tr.push({
      pos, tsOut: tsRaw, outIdx: idx, priceOut: price, actOut: act,
      pts, fee, tax, gain, cum, gainSlip, cumSlip
    });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  });

  if (!tr.length) { alert('沒有成功配對的交易'); return; }

  renderTable(tr);
  renderStats(tr, cum, cumSlip);
  drawChart(tsArr, tot, lon, sho, sli);
}

/* ---------- KPI 統計 (flex-grid) ---------- */
function renderStats (tr, cum, cumSlip) {
  const sum = arr => arr.reduce((a,b)=>a+b,0);
  const isWin  = t => t.gain > 0;
  const isLoss = t => t.gain < 0;
  const longs  = tr.filter(t => t.pos.side === 'L');
  const shorts = tr.filter(t => t.pos.side === 'S');
  const pct    = n => (n*100).toFixed(1)+'%';

  /* 基本統計生成器 */
  const basic = list =>{
    const win=list.filter(isWin), loss=list.filter(isLoss);
    return {
      '交易數':     list.length,
      '勝率':       pct(win.length/(list.length||1)),
      '敗率':       pct(loss.length/(list.length||1)),
      '累計獲利':   sum(list.map(t=>t.gain)),
      '正點數':     sum(win.map(t=>t.pts)),
      '負點數':     sum(loss.map(t=>t.pts)),
      '總點數':     sum(list.map(t=>t.pts))
    };
  };

  const stats = {
    '全部': basic(tr),
    '多單': basic(longs),
    '空單': basic(shorts)
  };

  /* 額外指標加到「全部」 */
  // 最大回撤
  let peak = 0, mdd = 0;
  tr.forEach(t=> { peak = Math.max(peak, t.cum); mdd = Math.min(mdd, t.cum-peak); });
  stats.全部['最大回撤'] = mdd;
  // 單日最大獲利 / 虧損
  const daily = {};
  tr.forEach(t => daily[t.tsOut.slice(0,8)] = (daily[t.tsOut.slice(0,8)]||0)+t.gain );
  stats.全部['單日最大獲利'] = Math.max(...Object.values(daily));
  stats.全部['單日最大虧損'] = Math.min(...Object.values(daily));
  stats.全部['滑價累計獲利'] = cumSlip;

  /* 產生 HTML */
  let html='';
  Object.entries(stats).forEach(([title,obj])=>{
    html += `<section><h3>${title}</h3><div class="stat-grid">`;
    Object.entries(obj).forEach(([k,v])=>{
      html += `<div class="stat-item"><span class="stat-key">${k}</span>：<span class="stat-val">${fmt(v)}</span></div>`;
    });
    html += '</div></section>';
  });
  statBox.innerHTML = html;
}

/* ---------- 交易紀錄表 ---------- */
function renderTable (list) {
  const body = tbl.querySelector('tbody'); body.innerHTML = '';
  list.forEach((t, i) => {
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i + 1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td>
      </tr>`);
  });
  tbl.hidden = false;
}

/* ---------- 畫圖 ---------- */
let chart;
function drawChart (tsArr, T, L, S, P) {
  if (chart) chart.destroy();

  /* 月份序列（前後各 +1, 共 26 個月） */
  const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
  const addM    = (d,n)=> new Date(d.getFullYear(), d.getMonth()+n);
  const toYM    = d => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const start = addM(ym2Date(tsArr[0].slice(0,6)), -1);
  const months=[]; for(let d=start; months.length<26; d=addM(d,1)) months.push(toYM(d));
  const monthIdx={}; months.forEach((m,i)=> monthIdx[m.replace('/','')]=i);

  /* X 座標：月序 + 月內比例 */
  const daysInMonth=(y,m)=> new Date(y,m,0).getDate();
  const X = tsArr.map(ts=>{
    const y=+ts.slice(0,4), m=+ts.slice(4,6), d=+ts.slice(6,8);
    const hh=+ts.slice(8,10), mm=+ts.slice(10,12);
    const frac=(d-1+(hh+mm/60)/24)/daysInMonth(y,m);
    return monthIdx[ts.slice(0,6)] + frac;
  });

  /* 極值索引 */
  const maxI = T.indexOf(Math.max(...T));
  const minI = T.indexOf(Math.min(...T));

  /* 背景條 & 月份文字 */
  const stripe={id:'stripe', beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}} = c, w=(right-left)/26;
    ctx.save();
    months.forEach((_,i)=>{
      ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
      ctx.fillRect(left+i*w, top, w, bottom-top);
    });
    ctx.restore();
  }};
  const mmLabel={id:'mmLabel', afterDraw(c){
    const {ctx,chartArea:{left,right,bottom}} = c, w=(right-left)/26;
    ctx.save();
    ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#555';
    months.forEach((m,i)=> ctx.fillText(m, left+w*(i+.5), bottom+8));
    ctx.restore();
  }};

  /* 線樣式 */
  const mkLine=(d,col,fill=false)=>({
    data:d, stepped:true,
    borderColor:col, borderWidth:2,
    pointRadius:4, pointBackgroundColor:col, pointBorderColor:col, pointBorderWidth:1,
    fill
  });
  const mkLast=(d,col)=>({
    data:d.map((v,i)=> i===d.length-1? v:null),
    showLine:false, pointRadius:6,
    pointBackgroundColor:col, pointBorderColor:col, pointBorderWidth:1,
    datalabels:{
      display:true, anchor:'center', align:'right', offset:8,
      formatter:v=> v?.toLocaleString('zh-TW') ?? '',
      color:'#000', clip:false, font:{size:10}
    }
  });
  const mkMark=(d,i,col)=>({
    data:d.map((v,j)=> j===i? v:null),
    showLine:false, pointRadius:6,
    pointBackgroundColor:col, pointBorderColor:col, pointBorderWidth:1,
    datalabels:{
      display:true,
      anchor:i===maxI?'end':'start',
      align :i===maxI?'top':'bottom',
      offset:8,
      formatter:v=> v?.toLocaleString('zh-TW') ?? '',
      color:'#000', clip:false, font:{size:10}
    }
  });

  chart = new Chart(cvs,{
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(T,'#fbc02d',{target:'origin', above:'rgba(255,138,128,.18)', below:'rgba(200,230,201,.18)'}),
        mkLine(L,'#d32f2f'),
        mkLine(S,'#2e7d32'),
        mkLine(P,'#212121'),

        mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'),
        mkLast(S,'#2e7d32'), mkLast(P,'#212121'),

        mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42, right:60}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      scales:{
        x:{type:'linear', min:0, max:25.999, grid:{display:false}, ticks:{display:false}},
        y:{ticks:{callback:v=> v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe, mmLabel, ChartDataLabels]
  });
}

/* ---------- 工具 ---------- */
const fmt = n => typeof n==='number' ? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : n;
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){ el.classList.add('flash'); setTimeout(()=> el.classList.remove('flash'),600); }
