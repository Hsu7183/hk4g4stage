/* ===== 常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'],
      EXIT_L = ['平賣', '強制平倉'],
      EXIT_S = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ----- KPI 容器（style 已在 style.css） ----- */
let statBox = document.getElementById('stats');

/* ----- 貼上、選檔 ----- */
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

/* ----- 主分析 ----- */
function analyse(raw) {
  let rows = raw.trim().split(/\r?\n/);
  if (!rows.length) { alert('空檔案'); return; }

  // 若第一行為參數就去除
  if(/(\d{2,}\.\d{6}\s+){5,}/.test(rows[0])) rows.shift();

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach((r) => {
    const [tsRaw0, pStr0, act] = r.trim().split(/\s+/); if (!act) return;
    const tsRaw = String(tsRaw0).split('.')[0];
    const price = Math.round(+pStr0);

    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw });
      return;
    }

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
  drawCurve(cvs, tsArr, tot, lon, sho, sli);
}

/* ----- KPI 輸出（卡片式） ----- */
function renderStats(tr, seq) {
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const pct = x => (x * 100).toFixed(1) + '%';
  const byDay = list => {
    const m = {};
    list.forEach(t => { const d = t.tsOut.slice(0, 8); m[d] = (m[d] || 0) + t.gain; });
    return Object.values(m);
  };
  const up = s => { let min = s[0], v = 0; s.forEach(x=>{min=Math.min(min,x); v=Math.max(v,x-min)}); return v; };
  const dn = s => { let pk = s[0], v = 0; s.forEach(x=>{pk=Math.max(pk,x); v=Math.min(v,x-pk)}); return v; };

  const longs  = tr.filter(t => t.pos.side === 'L');
  const shorts = tr.filter(t => t.pos.side === 'S');

  const make = (list, cumSeq) => {
    const win  = list.filter(t => t.gain > 0);
    const loss = list.filter(t => t.gain < 0);
    return {
      '交易數': list.length, '勝率': pct(win.length/(list.length||1)),
      '敗率': pct(loss.length/(list.length||1)),
      '正點數': sum(win.map(t=>t.pts)), '負點數': sum(loss.map(t=>t.pts)),
      '總點數': sum(list.map(t=>t.pts)),
      '累積獲利': sum(list.map(t=>t.gain)),
      '滑價累計獲利': sum(list.map(t=>t.gainSlip)),
      '單日最大獲利': Math.max(...byDay(list)),
      '單日最大虧損': Math.min(...byDay(list)),
      '區間最大獲利': up(cumSeq), '區間最大回撤': dn(cumSeq)
    };
  };

  const stats = { '全部': make(tr,seq.tot), '多單': make(longs,seq.lon), '空單': make(shorts,seq.sho) };

  let html = '';
  Object.entries(stats).forEach(([title, obj]) => {
    html += `<section><h3>${title}</h3><div class="stat-grid">`;
    Object.entries(obj).forEach(([k, v]) => {
      html += `<div class="stat-item"><span class="stat-key">${k}</span><span class="stat-val">${fmt(v)}</span></div>`;
    });
    html += `</div></section>`;
  });
  statBox.innerHTML = html;
}

/* ----- 交易表 ----- */
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

/* ----- 小工具 ----- */
const fmt   = n => typeof n==='number' ? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : n;
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
function sumUpTo(arr, idx, key){return arr.slice(0, idx + 1).reduce((a,b)=>a + b[key], 0);}
