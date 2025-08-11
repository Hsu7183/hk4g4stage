// ===== 常數與共用 =====
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];

const cvs = document.getElementById('equityChart');
const tradeTbl = document.getElementById('tradeTbl');
const sumHead = document.getElementById('sumHead');
const sumBody = document.getElementById('sumBody');
let chart;

document.getElementById('multiInput').onchange = async (e) => {
  const files = Array.from(e.target.files||[]);
  if (!files.length) return;
  const results = [];
  for (const f of files) {
    const raw = await readAsText(f);
    const parsed = parseText(raw);
    const kpi = buildKPI(parsed.trades, parsed.seqs);
    results.push({
      name: shortName(f.name),
      params: parsed.paramsText,
      trades: parsed.trades,
      tsArr: parsed.tsArr,
      seqs: parsed.seqs,
      view: {
        n: kpi.all['交易數'],
        winr: kpi.all['勝率Num'],   // for sort
        pips: kpi.all['總點數'],
        pnl: kpi.all['累積獲利'],
        slip: kpi.all['滑價累計獲利'],
        dd: kpi.all['區間最大回撤']
      }
    });
  }
  renderSummary(results);
  // 預設以當前排序第一列顯示
  if (results.length) showDetail(results[0]);
};
document.getElementById('btn-clear').onclick = ()=>{
  sumBody.innerHTML='';
  tradeTbl.querySelector('tbody').innerHTML='<tr><td colspan="13" class="muted">尚未載入</td></tr>';
  if (chart) chart.destroy();
};

// 表頭點擊排序
sumHead.onclick = (e)=>{
  const th = e.target.closest('th'); if (!th) return;
  const key = th.dataset.k; if (!key) return;
  const rows = Array.from(sumBody.querySelectorAll('tr'));
  const asc = !(th.classList.contains('asc'));
  sumHead.querySelectorAll('th').forEach(t=>t.classList.remove('asc','desc'));
  th.classList.add(asc?'asc':'desc');

  rows.sort((a,b)=>{
    const va = a.dataset[key], vb=b.dataset[key];
    const numa = +va; const numb=+vb;
    if (!Number.isNaN(numa) && !Number.isNaN(numb))
      return asc ? (numa-numb) : (numb-numa);
    return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  sumBody.innerHTML=''; rows.forEach(r=>sumBody.appendChild(r));
  // 重新顯示第一列為圖與交易
  const first = sumBody.querySelector('tr');
  if (first) first.click();
};

// ===== 解析/計算 =====
function parseText(raw){
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  let startIdx=0, paramsText='';
  if (lines.length && /^[\d.\s]+$/.test(lines[0])) {
    // 參數列：取整數後用 / 連接
    const ints = lines[0].trim().split(/\s+/).map(x=>Math.trunc(+x));
    paramsText = ints.join(' / ');
    startIdx = 1;
  }

  const q=[], trades=[], tsArr=[], T=[],L=[],S=[],P=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  for (let i=startIdx;i<lines.length;i++){
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length<3) continue;
    const tsRaw = normalizeTS(parts[0]);
    const price = +parts[1];
    const act = parts[2];

    if (ENTRY.includes(act)){ q.push({side:act==='新買'?'L':'S', pIn:price, tsIn:tsRaw}); continue; }
    const qi = q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act)) || (o.side==='S'&&EXIT_S.includes(act)));
    if (qi===-1) continue;
    const pos = q.splice(qi,1)[0];

    const pts = pos.side==='L'? price-pos.pIn : pos.pIn-price;
    const fee = FEE*2, tax = Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax;
    const gainSlip = gain - SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip; if (pos.side==='L') cumL+=gain; else cumS+=gain;
    trades.push({pos, tsOut:tsRaw, priceOut:price, pts, gain, gainSlip});
    tsArr.push(tsRaw); T.push(cum); L.push(cumL); S.push(cumS); P.push(cumSlip);
  }
  return { paramsText, trades, tsArr, seqs:{tot:T,lon:L,sho:S,sli:P} };
}

