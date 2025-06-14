/* ===== 常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-clip').addEventListener('click', async e => {
    try {
      const txt = await navigator.clipboard.readText();
      analyse(txt);
      flash(e.target);
    } catch (err) { alert('讀取剪貼簿失敗：' + err.message); }
  });

  document.getElementById('fileInput').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;

    const read = (enc) => new Promise((ok, bad) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => bad(fr.error);
      enc ? fr.readAsText(f, enc) : fr.readAsText(f);
    });

    (async () => {
      try { analyse(await read('big5')); }
      catch { try { analyse(await read()); }
              catch (err) { alert('讀檔失敗：' + err.message); } }
      flash(e.target.parentElement);
    })();
  });
});

/* ===== 主分析 ===== */
function analyse(raw) {
  const rows = raw.trim().split(/\r?\n/); if (!rows.length) { alert('檔案為空'); return; }

  const q = [], tr = [];
  const ts = [], total = [], long = [], short = [], slip = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach(r => {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/); if (!act) return;
    const price = +parseFloat(pStr);

    /* 進場 */
    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw, typeIn: act });
      return;
    }

    /* 出場配對 */
    const idx = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (idx === -1) return;

    const pos = q.splice(idx, 1)[0];
    const pts = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE * 2;
    const tax = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain;      cumSlip += gainSlip;
    if (pos.side === 'L') cumL += gain;
    else                  cumS += gain;

    tr.push({
      in : { ts: pos.tsIn.slice(0,12), price: pos.pIn, type: pos.typeIn },
      out: { ts: tsRaw.slice(0,12), price, type: act, pts, fee, tax,
             gain, cum, gainSlip, cumSlip }
    });

    ts.push(tsRaw);
    total .push(cum);
    long  .push(cumL);
    short .push(cumS);
    slip  .push(cumSlip);
  });

  if (!tr.length) { alert('沒有成功配對的交易'); return; }
  renderTable(tr);
  drawChart(ts, total, long, short, slip);
}

/* ===== 表格 ===== */
function renderTable(list) {
  const tb = document.querySelector('#tbl tbody'); tb.innerHTML = '';
  list.forEach((t, i) => {
    tb.insertAdjacentHTML('beforeend', `
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

/* ===== 畫圖 ===== */
let chart;
function drawChart(ts, total, longArr, shortArr, slipArr) {
  if (chart) chart.destroy();

  const monthStr = ts.map(s => `${s.slice(0,4)}/${s.slice(4,6)}`);
  const months   = [...new Set(monthStr)];
  const step     = Math.ceil(months.length / 24);

  const last = total.length - 1;
  const maxI = total.indexOf(Math.max(...total));
  const minI = total.indexOf(Math.min(...total));

  const stripe = {
    id:'stripe', beforeDraw(c){
      const {ctx,chartArea:{top,bottom}}=c,xs=c.scales.x;
      ctx.save();
      months.forEach((m,i)=>{
        if(i%2===0){
          const s=monthStr.indexOf(m),e=monthStr.lastIndexOf(m);
          ctx.fillStyle='rgba(0,0,0,.04)';
          ctx.fillRect(xs.getPixelForValue(s),top,
                       xs.getPixelForValue(e)-xs.getPixelForValue(s)+1,bottom-top);
        }
      });
      ctx.restore();
    }
  };

  const base = (col,w)=>({borderColor:col,borderWidth:w,pointRadius:0,fill:false});
  const end  = (arr,col)=>({label:'end',data:arr.map((v,i)=>i===last?v:null),
                            showLine:false,pointRadius:5,pointBackgroundColor:col,borderWidth:0});

  chart = new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:ts,
      datasets:[
        {label:'總',data:total ,...base('#fbc02d',2),
         fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},
        {label:'多',data:longArr ,...base('#d32f2f',1.4)},
        {label:'空',data:shortArr,...base('#2e7d32',1.4)},
        {label:'滑',data:slipArr ,...base('#212121',1.4)},

        end(total ,'#fbc02d'), end(longArr,'#d32f2f'),
        end(shortArr,'#2e7d32'), end(slipArr,'#212121'),

        {label:'Max',data:total.map((v,i)=>i===maxI?v:null),
         pointRadius:6,pointBackgroundColor:'#d32f2f',showLine:false,borderWidth:0},
        {label:'Min',data:total.map((v,i)=>i===minI?v:null),
         pointRadius:6,pointBackgroundColor:'#2e7d32',showLine:false,borderWidth:0}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}},
        datalabels:{
          color:'#000',font:{size:10},offset:-8,anchor:'end',align:'right',clamp:true,
          display:ctx=>{
            const l=ctx.dataset.label;
            return l==='Max'||l==='Min'||l==='end';
          },
          formatter:v=>fmt(v)
        }
      },
      scales:{
        x:{
          ticks:{
            autoSkip:false,
            callback:(v,i)=>months.indexOf(monthStr[i])%step===0?monthStr[i]:'',
            maxRotation:45,minRotation:45
          },
          grid:{display:false}
        },
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[stripe, window.ChartDataLabels||{}]
  });
}

/* ===== 工具 ===== */
const fmt = v => v===''||v===undefined?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
