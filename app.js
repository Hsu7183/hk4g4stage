/* ===== 參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'],
      EXIT_L = ['平賣', '強制平倉'],
      EXIT_S = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ---------- 讀取剪貼簿 / 檔案 ---------- */
document.getElementById('btn-clip').onclick = async e => {
  try { analyse(await navigator.clipboard.readText()); flash(e.target); }
  catch (err) { alert(err.message); }
};
document.getElementById('fileInput').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const read = enc => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result); r.onerror = () => no(r.error);
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
  const ymSeq = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach(r => {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/); if (!act) return;
    const price = +pStr;

    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw, typeIn: act });
      return;
    }
    const idx = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act)));
    if (idx === -1) return;
    const pos = q.splice(idx, 1)[0];

    const pts = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE * 2, tax = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax, gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side === 'L' ? cumL += gain : cumS += gain;

    tr.push({
      pos, tsOut: tsRaw, priceOut: price, actOut: act,
      pts, fee, tax, gain, cum, gainSlip, cumSlip
    });

    ymSeq.push(tsRaw.slice(0, 6));
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  });

  if (!tr.length) { alert('沒有成功配對的交易'); return; }

  renderTable(tr);
  drawChart(ymSeq, tot, lon, sho, sli);
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
function drawChart(ymArr, T, L, S, P) {
  if (chart) chart.destroy();

  /* 26 個月份（資料前後各 +1 月） */
  const ym2Date = ym => new Date(+ym.slice(0, 4), +ym.slice(4, 6) - 1);
  const addM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n);
  const toYM = d => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  const start = addM(ym2Date(ymArr[0]), -1);
  const months = [];
  for (let d = start; months.length < 26; d = addM(d, 1)) months.push(toYM(d));
  const monthIdx = {}; months.forEach((m, i) => monthIdx[m.replace('/', '')] = i);

  /* 每筆一點：月序 + 0.001*流水號 */
  const dup = {}, X = [];
  ymArr.forEach(m => {
    dup[m] = (dup[m] ?? 0) + 1;
    X.push(monthIdx[m] + dup[m] * 0.001);
  });

  const maxI = T.indexOf(Math.max(...T));
  const minI = T.indexOf(Math.min(...T));

  /* ---------- 背景黑白條與月份文字 ---------- */
  const stripe = {
    id: 'stripe', beforeDraw(c) {
      const { ctx, chartArea: { left, right, top, bottom } } = c,
            w = (right - left) / 26;
      ctx.save();
      months.forEach((_, i) => {
        ctx.fillStyle = i % 2 ? 'rgba(0,0,0,.05)' : 'transparent';
        ctx.fillRect(left + i * w, top, w, bottom - top);
      });
      ctx.restore();
    }
  };
  const mmLabel = {
    id: 'mmLabel', afterDraw(c) {
      const { ctx, chartArea: { left, right, bottom } } = c,
            w = (right - left) / 26;
      ctx.save();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#555';
      months.forEach((m, i) => ctx.fillText(m, left + w * (i + .5), bottom + 8));
      ctx.restore();
    }
  };

  /* ---------- 線 / 點 樣式 (階梯步進 + 實心圓) ---------- */
  const mkLine = (d, col, fill = false) => ({
    data: d,
    stepped: true,                     // ★ 改為階梯步進
    borderColor: col,
    borderWidth: 2,
    pointRadius: 4,
    pointBackgroundColor: col,
    pointBorderColor: col,
    pointBorderWidth: 1,
    fill
  });
  const mkLast = (d, col) => ({
    data: d.map((v, i) => i === d.length - 1 ? v : null),
    showLine: false,
    pointRadius: 6,
    pointBackgroundColor: col,
    pointBorderColor: col,
    pointBorderWidth: 1,
    datalabels: {
      display: true, anchor: 'start', align: 'left', offset: 6,
      formatter: v => v?.toLocaleString('zh-TW') ?? '',
      color: '#000', clip: false, font: { size: 10 }
    }
  });
  const mkMark = (d, i, col) => ({
    data: d.map((v, j) => j === i ? v : null),
    showLine: false,
    pointRadius: 6,
    pointBackgroundColor: col,
    pointBorderColor: col,
    pointBorderWidth: 1,
    datalabels: {
      display: true,
      anchor: i === maxI ? 'end' : 'start',
      align: i === maxI ? 'top' : 'bottom',
      offset: 8,
      formatter: v => v?.toLocaleString('zh-TW') ?? '',
      color: '#000', clip: false, font: { size: 10 }
    }
  });

  chart = new Chart(cvs, {
    type: 'line',
    data: {
      labels: X,
      datasets: [
        mkLine(T, '#fbc02d', {
          target: 'origin',
          above: 'rgba(255,138,128,.18)',   /* >0 tint */
          below: 'rgba(200,230,201,.18)'    /* <0 tint */
        }),
        mkLine(L, '#d32f2f'),
        mkLine(S, '#2e7d32'),
        mkLine(P, '#212121'),

        mkLast(T, '#fbc02d'), mkLast(L, '#d32f2f'),
        mkLast(S, '#2e7d32'), mkLast(P, '#212121'),

        mkMark(T, maxI, '#d32f2f'),
        mkMark(T, minI, '#2e7d32')
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 42 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: c => ' ' + c.parsed.y.toLocaleString('zh-TW') }
        },
        datalabels: { display: false }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 25.999,
          grid: { display: false },
          ticks: { display: false }
        },
        y: {
          ticks: { callback: v => v.toLocaleString('zh-TW') }
        }
      }
    },
    plugins: [stripe, mmLabel, ChartDataLabels]
  });
}

/* ---------- 工具 ---------- */
const fmt = n => n.toLocaleString('zh-TW');
function fmtTs(s) {
  return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}
function flash(el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 600); }
