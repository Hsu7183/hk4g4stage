/* === 常量 === */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* === DOM Ready === */
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

/* === 主流程 === */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return alert('空檔案');

  const q=[],tr=[];
  const x=[],tot=[],longA=[],shortA=[],slipA=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pStr);
    const ISO   = tsRaw.slice(0,4)+'-'+tsRaw.slice(4,6)+'-'+tsRaw.slice(6,8);

    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw});return;}

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain;cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({in:pos.tsIn,out:tsRaw,pts,fee,tax,gain,cum,gainSlip,cumSlip});

    x.push(new Date(ISO));          // X 軸日期
    tot.push(cum); longA.push(cumL); shortA.push(cumS); slipA.push(cumSlip);
  });

  if(!tr.length)return alert('沒有成功配對的交易！');
  renderTable(tr); drawChart(x,tot,longA,shortA,slipA);
}

/* === 表格 === */
function renderTable(list){
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  list.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${t.in}</td><td>—</td><td>—</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${t.out}</td><td>—</td><td>—</td>
          <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
          <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
          <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden=false;
}

/* === 畫圖 === */
let chart;
function drawChart(dates,T,L,S,P){
  if(chart)chart.destroy();

  /* stripe 用月份邊界 */
  const minDate=new Date(dates[0].getFullYear(),dates[0].getMonth(),1);
  const maxDate=new Date(dates[dates.length-1].getFullYear(),dates[dates.length-1].getMonth()+1,1);

  const stripe={
    id:'stripe',
    beforeDraw(c){const {ctx,chartArea:{top,bottom},scales:{x}}=c;
      ctx.save();
      for(let m=new Date(minDate),idx=0;m<maxDate;m.setMonth(m.getMonth()+1),idx++){
        if(idx%2===0){
          const x0=x.getPixelForValue(m);
          const next=new Date(m);next.setMonth(next.getMonth()+1);
          const x1=x.getPixelForValue(next);
          ctx.fillStyle='rgba(0,0,0,.06)';
          ctx.fillRect(x0,top,x1-x0,bottom-top);
        }
      }
      ctx.restore();}
  };

  const lastIdx=T.length-1;
  const maxIdx=T.indexOf(Math.max(...T)),minIdx=T.indexOf(Math.min(...T));

  const stair=(col)=>({borderColor:col,borderWidth:2,stepped:true,
                       pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,fill:false});
  const specialPt=(idx,col,txtAlign='left')=>({
    data:T.map((_,i)=>i===idx?T[i]:null),showLine:false,pointRadius:6,pointBackgroundColor:col,
    datalabels:{anchor:'end',align:txtAlign,formatter:v=>fmt(v)}
  });

  const lastLabel=(arr,col)=>({
    data:arr.map((v,i)=>i===lastIdx?v:null),showLine:false,pointRadius:5,pointBackgroundColor:col,
    datalabels:{anchor:'end',align:'left',formatter:v=>fmt(v)}
  });

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:dates,
      datasets:[
        {label:'總',data:T,...stair('#fbc02d'),
          fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},
        {label:'多',data:L,...stair('#d32f2f')},
        {label:'空',data:S,...stair('#2e7d32')},
        {label:'滑',data:P,...stair('#212121')},
        lastLabel(T ,'#fbc02d'),lastLabel(L ,'#d32f2f'),
        lastLabel(S ,'#2e7d32'),lastLabel(P ,'#212121'),
        specialPt(maxIdx,'#d32f2f','right'),
        specialPt(minIdx,'#2e7d32','right')
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}},
        datalabels:{display:false}
      },
      scales:{
        x:{type:'time',time:{unit:'month',stepSize:1,displayFormats:{month:'yyyy/MM'}},
           ticks:{maxRotation:45,minRotation:45},grid:{display:false}},
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[stripe,window.ChartDataLabels]
  });
}

/* === 工具 === */
const fmt=v=>(v==null||v==='')?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
