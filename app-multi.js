/* ===== 成本與滑價參數（與單檔版一致，可依市場調整） ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const CFG = {
  feeBothSides   : true,          // 手續費是否雙邊
  taxOnExitOnly  : true,          // 稅是否只算在出場
  slipMode       : 'total',       // 'total'：每筆固定扣 SLIP 點；'half-per-fill'：進出各扣半
};
const ENTRY = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉'];
const EXIT_S = ['平買','強制平倉'];

/* ===== UI ===== */
const filesInput = document.getElementById('filesInput');
const btnClear   = document.getElementById('btn-clear');
const tbl        = document.getElementById('tblBatch');
const thead      = tbl.querySelector('thead');
const tbody      = tbl.querySelector('tbody');

/* ===== KPI 欄位定義（每組：全部 / 多單 / 空單 都會有） ===== */
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

/* ===== 動作 ===== */
filesInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // 建表頭
  buildHeader();

  // 逐檔讀取與分析
  tbody.innerHTML = '';
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const text = await readFileWithFallback(f);
      const kpi = analyseToKPI(text);
      appendRow(f.name, kpi);
    } catch (err) {
      appendRow(f.name, null, err);
    }
  }
});

btnClear.addEventListener('click', () => {
  filesInput.value = '';
  thead.innerHTML = '';
  tbody.innerHTML = '';
});

/* ===== 檔案讀取（big5→utf-8 回退） ===== */
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

/* ===== 解析 → 交易序列 → KPI ===== */
function analyseToKPI(raw) {
  const rows = (raw || '').trim().split(/\r?\n/).filter(Boolean);
  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (const r of rows) {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/);
    if (!act) continue;
    const price = +pStr;

    // 進場
    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw });
      continue;
    }

    // 出場配對 FIFO
    const qi = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (qi === -1) continue;
    const pos = q.splice(qi, 1)[0];

    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;

    const fee = (CFG.feeBothSides ? FEE * 2 : FEE);
    const tax = TAX
      ? (CFG.taxOnExitOnly
          ? Math.round(price * MULT * TAX)
          : Math.round((pos.pIn + price) * MULT * TAX))
      : 0;

    const gain = pts * MULT - fee - tax;

    const slipMoney = (CFG.slipMode === 'half-per-fill') ? (SLIP * MULT * 2) : (SLIP * MULT);
    const gainSlip  = gain - slipMoney;

    cum += gain; cumSlip += gainSlip;
    (pos.side === 'L') ? (cumL += gain) : (cumS += gain);

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }

  return buildKPI(tr, { tot, lon, sho, sli });
}

