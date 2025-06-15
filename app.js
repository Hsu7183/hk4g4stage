/* ===== 參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],
      EXIT_L=['平賣','強制平倉'],
      EXIT_S=['平買','強制平倉'];

const cvs=document.getElementById('equityChart');
const tbl=document.getElementById('tbl');

/* ---------- 讀取剪貼簿 / 檔案 ---------- */
document.getElementById('btn-clip').onclick=async e=>{
  try{ analyse(await navigator.clipboard.readText()); flash(e.target); }
  catch(err){ alert(err.message); }
};
document.getElementById('fileInput').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const read=enc=>new Promise((ok,no)=>{
    const r=new FileReader();
    r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);
    enc?r.readAsText(f,enc):r.readAsText(f);
  });
  (async()=>{try{analyse(await read('big5'));}catch{analyse(await read());}
    flash(e.target.parentElement);})();
};

/* ---------- 主分析 ---------- */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);
  if(!rows.length){alert('空檔案');return;}

  const q=[],tr=[];
  const dates=[],tot=[],lon=[],sho=[],sli=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/); if(!act) return;
    const price=+pStr;

    if(ENTRY.includes(act)){
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act});
      return;
    }
    const idx=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1) return;
    const pos=q.splice(idx,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2, tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax, gainSlip=gain-SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({pos,tsOut:tsRaw,priceOut:price,actOut:act,
      pts,fee,tax,gain,cum,gainSlip,cumSlip});

    dates.push(tsRaw);              // 保存原始時間戳
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  });

  if(!tr.length){alert('沒有成功配對的交易');return;}

  renderTable(tr);
  drawChart(dates,tot,lon,sho,sli);
}

/* ---------- 表格 ---------- */
function renderTable(list){
  const body=tbl.querySelector('tbody'); body.innerHTML='';
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
function drawChart(dateArr,T,L,S,P){
  if(chart) chart.destroy();

  /*  X 軸用“第 n 筆交易” 索引  */
  const X = dateArr.map((_,i)=>i);

  /* 取得月份區段（用於黑白條 & label）  */
  const monthPos=[];                // {idx 起點 , ym "2023/07"}
  for(let i=0;i<dateArr.length;i++){
    const ym=dateArr[i].slice(0,6);
    if(i===0||ym!==dateArr[i-1].slice(0,6)){
      monthPos.push({idx:i,ym:`${ym.slice(0,4)}/${ym.slice(4,6)}`});
    }
  }
  monthPos.push({idx:dateArr.length});   // 尾端方便計算寬度

  const maxI=T.indexOf(Math.max(...T));
  const minI=T.indexOf(Math.min(...T));

  /* 背景黑白條 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c,
          w=(right-left)/(X.length-1||1);
    ctx.save();
    monthPos.forEach((m,i)=>{
      const x0=left+m.idx*w;
      const x1=left+monthPos[i+1].idx*w||right;
      ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
      ctx.fillRect(x0,top,x1-x0,bottom-top);
    });
    ctx.restore();
  }};
  /* 月份文字 */
  const mmLabel={id:'mmLabel',afterDraw(c){
    const {ctx,chartArea:{left,top,bottom}}=c,
          w=(c.chartArea.right-left)/(X.length-1||1);
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
    monthPos.slice(0,-1).forEach((m,i)=>{
      const mid= (m.idx+monthPos[i+1].idx-1)/2;
      ctx.fillText(m.ym,left+mid*w,bottom+8);
    });
    ctx.restore();
  }};

  /* 線與點樣式 (實心圓) */
  const mkLine=(d,col,fill=false)=>({
    data:d,stepped:true,borderColor:col,borderWidth:2,
    pointRadius:4,pointBackgroundColor:col,pointBorderColor:col,
    pointBorderWidth:1,fill
  });
  const mkLast=(d,col)=>({
    data:d.map((v,i)=>i===d.length-1?v:null),
    showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,
    datalabels:{
      display:true,anchor:'center',align:'left',offset:6,   /* 右側顯示 */
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}
    }
  });
  const mkMark=(d,i,col)=>({
    data:d.map((v,j)=>j===i?v:null),
    showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,
    datalabels:{
      display:true,anchor:i===maxI?'end':'start',
      align:i===maxI?'top':'bottom',offset:8,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}
    }
  });

  chart=new Chart(cvs,{
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(T,'#fbc02d',{
          target:'origin',
          above:'rgba(255,138,128,.18)',
          below:'rgba(200,230,201,.18)'
        }),
        mkLine(L,'#d32f2f'),
        mkLine(S,'#2e7d32'),
        mkLine(P,'#212121'),
        mkLast(T,'#fbc02d'),mkLast(L,'#d32f2f'),
        mkLast(S,'#2e7d32'),mkLast(P,'#212121'),
        mkMark(T,maxI,'#d32f2f'),mkMark(T,minI,'#2e7d32')
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{bottom:42}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      scales:{
        x:{type:'linear',grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

/* ---------- 工具 ---------- */
const fmt=n=>n.toLocaleString('zh-TW');
function fmtTs(s){return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;}
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
