// app-multi.js
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉'];
const EXIT_S = ['平買','強制平倉'];

const cvs = document.querySelector('#curve');
const pick = document.getElementById('pickFiles');
const btnClear = document.getElementById('btnClear');
const tbodyTop = document.getElementById('topTradesBody');
const sumBody = document.getElementById('resultBody');

let parsedList = [];

pick.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if(!files.length) return;

  parsedList = [];
  for(const f of files){
    const txt = await f.text();
    parsedList.push(analyseOne(txt, f.name));
  }
  renderSummary(parsedList);
  showTop(parsedList[0]);
});

btnClear.addEventListener('click', ()=>{
  parsedList = [];
  tbodyTop.innerHTML = `<tr><td colspan="14">尚未載入</td></tr>`;
  sumBody.innerHTML = '';
  drawCurve(cvs, [], [], [], [], []);
});

function analyseOne(raw, name=''){
  let rows = raw.trim().split(/\r?\n/);
  if(!rows.length) return emptyOne(name);

  // 第一行若是參數就去除
  if(/(\d{2,}\.\d{6}\s+){5,}/.test(rows[0])) rows.shift();

  const q=[], tr=[], tsArr=[], tot=[], lon=[], sho=[], sli=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  for(const line of rows){
    const [tsRaw0, pStr0, act] = line.trim().split(/\s+/);
    if(!act) continue;

    const tsRaw = String(tsRaw0).split('.')[0];
    const price = Math.round(+pStr0);

    if(ENTRY.includes(act)){
      q.push({ side: act==='新買'?'L':'S', pIn: price, tsIn: tsRaw });
      continue;
    }
    const qi = q.findIndex(o =>
      (o.side==='L' && EXIT_L.includes(act)) ||
      (o.side==='S' && EXIT_S.includes(act))
    );
    if(qi===-1) continue;

    const pos = q.splice(qi,1)[0];
    const pts = pos.side==='L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE*2, tax = Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax, gainSlip = gain - SLIP*MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side==='L' ? (cumL+=gain) : (cumS+=gain);

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });

    tsArr.push(tsRaw); tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }

  return { name: shortName(name), trades: tr, tsArr, tot, lon, sho, sli };
}

function emptyOne(name){ return { name: shortName(name), trades: [], tsArr:[], tot:[], lon:[], sho:[], sli:[] }; }
function shortName(n=''){ return String(n).replace(/\.[^/.]+$/,''); }

function showTop(d){
  tbodyTop.innerHTML = '';
  if(!d || !Array.isArray(d.trades) || d.trades.length===0){
    tbodyTop.innerHTML = `<tr><td colspan="14">尚未載入</td></tr>`;
    drawCurve(cvs, [], [], [], [], []);
    return;
  }

  d.trades.forEach((t,i)=>{
    tbodyTop.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td>
        <td>${t.pos.pIn.toLocaleString('zh-TW')}</td>
        <td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>${fmtTs(t.tsOut)}</td>
        <td>${t.priceOut.toLocaleString('zh-TW')}</td>
        <td>${t.pos.side==='L'?'平賣':'平買'}</td>
        <td>${t.pts}</td>
        <td>${(FEE*2).toLocaleString('zh-TW')}</td>
        <td>${Math.round(t.priceOut*MULT*TAX).toLocaleString('zh-TW')}</td>
        <td>${t.gain.toLocaleString('zh-TW')}</td>
        <td>${sumUpTo(d.trades,i,'gain').toLocaleString('zh-TW')}</td>
        <td>${t.gainSlip.toLocaleString('zh-TW')}</td>
        <td>${sumUpTo(d.trades,i,'gainSlip').toLocaleString('zh-TW')}</td>
      </tr>
    `);
  });

  // 畫第一列曲線（有資料才畫）
  if(d.tsArr.length && d.tot.length){
    drawCurve(cvs, d.tsArr, d.tot, d.lon, d.sho, d.sli);
  }else{
    drawCurve(cvs, [], [], [], [], []);
  }
}

function renderSummary(list){
  sumBody.innerHTML = '';
  list.forEach(item=>{
    sumBody.insertAdjacentHTML('beforeend', `
      <tr>
        <td style="text-align:left">${item.name}</td>
        <td>${item.trades.length}</td>
        <td>${(item.tot?.slice(-1)[0] ?? 0).toLocaleString('zh-TW')}</td>
      </tr>
    `);
  });

  // 點擊彙總列 → 切換成該檔為第一列視圖
  Array.from(sumBody.querySelectorAll('tr')).forEach((tr,i)=>{
    tr.style.cursor='pointer';
    tr.addEventListener('click',()=>showTop(parsedList[i]));
  });
}

/* 工具 */
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function sumUpTo(arr, idx, key){return arr.slice(0, idx + 1).reduce((a,b)=>a + b[key], 0);}
