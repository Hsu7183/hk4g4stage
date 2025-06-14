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
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}catch(err){alert('無法讀取剪貼簿：'+err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{analyse(new TextDecoder('big5').decode(rd.result));flash(e.target.parentElement);};
    rd.readAsArrayBuffer(f);
  });
});

/* ========= 主解析 ========= */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);
  const queue=[], rec=[], equity=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(line=>{
    const [ts,pS,act]=line.trim().split(/\s+/);
    if(!act) return;
    const price=+parseFloat(pS);

    if(ENTRY.includes(act)){                       // 建倉
      queue.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts});
      return;
    }

    const idx=queue.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1) return;
    const pos=queue.splice(idx,1)[0];

    const pts = pos.side==='L'? price-pos.pIn : pos.pIn-price;
    const fee = FEE_SIDE*2;
    const tax = Math.round(price*MULT*TAX_RATE);
    const gain= pts*MULT - fee - tax;
    const gainSlip = gain - SLIP_PT*MULT;

    if(pos.side==='L') cumL+=gain; else cumS+=gain;
    cum     += gain;
    cumSlip += gainSlip;

    rec.push({
      ts : ts.slice(0,12),
      price,
      type:act,
      pts,
      fee,
      tax,
      gain,
      gainSlip,
      longP :pos.side==='L'? gain :'',
      cumL,
      shortP:pos.side==='S'? gain :'',
      cumS,
      cumSlip
    });
    equity.push(cum);
  });

  if(!rec.length){alert('沒有成功配對的交易！');return;}

  renderTable(rec);
  drawChart(equity);
}

/* ========= 表格輸出 ========= */
function renderTable(arr){
  const tbody=document.querySelector('#tbl tbody');
  tbody.innerHTML='';
  arr.forEach((d,idx)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${idx+1}</td>
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

/* ========= 折線圖 ========= */
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
