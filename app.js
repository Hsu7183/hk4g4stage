/* ===== 常數 ===== */
const MULT = 200,
      FEE  = 45,
      TAX  = 0.00004,
      SLIP = 1.5;

const ENTRY  = ['新買','新賣'],
      EXIT_L = ['平賣','強制平倉'],
      EXIT_S = ['平買','強制平倉'];

const btnClip   = document.getElementById('btn-clip');
const fileInput = document.getElementById('fileInput');
const tbl       = document.getElementById('tbl');
const cvs       = document.getElementById('equityChart');

/* ========== 載入來源 ========= */
btnClip.addEventListener('click', async e => {
  try {
    analyse(await navigator.clipboard.readText());
    flash(e.target);
  } catch (err) { alert(err.message); }
});

fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;

  const read = enc => new Promise((ok,no)=>{
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(f,enc) : r.readAsText(f);
  });

  (async () => {
    try { analyse(await read('big5')); }
    catch { analyse(await read()); }
    flash(e.target.parentElement);
  })();
});

/* ========== 分析主程式 ========= */
function analyse(raw){
  const rows = raw.trim().split(/\r?\n/);
  if(!rows.length){ alert('空檔案'); return; }

  const q  = [], tr = [];
  const YM = [], TOT=[], LON=[], SHO=[], SLI=[];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.forEach(r=>{
    const [tsRaw, priceStr, act] = r.trim().split(/\s+/);
    if(!act) return;

    const price = +priceStr;
    if(ENTRY.includes(act)){
      q.push({side: act==='新買'?'L':'S', pIn:price, tsIn:tsRaw,  typeIn:act});
      return;
    }

    const idx = q.findIndex(o=>
      (o.side==='L' && EXIT_L.includes(act)) ||
      (o.side==='S' && EXIT_S.includes(act))
    );
    if(idx===-1) return;

    const pos = q.splice(idx,1)[0];
    const pts = pos.side==='L' ? price-pos.pIn : pos.pIn-price;
    const fee = FEE*2, tax = Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax;
    const gainSlip = gain - SLIP*MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side==='L' ? cumL+=gain : cumS+=gain;

    tr.push({
      pos,
      tsOut : tsRaw,
      priceOut : price,
      actOut   : act,
      pts, fee, tax, gain, cum, gainSlip, cumSlip
    });

    YM .push(tsRaw.slice(0,6));
    TOT.push(cum);
    LON.push(cumL);
    SHO.push(cumS);
    SLI.push(cumSlip);
  });

  if(!tr.length){ alert('沒有成功配對的交易'); return; }

  renderTable(tr);
  drawChart(YM,TOT,LON,SHO,SLI);
}

/* ========== 表格 ========= */
function renderTable(list){
  const body = tbl.querySelector('tbody');
  body.innerHTML = '';
  list.forEach((t,i)=>{
    body.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
          <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.typeIn}</td>
          <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.actOut}</td>
          <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
          <td>${fmt(t.gain)}</td><td>${fmt(t.cum)}</td>
          <td>${fmt(t.gainSlip)}</td><td>${fmt(t.cumSlip)}</td></tr>
    `);
  });
  tbl.hidden = false;
}

/* ========== 繪圖 ========= */
let chart;
function drawChart(ymSeq,T,L,S,P){
  if(chart) chart.destroy();

  /* ---- 26 等寬月份 ---- */
  const ym2d = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
  const addM = (d,n)=> new Date(d.getFullYear(), d.getMonth()+n);
  const toYM = d => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

  const firstDate = ym2d(ymSeq[0]);
  const endDate   = ym2d(ymSeq.at(-1));          // ← 修正名稱，避免重複宣告

  const start = addM(firstDate,-1);
  const months=[];
  for(let d=start; months.length<26; d=addM(d,1)) months.push(toYM(d));

  const xm={}; months.forEach((m,i)=> xm[m.replace('/','')]=i);

  /* 每筆點的 x = 月序 + 0.00x  (確保同月多點可見) */
  const freq={}, X=[];
  ymSeq.forEach(m=>{
    freq[m]=(freq[m]??0)+1;
    X.push(xm[m]+freq[m]*0.001);
  });

  const maxI=T.indexOf(Math.max(...T)),
        minI=T.indexOf(Math.min(...T));

  /* 背景條 */
  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{left,right,top,bottom}}=c,
          w=(right-left)/26;
    ctx.save();
    months.forEach((_,i)=>{
      ctx.fillStyle = i%2 ? 'rgba(0,0,0,.05)' : 'transparent';
      ctx.fillRect(left+i*w,top,w,bottom-top);
    });
    ctx.restore();
  }};

  /* 月份文字 */
  const monthLabel={id:'monthLabel',afterDraw(c){
    const {ctx,chartArea:{left,right,bottom}}=c,
          w=(right-left)/26;
    ctx.save();
    ctx.fillStyle='#666';
    ctx.font='10px sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='top';
    months.forEach((m,i)=> ctx.fillText(m,left+w*(i+0.5),bottom+4));
    ctx.restore();
  }};

  const step=(d,col)=>({
    data:d,borderColor:col,borderWidth:2,stepped:true,
    pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,fill:false
  });
  const lastPt=(d,col)=>({
    data:d.map((v,i)=>i===d.length-1?v:null),
    showLine:false,pointRadius:5,pointBackgroundColor:col,
    datalabels:{anchor:'start',align:'left',offset:6}
  });

  chart=new Chart(cvs,{
    type:'line',
    data:{
      labels:X,
      datasets:[
        step(T,'#fbc02d'), step(L,'#d32f2f'),
        step(S,'#2e7d32'), step(P,'#212121'),
        lastPt(T,'#fbc02d'), lastPt(L,'#d32f2f'),
        lastPt(S,'#2e7d32'), lastPt(P,'#212121'),

        {data:T.map((v,i)=>i===maxI?v:null),
         showLine:false,pointRadius:6,pointBackgroundColor:'#d32f2f',
         datalabels:{anchor:'end',align:'top',offset:8}},
        {data:T.map((v,i)=>i===minI?v:null),
         showLine:false,pointRadius:6,pointBackgroundColor:'#2e7d32',
         datalabels:{anchor:'end',align:'bottom',offset:8}}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{
          color:'#000',font:{size:10},clip:false,
          formatter:v=>v?.toLocaleString('zh-TW')||'',
          display:(ctx)=>ctx.dataset.showLine===false
        }
      },
      scales:{
        x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,monthLabel,ChartDataLabels]
  });
}

/* ========== 小工具 ========= */
const fmt   = n => n.toLocaleString('zh-TW');
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
