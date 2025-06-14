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
    const f=e.target.files[0]; if(!f) return;
    const rd=enc=>new Promise((ok,no)=>{
      const fr=new FileReader();
      fr.onload=()=>ok(fr.result); fr.onerror=()=>no(fr.error);
      enc?fr.readAsText(f,enc):fr.readAsText(f);
    });
    (async()=>{
      try{analyse(await rd('big5'));}catch{analyse(await rd());}
      flash(e.target.parentElement);
    })();
  });
});

/* ===== 主分析 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/); if(!rows.length){alert('空檔案');return;}

  const q=[],tr=[];
  const ts=[],tot=[],longA=[],shortA=[],slipA=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  rows.forEach(r=>{
    const [tsRaw,pStr,act]=r.trim().split(/\s+/); if(!act) return;
    const price=+parseFloat(pStr);

    if(ENTRY.includes(act)){                  // 進場
      q.push({side:act==='新買'?'L':'S',pIn:price,tsIn:tsRaw,typeIn:act}); return;
    }

    const i=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(i===-1) return;
    const pos=q.splice(i,1)[0];              // 出場

    const pts=pos.side==='L'?price-pos.pIn:pos.pIn-price;
    const fee=FEE*2,tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax, gainSlip=gain-SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    if(pos.side==='L') cumL+=gain; else cumS+=gain;

    tr.push({in:{ts:pos.tsIn.slice(0,12),price:pos.pIn,type:pos.typeIn},
             out:{ts:tsRaw.slice(0,12),price,type:act,pts,fee,tax,gain,cum,gainSlip,cumSlip}});

    ts.push(tsRaw); tot.push(cum); longA.push(cumL); shortA.push(cumS); slipA.push(cumSlip);
  });
  if(!tr.length){alert('沒有成功配對');return;}

  renderTable(tr);  compressAndDraw(ts,tot,longA,shortA,slipA);
}

/* ===== 表格 ===== */
function renderTable(list){
  const tb=document.querySelector('#tbl tbody');tb.innerHTML='';
  list.forEach((t,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
        <td>${t.in.ts}</td><td>${t.in.price}</td><td>${t.in.type}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr>
        <td>${t.out.ts}</td><td>${t.out.price}</td><td>${t.out.type}</td>
        <td>${fmt(t.out.pts)}</td><td>${fmt(t.out.fee)}</td><td>${fmt(t.out.tax)}</td>
        <td>${fmt(t.out.gain)}</td><td>${fmt(t.out.cum)}</td>
        <td>${fmt(t.out.gainSlip)}</td><td>${fmt(t.out.cumSlip)}</td></tr>`);
  });
  document.getElementById('tbl').hidden=false;
}

/* ===== 壓縮到「每月最後一筆」並畫圖 ===== */
function compressAndDraw(ts,tot,longA,shortA,slipA){
  const monthKey=s=>s.slice(0,4)+'/'+s.slice(4,6);
  const map=new Map();
  ts.forEach((t,i)=>map.set(monthKey(t),i));           // 只保留最後一筆 index

  const idxs=[...map.values()].sort((a,b)=>a-b);
  const mLabs=idxs.map(i=>monthKey(ts[i]));
  const T = idxs.map(i=>tot[i]), L=idxs.map(i=>longA[i]),
        S = idxs.map(i=>shortA[i]), P=idxs.map(i=>slipA[i]);

  drawChart(mLabs,T,L,S,P);
}

/* ===== 畫圖 ===== */
let chart;
function drawChart(lbl,T,L,S,P){
  if(chart) chart.destroy();

  const last=lbl.length-1, maxI=T.indexOf(Math.max(...T)), minI=T.indexOf(Math.min(...T));

  /* 背景條紋 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom}}=c,x=c.scales.x;
    ctx.save();
    lbl.forEach((m,i)=>{if(i%2===0){
      const start=x.getPixelForTick(i)-x.getPixelForTick(0);
      ctx.fillStyle='rgba(0,0,0,.05)';
      ctx.fillRect(x.getPixelForTick(i),top,x.getPixelForTick(i+1||i)-x.getPixelForTick(i),bottom-top);
    }});ctx.restore();}};

  const line=(col,w)=>({borderColor:col,borderWidth:w,pointRadius:0,fill:false});
  const end=(arr,col)=>({label:'end',data:arr.map((v,i)=>i===last?v:null),
                         showLine:false,pointRadius:5,pointBackgroundColor:col});

  chart=new Chart(document.getElementById('equityChart'),{
    type:'line',
    data:{
      labels:lbl,
      datasets:[
        {label:'總',data:T,...line('#fbc02d',2),
         fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},
        {label:'多',data:L,...line('#d32f2f',1.4)},
        {label:'空',data:S,...line('#2e7d32',1.4)},
        {label:'滑',data:P,...line('#212121',1.4)},

        end(T,'#fbc02d'), end(L,'#d32f2f'), end(S,'#2e7d32'), end(P,'#212121'),

        {label:'Max',data:T.map((v,i)=>i===maxI?v:null),
         showLine:false,pointRadius:6,pointBackgroundColor:'#d32f2f'},
        {label:'Min',data:T.map((v,i)=>i===minI?v:null),
         showLine:false,pointRadius:6,pointBackgroundColor:'#2e7d32'}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}},
        datalabels:{
          color:'#000',font:{size:10},offset:-6,anchor:'end',align:'right',clamp:true,
          display:ctx=>{
            const l=ctx.dataset.label;
            return l==='end'||l==='Max'||l==='Min';
          },
          formatter:v=>fmt(v)
        }
      },
      scales:{
        x:{grid:{display:false}},
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[stripe,window.ChartDataLabels||{}]
  });
}

/* ===== 小工具 ===== */
const fmt=v=>v===''||v===undefined?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
