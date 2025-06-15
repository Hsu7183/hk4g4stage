/* ===== 參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert(err.message);}
  });
  document.getElementById('fileInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>analyse(rd.result);
    rd.readAsText(f);           /* big5→utf-8 檔案瀏覽器多會自動轉成Unicode */
  });
});

/* ===== 主流程 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);if(!rows.length)return alert('空檔案');
  const q=[],tr=[];
  const x=[],tot=[],longA=[],shortA=[],slipA=[],monthTag=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;
  rows.forEach(r=>{
    const [tsRaw,pRaw,act]=r.trim().split(/\s+/);if(!act)return;
    /* tsRaw 可能含秒後多餘字，僅取前 12 碼 (YYYYMMDDhhmm) */
    const ts=tsRaw.slice(0,12);
    const price=+parseFloat(pRaw);
    const month = ts.slice(0,6);                             // 202308

    if(ENTRY.includes(act)){
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:ts,typeIn:act});
      return;
    }
    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1)return;
    const pos=q.splice(i,1)[0];

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax,gainSlip=gain-SLIP*MULT;
    cum+=gain;cumSlip+=gainSlip;
    pos.side==='L'?cumL+=gain:cumS+=gain;

    tr.push({inTs:pos.tsIn,inPrice:pos.pIn,inType:pos.typeIn,
             outTs:ts,outPrice:price,outType:act,
             pts,fee,tax,gain,cum,gainSlip,cumSlip});

    /* 資料給圖表 */
    monthTag.push(month);             // 月份標籤序列，同 x 一對一
    x.push(x.length);                 // 線性座標 0,1,2…
    tot.push(cum);longA.push(cumL);shortA.push(cumS);slipA.push(cumSlip);
  });
  if(!tr.length)return alert('沒有成功配對的交易！');
  renderTable(tr);drawChart(x,monthTag,tot,longA,shortA,slipA);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  list.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
      <td>${fmtTs(t.inTs)}</td><td>${t.inPrice}</td><td>${t.inType}</td>
      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.outTs)}</td><td>${t.outPrice}</td><td>${t.outType}</td>
      <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
      <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
      <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden=false;
}

/* ===== 畫圖 ===== */
let chart;
function drawChart(xIdx,monthTag,T,L,S,P){
  if(chart)chart.destroy();
  /* 取月份轉陣列 (yyyy/MM)，計算月起點 */
  const monthLabels=[];const monthStart=[];
  monthTag.forEach((m,i)=>{if(i===0||m!==monthTag[i-1]){
    monthLabels.push(m.slice(0,4)+'/'+m.slice(4,6));monthStart.push(i);
  }});
  /* stripe plugin : 24 個月等寬黑白相間 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom,left,right},scales:{x}}=c;
    const cell=(right-left)/monthLabels.length;
    ctx.save();
    monthLabels.forEach((_,i)=>{
      if(i%2===0){ctx.fillStyle='rgba(0,0,0,.05)';
        ctx.fillRect(left+i*cell,top,cell,bottom-top);}
    });
    ctx.restore();
  }};
  /* dataset 工具 */
  const step=(d,col)=>({data:d,borderColor:col,borderWidth:2,stepped:true,
    pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,fill:false});
  const last=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),
    showLine:false,pointRadius:5,pointBackgroundColor:col});
  const maxI=T.indexOf(Math.max(...T)),minI=T.indexOf(Math.min(...T));

  chart=new Chart(equityChart,{
    type:'line',
    data:{labels:xIdx,datasets:[
      step(T,'#fbc02d'),step(L,'#d32f2f'),step(S,'#2e7d32'),step(P,'#212121'),
      last(T,'#fbc02d'),last(L,'#d32f2f'),last(S,'#2e7d32'),last(P,'#212121'),
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
          align:'left',anchor:'end',offset:8,font:{size:10},
          formatter:v=>v?.toLocaleString('zh-TW')||''
        }
      },
      scales:{
        x:{
          type:'linear',
          ticks:{
            callback:(v,i)=>monthStart.includes(i)?monthLabels[monthStart.indexOf(i)]:'' ,
            maxRotation:0,minRotation:0
          },
          grid:{display:false}
        },
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,ChartDataLabels]
  });
}

/* ===== 工具 ===== */
const fmt=v=>v.toLocaleString('zh-TW');
const fmtTs=s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
