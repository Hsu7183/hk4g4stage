/* ===== 參數 ===== */
const MULT = 200,
      FEE  = 45,
      TAX  = 0.00004,
      SLIP = 1.5;

const ENTRY   = ['新買', '新賣'],
      EXIT_L  = ['平賣', '強制平倉'],   // 多單出場/強平
      EXIT_S  = ['平買', '強制平倉'];   // 空單出場/強平

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ---------------- 讀取剪貼簿 / 檔案 ---------------- */

document.getElementById('btn-clip').onclick = async e => {
  try {
    analyse(await navigator.clipboard.readText());
    flash(e.target);
  } catch (err) {
    alert(err.message);
  }
};

document.getElementById('fileInput').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;

  const read = enc => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(f, enc) : r.readAsText(f);
  });

  (async () => {
    try {
      analyse(await read('big5'));          // 先嘗試 Big5
    } catch {
      analyse(await read());                // 不行再用預設編碼
    }
    flash(e.target.parentElement);
  })();
};

/* ---------------- 主分析 ---------------- */

function analyse (raw) {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) {
    alert('空檔案');
    return;
  }

  /* 解析交易 ──── */
  const q  = [];          // 尚未平倉的部位佇列
  const tr = [];          // 完整配對後的交易

  const tot = [],         // 總損益
        lon = [],         // 多單損益
        sho = [],         // 空單損益
        sli = [];         // 含滑價損益
  const tsArr = [];       // 交易時間字串（用於判斷季度）

  let cum      = 0,       // 累積總損益
      cumL     = 0,       // 累積多單損益
      cumS     = 0,       // 累積空單損益
      cumSlip  = 0;       // 累積含滑價損益

  rows.forEach(r => {
    const [tsRaw, priceStr, act] = r.trim().split(/\s+/);
    if (!act) return;                     // 資料缺漏

    const price = +priceStr;

    /* 進場 */
    if (ENTRY.includes(act)) {
      q.push({
        side   : act === '新買' ? 'L' : 'S',
        pIn    : price,
        tsIn   : tsRaw,
        typeIn : act
      });
      return;
    }

    /* 出場（找第一筆符合方向的未平倉部位） */
    const idx = q.findIndex(o => (o.side === 'L' && EXIT_L.includes(act)) ||
                                  (o.side === 'S' && EXIT_S.includes(act)));
    if (idx === -1) return;               // 找不到對應倉位

    const pos = q.splice(idx, 1)[0];      // 取出並移除

    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2;                 // 進 + 出
    const tax  = Math.round(price * MULT * TAX);

    const gain     = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum     += gain;
    cumSlip += gainSlip;
    pos.side === 'L' ? (cumL += gain) : (cumS += gain);

    tr.push({
      pos,
      tsOut   : tsRaw,
      priceOut: price,
      actOut  : act,
      pts,
      fee,
      tax,
      gain,
      cum,
      gainSlip,
      cumSlip
    });

    tot.push(cum);
    lon.push(cumL);
    sho.push(cumS);
    sli.push(cumSlip);
    tsArr.push(tsRaw);
  });

  if (!tr.length) {
    alert('沒有成功配對的交易');
    return;
  }

  renderTable(tr);
  drawChart(tsArr, tot, lon, sho, sli);
}

/* ---------------- 表格 ---------------- */

function renderTable (list) {
  const body = tbl.querySelector('tbody');
  body.innerHTML = '';

  list.forEach((t, i) => {
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i + 1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td>
        <td>${t.pos.pIn}</td>
        <td>${t.pos.typeIn}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td>
        <td>${t.priceOut}</td>
        <td>${t.actOut}</td>
        <td>${fmt(t.pts)}</td>
        <td>${fmt(t.fee)}</td>
        <td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td>
        <td>${fmt(t.cum)}</td>
        <td>${fmt(t.gainSlip)}</td>
        <td>${fmt(t.cumSlip)}</td>
      </tr>`);
  });

  tbl.hidden = false;
}

/* ---------------- 畫圖 ---------------- */

let chart;

function drawChart (tsArr, T, L, S, P) {
  if (chart) chart.destroy();

  /* === X 軸：逐筆交易序號（從 1 開始） === */
  const X = T.map((_, i) => i + 1);

  /* === 算出每季的起訖索引 === */
  const getQuarter = s => {
    const y = s.slice(0, 4),
          m = +s.slice(4, 6);
    return `${y}Q${Math.floor((m - 1) / 3) + 1}`;
  };

  const quarters = [];
  let curQ   = getQuarter(tsArr[0]);
  let startI = 0;

  tsArr.forEach((ts, i) => {
    const q = getQuarter(ts);
    if (q !== curQ) {
      quarters.push({ label: curQ, start: startI, end: i - 1 });
      curQ   = q;
      startI = i;
    }
  });
  quarters.push({ label: curQ, start: startI, end: tsArr.length - 1 });

  /* === 背景季條 === */
  const stripe = {
    id: 'stripe',
    beforeDraw (c) {
      const { ctx, chartArea: { top, bottom } } = c;
      const xScale = c.scales.x;
      ctx.save();
      quarters.forEach((q, i) => {
        const x1 = xScale.getPixelForValue(q.start + 0.5),
              x2 = xScale.getPixelForValue(q.end + 1.5);
        ctx.fillStyle = i % 2 ? 'rgba(0,0,0,.05)' : 'transparent';
        ctx.fillRect(x1, top, x2 - x1, bottom - top);
      });
      ctx.restore();
    }
  };

  /* === 季度標籤 === */
  const qLabel = {
    id: 'qLabel',
    afterDraw (c) {
      const { ctx, chartArea: { bottom } } = c;
      const xScale = c.scales.x;
      ctx.save();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#555';
      quarters.forEach(q => {
        const mid = (q.start + q.end + 2) / 2;   // +2 因 X 從 1 起算
        const x   = xScale.getPixelForValue(mid);
        ctx.fillText(q.label, x, bottom + 8);
      });
      ctx.restore();
    }
  };

  /* === 最後數值固定右側標籤 === */
  const lastValueLabel = {
    id: 'lastValueLabel',
    afterDraw (c) {
      const { ctx, chartArea: { right, top, bottom } } = c;
      ctx.save();
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // 只處理前四條主線 (0~3)
      c.data.datasets.slice(0, 4).forEach(ds => {
        const meta = c.get
