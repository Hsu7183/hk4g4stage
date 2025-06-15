/* ===== 全域 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'], EXIT_L=['平賣','強制平倉'], EXIT_S=['平買','強制平倉'];
const cvs=document.getElementById('equityChart'); const tbl=document.getElementById('tbl');

/* ---------- 匯入 ---------- */
document.getElementById('btn-clip').onclick=async e=>{
  try{ analyse(await navigator.clipboard.readText()); flash(e.target);}catch(err){alert(err);}
};
document.getElementById('fileInput').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const read=enc=>new Promise((ok,no)=>{const r=new FileReader();
      r.onload=()=>ok(r.result); r.onerror=()=>no(r.error);
      enc?r.readAsText(f,enc):r.readAsText(f);});
  (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());}flash(e.target.parentElement);})();
};

/* ---------- 分析 ---------- */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/); if(!rows.length){alert('空檔案');return;}
  const Q=[],tx=[],tsArr=[],T=[],L=[],S=[],P=[];
  let cT=0,cL=0,cS=0,cP=0;

  rows.forEach(r=>{
    const [ts,p,a]=r.trim().split(/\s+/); if(!a) return;
    const price=+p;
    if(ENTRY.includes(a)){Q.push({side:a==='新買'?'L':'S',tsIn:ts,pIn:price,tIn:a});return;}
    const i=Q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(a))||(o.side==='S'&&EXIT_S.includes(a)));
    if(i===-1) return;
    const pos=Q.splice(i,1)[0];
    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2, tax=Math.round(price*MULT*TAX);
    const g=pts*MULT-fee-tax, gSlip=g-SLIP*MULT;
    cT+=g; cP+=gSlip; pos.side==='L'?cL+=g:cS+=g;

    tx.push({pos,tsOut:ts,priceOut:price,actOut:a,pts,fee,tax,g,cT,gSlip,cP});
    tsArr.push(ts); T.push(cT); L.push(cL); S.push(cS); P.push(cP);
  });
  if(!tx.length){alert('沒有成功配對');return;}
  renderTable(tx); drawChart(tsArr,T,L,S,P);
}

/* ---------- 表格 ---------- */
function renderTable(list){
  const body=tbl.querySelector('tbody'); body.innerHTML='';
  list.forEach((t,i)=>body.insertAdjacentHTML('beforeend',`
   <tr><td rowspan="2">${i+1}</td><td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.tIn}</td>
       <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
   <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
       <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
       <td>${fmt(t.g)}</td><td>${fmt(t.cT)}</td><td>${fmt(t.gSlip)}</td><td>${fmt(t.cP)}</td></tr>`));
  tbl.hidden=false;
}

/* ---------- 圖 ---------- */
let chart;
function drawChart(tsArr,T,L,S,P){
  if(chart) chart.destroy();

  /* 月格＋比例 -------------------- */
  const ym2Date=y=>new Date(+y.slice(0,4),+y.slice(4,6)-1);
  const addM =(d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const ymTxt=d=>`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const firstYM=tsArr[0].slice(0,6); const start=addM(ym2Date(firstYM),-1);
  const months=[]; while(months.length<26) months.push(ymTxt(addM(start,months.length)));
  const idx={}; months.forEach((m,i)=>idx[m.replace('/','')]=i);

  const X=tsArr.map(ts=>{
    const ym=ts.slice(0,6), d=+ts.slice(6,8);
    const days=new Date(+ym.slice(0,4),+ym.slice(4,6),0).getDate();
    return idx[ym] + (d-0.5)/days;
  });

  const maxI=T.indexOf(Math.max(...T)), minI=T.indexOf(Math.min(...T));

  /* plugin：月條 & 標籤 ---------- */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save(); months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
      ctx.fillRect(left+i*w,top,w,bottom-top);}); ctx.restore();}};
  const mmLabel={id:'mmLabel',afterDraw(c){
    const {ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
    ctx.save(); ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#555';
    months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8)); ctx.restore();}};

  /* dataset factory ---------------- */
  const mkLine=(d,col,fill=false)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
      pointRadius:4,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,fill});
  const mkLast=(d,col)=>{
    const x=X[X.length-1]+0.5, y=d[d.length-1];   // 再往右半格
    return {type:'scatter',
      data:[{x,y}],pointRadius:6,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
      datalabels:{display:true,anchor:'start',align:'left',offset:4,clip:false,
                  formatter:()=>y.toLocaleString('zh-TW'),color:'#000',font:{size:10}}};
  };
  const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
      pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
      datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',
        offset:8,clip:false,formatter:v=>v.toLocaleString('zh-TW'),color:'#000',font:{size:10}}});

  chart=new Chart(cvs,{
    type:'line',
    data:{labels:X,datasets:[
      mkLine(T,'#fbc02d',{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}),
      mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121'),
      mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'), mkLast(S,'#2e7d32'), mkLast(P,'#212121'),
      mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:120}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      scales:{
        x:{type:'linear',min:-0.2,max:months.length-1+1,
           grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

/* ---------- utils ---------- */
const fmt=n=>n.toLocaleString('zh-TW');
const fmtTs=s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
