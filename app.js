/* ========= 參數 ========= */
const MULT = 200;          // 每點 200 元
const FEE  = 45;           // 單邊手續費
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
      analyse(await navigator.clipboard.readText());
      flash(e.target);
    } catch (err) {
      alert('讀取剪貼簿失敗：' + err.message);
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

  const q  = [];          // 進場佇列
  const tr = [];          // 完整筆

  const tsArr   = [];
  const mainArr = [];
  const longArr = [];
  const shortArr= [];
  const slipArr = [];

  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach(r => {
    const [ts, pStr, act] = r.trim().split(/\s+/);
    if (!act) return;

    const price = +parseFloat(pStr);

    /* 進場 */
    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: ts, typeIn: act });
      return;
    }

    /* 出場配對 */
    const idx = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (idx === -1) return;

    const pos  = q.splice(idx, 1)[0];
    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2;
    const tax  = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    /* 累積 */
    cum     += gain;
    cumSlip += gainSlip;
    if (pos.side === 'L') cumL += gain; else cumS += gain;

    /* 交易記錄 */
    tr.push({
      in : { ts: pos.tsIn.slice(0,12), price: pos.pIn, type: pos.typeIn },
      out: { ts: ts.slice(0,12), price, type: act, pts, fee, tax,
             gain, cum, gainSlip, cumSlip }
    });

    /* 曲線資料 */
    tsArr   .push(ts);
    mainArr .push(cum);
    longArr .push(cumL);
    shortArr.push(cumS);
    slipArr .push(cumSlip);
  });

  if (!tr.length) { alert('沒有成功配對的交易！'); return; }

  renderTable(tr);
  drawChart(tsArr, mainArr, longArr, shortArr, slipArr);
}

/* ========= 交易表格 ========= */
function renderTable(list) {
  const tbody = document.querySelector('#tbl tbody');
  tbody.innerHTML = '';

  list.forEach((t, i) => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i + 1}</td>
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

  /* x 軸月份 */
  const monthStr   = tsArr.map(s => `${s.slice(0,4)}/${s.slice(4,6)}`);
  const uniqMonths = [...new Set(monthStr)];
  const step       = Math.ceil(uniqMonths.length / 24);   // 最多 24 個刻度

  /* 極值與最後點 */
  const maxV   = Math.max(...main);
  const minV   = Math.min(...main);
  const maxIdx = main.indexOf(maxV);
  const minIdx = main.indexOf(minV);
  const last   = main.length - 1;

  /* 月條紋插件 */
  const stripe = {
    id:'stripe',
    beforeDraw(c){
      const {ctx,chartArea:{top,bottom}} = c;
      const xs = c.scales.x;
      ctx.save();
      uniqMonths.forEach((m,i)=>{
        if(i%2===0){
          const s = monthStr.indexOf(m);
          const e = monthStr.lastIndexOf(m);
          ctx.fillStyle='rgba(0,0,0,.04)';
          ctx.fillRect(xs.getPixelForValue(s), top,
                       xs.getPixelForValue(e) - xs.getPixelForValue(s) + 1,
                       bottom - top);
        }
      });
      ctx.restore();
    }
  };

  /* 末端點樣式共用 */
  const endStyle = {
    pointRadius:5,
    pointStyle:'circle',
    pointBorderWidth:2,
    pointBackgroundColor:'#fff'
  };

  chart = new Chart(document.getElementById('equityChart'), {
    type:'line',
    data:{
      labels:tsArr,
      datasets:[
        { ...endStyle, label:'總累積',   data:main,     borderColor:'#fbc02d', borderWidth:2,
          fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'} },
        { ...endStyle, label:'多單累積', data:longArr,  borderColor:'#d32f2f', borderWidth:1.4, fill:false },
        { ...endStyle, label:'空單累積', data:shortArr, borderColor:'#2e7d32', borderWidth:1.4, fill:false },
        { ...endStyle, label:'滑價累積', data:slipArr,  borderColor:'#212121', borderWidth:1.4, fill:false },
        { label:'Max', data:main.map((v,i)=>i===maxIdx?v:null),
          pointRadius:6, pointBackgroundColor:'#d32f2f', showLine:false, borderWidth:0 },
        { label:'Min', data:main.map((v,i)=>i===minIdx?v:null),
          pointRadius:6, pointBackgroundColor:'#2e7d32', showLine:false, borderWidth:0 }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}},
        /* ===== DataLabels 顯示規則 ===== */
        datalabels:{
          color:'#000',
          font:{size:10},
          offset:-6,
          anchor:'end',
          align:'left',
          display:ctx=>{
            const lbl = ctx.dataset.label;
            const i   = ctx.dataIndex;
            return lbl==='Max'||lbl==='Min'||i===last;
          },
          formatter:v=>fmt(v)
        }
      },
      scales:{
        x:{
          ticks:{
            autoSkip:false,
            callback:(v,i)=>{
              const m = monthStr[i];
              return uniqMonths.indexOf(m) % step === 0 ? m : '';
            },
            maxRotation:45,
            minRotation:45
          },
          grid:{display:false}
        },
        y:{
          ticks:{callback:v=>fmt(v)}
        }
      }
    },
    plugins:[ChartDataLabels, stripe]
  });
}

/* ========= 小工具 ========= */
const fmt = v => (v===''||v===undefined) ? '' : (+v).toLocaleString('zh-TW');

function flash(el){
  el.classList.add('flash');
  setTimeout(()=>el.classList.remove('flash'),600);
}
