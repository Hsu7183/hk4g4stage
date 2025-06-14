/* ========= 參數 ========= */
const MULT = 200;          // 每點 200 元
const FEE  = 45;           // 單邊手續費 45 元
const TAX  = 0.00004;      // 期交稅率
const SLIP = 1.5;          // 滑價點數

const ENTRY  = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];

/* ========= 初始化 ========= */
document.addEventListener('DOMContentLoaded', () => {

  /* 貼上剪貼簿 */
  document.getElementById('btn-clip').addEventListener('click', async e => {
    try {
      const txt = await navigator.clipboard.readText();
      analyse(txt);
      flash(e.target);
    } catch (err) {
      alert('無法讀取剪貼簿：' + err.message);
    }
  });

  /* 選檔 */
  document.getElementById('fileInput').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const txt = new TextDecoder('big5').decode(rd.result);
      analyse(txt);
      flash(e.target.parentElement);
    };
    rd.readAsArrayBuffer(f);
  });
});

/* ========= 主分析 ========= */
function analyse(raw) {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) return;

  /* === 準備累積陣列 === */
  const tsArr = [];        // 時間戳 (yyyyMMddHHmmss)
  const mainArr  = [];     // 總累積
  const longArr  = [];     // 多單累積
  const shortArr = [];     // 空單累積
  const slipArr  = [];     // 滑價累積

  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  /* === 交易配對 === */
  const q  = [];   // 進場佇列
  const tr = [];   // 完成配對的交易

  rows.forEach(r => {
    const [ts, pStr, act] = r.trim().split(/\s+/);
    if (!act) return;

    const price = +parseFloat(pStr);

    /* 進場 */
    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: ts, typeIn: act });
      return;
    }

    /* 找對手出場 */
    const idx = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (idx === -1) return;

    const pos = q.splice(idx, 1)[0];          // 取出配對

    const pts = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE * 2;
    const tax = Math.round(price * MULT * TAX);
    const gain      = pts * MULT - fee - tax;
    const gainSlip  = gain - SLIP * MULT;

    cum     += gain;
    cumSlip += gainSlip;
    if (pos.side === 'L') cumL += gain; else cumS += gain;

    tr.push({
      in : { ts: pos.tsIn.slice(0, 12), price: pos.pIn, type: pos.typeIn },
      out: { ts: ts.slice(0, 12), price, type: act, pts, fee, tax, gain,
             cum, gainSlip, cumSlip }
    });

    tsArr  .push(ts);       // yyyyMMddHHmmss
    mainArr .push(cum);
    longArr .push(cumL);
    shortArr.push(cumS);
    slipArr .push(cumSlip);
  });

  if (!tr.length) { alert('沒有成功配對的交易！'); return; }

  renderTable(tr);
  drawChart(tsArr, mainArr, longArr, shortArr, slipArr);
}

/* ========= 表格 ========= */
function renderTable(list) {
  const tbody = document.querySelector('#tbl tbody');
  tbody.innerHTML = '';

  list.forEach((t, i) => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2" valign="middle">${i + 1}</td>
        <td>${t.in.ts}</td><td>${t.in.price}</td><td>${t.in.type}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${t.out.ts}</td><td>${t.out.price}</td><td>${t.out.type}</td>
        <td>${fmt(t.out.pts)}</td><td>${fmt(t.out.fee)}</td><td>${fmt(t.out.tax)}</td>
        <td>${fmt(t.out.gain)}</td><td>${fmt(t.out.cum)}</td>
        <td>${fmt(t.out.gainSlip)}</td><td>${fmt(t.out.cumSlip)}</td>
      </tr>
    `);
  });

  document.getElementById('tbl').hidden = false;
}

/* ========= 畫圖 ========= */
let chart;
function drawChart(tsArr, main, longArr, shortArr, slipArr) {

  if (chart) chart.destroy();

  /* x 軸月份字串 */
  const monthStr = tsArr.map(s => `${s.slice(0, 4)}/${s.slice(4, 6)}`);
  const uniqMonths = [...new Set(monthStr)];
  const step = Math.ceil(uniqMonths.length / 24);   // 顯示 ≤ 24 個月份

  /* 極值索引 */
  const maxVal = Math.max(...main);
  const minVal = Math.min(...main);
  const maxIdx = main.indexOf(maxVal);
  const minIdx = main.indexOf(minVal);

  chart = new Chart(document.getElementById('equityChart'), {
    type: 'line',
    data: {
      labels: tsArr,      // 完整時間戳
      datasets: [
        /* 黃 ─ 總累積 */
        {
          label: '總累積',
          data: main,
          borderColor: '#fbc02d',
          borderWidth: 2,
          pointRadius: 0,
          fill: { target: 'origin', above: 'rgba(251,192,45,.15)' }
        },
        /* 紅 ─ 多單 */
        {
          label: '多單累積',
          data: longArr,
          borderColor: '#d32f2f',
          borderWidth: 1.4,
          pointRadius: 0,
          fill: false
        },
        /* 綠 ─ 空單 */
        {
          label: '空單累積',
          data: shortArr,
          borderColor: '#2e7d32',
          borderWidth: 1.4,
          pointRadius: 0,
          fill: false
        },
        /* 黑 ─ 滑價 */
        {
          label: '滑價累積',
          data: slipArr,
          borderColor: '#212121',
          borderWidth: 1.4,
          pointRadius: 0,
          fill: false
        },
        /* 紅點 (最大獲利) */
        {
          label: 'Max',
          data: main.map((v, i) => (i === maxIdx ? v : null)),
          pointRadius: 6,
          pointBackgroundColor: '#d32f2f',
          borderWidth: 0,
          showLine: false,
          datalabels: { display: true, align: 'top', formatter: v => fmt(v) }
        },
        /* 綠點 (最大虧損) */
        {
          label: 'Min',
          data: main.map((v, i) => (i === minIdx ? v : null)),
          pointRadius: 6,
          pointBackgroundColor: '#2e7d32',
          borderWidth: 0,
          showLine: false,
          datalabels: { display: true, align: 'bottom', formatter: v => fmt(v) }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: { display: false },
        /* 預設關掉 datalabel，只留極值兩條開啟 */
        datalabels: { display: false },
        tooltip: {
          callbacks: { label: c => ' ' + fmt(c.parsed.y) }
        }
      },

      scales: {
        x: {
          type: 'category',
          ticks: {
            /* 每月顯示一次，最多 24 個 */
            callback: (v, i) => {
              const m = monthStr[i];
              return uniqMonths.indexOf(m) % step === 0 ? m : '';
            },
            maxRotation: 45,
            minRotation: 45
          },
          grid: { display: false }
        },
        y: {
          ticks: { callback: v => fmt(v) }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

/* ========= 小工具 ========= */
const fmt = v => (v === '' || v === undefined ? '' : (+v).toLocaleString('zh-TW'));

function flash(el) {
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 600);
}
