/* ===== 參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'],
      EXIT_L = ['平賣', '強制平倉'],
      EXIT_S = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ---------- I/O ---------- */
document.getElementById('btn-clip').onclick = async e => {
  try { analyse(await navigator.clipboard.readText()); flash(e.target); }
  catch (err) { alert(err.message); }
};
document.getElementById('fileInput').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const read = enc => new Promise((ok, no) => { const r = new FileReader();
    r.onload = () => ok(r.result); r.onerror = () => no(r.error);
    enc ? r.readAsText(f, enc) : r.readAsText(f); });
  (async () => { try { analyse(await read('big5')); } catch { analyse(await read()); }
    flash(e.target.parentElement); })();
};

/* ---------- 主流程 ---------- */
function analyse(raw) {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) { alert('空檔案'); return; }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach(r => {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/); if (!act) return;
    const price = +pStr;

    if (ENTRY.includes(act)) {                             // 建倉
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw, typeIn: act });
      return;
    }
    const idx = q.findIndex(o => (o.side === 'L' && EXIT_L.includes(act)) ||
                                 (o.side === 'S' && EXIT_S.includes(act)));
    if (idx === -1) return;

    const pos = q.splice(idx, 1)[0];
    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2;
    const tax  = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side === 'L' ? cumL += gain : cumS += gain;

    tr.push({ pos, tsOut: tsRaw, priceOut: price, actOut: act,
              pts, fee, tax, gain, cum, gainSlip, cumSlip });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  });

  if (!tr.length) { alert('沒有成功配對的交易'); return; }

  renderTable(tr);
  drawChart(tsArr, tot, lon, sho, sli);
}

/* ---------- 表格 ---------- */
function renderTable(list) {
  const body = tbl.querySelector('tbody'); body.innerHTML = '';
  list.forEach((t, i) => {
    body.insertAdjacentHTML('beforeend', `
      <tr><td rowspan="2">${i + 1}</td>
          <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
          <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
          <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
          <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>`);
  });
  tbl.hidden = false;
}

/* ---------- 畫圖 ---------- */
let chart;
function drawChart(tsArr, T, L, S, P) {
  if (chart) chart.destroy();

  /* -------- A. x 軸改用「交易序號」 -------- */
  const X = tsArr.map((_, i) => i);            // 0,1,2 … 每筆一格

  /* -------- B. 以「季」畫背景條 -------- */
  const qLabels = [], qPos = [];               // 用來畫 stripe
  tsArr.forEach((ts, i) => {
    const qTxt = ts.slice(0, 4) + 'Q' + (Math.floor((+ts.slice(4, 6) - 1) / 3) + 1);
    if (qLabels.length === 0 || qLabels[qLabels.length - 1] !== qTxt) {
      qLabels.push(qTxt);
      qPos.push(i);                            // 該季開始的 x 座標
    }
  });
  qPos.push(X.length);                         // 方便計算最後一格寬

  const stripe = {
    id: 'stripe',
    beforeDraw(c) {
      const { ctx, chartArea: { top, bottom } } = c;
      const scale = c.scales.x;
      ctx.save();
      qPos.forEach((p, i) => {
        if (i === qPos.length - 1) return;
        const left = scale.getPixelForValue(p);
        const right = scale.getPixelForValue(qPos[i + 1]);
        ctx.fillStyle = i % 2 ? 'rgba(0,0,0,.05)' : 'transparent';
        ctx.fillRect(left, top, right - left, bottom - top);
      });
      ctx.restore();
    }
  };

  /* -------- C. 找 max / min & 最後一筆 -------- */
  const maxI = T.indexOf(Math.max(...T));
  const minI = T.indexOf(Math.min(...T));

  /* -------- D. Dataset 工具 -------- */
  const mkLine = (d, col, fill) => ({
    data: d, stepped: true,
    borderColor: col, borderWidth: 2,
    pointRadius: 2,                     // <<< 需求 #2
    pointBackgroundColor: col, pointBorderColor: col, pointBorderWidth: 1,
    fill,
    datalabels: {                      // 只對最後一筆顯示數字 (#4)
      display: ctx => ctx.dataIndex === d.length - 1,
      anchor: 'start', align: 'left', offset: 6,
      formatter: v => v.toLocaleString('zh-TW'),
      color: '#000', clip: false, font: { size: 10 }
    }
  });

  const mkSpot = (d, i, col) => ({    // Max / Min 額外標註 (#3)
    type: 'scatter',
    data: [{ x: X[i], y: d[i] }],
    pointRadius: 6, backgroundColor: col, borderColor: col,
    datalabels: {
      display: true,
      anchor: i === maxI ? 'end' : 'start',
      align : i === maxI ? 'top' : 'bottom',
      offset: 8,
      formatter: v => v.y.toLocaleString('zh-TW'),
      color: '#000', clip: false, font: { size: 10 }
    }
  });

  /* -------- E. 右側留白 -------- */
  const extra = 0.5;                       // 外推 0.5 格
  const paddingR = 40;                     // 40px

  chart = new Chart(cvs, {
    type: 'line',
    data: {
      labels: X,
      datasets: [
        mkLine(T, '#fbc02d', { target: 'origin',
          above: 'rgba(255,138,128,.18)', below: 'rgba(200,230,201,.18)' }),
        mkLine(L, '#d32f2f'),
        mkLine(S, '#2e7d32'),
        mkLine(P, '#212121'),

        mkSpot(T, maxI, '#d32f2f'),
        mkSpot(T, minI, '#2e7d32')
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { bottom: 42, right: paddingR } },      // <<< #15
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + c.parsed.y.toLocaleString('zh-TW') } },
        datalabels: {}                                           // 個別 dataset 控制
      },
      scales: {
        x: {
          type: 'linear',
          min: -0.5, max: X.length - 1 + extra,
          grid: { display: false },
          ticks: { display: false }
        },
        y: { ticks: { callback: v => v.toLocaleString('zh-TW') } }
      }
    },
    plugins: [stripe, ChartDataLabels]
  });
}

/* ---------- 小工具 ---------- */
const fmt = n => n.toLocaleString('zh-TW');
function fmtTs(s){
  return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
}
function flash(el){ el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'), 600); }
