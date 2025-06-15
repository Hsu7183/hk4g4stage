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
    const f=e.target.files[0];if(!f)return;
    const read=(enc)=>new Promise((ok,no)=>{const r=new FileReader();
      r.onload=()=>ok(r.result);r.onerror=()=>no(r.error); enc?r.readAsText(f,enc):r.readAsText(f);});
    (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());} flash(e.target.parentElement);})();
  });
});

/* ===== 主分析 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return alert('空檔案');

  const q=[],tr=[];
  const ts=[],tot=[],longA=[],shortA=[],slipA=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+parseFloat(pStr);

    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});return;}

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain;cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:tsRaw.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});

    ts.push(tsRaw);tot.push(cum);longA.push(cumL);shortA.push(cumS);slipA.push(cumSlip);
  });
  if(!tr.length)return alert('沒有成功配對');

  renderTable(tr); drawChart(ts,tot,longA,shortA,slipA);
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
function drawChart(ts,T,L,S,P){
  /* 生成「完整月份序列」 */
  const ym=s=>s.slice(0,4)+'/'+s.slice(4,6);
  const first=new Date(ts[0].slice(0,4),ts[0].slice(4,6)-1);
  const last =new Date(ts[ts.length-1].slice(0,4),ts[ts.length-1].slice(4,6)-1);
  const months=[];
  for(let d=new Date(first);d<=last;d.setMonth(d.getMonth()+1)){
    months.push(d.toISOString().slice(0,7).replace('-','/'));
  }

  /* 把原始點映射到完整月份序列 */
  const idxMap={};ts.forEach((t,i)=>idxMap[ym(t)]=i);
  const fillArr=arr=>months.map(m=>idxMap[m]!=null?arr[idxMap[m]]:null);
  const tot=fillArr(T),long=fillArr(L),short=fillArr(S),slip=fillArr(P);

  if(chart)chart.destroy();
  const maxI=tot.indexOf(Math.max(...tot.filter(v=>v!==null)));
  const minI=tot.indexOf(Math.min(...tot.filter(v=>v!==null)));
  const lastI=tot.length-1;

  /* 黑白月條 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom}}=c,x=c.scales.x;
    ctx.save();
    months.forEach((_,i)=>{
      if(i%2===0){
        const x0=x.getPixelForTick(i),x1=x.getPixelForTick(i+1)||x0+(x.getPixelForTick(1)-x.getPixelForTick(0));
        ctx.fillStyle='rgba(0,0,0,.06)';
        ctx.fillRect(x0,top,x1-x0,bottom-top);
      }
    });
    ctx.restore();
  }};

  /* 共同線型 */
  const stair=(col)=>({borderColor:col,borderWidth:2,stepped:true,
                       pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,fill:false});

  const lastPoint=(arr,col)=>({data:arr.map((v,i)=>i===lastI?v:null),
                               showLine:false,pointRadius:5,pointBackgroundColor:col,
                               datalabels:{align:'left',anchor:'end',formatter:v=>fmt(v)}});

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:months,
      datasets:[
        /* 總線 */
        {label:'總',data:tot,...stair('#fbc02d'),
         fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},
        {label:'多',data:long ,...stair('#d32f2f')},
        {label:'空',data:short,...stair('#2e7d32')},
        {label:'滑',data:slip ,...stair('#212121')},

        lastPoint(tot  ,'#fbc02d'),
        lastPoint(long ,'#d32f2f'),
        lastPoint(short,'#2e7d32'),
        lastPoint(slip ,'#212121'),

        {data:tot.map((v,i)=>i===maxI?v:null),showLine:false,pointRadius:6,pointBackgroundColor:'#d32f2f',
          datalabels:{align:'right',anchor:'end',formatter:v=>fmt(v)}},
        {data:tot.map((v,i)=>i===minI?v:null),showLine:false,pointRadius:6,pointBackgroundColor:'#2e7d32',
          datalabels:{align:'right',anchor:'end',formatter:v=>fmt(v)}}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}},
        datalabels:{display:false}
      },
      scales:{
        x:{grid:{display:false},ticks:{maxRotation:45,minRotation:45}},
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[stripe,window.ChartDataLabels]
  });
}

/* ===== 工具 ===== */
const fmt=v=>(v==null||v==='')?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
