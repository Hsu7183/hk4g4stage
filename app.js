/* ========= 常數 ========= */
const MULT=200, FEE=45, TAX=0.00004, SLIP=1.5;
const ENTRY=['新買','新賣'],
      EXIT_L=['平賣','強制平倉'],
      EXIT_S=['平買','強制平倉'];

const btnClip=document.getElementById('btn-clip');
const fileInput=document.getElementById('fileInput');
const tbl=document.getElementById('tbl');
const canvas=document.getElementById('equityChart');

/* ========= 讀檔 ========= */
btnClip.addEventListener('click',async e=>{
  try{analyse(await navigator.clipboard.readText());flash(e.target);}catch(err){alert(err.message);}
});
fileInput.addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  const read=(enc)=>new Promise((ok,no)=>{
    const r=new FileReader();
    r.onload=()=>ok(r.result); r.onerror=no;
    enc?r.readAsText(f,enc):r.readAsText(f);
  });
  (async()=>{
    try{analyse(await read('big5'));}catch{analyse(await read());}
    flash(e.target.parentElement);
  })();
});

/* ========= 解析 & 彙整 ========= */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/); if(!rows.length)return alert('空檔案');

  const q=[],tr=[],ymSeq=[],TOT=[],LON=[],SHO=[],SLI=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/); if(!act)return;
    const price=+pStr, ts=tsRaw.slice(0,12);

    if(ENTRY.includes(act)){ // 開倉
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});
      return;
    }

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1) return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2, tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax, gainSlip=gain-SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    pos.side==='L' ? cumL+=gain : cumS+=gain;

    tr.push({pos,tsOut:ts,priceOut:price,actOut:act,pts,fee,tax,gain,cum,gainSlip,cumSlip});

    TOT.push(cum); LON.push(cumL); SHO.push(cumS); SLI.push(cumSlip);
    ymSeq.push(ts.slice(0,6));
  });
  if(!tr.length) return alert('沒有成功配對的交易！');

  renderTable(tr);
  drawChart(ymSeq,TOT,LON,SHO,SLI);  // 畫圖
}

/* ========= 表格 ========= */
function renderTable(list){
  const tb=tbl.querySelector('tbody');
  tb.innerHTML='';
  list.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
          <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
          <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
          <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>
    `);
  });
  tbl.hidden=false;
}

/* ========= 畫圖 ========= */
let chart;
function drawChart(ymSeq,T,L,S,P){
  if(chart) chart.destroy();

  /* ===== 26 個等寬月份 ===== */
  const ymToDate=ym=>new Date(+ym.slice(0,4),+ym.slice(4,6)-1);
  const addM  =(d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const fmtYM =d=>`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const first=ymToDate(ymSeq[0]), last=ymToDate(ymSeq[ymSeq.length-1]);
  const start=addM(first,-1);
  const months=[]; for(let d=start;months.length<26;d=addM(d,1)) months.push(fmtYM(d));

  /* x 座標：月序 + 0.01,0.02… 保持等寬 */
  const xm={}; months.forEach((m,i)=>xm[m.replace('/','')]=i);
  const freq={},X=[],TT=[],LL=[],SS=[],PP=[];
  ymSeq.forEach((m,i)=>{
    freq[m]=(freq[m]??0)+1;
    X.push(xm[m]+freq[m]*0.01);
    TT.push(T[i]); LL.push(L[i]); SS.push(S[i]); PP.push(P[i]);
  });

  const maxI=TT.indexOf(Math.max(...TT)),minI=TT.indexOf(Math.min(...TT));

  /* 背景條 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save();
    for(let i=0;i<26;i++){
      ctx.fillStyle=i%2? 'rgba(0,0,0,.05)':'transparent';
      ctx.fillRect(left+i*w,top,w,bottom-top);
    }
    ctx.restore();
  }};

  /* ---------- dataset helpers ---------- */
  const step=(d,col)=>({
    data:d,borderColor:col,borderWidth:2,stepped:true,
    pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,fill:false
  });
  const lastPt=(d,col,shift)=>({
    data:d.map((v,i)=>i===d.length-1?v:null),
    showLine:false,pointRadius:5,pointBackgroundColor:col,
    datalabels:{anchor:'start',align:'right',offset:4+shift}
  });

  /* ---------- 建圖 ---------- */
  chart=new Chart(canvas,{
    type:'line',
    data:{labels:X,datasets:[
      step(TT,'#fbc02d'), step(LL,'#d32f2f'), step(SS,'#2e7d32'), step(PP,'#212121'),
      lastPt(TT,'#fbc02d',10), lastPt(LL,'#d32f2f',12), lastPt(SS,'#2e7d32',12), lastPt(PP,'#212121',12),
      {data:TT.map((v,i)=>i===maxI?v:null),showLine:false,pointRadius:6,
       pointBackgroundColor:'#d32f2f',
       datalabels:{anchor:'end',align:'top',offset:8}},
      {data:TT.map((v,i)=>i===minI?v:null),showLine:false,pointRadius:6,
       pointBackgroundColor:'#2e7d32',
       datalabels:{anchor:'end',align:'bottom',offset:8}}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{
          color:'#333',font:{size:10},clip:false,
          formatter:v=>v?.toLocaleString('zh-TW')||'',
          display:(ctx)=>ctx.dataset.showLine===false
        }
      },
      scales:{
        x:{
          type:'linear',min:0,max:25.9,grid:{display:false},
          ticks:{
            stepSize:1,
            callback:v=>{
              const center=v-0.5;
              if(Math.abs(center-Math.round(center))<0.01){
                const i=Math.round(center);
                return months[i] ?? '';
              }
              return '';
            }
          }
        },
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,ChartDataLabels]
  });
}

/* ========= 小工具 ========= */
const fmt   =v=>v.toLocaleString('zh-TW');
const fmtTs =s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
