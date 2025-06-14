/* ===== 參數 ===== */
const MULT=200,FEE_SIDE=50,SLIP_PT=0.5;
const ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉'],EXIT_S=['平買','強制平倉'];

/* ===== 介面事件 ===== */
document.getElementById('btn-clip').addEventListener('click',async()=>{
  analyse(await navigator.clipboard.readText());
});
document.getElementById('fileInput').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>analyse(new TextDecoder('big5').decode(r.result));
  r.readAsArrayBuffer(f);
});

/* ===== 主分析 ===== */
function analyse(raw){
  const rows=raw.trim().split(/\r?\n/),q=[],tr=[],eq=[],dates=new Set();
  let cum=0,expo=0,maxExpo=0,barsSum=0;
  rows.forEach(r=>{
    const [ts,pS,a]=r.trim().split(/\s+/); if(!a)return;
    const p=+parseFloat(pS),d=ts.slice(0,8); dates.add(d);
    if(ENTRY.includes(a)){q.push({s:a==='新買'?'L':'S',pIn:p,tsIn:ts}); expo+=p*MULT; maxExpo=Math.max(maxExpo,expo); return;}
    const i=q.findIndex(o=>(o.s==='L'&&EXIT_L.includes(a))||(o.s==='S'&&EXIT_S.includes(a))); if(i===-1)return;
    const pos=q.splice(i,1)[0]; expo-=pos.pIn*MULT;
    const pts=pos.s==='L'?p-pos.pIn:pos.pIn-p, pnl=pts*MULT, bars=Math.max(1,(Date.parse(ts)-Date.parse(pos.tsIn))/60000);
    tr.push({...pos,tsOut:ts,side:pos.s==='L'?'多':'空',pts,pnl,bars}); cum+=pnl; eq.push(cum); barsSum+=bars;
  });
  if(!tr.length){alert('沒有成功配對的交易！');return;}

  /* --- 統計 --- */
  const win=tr.filter(t=>t.pnl>0),loss=tr.filter(t=>t.pnl<0),
        gp=sum(win.map(t=>t.pnl)),gl=sum(loss.map(t=>t.pnl)),
        cost=tr.length*(FEE_SIDE*2+SLIP_PT*MULT),
        net=gp+gl-cost,pf=Math.abs(gl)?(gp/Math.abs(gl)).toFixed(2):'∞',
        avgT=(net/tr.length).toFixed(0),avgW=win.length?(gp/win.length).toFixed(0):0,
        avgL=loss.length?(gl/loss.length).toFixed(0):0,rr=(avgW/Math.abs(avgL||1)).toFixed(2),
        stats=[['淨利',net],['毛利',gp],['毛損',gl],['獲利因子',pf],['總交易成本',cost],
               ['最大投入金額',maxExpo],['總交易次數',tr.length],['獲利交易次數',win.length],
               ['虧損交易次數',loss.length],['勝率',pct(win.length,tr.length)],
               ['平均交易',avgT],['平均獲利交易',avgW],['平均虧損交易',avgL],
               ['平均獲利虧損比',rr]];

  const grid=document.getElementById('statsGrid'); grid.innerHTML='';
  stats.forEach(([k,v])=>{const c=document.createElement('div');c.className='card';c.innerHTML=`<h3>${k}</h3><div>${fmt(v)}</div>`;grid.appendChild(c);});

  /* --- 明細表 --- */
  const tbody=document.querySelector('#tbl tbody');tbody.innerHTML='';
  tr.forEach(t=>{const r=document.createElement('tr');r.innerHTML=`<td>${t.tsIn}</td><td>${t.tsOut}</td><td>${t.side}</td><td>${t.pts}</td><td>${fmt(t.pnl)}</td><td>${t.bars}</td>`;tbody.appendChild(r);});
  document.getElementById('tbl').hidden=false;

  draw(eq);
}

/* Chart.js 折線圖 */
let chart=null;
function draw(eq){if(chart)chart.destroy();chart=new Chart(document.getElementById('equityChart'),{type:'line',data:{labels:eq.map((_,i)=>i+1),datasets:[{data:eq,borderColor:'#ff9800',fill:false}]},options:{plugins:{legend:{display:false}},responsive:true}});}

/* 工具函式 */
const sum=a=>a.reduce((x,y)=>x+y,0),fmt=n=>(+n).toLocaleString('zh-TW');
const pct=(n,d)=>d?(n/d*100).toFixed(2)+'%':'0%';
