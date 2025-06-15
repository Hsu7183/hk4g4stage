/* ===== 參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'],
      EXIT_L = ['平賣', '強制平倉'],
      EXIT_S = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ---------- KPI 容器 & 樣式 ---------- */
let statBox = document.getElementById('stats');
if (!statBox) {
  statBox = document.createElement('div');
  statBox.id = 'stats';
  statBox.style.maxWidth = '1200px';
  statBox.style.margin   = '1rem auto';
  statBox.style.fontSize = '.84rem';
  statBox.style.lineHeight = '1.4';
  document.querySelector('header').after(statBox);

  const style = document.createElement('style');
  style.textContent = `
    #stats section {margin-bottom:.9rem}
    #stats h3 {margin:.3rem 0;font-size:.95rem;border-bottom:1px solid #e0e0e0;padding-bottom:.2rem}
    .stat-grid {display:flex;flex-wrap:wrap;gap:.5rem .8rem}
    .stat-item {min-width:130px;white-space:nowrap}
    .stat-key {color:#555}
    .stat-val {font-weight:600}
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
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(f, enc) : r.readAsText(f);
  });
  (async () => {
    try { analyse(await read('big5')); } catch { analyse(await read()); }
    flash(e.target.parentElement);
  })();
};

/* ---------- 主分析 ---------- */
function analyse(raw) {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) { alert('空檔案'); return; }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach((r) => {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/); if (!act) return;
    const price = +pStr;

    /* 進場 */
    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw });
      return;
    }

    /* 出場配對 */
    const qi = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (qi === -1) return;
    const pos = q.splice(qi, 1)[0];

    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2, tax = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax,
          gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side === 'L' ? cumL += gain : cumS += gain;

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  });

  if (!tr.length) { alert('沒有成功配對的交易'); return; }

  renderTable(tr);
  renderStats(tr, { tot, lon, sho, sli });
  drawChart(tsArr, tot, lon, sho, sli);
}

/* ---------- KPI flex-grid ---------- */
function renderStats(tr, seq) {
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const pct = x => (x * 100).toFixed(1) + '%';
  const byDay = list => {
    const m = {};
    list.forEach(t => { const d = t.tsOut.slice(0, 8); m[d] = (m[d] || 0) + t.gain; });
    return Object.values(m);
  };
  const drawUp = s => { let min = s[0], up = 0; s.forEach(v => { min = Math.min(min, v); up = Math.max(up, v - min); }); return up; };
  const drawDn = s => { let peak = s[0], dn = 0; s.forEach(v => { peak = Math.max(peak, v); dn = Math.min(dn, v - peak); }); return dn; };

  const longs  = tr.filter(t => t.pos.side === 'L');
  const shorts = tr.filter(t => t.pos.side === 'S');

  const make = (list, cumSeq) => {
    const win  = list.filter(t => t.gain > 0);
    const loss = list.filter(t => t.gain < 0);
    return {
      '交易數'        : list.length,
      '勝率'          : pct(win.length  / (list.length || 1)),
      '敗率'          : pct(loss.length / (list.length || 1)),
      '正點數'        : sum(win .map(t => t.pts)),
      '負點數'        : sum(loss.map(t => t.pts)),
      '總點數'        : sum(list.map(t => t.pts)),
      '累積獲利'      : sum(list.map(t => t.gain)),
      '滑價累計獲利'  : sum(list.map(t => t.gainSlip)),
      '單日最大獲利'  : Math.max(...byDay(list)),
      '單日最大虧損'  : Math.min(...byDay(list)),
      '區間最大獲利'  : drawUp(cumSeq),
      '區間最大回撤'  : drawDn(cumSeq)
    };
  };

  const stats = {
    '全部': make(tr     , seq.tot),
    '多單': make(longs  , seq.lon),
    '空單': make(shorts , seq.sho)
  };

  /* 輸出 HTML */
  let html = '';
  Object.entries(stats).forEach(([title, obj]) => {
    html += `<section><h3>${title}</h3><div class="stat-grid">`;
    Object.entries(obj).forEach(([k, v]) => {
      html += `<div class="stat-item"><span class="stat-key">${k}</span>：<span class="stat-val">${fmt(v)}</span></div>`;
    });
    html += '</div></section>';
  });
  statBox.innerHTML = html;
}

/* ---------- 交易紀錄表 ---------- */
function renderTable(list) {
  const body = tbl.querySelector('tbody'); body.innerHTML = '';
  list.forEach((t, i) => {
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i + 1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side === 'L' ? '新買' : '新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.pos.side === 'L' ? '平賣' : '平買'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(FEE * 2)}</td><td>${fmt(Math.round(t.priceOut * MULT * TAX))}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(sumUpTo(list, i, 'gain'))}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(sumUpTo(list, i, 'gainSlip'))}</td>
      </tr>
    `);
  });
  tbl.hidden = false;
}

/* ---------- 畫圖 ---------- */
let chart;
function drawChart(tsArr, T, L, S, P) {
  if (chart) chart.destroy();

  /* 月份序列 (26 個月) */
  const ym2Date = ym => new Date(+ym.slice(0, 4), +ym.slice(4, 6) - 1);
  const addM    = (d, n) => new Date(d.getFullYear(), d.getMonth() + n);
  const start   = addM(ym2Date(tsArr[0].slice(0, 6)), -1);
  const months  = [];
  for (let d = start; months.length < 26; d = addM(d, 1))
    months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  const mIdx = {}; months.forEach((m, i) => mIdx[m.replace('/', '')] = i);

  /* X 軸座標：月序 + 月內比例 */
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const X = tsArr.map(ts => {
    const y  = +ts.slice(0, 4), m = +ts.slice(4, 6), d = +ts.slice(6, 8),
          hh = +ts.slice(8,10),  mm= +ts.slice(10,12);
    return mIdx[ts.slice(0, 6)] + (d - 1 + (hh + mm / 60) / 24) / daysInMonth(y, m);
  });

  const maxI = T.indexOf(Math.max(...T));
  const minI = T.indexOf(Math.min(...T));

  /* 背景條 + 月份文字 */
  const stripe={id:'stripe',beforeDraw(c){const{ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
    ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
  const mmLabel={id:'mmLabel',afterDraw(c){const{ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
    months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

  /* 線與標籤 */
  const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
    pointRadius:4,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1});
  const mkLast=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    datalabels:{display:true,anchor:'center',align:'right',offset:8,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});
  const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',offset:8,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});

  chart = new Chart(cvs, {
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(T,'#fbc02d'),    // 總
        mkLine(L,'#d32f2f'),    // 多
        mkLine(S,'#2e7d32'),    // 空
        mkLine(P,'#212121'),    // 滑價累計獲利

        mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'),
        mkLast(S,'#2e7d32'), mkLast(P,'#212121'),

        mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:60}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      scales:{
        x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

/* ---------- 工具 ---------- */
const fmt   = n => typeof n==='number' ? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : n;
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
function sumUpTo(arr, idx, key){return arr.slice(0, idx + 1).reduce((a,b)=>a + b[key], 0);}
