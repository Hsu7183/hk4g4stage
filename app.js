/* ========= 參數 ========= */
const MULT        = 200;      // 1 點 = 200 元
const FEE_SIDE    = 45;       // 單邊手續費
const TAX_RATE    = 0.00004;  // 期交稅率
const SLIP_PT     = 1.5;      // 滑點 1.5 點

/* ========= 關鍵字 ========= */
const ENTRY=['新買','新賣'];
const EXIT_L=['平賣','強制平倉'];
const EXIT_S=['平買','強制平倉'];

/* ========= DOM Ready ========= */
document.addEventListener('DOMContentLoaded',()=>{
  /* 剪貼簿 */
  document.getElementById('btn-clip').addEventListener('click',async()=>{
    try{const txt=await navigator.clipboard.readText();flash(event.target);analyse(txt);}
    catch(e){alert('無法讀取剪貼簿：'+e.message);}
  });
  /* 上傳 */
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{flash(e.target.parentElement);analyse(new TextDecoder('big5').decode(r.result));};
    r.readAsArrayBuffer(f);
  });
});

/* ========= 主解析 ========= */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);
  const q=[],tr=[],eq=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [ts,pS,a] = r.trim().split(/\s+/);
    if(!a) return;
    const price=+parseFloat(pS);

    /* 建倉 */
    if(ENTRY.includes(a)){
      q.push({side:a==='新買'?'LONG':'SHORT',pIn:price,tsIn:ts});
      return;
    }

    /* 平倉 */
    const idx=q.findIndex(o=>(o.side==='LONG' && EXIT_L.includes(a))||(o.side==='SHORT'&&EXIT_S.includes(a)));
    if(idx===-1) return;
    const pos=q.splice(idx,1)[0];

    const pts = pos.side==='LONG'? price-pos.pIn : pos.pIn-price;

    /* ---- 成本計算 ---- */
    const fee   = FEE_SIDE*2;                   // 雙邊
    const tax   = Math.round(price*MULT*TAX_RATE); // 依平倉價收稅
    const profit= pts*MULT - fee - tax;
    const profitSlip = profit - SLIP_PT*MULT;

    const isLong = pos.side==='LONG';
    if(isLong) cumL += profit;
    else       cumS += profit;

    cum     += profit;
    cumSlip += profitSlip;

    tr.push({
      ts:ts.slice(0,12),
      price,
      type:a,
      code:isLong?'A01':'A03',
      pts,
      fee,
      tax,
      profit,
      profitSlip,
      longP :isLong? profit : '',
      cumL,
      shortP:!isLong? profit : '',
      cumS,
      cumSlip
    });
    eq.push(cum);
  });

  if(!tr.length){alert('沒有成功配對的交易！');return;}

  renderTable(tr);
  drawChart(eq);
}

/* ========= 表格 ========= */
function renderTable(arr){
  const tbody=document.querySelector('#tbl tbody');
  tbody.innerHTML='';
  arr.forEach(d=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${d.ts}</td><td>${d.price}</td><td>${d.type}</td><td>${d.code}</td>
      <td>${fmt(d.pts)}</td><td>${fmt(d.fee)}</td><td>${fmt(d.tax)}</td>
      <td>${fmt(d.profit)}</td><td>${fmt(d.profitSlip)}</td>
      <td>${fmt(d.longP)}</td><td>${fmt(d.cumL)}</td>
      <td>${fmt(d.shortP)}</td><td>${fmt(d.cumS)}</td><td>${fmt(d.cumSlip)}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('tbl').hidden=false;
}

/* ========= Chart ========= */
let chart;
function drawChart(eq){
  if(chart) chart.destroy();
  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{labels:eq.map((_,i)=>i+1),datasets:[{
      data:eq,borderWidth:2,pointRadius:0,borderColor:'#ff9800',
      fill:{target:'origin',above:'rgba(255,152,0,.15)'}
    }]},
    options:{plugins:{legend:{display:false},tooltip:{mode:'index',intersect:false}},
             hover:{mode:'index',intersect:false},
             scales:{x:{display:false},y:{ticks:{callback:v=>fmt(v)}}}}
  });
}

/* ========= 小工具 ========= */
const fmt=v=>(v===''||v===undefined)?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
