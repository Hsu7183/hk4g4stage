/* ================================================================
   基本參數
   ================================================================ */
const CONTRACT_MULT   = 200;       // 1 點 = 200 元
const FEE_PER_SIDE    = 90;        // 手續費 (單邊) *可自訂
const INIT_CAPITAL    = 1_000_000; // 起始資金 (for TWR/投入率)

const ENTRY  = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉'];
const EXIT_S = ['平買','強制平倉'];

/* ================================================================
   UI：剪貼簿 & 檔案
   ================================================================ */
async function readClipboard(){
  const txt = await navigator.clipboard.readText();
  analyse(txt);
}
document.querySelector('button').onclick = readClipboard;
document.getElementById('file').onchange = e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>analyse(new TextDecoder('big5').decode(r.result));
  r.readAsArrayBuffer(f);
};

/* ================================================================
   主流程：解析→配對→統計
   ================================================================ */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/);
  const q=[], trades=[], dailyEquity={}, datesSet=new Set();

  rows.forEach(r=>{
    const [ts,pStr,act] = r.trim().split(/\s+/);
    if(!act) return;
    const price=+parseFloat(pStr);
    const date = ts.slice(0,8);
    datesSet.add(date);

    if(ENTRY.includes(act)){          // 建倉
      q.push({side: act==='新買'?'L':'S',pIn:price,tsIn:ts});
      return;
    }

    const idx = q.findIndex(o=>
      (o.side==='L'&&EXIT_L.includes(act)) ||
      (o.side==='S'&&EXIT_S.includes(act))
    );
    if(idx===-1) return;              // 找不到對單
    const pos = q.splice(idx,1)[0];
    const pts = pos.side==='L'? price-pos.pIn : pos.pIn-price;
    const pnl = pts*CONTRACT_MULT - FEE_PER_SIDE*2; // 兩邊手續費
    const holdMin = (toSec(ts)-toSec(pos.tsIn))/60; // 持倉分鐘 = bar 數
    trades.push({...pos,tsOut:ts,pts,pnl,holdBar:holdMin});
    dailyEquity[date]=(dailyEquity[date]??0)+pnl;
  });

  if(!trades.length){ alert('沒有配對成功的交易'); return; }

  /* ======== 累積曲線 for MFE/MDD ======== */
  const cumu=[]; let acc=0;
  Object.keys(dailyEquity).sort().forEach(d=>{
    acc+=dailyEquity[d]; cumu.push(acc);
  });
  const maxEqui=Math.max(...cumu), minEqui=Math.min(...cumu);

  /* ======== 基本計算 ======== */
  const ttl=trades.length;
  const win=trades.filter(t=>t.pnl>0);
  const loss=trades.filter(t=>t.pnl<0);
  const gp = sum(win.map(t=>t.pnl));
  const gl = sum(loss.map(t=>t.pnl));
  const net= gp+gl;
  const pf = Math.abs(gl)?(gp/Math.abs(gl)).toFixed(2):'∞';
  const avg = net/ttl|0, avgW=gp/win.length|0, avgL=gl/loss.length|0;
  const rr  = avgW/Math.abs(avgL) || 0;

  const maxW = Math.max(...trades.map(t=>t.pnl));
  const maxL = Math.min(...trades.map(t=>t.pnl));

  /* ======== 持倉 K 相關 ======== */
  const avgHoldAll   = avgArr(trades.map(t=>t.holdBar));
  const avgHoldWin   = avgArr(win   .map(t=>t.holdBar));
  const avgHoldLoss  = avgArr(loss  .map(t=>t.holdBar));

  /* ======== 交易成本、投入 ======== */
  const feeTotal = ttl*FEE_PER_SIDE*2;
  let openLots=0, maxCapital=0;
  trades.forEach(t=>{
    // 進場時資金佔用 ≈ 成交價*乘數 (單口)
    maxCapital=Math.max(maxCapital, t.pIn*CONTRACT_MULT*++openLots);
    --openLots;
  });
  const maxInvestReturn = net/maxCapital;

  /* ======== TWR (時間加權) ======== */
  let twrEquity=INIT_CAPITAL;
  Object.keys(dailyEquity).sort().forEach(d=>{
    twrEquity += dailyEquity[d];
  });
  const twr = (twrEquity/INIT_CAPITAL-1);

  /* ======== 日期統計 ======== */
  const tradeDays = datesSet.size;
  const firstDate = Math.min(...[...datesSet]);
  const lastDate  = Math.max(...[...datesSet]);
  const backtestDays =
    (Date.parse(toDate(lastDate)) - Date.parse(toDate(firstDate)))
    /86400000 +1;
  const tradeRatio = (tradeDays/backtestDays*100).toFixed(2)+'%';

  /* ======== 輸出 ======== */
  document.getElementById('stats').textContent = `
淨利                : ${fmt(net)}
毛利 / 毛損         : ${fmt(gp)} / ${fmt(gl)}
獲利因子            : ${pf}
總交易成本          : ${fmt(feeTotal)}
最大投入金額        : ${fmt(maxCapital)}
總交易筆數          : ${ttl}
獲利 / 虧損筆數     : ${win.length} / ${loss.length}
勝率                : ${(win.length/ttl*100).toFixed(2)}%
平均交易            : ${fmt(avg)}
平均獲利 / 虧損交易 : ${fmt(avgW)} / ${fmt(avgL)}
平均盈虧比          : ${rr.toFixed(2)}
最大獲利 / 虧損交易 : ${fmt(maxW)} / ${fmt(maxL)}
最大區間獲利 / 虧損 : ${fmt(maxEqui)} / ${fmt(minEqui)}
------------------ 持倉時間 (K) ------------------
平均持倉           : ${avgHoldAll}
獲利持倉           : ${avgHoldWin}
虧損持倉           : ${avgHoldLoss}
回測K線總數        : ${backtestDays* (24*60)}  (若1分K且全天盤可再細分)
------------------ 報酬 --------------------------
時間加權報酬(TWR)  : ${(twr*100).toFixed(2)}%
最大投入報酬率      : ${(maxInvestReturn*100).toFixed(2)}%
實際交易天數        : ${tradeDays}
交易天數佔比        : ${tradeRatio}
`;

  /* ======== 填表 ======== */
  const tb=document.querySelector('#tbl tbody'); tb.innerHTML='';
  trades.forEach(t=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${t.tsOut}</td><td>${t.side==='L'?'多':'空'}</td>
    <td>${t.pts}</td><td>${fmt(t.pnl)}</td><td>${t.holdBar}</td>`;
    tb.appendChild(tr);
  });
  document.getElementById('tbl').hidden=false;
}

/* ================================================================
   小工具
   ================================================================ */
const sum=a=>a.reduce((x,y)=>x+y,0);
const avgArr=a=>a.length?(sum(a)/a.length).toFixed(1):0;
const fmt=n=>(+n).toLocaleString('zh-TW');
const toSec=s=>Date.parse(
  `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`
)/1000;
const toDate=s=>`${s.slice(0,4)}-${s.slice(4,2)}-${s.slice(6,2)}`;
