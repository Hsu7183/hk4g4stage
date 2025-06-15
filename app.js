/* ===== 常數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ===== DOM ===== */
document.addEventListener('DOMContentLoaded',()=>{
  /* 貼上剪貼簿 */
  btnClip.addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert(err.message);}
  });

  /* 選擇檔案 */
  fileInput.addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const read=(enc)=>new Promise((ok,no)=>{const r=new FileReader();
      r.onload=()=>ok(r.result);r.onerror=no; enc?r.readAsText(f,enc):r.readAsText(f);});
    (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());}
      flash(e.target.parentElement);})();
  });
});

/* ===== 主流程 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return alert('空檔案');
  const q=[],tr=[];

  /* 累加陣列 */
  const X=[],monthSeq=[],tot=[],longA=[],shortA=[],slipA=[];

  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pStr); const ts=tsRaw.slice(0,12);
    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});return;}

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain;cumSlip+=gainSlip; pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({inTs:pos.tsIn,inPrice:pos.pIn,inType:pos.typeIn,outTs:ts,outPrice:price,
      outType:act,pts,fee,tax,gain,cum,gainSlip,cumSlip});

    tot.push(cum);longA.push(cumL);shortA.push(cumS);slipA.push(cumSlip);
    monthSeq.push(ts.slice(0,6));  /* 202308 */
  });
  if(!tr.length)return alert('沒有成功配對的交易！');

  renderTable(tr); drawChart(monthSeq,tot,longA,shortA,slipA);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=tbl.querySelector('tbody');tb.innerHTML='';
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
  tbl.hidden=false;
}

/* ===== 畫圖（26 個月等寬） ===== */
let chart;
function drawChart(monthSeq,Tot,Lon,Sho,Sli){
  if(chart)chart.destroy();

  /* 取起訖月 + 前後各推 1 月 → 26 個月 */
  const first=monthSeq[0],last=monthSeq[monthSeq.length-1];
  const ymToDate=(ym)=>new Date(+ym.slice(0,4),+ym.slice(4,6)-1);
  const addMonth=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const fmtYM=d=>`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const start=addMonth(ymToDate(first),-1),end=addMonth(ymToDate(first),25); /* 26 個 */
  const months=[];for(let d=start;d<=end;d=addMonth(d,1))months.push(fmtYM(d).replace('/',''));

  /* 建立 X 軸：月序 + 月內序(0.01,0.02 …) */
  const monthIndex={};months.forEach((m,i)=>monthIndex[m]=i);
  const X=[],tT=[],tL=[],tS=[],tP=[];
  const counter={};      /* 追蹤月內序 */
  monthSeq.forEach((m,i)=>{
    counter[m]=(counter[m]||0)+1;
    X.push(monthIndex[m]+counter[m]*0.01);
    tT.push(Tot[i]);tL.push(Lon[i]);tS.push(Sho[i]);tP.push(Sli[i]);
  });

  /* stripe 背景 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom,left,right}}=c;
    const cell=(right-left)/months.length;ctx.save();
    months.forEach((_,i)=>{if(i%2===0){
      ctx.fillStyle='rgba(0,0,0,.05)';
      ctx.fillRect(left+i*cell,top,cell,bottom-top);
    }});ctx.restore();
  }};

  /* dataset factory */
  const step=(d,col)=>({data:d,borderColor:col,borderWidth:2,stepped:true,
    pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,fill:false});
  const last=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),
    showLine:false,pointRadius:5,pointBackgroundColor:col});

  const maxI=tT.indexOf(Math.max(...tT)),minI=tT.indexOf(Math.min(...tT));

  chart=new Chart(equityChart,{
    type:'line',
    data:{labels:X,datasets:[
      step(tT,'#fbc02d'),step(tL,'#d32f2f'),step(tS,'#2e7d32'),step(tP,'#212121'),
      last(tT,'#fbc02d'),last(tL,'#d32f2f'),last(tS,'#2e7d32'),last(tP,'#212121'),
      {data:tT.map((v,i)=>i===maxI?v:null),showLine:false,pointRadius:6,pointBackgroundColor:'#d32f2f'},
      {data:tT.map((v,i)=>i===minI?v:null),showLine:false,pointRadius:6,pointBackgroundColor:'#2e7d32'}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{
          display:ctx=>ctx.dataset.showLine===false,
          anchor:'start',align:'right',offset:-6,font:{size:10},
          formatter:v=>v?.toLocaleString('zh-TW')||''
        }
      },
      scales:{
        x:{
          type:'linear',min:0,max:25.9,
          ticks:{
            callback:(v)=>{const i=Math.round(v);return (v-i===0)?`${months[i].slice(0,4)}/${months[i].slice(4)}`:''},
            maxRotation:0,minRotation:0
          },grid:{display:false}
        },
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,ChartDataLabels]
  });
}

/* ===== 工具 ===== */
const fmt=v=>v.toLocaleString('zh-TW');
const fmtTs=s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
