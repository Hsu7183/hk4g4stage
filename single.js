// ===== 常數 =====
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');
let chart;

// ===== 事件 =====
document.getElementById('btn-clip').onclick = async (e) => {
  try { const t = await navigator.clipboard.readText(); runAnalyse(t); flash(e.target); }
  catch (err) { alert('讀取剪貼簿失敗：' + err.message); }
};
document.getElementById('fileInput').onchange = async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const raw = await readAsText(f);
  runAnalyse(raw);
  flash(e.target.parentElement);
};

// ===== 流程 =====
function runAnalyse(raw) {
  const parsed = parseText(raw);
  if (parsed.trades.length === 0) { alert('沒有成功配對的交易'); return; }

  renderTable(parsed.trades);
  renderStats(parsed.trades, parsed.seqs);
  drawChart(parsed.tsArr, parsed.seqs.tot, parsed.seqs.lon, parsed.seqs.sho, parsed.seqs.sli);
}

// ===== 解析 TXT =====
function parseText(raw) {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { trades: [], seqs: {}, tsArr: [] };

  // 第一行若只有數字與小數點與空格 -> 視為參數（此頁面僅忽略，不展示）
  let startIdx = 0;
  if (/^[\d.\s]+$/.test(lines[0])) startIdx = 1;

  const q = [];
  const trades = [];
  const tsArr = [], T=[], L=[], S=[], P=[];
  let cum=0, cumL=0, cumS=0, cumSlip=0;

  for (let i=startIdx;i<lines.length;i++){
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 3) continue;
    const tsRaw = normalizeTS(parts[0]); // 取到 YYYYMMDDHHMM（12碼）
    const price = +parts[1];
    const act = parts[2];

    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw });
      continue;
    }
    const qi = q.findIndex(o => (o.side==='L' && EXIT_L.includes(act)) || (o.side==='S' && EXIT_S.includes(act)));
    if (qi === -1) continue;
    const pos = q.splice(qi,1)[0];

    const pts = pos.side==='L' ? price-pos.pIn : pos.pIn-price;
    const fee = FEE*2, tax = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    if (pos.side==='L') cumL += gain; else cumS += gain;

    trades.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });
    tsArr.push(tsRaw);
    T.push(cum); L.push(cumL); S.push(cumS); P.push(cumSlip);
  }

  return { trades, tsArr, seqs: { tot:T, lon:L, sho:S, sli:P } };
}

