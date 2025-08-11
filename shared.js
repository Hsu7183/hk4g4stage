// 統一解析器：支援第一行參數、自動抓最後欄位當動作、timestamp 取前 12 碼
const ENTRY = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉'];
const EXIT_S = ['平買','強制平倉'];
const ACTS = new Set(['新買','新賣','平買','平賣','強制平倉']);
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;

export function parseOne(raw){
  const rows = raw.split(/\r?\n/).map(s=>s.replace(/\uFEFF/g,'').trim()).filter(Boolean);
  const params = [];

  const isParamLine = line => {
    const toks = line.split(/\s+/);
    return toks.length >= 3 && toks.every(t=>/^-?\d+(\.\d+)?$/.test(t));
  };
  let i = 0;
  if (rows[0] && isParamLine(rows[0])) {
    params.push(...rows[0].split(/\s+/));
    i = 1;
  }

  const q=[], tr=[];
  for (; i<rows.length; i++){
    const parts = rows[i].split(/\s+/).filter(Boolean);
    if (parts.length < 3) continue;
    const act = parts[parts.length-1].replace(/\s/g,'');
    if (!ACTS.has(act)) continue;

    let tsRaw = parts[0].replace(/\D/g,'');
    if (tsRaw.length < 12) continue;
    tsRaw = tsRaw.slice(0,12);

    const price = parseFloat(parts[1]);
    if (!Number.isFinite(price)) continue;

    if (ENTRY.includes(act)){
      q.push({ side: act==='新買'?'L':'S', pIn: price, tsIn: tsRaw });
      continue;
    }
    const qi = q.findIndex(o =>
      (o.side==='L' && EXIT_L.includes(act)) ||
      (o.side==='S' && EXIT_S.includes(act))
    );
    if (qi===-1) continue;
    const pos = q.splice(qi,1)[0];

    const pts  = pos.side==='L' ? price-pos.pIn : pos.pIn-price;
    const fee  = FEE*2, tax=Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax;
    const gainSlip = gain - SLIP*MULT;

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });
  }
  return { trades: tr, params };
}

export function runKPI(trades){
  const sum = a => a.reduce((x,y)=>x+y,0);
  const all = trades;
  const long = trades.filter(t=>t.pos.side==='L');
  const short= trades.filter(t=>t.pos.side==='S');
  const toSum = l => ({ sumGain: sum(l.map(t=>t.gain)) });
  return { all: toSum(all), long: toSum(long), short: toSum(short) };
}

export function fmtTs(s){ return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`; }

// 畫左上收益曲線（依單檔算法）
export function drawCurve(cvs, trades){
  const tsArr = [], T=[], L=[], S=[], P=[];
  let cum=0,cumL=0,cumS=0,cumP=0;
  trades.forEach(t=>{
    cum += t.gain; cumP += t.gainSlip;
    if (t.pos.side==='L') cumL += t.gain; else cumS += t.gain;
    tsArr.push(t.tsOut); T.push(cum); L.push(cumL); S.push(cumS); P.push(cumP);
  });

  const ym2Date = ym => new Date(+ym.slice(0, 4), +ym.slice(4, 6) - 1);
  const addM    = (d, n) => new Date(d.getFullYear(), d.getMonth() + n);
  const start   = addM(ym2Date(tsArr[0].slice(0, 6)), -1);
  const months  = [];
  for (let d = start; months.length < 26; d = addM(d, 1))
    months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  const mIdx = {}; months.forEach((m, i) => mIdx[m.replace('/', '')] = i);

  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const X = tsArr.map(ts => {
    const y  = +ts.slice(0, 4), m = +ts.slice(4, 6), d = +ts.slice(6, 8),
          hh = +ts.slice(8,10),  mm= +ts.slice(10,12);
    return mIdx[ts.slice(0, 6)] + (d - 1 + (hh + mm / 60) / 24) / daysInMonth(y, m);
  });

  const maxI = T.indexOf(Math.max(...T));
  const minI = T.indexOf(Math.min(...T));

  const stripe={id:'stripe',beforeDraw(c){const{ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
    ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
  const mmLabel={id:'mmLabel',afterDraw(c){const{ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
    months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

  const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
    pointRadius:4,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1});
  const mkLast=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    datalabels:{display:true,anchor:'center',align:'right',offset:8,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});
  const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',offset:8,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});

  return new Chart(cvs, {
    type:'line',
    data:{ labels:X, datasets:[
      mkLine(T,'#fbc02d'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121'),
      mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'), mkLast(S,'#2e7d32'), mkLast(P,'#212121'),
      mkMark(T,maxI,'#d32f2f'), mkMark(T,minI,'#2e7d32')
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:60}},
      plugins:{ legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false} },
      scales:{ x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
               y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}} }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}
