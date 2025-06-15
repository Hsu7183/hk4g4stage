/* ===== 參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ===== Dom Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert('剪貼簿失敗:'+err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    const read=enc=>new Promise((ok,no)=>{const r=new FileReader();
        r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);
        enc?r.readAsText(f,enc):r.readAsText(f);});
    (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());}
      flash(e.target.parentElement);})();
  });
});

/* ===== 主分析 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/); if(!rows.length)return alert('檔案為空');
  const q=[],tr=[],ts=[],tot=[],longA=[],shortA=[],slipA=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/); if(!act) return;
    const price=+parseFloat(pStr);
    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});return;}

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1) return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip; pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:tsRaw.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});

    ts.push(tsRaw.slice(0,8)); tot.push(cum);
    longA.push(cumL); shortA.push(cumS); slipA.push(cumSlip);
  });
  if(!tr.length) return alert('沒有成功配對的交易！');

  renderTable(tr);
  drawChart(ts,tot,longA,shortA,slipA);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  list.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${t.in.ts}</td><td>${t.in.price}</td><td>${t.in.type}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${t.out.ts}</td><td>${t.out.price}</td><td>${t.out.type}</td>
          <td>${fmt(t.out.pts)}</td><td>${fmt(t.out.fee)}</td><td>${fmt(t.out.tax)}</td>
          <td>${fmt(t.out.gain)}</td><td>${fmt(t.out.cum)}</td>
          <td>${fmt(t.out.gainSlip)}</td><td>${fmt(t.out.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden=false;
}

/* ===== 畫圖 ===== */
let chart;
function drawChart(lbl,T,L,S,P){
  if(chart) chart.destroy();

  const last=lbl.length-1,maxI=T.indexOf(Math.max(...T)),minI=T.indexOf(Math.min(...T));
  const months=lbl.map(d=>d.slice(0,6));

  /* --- 改良條紋：輪流塗色，但最左側永遠是「淺灰」 --- */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom,left,right}}=c,x=c.scales.x;
    ctx.save();
    let monthStart=0, stripeOn=false, prev=months[0];
    months.forEach((m,i)=>{
      if(m!==prev){ drawBand(monthStart,i,stripeOn); monthStart=i; prev=m; stripeOn=!stripeOn; }
    });
    drawBand(monthStart, months.length, stripeOn);   // 尾段
    ctx.restore();

    function drawBand(from,to,on){
      if(!on) return;          // 交錯
      const x0=x.getPixelForTick(from);
      const x1=to<lbl.length?x.getPixelForTick(to):right;
      ctx.fillStyle='rgba(0,0,0,.04)';               // 淺灰
      ctx.fillRect(x0,top,x1-x0,bottom-top);
    }
  }};

  const stepLine=(c,w)=>({borderColor:c,borderWidth:w,stepped:true,
    pointRadius:2,pointBackgroundColor:c,pointBorderColor:c,fill:false});
  const dot=(arr,idx,col,r=6)=>({data:arr.map((v,i)=>i===idx?v:null),
    showLine:false,pointRadius:r,pointBackgroundColor:col,pointBorderColor:'#fff',pointBorderWidth:1});

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:lbl,
      datasets:[
        {label:'總',data:T,...stepLine('#fbc02d',2),
          fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},
        {label:'多',data:L,...stepLine('#d32f2f',2)},
        {label:'空',data:S,...stepLine('#2e7d32',2)},
        {label:'滑',data:P,...stepLine('#212121',2)},

        dot(T,last,'#fbc02d',5),dot(L,last,'#d32f2f',5),
        dot(S,last,'#2e7d32',5),dot(P,last,'#212121',5),
        dot(T,maxI,'#d32f2f',7),dot(T,minI,'#2e7d32',7)
      ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{
          color:'#000',font:{size:10},clip:false,
          display:ctx=>{
            const ds=ctx.datasetIndex; return ds>=4;      // 只顯示點的資料集
          },
          anchor:'end',align:'left',offset:6,
          formatter:v=>v?.toLocaleString('zh-TW')??''
        }
      },
      scales:{
        x:{grid:{display:false},ticks:{maxRotation:45,minRotation:45}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }},
    plugins:[stripe,window.ChartDataLabels||{}]
  });
}

/* ===== utils ===== */
const fmt=v=>(v===undefined||v==='')?'':v.toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
