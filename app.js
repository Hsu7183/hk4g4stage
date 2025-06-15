/* ===== 參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert(err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const read=(enc)=>new Promise((ok,no)=>{const r=new FileReader();
      r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);
      enc?r.readAsText(f,enc):r.readAsText(f);});
    (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());}
      flash(e.target.parentElement);})();
  });
});

/* ===== 主流程 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return alert('空檔案');

  const q=[],tr=[];const x=[],tot=[],longA=[],shortA=[],slipA=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pRaw,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pRaw);

    /* --- 日期字串修正 (FIX) --- */
    const ISO=`${tsRaw.slice(0,4)}-${tsRaw.slice(4,6)}-${tsRaw.slice(6,8)}`;

    if(ENTRY.includes(act)){
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});
      return;
    }

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain;cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({inTs:pos.tsIn,inPrice:pos.pIn,inType:pos.typeIn,
             outTs:tsRaw,outPrice:price,outType:act,
             pts,fee,tax,gain,cum,gainSlip,cumSlip});

    x.push(new Date(ISO));tot.push(cum);longA.push(cumL);
    shortA.push(cumS);slipA.push(cumSlip);
  });

  if(!tr.length)return alert('沒有成功配對的交易！');
  renderTable(tr);drawChart(x,tot,longA,shortA,slipA);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  list.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
      <td>${fmtTs(t.inTs)}</td><td>${t.inPrice}</td><td>${t.inType}</td>
      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.outTs)}</td><td>${t.outPrice}</td><td>${t.outType}</td>
      <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
      <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
      <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden=false;
}

/* ===== 畫圖 ===== */
let chart;
function drawChart(time,T,L,S,P){
  if(chart)chart.destroy();

  /* --- stripe 背景 (等寬月條) --- */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom},scales:{x}}=c;
    ctx.save();time.forEach((_,i)=>{if(i%2===0){
      const x0=x.getPixelForValue(i),x1=x.getPixelForValue(i+1)||x0+(x.getPixelForValue(i)-x.getPixelForValue(i-1));
      ctx.fillStyle='rgba(0,0,0,.05)';ctx.fillRect(x0,top,x1-x0,bottom-top);
    }});ctx.restore();
  }};

  /* --- 資料集工廠 --- */
  const step=(d,col)=>({
    data:d,borderColor:col,borderWidth:2,stepped:true,
    pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,fill:false
  });
  const lastPt=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),
                           showLine:false,pointRadius:5,pointBackgroundColor:col});
  const maxI=T.indexOf(Math.max(...T)),minI=T.indexOf(Math.min(...T));

  chart=new Chart(equityChart,{
    type:'line',
    data:{labels:time,datasets:[
      step(T,'#fbc02d'),step(L,'#d32f2f'),step(S,'#2e7d32'),step(P,'#212121'),
      lastPt(T,'#fbc02d'),lastPt(L,'#d32f2f'),lastPt(S,'#2e7d32'),lastPt(P,'#212121'),
      {data:T.map((v,i)=>i===maxI?v:null),showLine:false,pointRadius:6,pointBackgroundColor:'#d32f2f'},
      {data:T.map((v,i)=>i===minI?v:null),showLine:false,pointRadius:6,pointBackgroundColor:'#2e7d32'}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{
          display:ctx=>ctx.dataset.showLine===false,
          align:'left',anchor:'end',offset:6,font:{size:10},
          formatter:v=>v?.toLocaleString('zh-TW')||''
        }
      },
      scales:{
        x:{
          type:'time',time:{unit:'month',round:'month',displayFormats:{month:'yyyy/MM'}},
          ticks:{maxTicksLimit:24},
          grid:{display:false}
        },
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,ChartDataLabels]
  });
}

/* ===== 小工具 ===== */
const fmt=v=>v.toLocaleString('zh-TW');
const fmtTs=s=>s.slice(0,4)+'/'+s.slice(4,2)+'/'+s.slice(6,2);
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
