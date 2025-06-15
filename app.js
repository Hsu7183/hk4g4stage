/* ===== 參數 ===== */
const MULT=200, FEE=45, TAX=0.00004, SLIP=1.5;
const ENTRY=['新買','新賣'],
      EXIT_L=['平賣','強制平倉'],
      EXIT_S=['平買','強制平倉'];

/* ===== READY ===== */
const btnClip=document.getElementById('btn-clip');
const fileInput=document.getElementById('fileInput');
const equityChart=document.getElementById('equityChart');
const tbl=document.getElementById('tbl');

document.addEventListener('DOMContentLoaded',()=>{
  btnClip.addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert(err.message);}
  });

  fileInput.addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;

    const read=(enc)=>new Promise((ok,no)=>{
      const r=new FileReader();
      r.onload=()=>ok(r.result); r.onerror=no;
      enc ? r.readAsText(f,enc) : r.readAsText(f);
    });

    (async()=>{
      try{analyse(await read('big5'));}catch{analyse(await read());}
      flash(e.target.parentElement);
    })();
  });
});

/* ===== 主流程 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/); if(!rows.length) return alert('空檔案');

  const q=[],tr=[],monthSeq=[],Tot=[],Lon=[],Sho=[],Sli=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/); if(!act) return;
    const price=+parseFloat(pStr), ts=tsRaw.slice(0,12);

    if(ENTRY.includes(act)){
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});
      return;
    }

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1) return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2, tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax, gainSlip=gain-SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({
      inTs:pos.tsIn, inPrice:pos.pIn, inType:pos.typeIn,
      outTs:ts,      outPrice:price,  outType:act,
      pts, fee, tax, gain, cum, gainSlip, cumSlip
    });

    Tot.push(cum); Lon.push(cumL); Sho.push(cumS); Sli.push(cumSlip);
    monthSeq.push(ts.slice(0,6));
  });

  if(!tr.length) return alert('沒有成功配對的交易！');

  renderTable(tr);
  drawChart(monthSeq,Tot,Lon,Sho,Sli);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=tbl.querySelector('tbody');
  tb.innerHTML='';
  list.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${fmtTs(t.inTs)}</td><td>${t.inPrice}</td><td>${t.inType}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.outTs)}</td><td>${t.outPrice}</td><td>${t.outType}</td>
          <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
          <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
          <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>
    `);
  });
  tbl.hidden=false;
}

/* ===== 畫圖 ===== */
let chart;
function drawChart(monthSeq,Tot,Lon,Sho,Sli){
  if(chart) chart.destroy();

  /* ------ 計算 26 個等寬月份 ------ */
  const ymToDate=ym=>new Date(+ym.slice(0,4),+ym.slice(4,6)-1);
  const addM  =(d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const fmtYM =d=>`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const first=monthSeq[0], lastYM=monthSeq[monthSeq.length-1];
  const start=addM(ymToDate(first),-1);             // 前推 1 月
  const months=[]; for(let d=start; months.length<26; d=addM(d,1)) months.push(fmtYM(d));

  /* x 軸位置（月序 + 月內序 0.01, 0.02 …） */
  const monthIndex={}; months.forEach((m,i)=>monthIndex[m.replace('/','')]=i);
  const occur={}; const X=[],T=[],L=[],S=[],P=[];
  monthSeq.forEach((m,i)=>{
    occur[m]=(occur[m]||0)+1;
    X.push(monthIndex[m]+occur[m]*0.01);
    T.push(Tot[i]); L.push(Lon[i]); S.push(Sho[i]); P.push(Sli[i]);
  });

  const maxI=T.indexOf(Math.max(...T)), minI=T.indexOf(Math.min(...T));

  /* 背景條 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c,cell=(right-left)/26;
    ctx.save();
    for(let i=0;i<26;i+=2){
      ctx.fillStyle='rgba(0,0,0,.05)';
      ctx.fillRect(left+i*cell,top,cell,bottom-top);
    }
    ctx.restore();
  }};

  /* 線型預設 */
  const step=(d,c)=>({data:d,borderColor:c,borderWidth:2,stepped:true,
    pointRadius:3,pointBackgroundColor:c,pointBorderColor:c,fill:false});
  const lastPt=(d,c)=>({data:d.map((v,i)=>i===d.length-1?v:null),
    showLine:false,pointRadius:5,pointBackgroundColor:c});

  chart=new Chart(equityChart,{
    type:'line',
    data:{labels:X,datasets:[
      step(T,'#fbc02d'), step(L,'#d32f2f'), step(S,'#2e7d32'), step(P,'#212121'),
      lastPt(T,'#fbc02d'), lastPt(L,'#d32f2f'), lastPt(S,'#2e7d32'), lastPt(P,'#212121'),
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
          anchor:'start',align:'right',offset:-6,
          font:{size:10},
          formatter:v=>v?.toLocaleString('zh-TW')||''
        }
      },
      scales:{
        x:{
          type:'linear',min:0,max:25.9,
          ticks:{callback:v=>{
            const i=Math.round(v);
            return (v-i===0)?months[i]:'';
          }}
        },
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,ChartDataLabels]
  });
}

/* ===== 工具 ===== */
const fmt   =v=>v.toLocaleString('zh-TW');
const fmtTs =s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
