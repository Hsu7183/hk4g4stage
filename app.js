/* ========= 參數 ========= */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ========= 初始化 ========= */
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

/* ========= 主分析 ========= */
function analyse(raw){
  const lines=raw.trim().split(/\r?\n/);if(!lines.length)return;
  const q=[],tr=[],tsArr=[],main=[],longArr=[],shortArr=[],slipArr=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  lines.forEach(line=>{
    const [ts,pS,act]=line.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pS);

    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});return;}

    const idx=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));if(idx===-1)return;
    const pos=q.splice(idx,1)[0];

    const pts = pos.side==='L'? price-pos.pIn : pos.pIn-price;
    const fee = FEE*2, tax = Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax, gainSlip = gain - SLIP*MULT;

    cum += gain; cumSlip += gainSlip;
    if(pos.side==='L') cumL += gain; else cumS += gain;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:ts.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});

    tsArr.push(ts.slice(0,6));                // YYYYMM
    main.push(cum);
    longArr.push(cumL);
    shortArr.push(cumS);
    slipArr.push(cumSlip);
  });

  if(!tr.length){alert('沒有成功配對的交易！');return;}
  renderTable(tr);
  drawChart(tsArr,main,longArr,shortArr,slipArr);
}

/* ========= 表格 ========= */
function renderTable(list){
  const tbody=document.querySelector('#tbl tbody');tbody.innerHTML='';
  list.forEach((t,i)=>{
    tbody.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2" valign="middle">${i+1}</td>
          <td>${t.in.ts}</td><td>${t.in.price}</td><td>${t.in.type}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${t.out.ts}</td><td>${t.out.price}</td><td>${t.out.type}</td>
          <td>${fmt(t.out.pts)}</td><td>${fmt(t.out.fee)}</td><td>${fmt(t.out.tax)}</td>
          <td>${fmt(t.out.gain)}</td><td>${fmt(t.out.cum)}</td>
          <td>${fmt(t.out.gainSlip)}</td><td>${fmt(t.out.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden=false;
}

/* ========= 畫圖 ========= */
let chart;
function drawChart(monthArr,main,longArr,shortArr,slipArr){
  if(chart) chart.destroy();

  /* 生成完整 labels 與 tick 篩選 step */
  const labels=monthArr.map(m=>`${m.slice(0,4)}/${m.slice(4,6)}`);
  const uniqMonths=[...new Set(labels)];
  const step=Math.ceil(uniqMonths.length/24);

  /* 找極值索引 */
  const max=Math.max(...main),min=Math.min(...main);
  const maxIdx=main.indexOf(max),minIdx=main.indexOf(min);

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'總累積',data:main,borderColor:'#fbc02d',borderWidth:2,pointRadius:0,
         fill:{target:'origin',above:'rgba(251,192,45,.15)'}},
        {label:'做多累積',data:longArr,borderColor:'#d32f2f',borderWidth:1.5,pointRadius:0,fill:false},
        {label:'做空累積',data:shortArr,borderColor:'#2e7d32',borderWidth:1.5,pointRadius:0,fill:false},
        {label:'滑價累積',data:slipArr,borderColor:'#212121',borderWidth:1.5,pointRadius:0,fill:false},
        {label:'Max',data:main.map((v,i)=>i===maxIdx?v:null),pointRadius:6,pointBackgroundColor:'#d32f2f',
         borderWidth:0,showLine:false,datalabels:{align:'top',formatter:v=>fmt(v)}},
        {label:'Min',data:main.map((v,i)=>i===minIdx?v:null),pointRadius:6,pointBackgroundColor:'#2e7d32',
         borderWidth:0,showLine:false,datalabels:{align:'bottom',formatter:v=>fmt(v)}}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}},
        datalabels:{color:'#000',font:{size:10},clip:true}
      },
      scales:{
        x:{ticks:{callback:(v,i,l)=> i%step===0 ? l[i] : '' ,maxRotation:45,minRotation:45}},
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[ChartDataLabels]
  });
}

/* ========= 工具 ========= */
const fmt=v=>(v===''||v===undefined)?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
