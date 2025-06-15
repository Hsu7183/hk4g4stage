/* ===== 參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],
      EXIT_L=['平賣','強制平倉'],
      EXIT_S=['平買','強制平倉'];

const cvs=document.getElementById('equityChart');
const tbl=document.getElementById('tbl');

/* ---------- I/O ---------- */
document.getElementById('btn-clip').onclick=async e=>{
  try{analyse(await navigator.clipboard.readText());flash(e.target);}catch(err){alert(err.message);}
};
document.getElementById('fileInput').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const read=enc=>new Promise((ok,no)=>{const r=new FileReader();
    r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);
    enc?r.readAsText(f,enc):r.readAsText(f);});
  (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());}
    flash(e.target.parentElement);})();
};

/* ---------- 主流程 ---------- */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);
  if(!rows.length){alert('空檔案');return;}

  const q=[],tr=[],tsArr=[],tot=[],lon=[],sho=[],sli=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/);if(!act)return;
    const price=+pStr;                                  // 時間戳固定 14 位 (yyyymmddHHMMSS)

    if(ENTRY.includes(act)){                            // 建倉
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});
      return;
    }
    const idx=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1)return;
    const pos=q.splice(idx,1)[0];                       // 撿出配對

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;

    cum+=gain;cumSlip+=gainSlip;pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({pos,tsOut:tsRaw,priceOut:price,actOut:act,
             pts,fee,tax,gain,cum,gainSlip,cumSlip});
    tsArr.push(tsRaw);                                  // 時間同步 push
    tot.push(cum);lon.push(cumL);sho.push(cumS);sli.push(cumSlip);
  });
  if(!tr.length){alert('沒有成功配對的交易');return;}

  renderTable(tr);
  drawChart(tsArr,tot,lon,sho,sli);
}

/* ---------- 表格 ---------- */
function renderTable(list){
  const body=tbl.querySelector('tbody');body.innerHTML='';
  list.forEach((t,i)=>{
    body.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
          <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
          <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
          <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>`);
  });
  tbl.hidden=false;
}

/* ---------- 畫圖 ---------- */
let chart;
function drawChart(tsArr,T,L,S,P){
  if(chart)chart.destroy();

  /* A. 月 Grid 與 index */
  const ym2Date=y=>new Date(+y.slice(0,4),+y.slice(4,6)-1);
  const addM=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const ymTxt=d=>`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const firstYM=tsArr[0].slice(0,6);                    // 最早年月
  const start=addM(ym2Date(firstYM),-1);
  const months=[],idx={};
  while(months.length<26){months.push(ymTxt(addM(start,months.length)));}
  months.forEach((m,i)=>idx[m.replace('/','')]=i);       // 查表

  /* B. 生成 X 座標（月份欄 + 日比例）*/
  const X=tsArr.map(ts=>{
    const y=+ts.slice(0,4),m=+ts.slice(4,6),d=+ts.slice(6,8);
    const days=new Date(y,m,0).getDate();
    const xm=idx[`${y}${String(m).padStart(2,'0')}`];
    return xm + (d-0.5)/days;                           // 置中微調
  });

  const maxI=T.indexOf(Math.max(...T));
  const minI=T.indexOf(Math.min(...T));

  /* C. Dataset */
  const mkLine=(d,col,fill)=>({
    data:d,stepped:true,
    borderColor:col,borderWidth:2,
    pointRadius:1,pointBackgroundColor:col,pointBorderColor:col,
    pointBorderWidth:.5,fill,
    datalabels:{
      display:c=>c.dataIndex===d.length-1,       // 只顯示最後一點
      anchor:'start',align:'left',offset:4,
      formatter:v=>v.toLocaleString('zh-TW'),color:'#000',clip:false,font:{size:10}
    }
  });
  const mkMark=(d,i,col)=>({                    // Max / Min
    type:'scatter',
    data:d.map((v,j)=>j===i?{x:X[j],y:v}:null),
    pointRadius:6,backgroundColor:col,borderColor:col,
    datalabels:{display:true,anchor:i===maxI?'end':'start',
      align:i===maxI?'top':'bottom',offset:8,
      formatter:v=>v?.y.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}
  });

  /* D. stripe & month label */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save();months.forEach((_,i)=>{
      ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
      ctx.fillRect(left+i*w,top,w,bottom-top);
    });ctx.restore();
  }};
  const mmLabel={id:'mmLabel',afterDraw(c){
    const {ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';
    ctx.textBaseline='top';ctx.fillStyle='#555';
    months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));
    ctx.restore();
  }};

  /* E. 計算右側留白格數 = 0.5格 + 30px */
  const extra=0.5;                                    // 半格
  const paddingRight=30;
  chart=new Chart(cvs,{
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(T,'#fbc02d',{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}),
        mkLine(L,'#d32f2f'),mkLine(S,'#2e7d32'),mkLine(P,'#212121'),
        mkMark(T,maxI,'#d32f2f'),mkMark(T,minI,'#2e7d32')
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:paddingRight}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{}                                 // 已各自控制
      },
      scales:{
        x:{type:'linear',
           min:-0.2,max:25+extra,
           grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

/* ---------- 小工具 ---------- */
const fmt = n=>n.toLocaleString('zh-TW');
function fmtTs(s){return`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;}
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
