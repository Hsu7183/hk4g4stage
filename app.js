/* === 參數 === */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* === 初始 === */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}catch(err){alert(err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();rd.onload=()=>{analyse(new TextDecoder('big5').decode(rd.result));flash(e.target.parentElement);};
    rd.readAsArrayBuffer(f);
  });
});

/* === 主分析 === */
function analyse(raw){
  const lines=raw.trim().split(/\r?\n/);if(!lines.length)return;
  const q=[],tr=[],eq=[];let cum=0,cumSlip=0;

  lines.forEach(l=>{
    const [ts,pS,act]=l.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pS);

    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});return;}

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;
    cum+=gain;cumSlip+=gainSlip;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:ts.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});
    eq.push({v:cum,ts:ts.slice(0,12)});
  });

  if(!tr.length){alert('沒有成功配對的交易！');return;}
  renderTable(tr);drawChart(eq);
}

/* === 表格 === */
function renderTable(tr){
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  tr.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2" valign="middle">${i+1}</td>
          <td>${t.in.ts}</td><td>${t.in.price}</td><td>${t.in.type}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${t.out.ts}</td><td>${t.out.price}</td><td>${t.out.type}</td>
          <td>${fmt(t.out.pts)}</td><td>${fmt(t.out.fee)}</td><td>${fmt(t.out.tax)}</td>
          <td>${fmt(t.out.gain)}</td><td>${fmt(t.out.cum)}</td>
          <td>${fmt(t.out.gainSlip)}</td><td>${fmt(t.out.cumSlip)}</td></tr>
    `);
  });
  document.getElementById('tbl').hidden=false;
}

/* === 畫圖 === */
let chart;
function drawChart(arr){
  if(chart) chart.destroy();
  const labels=arr.map(o=>o.ts),data=arr.map(o=>o.v);
  const max=Math.max(...data),min=Math.min(...data),maxI=data.indexOf(max),minI=data.indexOf(min);

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels,
      datasets:[
        {data,borderWidth:2,pointRadius:0,borderColor:'#ff9800',
         fill:{target:'origin',above:'rgba(255,152,0,.15)'}},
        {data:data.map((v,i)=>i===maxI?v:null),pointRadius:6,pointBackgroundColor:'#d32f2f',showLine:false},
        {data:data.map((v,i)=>i===minI?v:null),pointRadius:6,pointBackgroundColor:'#2e7d32',showLine:false}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}}},
      scales:{x:{ticks:{autoSkip:true,maxRotation:45,minRotation:45}},y:{ticks:{callback:v=>fmt(v)}}}
    }
  });
}

/* === 工具 === */
const fmt=v=>(v===''||v===undefined)?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
