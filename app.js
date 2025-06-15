/* ========= 參數 ========= */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

const cvs=document.getElementById('equityChart');
const tbl=document.getElementById('tbl');

/* ========= 載入檔案 / 剪貼簿 ========= */
document.getElementById('btn-clip').onclick=async e=>{
  try{analyse(await navigator.clipboard.readText());flash(e.target);}
  catch(err){alert(err.message);}
};
document.getElementById('fileInput').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const read=enc=>new Promise((ok,no)=>{const r=new FileReader();
    r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);
    enc?r.readAsText(f,enc):r.readAsText(f);});
  (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());}
    flash(e.target.parentElement);})();
};

/* ========= 主要流程 ========= */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return alert('空檔案');
  const q=[],tr=[],ts=[],tot=[],lon=[],sho=[],sli=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+pStr;
    if(ENTRY.includes(act)){q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});return;}

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;
    cum+=gain;cumSlip+=gainSlip;pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({pos,tsOut:tsRaw,priceOut:price,actOut:act,pts,fee,tax,gain,cum,gainSlip,cumSlip});
    ts.push(tsRaw);tot.push(cum);lon.push(cumL);sho.push(cumS);sli.push(cumSlip);
  });
  if(!tr.length)return alert('沒有成功配對的交易！');
  renderTable(tr);drawChart(ts,tot,lon,sho,sli);
}

/* ========= 表格 ========= */
function renderTable(list){
  const body=tbl.querySelector('tbody');body.innerHTML='';
  list.forEach((t,i)=>body.insertAdjacentHTML('beforeend',`
    <tr><td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
    <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>`));
  tbl.hidden=false;
}

/* ========= 畫圖 ========= */
let chart;
function drawChart(tsArr,T,L,S,P){
  if(chart)chart.destroy();

  /* ---- x 座標：依日期自然順序，直接 0,1,2... ---- */
  const X=tsArr.map((_,i)=>i);

  /* ---- 26 個月背景 ---- */
  const ym=s=>s.slice(0,6);
  const ymList=[...new Set(tsArr.map(ym))];
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/ymList.length;
    ctx.save();ymList.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
      ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();
  }};
  const mm={id:'mm',afterDraw(c){
    const {ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/ymList.length;
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
    ymList.forEach((m,i)=>ctx.fillText(`${m.slice(0,4)}/${m.slice(4)}`,left+w*(i+.5),bottom+8));
    ctx.restore();
  }};

  const maxI=T.indexOf(Math.max(...T)),minI=T.indexOf(Math.min(...T));
  const mk=(d,col)=>({
    data:d,stepped:true,borderColor:col,borderWidth:2,fill:false,
    pointRadius:4,pointBackgroundColor:col,pointBorderColor:'#fff',pointBorderWidth:1,datalabels:{display:false}
  });
  const last=(d,col)=>({
    data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:2,
    datalabels:{display:true,anchor:'start',align:'left',offset:6,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}
  });
  const mark=(d,i,col)=>({
    data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:2,
    datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',offset:8,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}
  });

  chart=new Chart(cvs,{
    type:'line',
    data:{
      labels:X,
      datasets:[
        mk(T,'#fdd835'),mk(L,'#e53935'),mk(S,'#43a047'),mk(P,'#000'),
        last(T,'#fdd835'),last(L,'#e53935'),last(S,'#43a047'),last(P,'#000'),
        mark(T,maxI,'#e53935'),mark(T,minI,'#43a047')
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{bottom:42}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}},
      scales:{x:{grid:{display:false},ticks:{display:false}},
              y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
    },
    plugins:[stripe,mm,ChartDataLabels]
  });
}

/* ========= 小工具 ========= */
const fmt=n=>n.toLocaleString('zh-TW');
const fmtTs=s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
