import { parseOne, fmtTs, runKPI, drawCurve } from './shared.js';

const $ = s => document.querySelector(s);
const table = $('#summary');
const body  = table.querySelector('tbody');
const tTop  = $('#topTrades').querySelector('tbody');
const cvs   = $('#multiChart');

let chart; // for multi

$('#multiInput').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  body.innerHTML = '';
  const rows = [];
  for (const f of files) {
    const raw = await f.text();
    const { trades, params } = parseOne(raw);
    const kpi = runKPI(trades);
    rows.push({
      name: f.name.replace(/\.[^.]+$/,''),
      params,
      trades,
      kpi
    });
  }

  // 渲染表格
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.params.map(v => String(Math.trunc(+v))).join(' / ') || '—'}</td>
      <td>${r.trades.length}</td>
      <td>${(r.kpi.all.sumGain).toLocaleString('zh-TW')}</td>
      <td>${(r.kpi.long.sumGain).toLocaleString('zh-TW')}</td>
      <td>${(r.kpi.short.sumGain).toLocaleString('zh-TW')}</td>
    `;
    tr.addEventListener('click', () => showTop(idx));
    body.appendChild(tr);
  });

  // 排序點擊
  table.querySelectorAll('th[data-k]').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.k;
      const asc = th.classList.toggle('asc');
      table.querySelectorAll('th[data-k]').forEach(x => x !== th && x.classList.remove('asc'));
      rows.sort((a,b)=>{
        const get = k => k==='name'? a.name.localeCompare(b.name)
          : k==='params'? a.params.join(',').localeCompare(b.params.join(','))
          : k==='n'? a.trades.length : k==='p'? a.kpi.all.sumGain
          : k==='l'? a.kpi.long.sumGain : a.kpi.short.sumGain;
        return (asc?1:-1)*(get(a)-get(b));
      });
      body.innerHTML='';
      rows.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.name}</td>
          <td>${r.params.map(v => String(Math.trunc(+v))).join(' / ') || '—'}</td>
          <td>${r.trades.length}</td>
          <td>${(r.kpi.all.sumGain).toLocaleString('zh-TW')}</td>
          <td>${(r.kpi.long.sumGain).toLocaleString('zh-TW')}</td>
          <td>${(r.kpi.short.sumGain).toLocaleString('zh-TW')}</td>
        `;
        tr.addEventListener('click', () => showTop(idx));
        body.appendChild(tr);
      });
      showTop(0); // 排完直接切第一筆
    };
  });

  // 預設顯示第一筆
  showTop(0);

  function showTop(i) {
    const r = rows[i]; if (!r) return;
    // 右上交易表
    tTop.innerHTML = '';
    let cum = 0, cumP=0;
    r.trades.forEach((t, idx) => {
      cum += t.gain; cumP += t.gainSlip;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td>
        <td>${t.pos.side==='L'?'多':'空'}</td>
        <td>${t.pts.toFixed(0)}</td>
        <td>${(45*2).toLocaleString('zh-TW')}</td>
        <td>${Math.round(t.priceOut*200*0.00004)}</td>
        <td>${t.gain.toLocaleString('zh-TW')}</td>
        <td>${cum.toLocaleString('zh-TW')}</td>
        <td>${t.gainSlip.toLocaleString('zh-TW')}</td>
        <td>${cumP.toLocaleString('zh-TW')}</td>
      `;
      tTop.appendChild(tr);
    });

    // 左上曲線
    if (chart) chart.destroy();
    chart = drawCurve(cvs, r.trades);
  }
});

document.getElementById('btn-clear').onclick = () => {
  body.innerHTML = '';
  tTop.innerHTML = '<tr><td colspan="13">尚未載入</td></tr>';
  if (chart) chart.destroy();
};
