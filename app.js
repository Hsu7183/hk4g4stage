/* ===== 參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],
      EXIT_L=['平賣','強制平倉'],
      EXIT_S=['平買','強制平倉'];

/* ===== Dom Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert('剪貼簿失敗: '+err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=()=>analyse(reader.result);
    reader.readAsText(f);    // UTF-8 / BIG5 皆可
    flash(e.target.parentElement);
  });
});

/* ===== 主分析 ===== */
function analyse(text){
  const lines=text.trim().split(/\r?\n/); if(!lines.length)return;

  const q=[],tr=[],lbl=[],tot=[],longA=[],shortA=[],slipA=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  lines.forEach(l=>{
    const [ts,pS,act]=l.trim().split(/\s+/); if(!act)return;
    const price=+parseFloat(pS);

    if(ENTRY.includes(act)){ q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act}); return; }

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1) return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,
          gainSlip=gain-SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:ts.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});

    lbl.push(ts.slice(0,6).replace(/(\d{4})(\d{2})/,'$1/$2'));
    tot.push(cum); longA.push(cumL); shortA.push(cumS); slipA.push(cumSlip);
  });
  if(!tr.length)return alert('沒有成功配對的交易！');

  renderTable(tr); drawChart(lbl,tot,longA,shortA,slipA);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  list.forEach((o,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${o.in.ts}</td><td>${o.in.price}</td><td>${o.in.type}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${o.out.ts}</td><td>${o.out.price}</td><td>${o.out.type}</td>
          <td>${fmt(o.out.pts)}</td><td>${fmt(o.out.fee)}</td><td>${fmt(o.out.tax)}</td>
          <td>${fmt(o.out.gain)}</td><td>${fmt(o.out.cum)}</td>
          <td>${fmt(o.out.gainSlip)}</td><td>${fmt(o.out.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden=false;
}

/* ===== 畫圖 ===== */
let chart;
function drawChart(label,T,L,S,P){
  if(chart) chart.destroy();

  /* 背景月份黑白條 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom}}=c,x=c.scales.x;
    ctx.save();
    label.forEach((_,i)=>{if(i%2===0){
      const x0=x.getPixelForValue(i),x1=x.getPixelForValue(i+1)||x0+(x.getPixelForValue(1)-x.getPixelForValue(0));
      ctx.fillStyle='rgba(0,0,0,.05)';
      ctx.fillRect(x0,top,x1-x0,bottom-top);
    }});ctx.restore();
  }};

  /* 通用線型 */
  const stepLine=(col)=>({
    borderColor:col,borderWidth:2,stepped:true,
    pointRadius:3,pointStyle:'circle',pointBorderWidth:2,
    pointBackgroundColor:'#fff',pointBorderColor:col,fill:false
  });

  const lastPoint=(arr,col)=>({
    data:arr.map((v,i)=>i===arr.length-1?v:null),
    showLine:false,pointRadius:5,pointBackgroundColor:col,
    datalabels:{align:'left',anchor:'end',offset:6,color:'#000',
      formatter:v=>v.toLocaleString('zh-TW')}
  });

  const max=Math.max(...T),min=Math.min(...T),
        maxI=T.indexOf(max),minI=T.indexOf(min);

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:label,
      datasets:[
        /* 總線黃 + 底色 */
        {
          label:'總',data:T,...stepLine('#fbc02d'),
          fill:{target:'origin',
            above:'rgba(255,138,128,.18)',
            below:'rgba(200,230,201,.18)'}
        },
        {label:'多',data:L,...stepLine('#d32f2f')},
        {label:'空',data:S,...stepLine('#2e7d32')},
        {label:'滑',data:P,...stepLine('#212121')},

        /* 四條最後一點 */
        {...lastPoint(T,'#fbc02d')},
        {...lastPoint(L,'#d32f2f')},
        {...lastPoint(S,'#2e7d32')},
        {...lastPoint(P,'#212121')},

        /* 最大值 / 最小值點 */
        {data:T.map((v,i)=>i===maxI?v:null),
          showLine:false,pointRadius:6,pointBackgroundColor:'#d32f2f',
          datalabels:{align:'left',anchor:'end',offset:6,color:'#000',
            formatter:v=>v.toLocaleString('zh-TW')}},
        {data:T.map((v,i)=>i===minI?v:null),
          showLine:false,pointRadius:6,pointBackgroundColor:'#2e7d32',
          datalabels:{align:'left',anchor:'end',offset:6,color:'#000',
            formatter:v=>v.toLocaleString('zh-TW')}}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      elements:{point:{hoverRadius:5}},
      scales:{
        x:{grid:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,window.ChartDataLabels]
  });
}

/* ===== 小工具 ===== */
const fmt=v=>(v===''||v===undefined)?'':v.toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
