/* ========= 固定參數 ========= */
const MULT        = 200;      // 1 點 = 200 元
const FEE_SIDE    = 45;       // 單邊手續費
const TAX_RATE    = 0.00004;  // 期交稅率
const SLIP_PT     = 1.5;      // 滑點 1.5 點

/* ========= 關鍵字 ========= */
const ENTRY=['新買','新賣'];
const EXIT_L=['平賣','強制平倉'];
const EXIT_S=['平買','強制平倉'];

/* ========= 初始化 ========= */
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

/* ========= 主分析 ========= */
function analyse(raw){
  const lines=raw.trim().split(/\r?\n/);
  const q=[], trades=[], equity=[];
  let cum=0,cumSlip=0;

  lines.forEach(line=>{
    const [ts,pS,act]=line.trim().split(/\s+/);
    if(!act) return;
    const price=+parseFloat(pS);

    /* 進場 */
    if(ENTRY.includes(act)){
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});
      return;
    }

    /* 出場 */
    const idx=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1) return;
    const pos=q.splice(idx,1)[0];

    const pts = pos.side==='L'? price-pos.pIn : pos.pIn-price;
    const fee = FEE_SIDE*2;
    const tax = Math.round(price*MULT*TAX_RATE);
    const gain= pts*MULT - fee - tax;
    const gainSlip = gain - SLIP_PT*MULT;

    cum     += gain;
    cumSlip += gainSlip;

    trades.push({
      in :{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
      out:{ts:ts.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}
    });
    equity.push({v:cum,ts:ts.slice(0,12)});
  });

  if(!trades.length){alert('沒有成功配對的交易！');return;}

  renderTable(trades);
  drawChart(equity);
}

/* ========= 表格 ========= */
function renderTable(tr){
  const tbody=document.querySelector('#tbl tbody');
  tbody.innerHTML='';

  tr.forEach((t,i)=>{
    /* 進場列 */
    tbody.insertAdjacentHTML('beforeend',`
      <tr>
        <td rowspan="2" valign="middle">${i+1}</td>
        <td>${t.in.ts}</td><td>${t.in.price}</td><td>${t.in.type}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
    `);
    /* 出場列 */
    tbody.insertAdjacentHTML('beforeend',`
      <tr>
        <td>${t.out.ts}</td><td>${t.out.price}</td><td>${t.out.type}</td>
        <td>${fmt(t.out.pts)}</td><td>${fmt(t.out.fee)}</td><td>${fmt(t.out.tax)}</td>
        <td>${fmt(t.out.gain)}</td><td>${fmt(t.out.cum)}</td>
        <td>${fmt(t.out.gainSlip)}</td><td>${fmt(t.out.cumSlip)}</td>
      </tr>
    `);
  });
  document.getElementById('tbl').hidden=false;
}

/* ========= 畫圖 ========= */
let chart;
function drawChart(arr){
  if(chart) chart.destroy();

  const labels = arr.map(o=>o.ts);
  const data   = arr.map(o=>o.v);

  /* 找最大 & 最小 */
  const maxVal=Math.max(...data),minVal=Math.min(...data);
  const maxIdx=data.indexOf(maxVal),minIdx=data.indexOf(minVal);

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'累積獲利',data,borderWidth:2,pointRadius:0,borderColor:'#ff9800',
         fill:{target:'origin',above:'rgba(255,152,0,.15)'}},
        {label:'最大獲利',data:data.map((v,i)=>i===maxIdx?v:null),
         borderWidth:0,pointRadius:5,pointBackgroundColor:'#ff9800',showLine:false},
        {label:'最大虧損',data:data.map((v,i)=>i===minIdx?v:null),
         borderWidth:0,pointRadius:5,pointBackgroundColor:'#e53935',showLine:false}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:(ctx)=>` ${fmt(ctx.parsed.y)}`}}},
      scales:{
        x:{ticks:{autoSkip:true,maxRotation:45,minRotation:45}},
        y:{ticks:{callback:v=>fmt(v)}}
      }
    }
  });
}

/* ========= 工具 ========= */
const fmt=v=>(v===''||v===undefined)?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
