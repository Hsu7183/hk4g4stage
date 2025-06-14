/* ===== 基本參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}catch(err){alert(err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{analyse(new TextDecoder('big5').decode(rd.result));flash(e.target.parentElement);};
    rd.readAsArrayBuffer(f);
  });
});

/* ===== 主要分析 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return;

  const q=[],tr=[],ts=[],total=[],long=[],short=[],slip=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pStr);

    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});return;}

    const idx=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1)return;

    const pos=q.splice(idx,1)[0];
    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain;cumSlip+=gainSlip;
    if(pos.side==='L')cumL+=gain; else cumS+=gain;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:tsRaw.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});

    ts.push(tsRaw);
    total .push(cum);
    long  .push(cumL);
    short .push(cumS);
    slip  .push(cumSlip);
  });

  if(!tr.length){alert('沒有成功配對的交易！');return;}

  renderTable(tr);
  drawChart(ts,total,long,short,slip);
}

/* ===== 交易表格 ===== */
function renderTable(list){
  const tbody=document.querySelector('#tbl tbody');tbody.innerHTML='';
  list.forEach((t,i)=>{
    tbody.insertAdjacentHTML('beforeend',`
      <tr>
        <td rowspan="2">${i+1}</td>
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
  document.getElementById('tbl').hidden=false;
}

/* ===== 畫圖 ===== */
let chart;
function drawChart(ts,total,long,short,slip){
  if(chart)chart.destroy();

  /* 月份資料與刻度 */
  const monthStr=ts.map(s=>`${s.slice(0,4)}/${s.slice(4,6)}`);
  const months=[...new Set(monthStr)];
  const step=Math.ceil(months.length/24);

  const last=total.length-1;
  const maxV=Math.max(...total),minV=Math.min(...total);
  const maxI=total.indexOf(maxV),minI=total.indexOf(minV);

  /* 月條紋插件 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom}}=c,xs=c.scales.x;
    months.forEach((m,i)=>{
      if(i%2===0){
        const s=monthStr.indexOf(m),e=monthStr.lastIndexOf(m);
        ctx.fillStyle='rgba(0,0,0,.04)';
        ctx.fillRect(xs.getPixelForValue(s),top,
                     xs.getPixelForValue(e)-xs.getPixelForValue(s)+1,bottom-top);
      }
    });
  }};

  /* 公用樣式 */
  const line=(col,width)=>({
    borderColor:col,borderWidth:width,fill:false,
    pointRadius:ctx=>ctx.dataIndex===last?5:0,
    pointStyle:'circle',pointBorderWidth:2,
    pointBackgroundColor:col
  });

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:ts,
      datasets:[
        {label:'總累積',data:total,
         ...line('#fbc02d',2),
         fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},

        {label:'多單累積',data:long ,...line('#d32f2f',1.4)},
        {label:'空單累積',data:short,...line('#2e7d32',1.4)},
        {label:'滑價累積',data:slip ,...line('#212121',1.4)},

        {label:'Max',data:total.map((v,i)=>i===maxI?v:null),
         pointRadius:6,pointBackgroundColor:'#d32f2f',showLine:false},
        {label:'Min',data:total.map((v,i)=>i===minI?v:null),
         pointRadius:6,pointBackgroundColor:'#2e7d32',showLine:false}
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
            const lbl=ctx.dataset.label,i=ctx.dataIndex;
            return lbl==='Max'||lbl==='Min'||i===last;
          },
          formatter:v=>fmt(v)
        }
      },
      scales:{
        x:{
          ticks:{
            autoSkip:false,
            callback:(v,i)=>{
              const m=monthStr[i];
              return months.indexOf(m)%step===0?m:'';
            },
            maxRotation:45,minRotation:45
          },
          grid:{display:false}
        },
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[ChartDataLabels,stripe]
  });
}

/* ===== 工具 ===== */
const fmt=v=>v===''||v===undefined?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
