/* ========= 固定參數 ========= */
const MULT        = 200;        // 1 點 = 200 元
const FEE_SIDE    = 45;         // 單邊手續費
const TAX_RATE    = 0.00004;    // 期交稅率
const SLIP_PT     = 1.5;        // 滑點 1.5 點

/* ========= 關鍵字 ========= */
const ENTRY=['新買','新賣'];
const EXIT_L=['平賣','強制平倉'];
const EXIT_S=['平買','強制平倉'];

/* ========= 入口 ========= */
document.addEventListener('DOMContentLoaded',()=>{
  /* 剪貼簿 */
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert('無法讀取剪貼簿：'+err.message);}
  });
  /* 檔案 */
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{analyse(new TextDecoder('big5').decode(rd.result));flash(e.target.parentElement);};
    rd.readAsArrayBuffer(f);
  });
});

/* ========= 主流程 ========= */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);
  const queue=[], trades=[], equity=[];
  let cum=0,cumSlip=0;

  rows.forEach(line=>{
    const [ts,pS,act]=line.trim().split(/\s+/);
    if(!act) return;
    const price=+parseFloat(pS);

    /* 進場 */
    if(ENTRY.includes(act)){
      queue.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});
      return;
    }

    /* 出場 */
    const i=queue.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1) return;
    const pos=queue.splice(i,1)[0];

    const pts= pos.side==='L'? price-pos.pIn : pos.pIn-price;
    const fee= FEE_SIDE*2;
    const tax= Math.round(price*MULT*TAX_RATE);
    const gain= pts*MULT - fee - tax;
    const gainSlip= gain - SLIP_PT*MULT;

    cum     += gain;
    cumSlip += gainSlip;

    trades.push({
      in :{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
      out:{ts:ts.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}
    });
    equity.push(cum);
  });

  if(!trades.length){alert('沒有成功配對的交易！');return;}

  renderTable(trades);
  drawChart(equity);
}

/* ========= 表格 ========= */
function renderTable(trades){
  const tbody=document.querySelector('#tbl tbody');
  tbody.innerHTML='';

  trades.forEach((t,idx)=>{
    /* 進場列 */
    const trIn=document.createElement('tr');
    trIn.innerHTML=`
      <td rowspan="2" valign="middle">${idx+1}</td>
      <td>${t.in.ts}</td>
      <td>${t.in.price}</td>
      <td>${t.in.type}</td>
      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
    tbody.appendChild(trIn);

    /* 出場列 */
    const trOut=document.createElement('tr');
    trOut.innerHTML=`
      <td>${t.out.ts}</td>
      <td>${t.out.price}</td>
      <td>${t.out.type}</td>
      <td>${fmt(t.out.pts)}</td>
      <td>${fmt(t.out.fee)}</td>
      <td>${fmt(t.out.tax)}</td>
      <td>${fmt(t.out.gain)}</td>
      <td>${fmt(t.out.cum)}</td>
      <td>${fmt(t.out.gainSlip)}</td>
      <td>${fmt(t.out.cumSlip)}</td>`;
    tbody.appendChild(trOut);
  });

  document.getElementById('tbl').hidden=false;
}

/* ========= 折線圖 ========= */
let chart=null;
function drawChart(eq){
  if(chart) chart.destroy();
  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{labels:eq.map((_,i)=>i+1),datasets:[{
      data:eq,
      borderWidth:2,pointRadius:0,borderColor:'#ff9800',
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