function buildKPI(tr, seq){
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const byDay=list=>{const m={}; list.forEach(t=>{const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain;}); return Object.values(m);};
  const drawUp=s=>{let mn=s[0],up=0; s.forEach(v=>{mn=Math.min(mn,v); up=Math.max(up,v-mn);}); return up;};
  const drawDn=s=>{let pk=s[0],dn=0; s.forEach(v=>{pk=Math.max(pk,v); dn=Math.min(dn,v-pk);}); return dn;};
  const longs=tr.filter(t=>t.pos.side==='L');
  const shorts=tr.filter(t=>t.pos.side==='S');

  const make=(list,cum)=>{const win=list.filter(t=>t.gain>0), loss=list.filter(t=>t.gain<0);
    const _winr = win.length/(list.length||1);
    return {
      '交易數':list.length,
      '勝率':(_winr*100).toFixed(1)+'%',
      '勝率Num':_winr,
      '總點數':sum(list.map(t=>t.pts)),
      '累積獲利':sum(list.map(t=>t.gain)),
      '滑價累計獲利':sum(list.map(t=>t.gainSlip)),
      '單日最大獲利':Math.max(...byDay(list),0),
      '單日最大虧損':Math.min(...byDay(list),0),
      '區間最大獲利':drawUp(cum),
      '區間最大回撤':drawDn(cum)
    };};
  return { all:make(tr,seq.tot), L:make(longs,seq.lon), S:make(shorts,seq.sho) };
}

// ===== 呈現 =====
function renderSummary(items){
  sumBody.innerHTML='';
  items.forEach((it,idx)=>{
    const tr=document.createElement('tr');
    tr.dataset.name = it.name;
    tr.dataset.params = it.params;
    tr.dataset.n = it.view.n;
    tr.dataset.winr = it.view.winr;
    tr.dataset.pips = it.view.pips;
    tr.dataset.pnl = it.view.pnl;
    tr.dataset.slip = it.view.slip;
    tr.dataset.dd = it.view.dd;

    tr.innerHTML = `
      <td class="mono">${escapeHtml(it.name)}</td>
      <td class="mono">${escapeHtml(it.params||'—')}</td>
      <td class="num">${fmt(it.view.n)}</td>
      <td class="num">${(it.view.winr*100).toFixed(1)}%</td>
      <td class="num">${fmt(it.view.pips)}</td>
      <td class="num">${fmt(it.view.pnl)}</td>
      <td class="num">${fmt(it.view.slip)}</td>
      <td class="num">${fmt(it.view.dd)}</td>
    `;
    tr.onclick=()=>showDetail(it);
    if (idx%2) tr.classList.add('even');
    sumBody.appendChild(tr);
  });
}

function showDetail(it){
  // 交易表
  const body = tradeTbl.querySelector('tbody'); body.innerHTML='';
  const list = it.trades;
  list.forEach((t,i)=>{
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td>
        <td>${t.pos.side==='L'?'多':'空'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(FEE*2)}</td><td>${fmt(Math.round(t.priceOut*MULT*TAX))}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(sumUpTo(list,i,'gain'))}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(sumUpTo(list,i,'gainSlip'))}</td>
      </tr>
    `);
  });

  // KPI 區
  const kpi = buildKPI(it.trades, it.seqs);
  renderStatsBlock(kpi);

  // 圖
  drawChart(it.tsArr, it.seqs.tot, it.seqs.lon, it.seqs.sho, it.seqs.sli);
}

function renderStatsBlock(kpi){
  const statBox = document.getElementById('stats');
  const block = (obj,title)=>{
    let html=`<section><h3>${title}</h3><div class="stat-grid">`;
    Object.entries(obj).forEach(([k,v])=>{
      if (k==='勝率Num') return;
      html+=`<div class="stat-item"><span class="stat-key">${k}</span>：<span class="stat-val">${fmt(v)}</span></div>`;
    });
    html+='</div></section>';
    return html;
  };
  statBox.innerHTML = block(kpi.all,'全部') + block(kpi.L,'多單') + block(kpi.S,'空單');
}

function drawChart(tsArr, T,L,S,P){
  if (chart) chart.destroy();
  if (!tsArr.length){ chart=new Chart(cvs,{type:'line',data:{labels:[],datasets:[]}}); return; }

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
    data:{labels:X,
      datasets:[
        mkLine(T,'#fbc02d'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121'),
        mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'), mkLast(S,'#2e7d32'), mkLast(P,'#212121'),
        mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
      ]},
    options:{responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:60}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}}, datalabels:{display:false}},
      scales:{x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}}, y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

// ===== 工具 =====
function readAsText(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result); r.onerror=()=>rej(r.error);
    r.readAsText(file);
  });
}
function normalizeTS(s){
  const digits = (s.split('.')[0]||'').trim();
  return digits.length>=12 ? digits.slice(0,12) : digits.padEnd(12,'0');
}
function shortName(n){
  // 僅保留開頭時間戳與策略名的前段，方便核對
  const m = n.match(/^\d{8}[_-]?\d{6}|^\d{8}_\d{6}/);
  return m ? m[0] : n;
}
const fmt = v => typeof v==='number' ? v.toLocaleString('zh-TW',{maximumFractionDigits:2}) : v;
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function sumUpTo(arr, idx, key){return arr.slice(0, idx + 1).reduce((a,b)=>a + b[key], 0);}
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}
