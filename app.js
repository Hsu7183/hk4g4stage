/* ===== 全局參數 ===== */
const MULT=200, FEE=45, TAX=0.00004, SLIP=1.5;
const ENTRY=['新買','新賣'],
      EXIT_L=['平賣','強制平倉'],
      EXIT_S=['平買','強制平倉'];

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-clip').addEventListener('click',async e=>{
    try{ analyse(await navigator.clipboard.readText()); flash(e.target); }
    catch(err){ alert('剪貼簿失敗：'+err.message); }
  });

  document.getElementById('fileInput').addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const read=(enc)=>new Promise((ok,no)=>{const r=new FileReader();
        r.onload=()=>ok(r.result); r.onerror=()=>no(r.error);
        enc?r.readAsText(file,enc):r.readAsText(file);});
    (async()=>{ try{ analyse(await read('big5')); } catch{ analyse(await read()); }
       flash(e.target.parentElement); })();
  });
});

/* ===== 主要分析 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/); if(!rows.length) return alert('空檔案');

  const q=[],tr=[];
  const ts=[], total=[], longArr=[], shortArr=[], slipArr=[];
  let cum=0, cumL=0, cumS=0, cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,priceStr,act]=r.trim().split(/\s+/); if(!act) return;
    const price=+parseFloat(priceStr);

    if(ENTRY.includes(act)){ q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act}); return; }

    const idx=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1) return;
    const pos=q.splice(idx,1)[0];

    const pts = pos.side==='L' ? price-pos.pIn : pos.pIn-price;
    const fee = FEE*2,
          tax = Math.round(price*MULT*TAX),
          gain = pts*MULT - fee - tax,
          gainSlip = gain - SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    pos.side==='L' ? cumL+=gain : cumS+=gain;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:tsRaw.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});

    ts.push(tsRaw); total.push(cum); longArr.push(cumL); shortArr.push(cumS); slipArr.push(cumSlip);
  });

  if(!tr.length) return alert('沒有成功配對的交易！');

  renderTable(tr);
  drawChart(ts,total,longArr,shortArr,slipArr);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=document.querySelector('#tbl tbody'); tb.innerHTML='';
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
function drawChart(labelRaw,total,longArr,shortArr,slipArr){
  if(chart) chart.destroy();

  /* x 軸使用每筆交易日期 (YYYYMMDDhhmm) */
  const labels = labelRaw.map(ts=>`${ts.slice(0,4)}/${ts.slice(4,6)}/${ts.slice(6,8)}`);

  /* 最大最小位置 */
  const maxI = total.indexOf(Math.max(...total));
  const minI = total.indexOf(Math.min(...total));
  const last = total.length-1;

  /* 條紋交錯：從 index=1 開始畫，index=0 不畫(避免黑邊) */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom,right}}=c, x=c.scales.x;
    ctx.save();
    for(let i=1;i<labels.length;i++){
      if(i%2===0){       /* 灰條位置 */
        const x0=x.getPixelForValue(i-0.5), x1=x.getPixelForValue(i+0.5)||right;
        ctx.fillStyle='rgba(0,0,0,.05)';
        ctx.fillRect(x0,top,x1-x0,bottom-top);
      }
    }
    ctx.restore();
  }};

  const stepLine=(col)=>({borderColor:col,borderWidth:2,stepped:true,
    pointRadius:2,pointBackgroundColor:col,pointBorderColor:col,fill:false});

  const mark=(arr,idx,col,size=6)=>({data:arr.map((v,i)=>i===idx?v:null),
    showLine:false,pointRadius:size,pointBackgroundColor:col,pointBorderColor:'#fff',pointBorderWidth:1});

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'總',data:total,...stepLine('#fbc02d'),
          fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},
        {label:'多',data:longArr,...stepLine('#d32f2f')},
        {label:'空',data:shortArr,...stepLine('#2e7d32')},
        {label:'滑',data:slipArr,...stepLine('#212121')},

        mark(total,last,'#fbc02d',5),  mark(longArr,last,'#d32f2f',5),
        mark(shortArr,last,'#2e7d32',5),mark(slipArr,last,'#212121',5),
        mark(total,maxI,'#d32f2f',7),  mark(total,minI,'#2e7d32',7)
      ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      animation:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{
          color:'#000',font:{size:10},clip:false,
          display:ctx=>ctx.datasetIndex>=4,
          anchor:'end',align:'left',offset:6,
          formatter:v=>v?.toLocaleString('zh-TW')??''
        }},
      scales:{
        x:{grid:{display:false},ticks:{maxRotation:45,minRotation:45}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}},
    plugins:[stripe,window.ChartDataLabels||{}]
  });
}

/* ===== Utilities ===== */
const fmt=v=>(v===undefined||v==='')?'':v.toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
