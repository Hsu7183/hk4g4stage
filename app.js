/* =========================================================================
 *  app.js  –  交易剪貼簿分析   (2024-06 版)
 * =========================================================================
 * 需求彙總
 * 1.  X 軸以「季」為分隔 (Q1/Q2/…)，所有交易點依日期比例顯示
 * 2.  點半徑 → 2
 * 3.  顯示「最大獲利 / 最大虧損」兩個標籤
 * 4.  四條線最後一點數值 → 固定在點右側；右側留 40px 文字空間
 * -------------------------------------------------------------------------*/

/* ===== 0. 常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY   = ['新買', '新賣'];
const EXIT_L  = ['平賣', '強制平倉'];
const EXIT_S  = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ===== 1. 讀剪貼簿 / 選檔 ===== */
document.getElementById('btn-clip').onclick = async e => {
  try { analyse(await navigator.clipboard.readText()); flash(e.target); }
  catch (err) { alert(err.message); }
};
document.getElementById('fileInput').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const read = enc => new Promise((ok,no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result); r.onerror = () => no(r.error);
    enc ? r.readAsText(f,enc) : r.readAsText(f);
  });
  (async() => {
    try { analyse(await read('big5')); } catch { analyse(await read()); }
    flash(e.target.parentElement);
  })();
};

/* ===== 2. 主分析 ===== */
function analyse(raw){
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length){ alert('空檔案'); return; }

  const q  = [], tr = [];
  const qSeq=[], tot=[], lon=[], sho=[], sli=[];
  let cum=0, cumL=0, cumS=0, cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act] = r.trim().split(/\s+/); if(!act) return;
    const price = +pStr;

    if (ENTRY.includes(act)){
      q.push({side: act==='新買'?'L':'S', pIn: price, tsIn: tsRaw, typeIn: act});
      return;
    }
    const idx=q.findIndex(o=>
      (o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1) return;
    const pos=q.splice(idx,1)[0];

    const pts = pos.side==='L' ? price-pos.pIn : pos.pIn-price;
    const fee = FEE*2, tax=Math.round(price*MULT*TAX);
    const gain = pts*MULT-fee-tax, gainSlip=gain-SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({pos,tsOut:tsRaw,priceOut:price,actOut:act,
            pts,fee,tax,gain,cum,gainSlip,cumSlip});

    qSeq.push(tsRaw);        // 後面做季座標用 → 保留原始字串
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  });

  if(!tr.length){ alert('沒有成功配對的交易'); return; }

  renderTable(tr);
  drawChart(qSeq,tot,lon,sho,sli);
}

/* ===== 3. 表格 ===== */
function renderTable(list){
  const body = tbl.querySelector('tbody'); body.innerHTML='';
  list.forEach((t,i)=>{
    body.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
          <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
          <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
          <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>`);
  });
  tbl.hidden=false;
}

/* ===== 4. 畫圖 ===== */
let chart;
function drawChart(tsArr,T,L,S,P){
  if(chart) chart.destroy();

  /* === 4-1. 建 Quarter 座標 === */
  const toDate = s => new Date(+s.slice(0,4),+s.slice(4,2)-1,+s.slice(6,2));
  const quarterNumber = d => d.getFullYear()*4 + Math.floor(d.getMonth()/3);
  const qMin = quarterNumber(toDate(tsArr[0])) - 1;      // 往前補一季
  const qMax = quarterNumber(toDate(tsArr.at(-1)));      // 最後一季

  /* 每季 1 格，最後為 label 預留半格 (右 padding) */
  const X = tsArr.map(s=>{
    const d  = toDate(s);
    const qn = quarterNumber(d);
    const inQuarterDay = d - new Date(d.getFullYear(),Math.floor(d.getMonth()/3)*3,1);
    const daysInQ = (new Date(d.getFullYear(),Math.floor(d.getMonth()/3)*3+3,0)-new Date(d.getFullYear(),Math.floor(d.getMonth()/3)*3,1))/86400000+1;
    return (qn - qMin) + (inQuarterDay/86400000)/daysInQ*0.9;   // 0-0.9
  });

  const quarters = [];
  for(let q=0;q<=qMax-qMin+1;q++){
    const y  = Math.floor((q+qMin)/4);
    const m3 = (q+qMin)%4*3+1;
    quarters.push(`${y}Q${Math.ceil(m3/3)}`);
  }

  const maxI=T.indexOf(Math.max(...T));
  const minI=T.indexOf(Math.min(...T));

  /* === 4-2. 背景條 (灰白)、虧損區塊 (粉) === */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c, w=(right-left)/(quarters.length-1);
    ctx.save(); ctx.fillStyle='rgba(0,0,0,0.05)';
    for(let i=0;i<quarters.length-1;i+=2) ctx.fillRect(left+i*w,top,w,bottom-top);
    ctx.restore();
  }};
  const lossArea={id:'loss',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom},scales:{y}}=c;
    ctx.save(); ctx.fillStyle='rgba(255,152,152,.15)';
    ctx.fillRect(left,y.getPixelForValue(0),right-left,bottom-y.getPixelForValue(0));
    ctx.restore();
  }};

  /* === 4-3. 線 / 點 樣式 === */
  const mkLine=(d,col,fill)=>({
    data:d,
    stepped:true,
    borderColor:col,borderWidth:2,
    pointRadius:2,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    fill,
    datalabels:{display:false}
  });
  const mkLast=(d,col)=>({
    data:d.map((v,i)=>i===d.length-1?v:null),
    showLine:false,
    pointRadius:2,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    datalabels:{
      display:true,
      anchor:'end', align:'left', offset:6,
      formatter:v=>v.toLocaleString('zh-TW'),
      color:'#000', clip:false, font:{size:10}
    }
  });
  const mkMark=(d,i,col)=>({
    data:d.map((v,j)=>j===i?v:null),
    showLine:false, pointRadius:4,
    pointBackgroundColor:col,pointBorderColor:col,
    datalabels:{
      display:true,
      anchor:i===maxI?'end':'start',
      align:i===maxI?'top':'bottom',
      offset:8,
      formatter:v=>v.toLocaleString('zh-TW'),
      color:'#000',clip:false,font:{size:10}
    }
  });

  /* === 4-4. Chart === */
  chart=new Chart(cvs,{
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(T,'#fbc02d',{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}),
        mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121'),
        mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'), mkLast(S,'#2e7d32'), mkLast(P,'#212121'),
        mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:40}},       // --> 右側 40px
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      scales:{
        x:{
          type:'linear',
          min:0,max:quarters.length-1+0.5,          // 最後再多半格空間
          grid:{display:false},
          ticks:{
            autoSkip:false,
            callback:(v)=>quarters[v]??''
          }
        },
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,lossArea,ChartDataLabels]
  });
}

/* ===== 5. 小工具 ===== */
const fmt = n => n.toLocaleString('zh-TW');
function fmtTs(s){ return `${s.slice(0,4)}/${s.slice(4,2)}/${s.slice(6,2)} ${s.slice(8,2)}:${s.slice(10,2)}`; }
function flash(el){ el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),600); }