/* ===== KPI 計算（與單檔版一致） ===== */
function buildKPI(tr, seq) {
  const sum  = arr => arr.reduce((a,b)=>a+b,0);
  const pct  = x => (x*100).toFixed(1) + '%';
  const safeMax = arr => arr.length ? Math.max(...arr) : 0;
  const safeMin = arr => arr.length ? Math.min(...arr) : 0;

  const byDay = list => {
    const m = {};
    for (const t of list) {
      const d = (t.tsOut||'').slice(0,8);
      m[d] = (m[d] || 0) + (t.gain||0);
    }
    return Object.values(m);
  };

  const drawUp = s => {
    if (!s.length) return 0;
    let min = s[0], up = 0;
    for (const v of s) { min = Math.min(min, v); up = Math.max(up, v - min); }
    return up;
  };
  const drawDn = s => {
    if (!s.length) return 0;
    let peak = s[0], dn = 0;
    for (const v of s) { peak = Math.max(peak, v); dn = Math.min(dn, v - peak); }
    return dn;
  };

  const streaks = list => {
    let cw=0, cl=0, mw=0, ml=0;
    for (const t of list) {
      if (t.gain > 0) { cw++; cl=0; if(cw>mw) mw=cw; }
      else if (t.gain < 0) { cl++; cw=0; if(cl>ml) ml=cl; }
    }
    return {maxWinStreak:mw, maxLossStreak:ml};
  };

  const longs  = tr.filter(t => t.pos?.side === 'L');
  const shorts = tr.filter(t => t.pos?.side === 'S');

  const make = (list, cumSeq) => {
    if (!list.length) {
      return {
        n:0, winRate:'0.0%', lossRate:'0.0%',
        posPts:0, negPts:0, sumPts:0,
        sumGain:0, sumGainSlip:0,
        maxDay:0, minDay:0, maxRunUp:0, maxDrawdown:0,
        pf:'—', avgW:0, avgL:0, rr:'—', expectancy:0,
        maxWinStreak:0, maxLossStreak:0
      };
    }
    const win  = list.filter(t => t.gain > 0);
    const loss = list.filter(t => t.gain < 0);

    const winAmt  = sum(win.map(t => t.gain));
    const lossAmt = -sum(loss.map(t => t.gain));
    const pf = lossAmt === 0 ? (winAmt > 0 ? '∞' : '—') : (winAmt / lossAmt).toFixed(2);

    const avgW = win.length  ? (winAmt / win.length) : 0;
    const avgL = loss.length ? (-lossAmt / loss.length) : 0; // 負值
    const rr   = (avgL === 0) ? '—' : (Math.abs(avgW / avgL)).toFixed(2);

    const expectancy = (win.length + loss.length)
      ? (winAmt - lossAmt) / (win.length + loss.length)
      : 0;

    const {maxWinStreak, maxLossStreak} = streaks(list);

    return {
      n: list.length,
      winRate: pct(win.length / list.length),
      lossRate: pct(loss.length / list.length),
      posPts: sum(win.map(t=>t.pts)),
      negPts: sum(loss.map(t=>t.pts)),
      sumPts: sum(list.map(t=>t.pts)),
      sumGain: sum(list.map(t=>t.gain)),
      sumGainSlip: sum(list.map(t=>t.gainSlip)),
      maxDay: safeMax(byDay(list)),
      minDay: safeMin(byDay(list)),
      maxRunUp: drawUp(cumSeq),
      maxDrawdown: drawDn(cumSeq),
      pf, avgW, avgL, rr, expectancy,
      maxWinStreak, maxLossStreak
    };
  };

  return {
    全部: make(tr, seq.tot||[]),
    多單: make(longs, seq.lon||[]),
    空單: make(shorts, seq.sho||[])
  };
}

/* ===== 表頭與列渲染 ===== */
function buildHeader() {
  // 產生一列扁平表頭：檔名 + 各組KPI（前綴）
  const cells = ['<th class="nowrap">檔名</th>'];
  for (const g of GROUPS) {
    for (const [label] of KPI_ORDER) {
      cells.push(`<th class="nowrap">${g}-${label}</th>`);
    }
  }
  thead.innerHTML = `<tr>${cells.join('')}</tr>`;
}

function appendRow(filename, kpi, err) {
  if (!kpi) {
    const colSpan = 1 + GROUPS.length * KPI_ORDER.length;
    const row = `<tr><td class="nowrap">${escapeHTML(filename)}</td><td colspan="${colSpan-1}" style="color:#c00;text-align:left">讀取/解析失敗：${escapeHTML(err?.message||'未知錯誤')}</td></tr>`;
    tbody.insertAdjacentHTML('beforeend', row);
    return;
  }

  const tds = [`<td class="nowrap">${escapeHTML(filename)}</td>`];
  for (const g of GROUPS) {
    const obj = kpi[g] || {};
    for (const [, key] of KPI_ORDER) {
      tds.push(`<td>${fmt(obj[key])}</td>`);
    }
  }
  tbody.insertAdjacentHTML('beforeend', `<tr>${tds.join('')}</tr>`);
}

/* ===== 小工具 ===== */
const fmt = n => (typeof n==='number' && isFinite(n))
  ? n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
  : (n ?? '—');

function escapeHTML(s='') {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