// ===== 視覺化 =====
function renderTable(list){
  const body = tbl.querySelector('tbody'); body.innerHTML='';
  list.forEach((t,i)=>{
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.pos.side==='L'?'平賣':'平買'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(FEE*2)}</td><td>${fmt(Math.round(t.priceOut*MULT*TAX))}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(sumUpTo(list,i,'gain'))}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(sumUpTo(list,i,'gainSlip'))}</td>
      </tr>
    `);
  });
}

function renderStats(tr, seq) {
  const statBox = document.getElementById('stats');
  const sum = a=>a.reduce((x,y)=>x+y,0);
  const pct = x=>(x*100).toFixed(1)+'%';
  const byDay = list=>{
    const m={}; list.forEach(t=>{ const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain;});
    return Object.values(m);
  };
  const drawUp = s=>{ let mn=s[0],up=0; s.forEach(v=>{ mn=Math.min(mn,v); up=Math.max(up,v-mn);}); return up; };
  const drawDn = s=>{ let pk=s[0],dn=0; s.forEach(v=>{ pk=Math.max(pk,v); dn=Math.min(dn,v-pk);}); return dn; };

  const longs=tr.filter(t=>t.pos.side==='L');
  const shorts=tr.filter(t=>t.pos.side==='S');

  const make=(list, cumSeq)=> {
    const win=list.filter(t=>t.gain>0), loss=list.filter(t=>t.gain<0);
    return {
      '交易數':list.length,
      '勝率':pct(win.length/(list.length||1)),
      '敗率':pct(loss.length/(list.length||1)),
      '正點數':sum(win.map(t=>t.pts)),
      '負點數':sum(loss.map(t=>t.pts)),
      '總點數':sum(list.map(t=>t.pts)),
      '累積獲利':sum(list.map(t=>t.gain)),
      '滑價累計獲利':sum(list.map(t=>t.gainSlip)),
      '單日最大獲利':Math.max(...byDay(list),0),
      '單日最大虧損':Math.min(...byDay(list),0),
      '區間最大獲利':drawUp(cumSeq),
      '區間最大回撤':drawDn(cumSeq)
    };
  };

  const stats={'全部':make(tr,seq.tot),'多單':make(longs,seq.lon),'空單':make(shorts,seq.sho)};
  let html='';
  Object.entries(stats).forEach(([title,obj])=>{
    html+=`<section><h3>${title}</h3><div class="stat-grid">`;
    Object.entries(obj).forEach(([k,v])=>{
      html+=`<div class="stat-item"><span class="stat-key">${k}</span>：<span class="stat-val">${fmt(v)}</span></div>`;
    });
    html+='</div></section>';
  });
  statBox.innerHTML=html;
}

function drawChart(tsArr, T, L, S, P){
  if (chart) chart.destroy();
  if (tsArr.length===0){
    chart = new Chart(cvs,{type:'line',data:{labels:[],datasets:[]}}); return;
  }
  const ym2Date=ym=>new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
  const addM=(d,n)=>new Date(d.getFullYear(), d.getMonth()+n);
  const start=addM(ym2Date(tsArr[0].slice(0,6)),-1);
  const months=[]; for(let d=start; months.length<26; d=addM(d,1))
    months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
  const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);

  const daysInMonth=(y,m)=>new Date(y,m,0).getDate();
  const X = tsArr.map(ts=>{
    const y=+ts.slice(0,4), m=+ts.slice(4,6), d=+ts.slice(6,8), hh=+ts.slice(8,10), mm=+ts.slice(10,12);
    return mIdx[ts.slice(0,6)] + (d-1 + (hh+mm/60)/24)/daysInMonth(y,m);
  });

  const maxI=T.indexOf(Math.max(...T));
  const minI=T.indexOf(Math.min(...T));

  const stripe={id:'stripe',beforeDraw(c){const{ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent'; ctx.fillRect(left+i*w,top,w,bottom-top);}); ctx.restore();}};
  const mmLabel={id:'mmLabel',afterDraw(c){const{ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
    months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

  const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,pointRadius:3,pointBackgroundColor:col,pointBorderColor:col});
  const mkLast=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:5,pointBackgroundColor:col,pointBorderColor:col,
    datalabels:{display:true,anchor:'center',align:'right',offset:8,formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});
  const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:5,pointBackgroundColor:col,pointBorderColor:col,
    datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',offset:8,formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});

  chart = new Chart(cvs,{
    type:'line',
    data:{ labels:X,
      datasets:[
        mkLine(T,'#fbc02d'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121'),
        mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'), mkLast(S,'#2e7d32'), mkLast(P,'#212121'),
        mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
      ]},
    options:{ responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:60}},
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}}, datalabels:{display:false} },
      scales:{ x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}}, y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}} }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

// ===== 小工具 =====
function readAsText(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result); r.onerror=()=>rej(r.error);
    r.readAsText(file); // 預設 UTF-8；你的檔若是 Big5 也多半能讀，若有問題再補 fallback
  });
}
function normalizeTS(s){
  // 可能是 20230907124000.000000 或 20230907124000 或 202309071240
  const digits = (s.split('.')[0]||'').trim();
  return digits.length>=12 ? digits.slice(0,12) : digits.padEnd(12,'0');
}
const fmt = n => typeof n==='number'? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : n;
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function sumUpTo(arr, idx, key){return arr.slice(0, idx + 1).reduce((a,b)=>a + b[key], 0);}
function flash(el){el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),600);}
