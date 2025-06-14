/* ========= 參數 ========= */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ========= 初始化 ========= */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert('無法讀取剪貼簿：'+err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{analyse(new TextDecoder('big5').decode(rd.result));flash(e.target.parentElement);};
    rd.readAsArrayBuffer(f);
  });
});

/* ========= 主分析 ========= */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return;

  const tsArr=[],main=[],longArr=[],shortArr=[],slipArr=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  const q=[],tr=[];

  rows.forEach(r=>{
    const [ts,pS,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pS);

    if(ENTRY.includes(act)){
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});
      return;
    }

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain;cumSlip+=gainSlip;
    if(pos.side==='L')cumL+=gain;else cumS+=gain;

    tr.push({
      in :{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
      out:{ts:ts.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}
    });

    tsArr  .push(ts);
    main   .push(cum);
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
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  list.forEach((t,i)=>{
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

/* ========= 畫圖 ========= */
let chart;
function drawChart(tsArr,main,longArr,shortArr,slipArr){
  if(chart)chart.destroy();

  const monthStr   = tsArr.map(s=>`${s.slice(0,4)}/${s.slice(4,6)}`);
  const uniqMonths = [...new Set(monthStr)];
  const step       = Math.ceil(uniqMonths.length/24);

  const maxV=Math.max(...main),minV=Math.min(...main);
  const maxI=main.indexOf(maxV),minI=main.indexOf(minV);

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:tsArr,
      datasets:[
        {label:'總累積',data:main,borderColor:'#fbc02d',borderWidth:2,pointRadius:0,
         fill:{target:'origin',above:'rgba(251,192,45,.15)'}},
        {label:'多單累積',data:longArr,borderColor:'#d32f2f',borderWidth:1.4,pointRadius:0,fill:false},
        {label:'空單累積',data:shortArr,borderColor:'#2e7d32',borderWidth:1.4,pointRadius:0,fill:false},
        {label:'滑價累積',data:slipArr,borderColor:'#212121',borderWidth:1.4,pointRadius:0,fill:false},
        {label:'Max',data:main.map((v,i)=>i===maxI?v:null),pointRadius:6,pointBackgroundColor:'#d32f2f',
         borderWidth:0,showLine:false},
        {label:'Min',data:main.map((v,i)=>i===minI?v:null),pointRadius:6,pointBackgroundColor:'#2e7d32',
         borderWidth:0,showLine:false}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        datalabels:{
          display: ctx=>{
            const lbl=ctx.chart.data.datasets[ctx.datasetIndex].label;
            return lbl==='Max'||lbl==='Min';
          },
          color:'#000',
          font:{size:10},
          align:ctx=>ctx.dataset.label==='Max'?'top':'bottom',
          formatter:v=>fmt(v)
        },
        tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}}
      },
      scales:{
        x:{
          type:'category',
          ticks:{
            callback:(v,i)=>{
              const m=monthStr[i];
              return uniqMonths.indexOf(m)%step===0?m:'';
            },
            maxRotation:45,minRotation:45
          },
          grid:{display:false}
        },
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[ChartDataLabels]
  });
}

/* ========= 工具 ========= */
const fmt=v=>(v===''||v===undefined)?'':(+v).toLocaleString('zh-TW');

function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
