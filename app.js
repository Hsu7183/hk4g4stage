/* ===== 全域 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY  = ['新買','新賣'],
      EXIT_L = ['平賣','強制平倉'],
      EXIT_S = ['平買','強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');

/* ---------- 讀取 ---------- */
document.getElementById('btn-clip').onclick = async e=>{
  try{ analyse(await navigator.clipboard.readText()); flash(e.target); }
  catch(err){ alert(err); }
};
document.getElementById('fileInput').onchange = e=>{
  const f = e.target.files[0]; if(!f) return;
  const read = enc=>new Promise((ok,no)=>{ const r=new FileReader();
      r.onload = ()=>ok(r.result); r.onerror = ()=>no(r.error);
      enc ? r.readAsText(f,enc) : r.readAsText(f);
  });
  (async()=>{ try{analyse(await read('big5'));}catch{analyse(await read());}
    flash(e.target.parentElement); })();
};

/* ---------- 解析 ---------- */
function analyse(raw){
  const rows = raw.trim().split(/\r?\n/);
  if(!rows.length){ alert('空檔案');return; }

  const Q=[], tx=[], dateArr=[], T=[], L=[], S=[], P=[];
  let Cum=0, CumL=0, CumS=0, CumSlip=0;

  rows.forEach(r=>{
    const [ts,p,act] = r.trim().split(/\s+/); if(!act) return;
    const price = +p;

    if(ENTRY.includes(act)){ Q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act}); return;}

    const i = Q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1) return;
    const pos = Q.splice(i,1)[0];

    const pts  = pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee  = FEE*2;
    const tax  = Math.round(price*MULT*TAX);
    const gain = pts*MULT-fee-tax;
    const gSlip= gain-SLIP*MULT;

    Cum+=gain; CumSlip+=gSlip; pos.side==='L'?CumL+=gain:CumS+=gain;

    tx.push({pos,tsOut:ts,priceOut:price,actOut:act,
             pts,fee,tax,gain,Cum,gSlip,CumSlip});

    dateArr.push(ts); T.push(Cum); L.push(CumL); S.push(CumS); P.push(CumSlip);
  });

  if(!tx.length){ alert('沒有成功配對的交易');return; }

  renderTable(tx); drawChart(dateArr,T,L,S,P);
}

/* ---------- 表格 ---------- */
function renderTable(list){
  const body = tbl.querySelector('tbody'); body.innerHTML='';
  list.forEach((t,i)=>body.insertAdjacentHTML('beforeend',`
    <tr><td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
    <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(t.Cum)}</td>
        <td>${fmt(t.gSlip)}</td><td>${fmt(t.CumSlip)}</td></tr>`));
  tbl.hidden = false;
}

/* ---------- 圖 ---------- */
let chart;
function drawChart(tsArr,T,L,S,P){
  if(chart) chart.destroy();

  /* 26 個月格 (前後各 +1) */
  const ym2Date = y=>new Date(+y.slice(0,4),+y.slice(4,6)-1);
  const addM    = (d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const toYM    = d=>`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const start = addM(ym2Date(tsArr[0].slice(0,6)),-1);
  const months=[]; for(let d=start;months.length<26;d=addM(d,1)) months.push(toYM(d));
  const idx={}; months.forEach((m,i)=>idx[m.replace('/','')]=i);

  /* x = 月序 + 日比例 (0~0.98) */
  const X = tsArr.map(ts=>{
    const ym  = ts.slice(0,6),
          day = +ts.slice(6,8),
          days= new Date(+ym.slice(0,4),+ym.slice(4,6),0).getDate();
    return idx[ym] + (day-0.5)/days;     // 月內等比例
  });

  const maxI=T.indexOf(Math.max(...T)), minI=T.indexOf(Math.min(...T));

  /* --- 補充外觀 plug-in --- */
  const stripe = {id:'stripe',beforeDraw(c){const {ctx,chartArea:{left,right,top,bottom}}=c,
          w=(right-left)/26;ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?
          'rgba(0,0,0,.05)':'transparent';ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
  const mmLabel={id:'mmLabel',afterDraw(c){const {ctx,chartArea:{left,right,bottom}}=c,
          w=(right-left)/26;ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';
          ctx.textBaseline='top';ctx.fillStyle='#555';
          months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

  const mkLine=(d,col,fill=false)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
      pointRadius:4,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,fill});
  const mkLast=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:6,
      pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
      datalabels:{display:true,anchor:'start',align:'left',offset:12,clip:false,
                  formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',font:{size:10}}});
  const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
      pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
      datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',
                  offset:8,clip:false,formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',font:{size:10}}});

  chart=new Chart(cvs,{
    type:'line',
    data:{labels:X,datasets:[
      mkLine(T,'#fbc02d',{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}),
      mkLine(L,'#d32f2f'),mkLine(S,'#2e7d32'),mkLine(P,'#212121'),
      mkLast(T,'#fbc02d'),mkLast(L,'#d32f2f'),mkLast(S,'#2e7d32'),mkLast(P,'#212121'),
      mkMark(T,maxI,'#d32f2f'),mkMark(T,minI,'#2e7d32')
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:110}},      /* ★(A) 右側餘寬 */
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      scales:{
        x:{type:'linear',min:-0.2,max:months.length-1+0.4,   /* ★(A) x.max 延後 */
           grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

/* ---------- utils ---------- */
const fmt = n=>n.toLocaleString('zh-TW');
const fmtTs = s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){ el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),600); }
