/* ===== 參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded', () => {
  /* 貼上剪貼簿 */
  document.getElementById('btn-clip').addEventListener('click', async e => {
    try { analyse(await navigator.clipboard.readText()); flash(e.target); }
    catch (err) { alert('剪貼簿失敗：' + err.message); }
  });

  /* 選檔案 (自動偵測 UTF-8 或 Big-5) */
  document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const read = enc => new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(r.result); r.onerror = () => no(r.error);
      enc ? r.readAsText(file, enc) : r.readAsText(file);
    });
    (async () => {
      try { analyse(await read('big5')); } catch { analyse(await read()); }
      flash(e.target.parentElement);
    })();
  });
});

/* ===== 主分析 ===== */
function analyse(raw) {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) return alert('檔案為空');

  /* 交易統計陣列 */
  const q = [], tr = [];
  const ts = [], tot = [], longArr = [], shortArr = [], slipArr = [];

  let cum = 0, cumLong = 0, cumShort = 0, cumSlip = 0;

  rows.forEach(r => {
    const [tsRaw, priceStr, act] = r.trim().split(/\s+/);
    if (!act) return;
    const price = +parseFloat(priceStr);

    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw, typeIn: act });
      return;
    }

    /* 找平倉 */
    const idx = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act)));
    if (idx === -1) return;
    const pos = q.splice(idx, 1)[0];

    /* 計算損益 */
    const pts = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE * 2;
    const tax = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain;  cumSlip += gainSlip;
    pos.side === 'L' ? cumLong += gain : cumShort += gain;

    /* 紀錄單筆 */
    tr.push({
      in:  { ts: pos.tsIn.slice(0, 12), price: pos.pIn, type: pos.typeIn },
      out: { ts: tsRaw.slice(0, 12), price, type: act,
             pts, fee, tax, gain, cum, gainSlip, cumSlip }
    });

    /* 時序陣列（逐筆，不再壓縮） */
    ts.push(tsRaw.slice(0, 8));   // 只留到日，x 軸比較乾淨
    tot.push(cum);
    longArr.push(cumLong);
    shortArr.push(cumShort);
    slipArr.push(cumSlip);
  });

  if (!tr.length) return alert('沒有成功配對的交易！');

  renderTable(tr);
  drawChart(ts, tot, longArr, shortArr, slipArr);
}

/* ===== 表格 ===== */
function renderTable(list) {
  const tb = document.querySelector('#tbl tbody');
  tb.innerHTML = '';
  list.forEach((t, i) => {
    tb.insertAdjacentHTML('beforeend', `
      <tr><td rowspan="2">${i + 1}</td>
          <td>${t.in.ts}</td><td>${t.in.price}</td><td>${t.in.type}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${t.out.ts}</td><td>${t.out.price}</td><td>${t.out.type}</td>
          <td>${fmt(t.out.pts)}</td><td>${fmt(t.out.fee)}</td><td>${fmt(t.out.tax)}</td>
          <td>${fmt(t.out.gain)}</td><td>${fmt(t.out.cum)}</td>
          <td>${fmt(t.out.gainSlip)}</td><td>${fmt(t.out.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden = false;
}

/* ===== 畫圖（逐筆階梯線 + 最後一筆 / 最大 / 最小標示） ===== */
let chart;
function drawChart(lbl, T, L, S, P) {
  if (chart) chart.destroy();

  const last = lbl.length - 1;
  const maxI = T.indexOf(Math.max(...T));
  const minI = T.indexOf(Math.min(...T));

  /* 月份黑白相間背景 */
  const stripe = {
    id: 'stripe',
    beforeDraw(c) {
      const { ctx, chartArea: { top, bottom } } = c, x = c.scales.x;
      ctx.save();
      lbl.forEach((d, i) => {
        if (i % 2 === 0) {
          const x0 = x.getPixelForTick(i);
          const x1 = x.getPixelForTick(i + 1) || x0 + (x.getPixelForTick(1) - x0);
          ctx.fillStyle = i % 4 === 0 ? 'rgba(0,0,0,.05)' : 'rgba(0,0,0,.02)';
          ctx.fillRect(x0, top, x1 - x0, bottom - top);
        }
      });
      ctx.restore();
    }
  };

  /* 共用階梯樣式 */
  const stepLine = (c, w) => ({
    borderColor: c, borderWidth: w, stepped: true,
    pointRadius: 2, pointBackgroundColor: c, pointBorderColor: c,
    fill: false
  });

  /* 單一點資料集（顯示 max / min / last） */
  const dot = (arr, idx, col, r = 6) => ({
    data: arr.map((v, i) => (i === idx ? v : null)),
    showLine: false,
    pointRadius: r, pointBackgroundColor: col, pointBorderColor: '#fff', pointBorderWidth: 1
  });

  chart = new Chart(document.getElementById('equityChart'), {
    type: 'line',
    data: {
      labels: lbl,
      datasets: [
        /* 總 / 多 / 空 / 滑 */
        { label: '總', data: T, ...stepLine('#fbc02d', 2),
          fill: { target: 'origin',
                  above: 'rgba(255,138,128,.18)',
                  below: 'rgba(200,230,201,.18)' } },
        { label: '多', data: L, ...stepLine('#d32f2f', 2) },
        { label: '空', data: S, ...stepLine('#2e7d32', 2) },
        { label: '滑', data: P, ...stepLine('#212121', 2) },

        /* 四條線最後一筆 */
        dot(T, last, '#fbc02d', 5),
        dot(L, last, '#d32f2f', 5),
        dot(S, last, '#2e7d32', 5),
        dot(P, last, '#212121', 5),

        /* 最大 / 最小 */
        dot(T, maxI, '#d32f2f', 7),
        dot(T, minI, '#2e7d32', 7)
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + c.parsed.y.toLocaleString('zh-TW') } },
        datalabels: {
          color: '#000', font: { size: 10 }, clip: false,
          display: ctx => {
            /* 只顯示：最大、最小、四條線最後一點 */
            const ds = ctx.datasetIndex, idx = ctx.dataIndex;
            return (
              /* 最後 4 點 */
              (ds >= 4 && ds <= 7) ||
              /* 最大 / 最小 */
              (ds === 8 || ds === 9)
            );
          },
          anchor: 'end', align: 'left', offset: 6,
          formatter: v => v?.toLocaleString('zh-TW') ?? ''
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45 } },
        y: { ticks: { callback: v => v.toLocaleString('zh-TW') } }
      }
    },
    plugins: [stripe, window.ChartDataLabels || {}]
  });
}

/* ===== 工具 ===== */
const fmt = v => (v === '' || v === undefined) ? '' : v.toLocaleString('zh-TW');
function flash(el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 600); }
