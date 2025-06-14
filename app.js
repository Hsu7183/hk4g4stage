/* ========= 參數 ========= */
const MULT        = 200;        // 1 點 = 200 元
const FEE_SIDE    = 45;         // 單邊手續費
const TAX_RATE    = 0.00004;    // 期交稅率
const SLIP_PT     = 1.5;        // 滑點 1.5 點

/* ========= 關鍵字 ========= */
const ENTRY=['新買','新賣'];
const EXIT_L=['平賣','強制平倉'];
const EXIT_S=['平買','強制平倉'];

/* ========= DOM Ready ========= */
document.addEventListener('DOMContentLoaded',()=>{
  /* 剪貼簿 */
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert('無法讀取剪貼簿：'+err.message);}
  });
  /* 上傳 */
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{analyse(new TextDecoder('big5').decode(rd.result));flash(e.target.parentElement);};
    rd.readAsArrayBuffer(f);
  });
});

/* ========= 主流程 ========= */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);
  const queue=[], records=[], eq=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(line=>{
    const [ts,pS,act] = line.trim().split(/\s+/);
    if(!act) return;
    const price=+parseFloat(pS);

    /* 建倉 */
    if(ENTRY.includes(act)){
      queue.push({side:act==='新買'?'LONG':'SHORT',pIn:price,tsIn:ts});
      return;
    }

    /* 平倉 */
    const idx=queue.findIndex(o=>(o.side==='LONG' && EXIT_L.includes(act))||(o.side==='SHORT'&&EXIT_S.includes(act)));
    if(idx===-1) return;
    const pos=queue.splice(idx,1)[0];

    const pts = pos.side==='LONG' ? price-pos.pIn : pos.pIn-price;

    /* 成本 */
    const fee = FEE_SIDE*2;
    const tax = Math.round(price*MULT*TAX_RATE);
    const gain= pts*MULT - fee - tax;
    const gainSlip = gain - SLIP_PT*MULT;

    const isL = pos.side==='LONG';
    if(isL) cumL+=gain; else cumS+=gain;
    cum     += gain;
    cumSlip += gainSlip;

    records.push({
      ts : ts.slice(0,12),
      price,
      type:act,
      pts,
      fee,
      tax,
      gain,
      gainSlip,
      longP :isL?gain:'',
      cumL,
      shortP:!isL?gain:'',
      cumS,
      cumSlip
    });
    eq.push(cum);
  });

  if(!records.length){alert('沒有成功配對的交易！');return;}

  renderTable(records);
  drawChart(eq);
}

/* ========= 表格 ========= */
function renderTable(data){
  const tbody=document.querySelector('#tbl tbody');
  tbody.innerHTML='';
  data.forEach((d,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${i+1}</td>
      <td>${d.ts}</td>
      <td>${d.price}</td>
      <td>${d.type}</td>
      <td>${fmt(d.pts)}</td>
      <td>${fmt(d.fee)}</td>
      <td>${fmt(d.tax)}</td>
      <td>${fmt(d.gain)}</td>
      <td>${fmt(d.gainSlip)}</td>
      <td>${fmt(d.longP)}</td>
      <td>${fmt(d.cumL)}</td>
      <td>${fmt(d.shortP)}</td>
      <td>${fmt(d.cumS)}</td>
      <td>${fmt(d.cumSlip)}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('tbl').hidden=false;
}

/* ========= Chart ========= */
let chart;
function drawChart(eq){
  if(chart) chart.destroy();
  chart = new Chart(document.getElementById('equityChart'),{
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
const fmt = v => (v===''||v===undefined)?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
