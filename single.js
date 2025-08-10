/* ===== 常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買','新賣'], EXIT_L = ['平賣','強制平倉'], EXIT_S = ['平買','強制平倉'];

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');
const errBox = document.getElementById('errBox');

let chart;

/* ===== 事件綁定（確保元素存在） ===== */
document.getElementById('btn-clip').addEventListener('click', async (e) => {
  try {
    const txt = await navigator.clipboard.readText();
    if (!txt.trim()) return showErr('剪貼簿是空的。');
    analyse(txt);
    flash(e.target);
  } catch (err) { showErr('讀取剪貼簿失敗：' + err.message); }
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const text = await readFileWithFallback(f);
    if (!text.trim()) return showErr('檔案內容為空。');
    analyse(text);
    flash(document.getElementById('pick'));
  } catch (err) { showErr('讀檔失敗：' + err.message); }
});

/* ===== 檔案讀取（big5 → utf-8 回退） ===== */
function readFileWithFallback(file) {
  const read = (enc) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  return (async () => { try { return await read('big5'); } catch { return await read(); } })();
}

/* ===== 主分析 ===== */
function analyse(raw) {
  hideErr();
  const rows = raw.trim().split(/\r?\n/).filter(Boolean);
  if (!rows.length) return showErr('空檔案。');

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (const r of rows) {
    const [tsRaw, pStr, act] = r.trim().split(/\s+/);
    if (!act) continue;
    const price = +pStr;
    if (!Number.isFinite(price)) continue;

    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw });
      continue;
    }
    const qi = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (qi === -1) continue;

    const pos = q.splice(qi, 1)[0];
    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2;
    const tax  = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side === 'L' ? cumL += gain : cumS += gain;

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip, fee, tax });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }

  if (!tr.length) return showErr('沒有成功配對的交易。');

  renderTable(tr);
  renderStats(tr, { tot, lon, sho, sli });
  drawChart(tsArr, tot, lon, sho, sli);
}

/* ===== KPI ===== */
function renderStats(tr, seq) {
  const sum = a => a.reduce((x,y)=>x+y,0);
  const pct = x => (x*100).toFixed(1) + '%';
  const byDay = list => {
    const m = {}; list.forEach(t => { const d = t.tsOut.slice(0,8); m[d] = (m[d] || 0) + t.gain; });
    return Object.values(m);
  };
  const runUp = s => { if(!s.length) return 0; let m=s[0], up=0; for(const v of s){ m=Math.min(m,v); up=Math.max(up,v-m);} return up; };
  const drawDn= s => { if(!s.length) return 0; let p=s[0], dn=0; for(const v of s){ p=Math.max(p,v); dn=Math.min(dn,v-p);} return dn; };

  const longs  = tr.filter(t => t.pos.side === 'L');
  const shorts = tr.filter(t => t.pos.side === 'S');

  const make = (list, cumSeq) => {
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
      '單日最大獲利':Math.max(...byDay(list)),
      '單日最大虧損':Math.min(...byDay(list)),
      '區間最大獲利':runUp(cumSeq),
      '區間最大回撤':drawDn(cumSeq)
    };
  };

  const stats = { '全部':make(tr,seq.tot), '多單':make(longs,seq.lon), '空單':make(shorts,seq.sho) };

  // HTML
  const statBox = document.getElementById('stats');
  let html = '';
  for (const [title, obj] of Object.entries(stats)) {
    html += `<section class="box" style="margin:.8rem 0">
               <h3 style="margin:.2rem 0 .5rem">${title}</h3>
               <div style="display:flex;flex-wrap:wrap;gap:.6rem 1rem">`;
    for (const [k, v] of Object.entries(obj)) {
      html += `<div class="stat-item"><span style="color:#555">${k}</span>：<b>${fmt(v)}</b></div>`;
    }
    html += `</div></section>`;
  }
  statBox.innerHTML = html;
}

/* ===== 表格（雙列一筆） ===== */
function renderTable(list) {
  const body = tbl.querySelector('tbody'); body.innerHTML = '';
  let cumGain=0, cumSlip=0;
  list.forEach((t, i) => {
    cumGain += t.gain; cumSlip += t.gainSlip;
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i + 1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side === 'L' ? '新買' : '新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.pos.side === 'L' ? '平賣' : '平買'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(t.fee)}</td><td>${fmt(t.tax)}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(cumGain)}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(cumSlip)}</td>
      </tr>
    `);
  });
  tbl.hidden = false;
}

/* ===== 圖表（與你現在批量版一致的樣式：總=黃、多=綠、空=紅、滑價=黑） ===== */
function drawChart(tsArr, T, L, S, P) {
  try{
    if (chart) chart.destroy();
    if (!tsArr?.length) return;

    const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
    const addM = (d,n)=> new Date(d.getFullYear(), d.getMonth()+n);
    const start = addM(ym2Date(tsArr[0].slice(0,6)), -1);
    const months=[]; for(let d=start; months.length<26; d=addM(d,1)) months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
    const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);
    const daysInMonth=(y,m)=> new Date(y,m,0).getDate();
    const X = tsArr.map(ts=>{
      const y=+ts.slice(0,4), m=+ts.slice(4,6), d=+ts.slice(6,8), hh=+ts.slice(8,10), mm=+ts.slice(10,12);
      return mIdx[ts.slice(0,6)] + (d-1 + (hh+mm/60)/24) / daysInMonth(y,m);
    });

    const stripes = {id:'stripes', beforeDraw(c){const {ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
      ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.06)':'transparent';ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
    const lastLabels = {id:'lastLabels', afterDatasetsDraw(c){
      const {ctx}=c, ds=c.data.datasets; ctx.save();
      ctx.font='12px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.fillStyle='#111';
      for(let k=0;k<ds.length;k++){ const m=c.getDatasetMeta(k); const p=m?.data?.[m.data.length-1]; if(!p) continue;
        const val=ds[k].data[ds[k].data.length-1]; if(val==null) continue;
        ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(Number(val).toLocaleString('zh-TW'), p.x+6, p.y); }
      ctx.restore();
    }};

    const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,pointRadius:3,pointHoverRadius:4});
    chart = new Chart(cvs, {
      type:'line',
      data:{ labels:X, datasets:[
        mkLine(T,'#f6b300'), // 總（黃）
        mkLine(L,'#2e7d32'), // 多（綠）
        mkLine(S,'#d32f2f'), // 空（紅）
        mkLine(P,'#000000')  // 滑價（黑）
      ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        layout:{padding:{bottom:42,right:60}},
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}} },
        scales:{ x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{callback:(v,i)=>months[i]??''}},
                 y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}} }
      },
      plugins:[stripes,lastLabels]
    });
  }catch(err){ showErr('畫圖失敗：' + err.message); }
}

/* ===== 工具 ===== */
function fmt(n){return (typeof n==='number' && isFinite(n)) ? n.toLocaleString('zh-TW',{maximumFractionDigits:0}) : (n??'—');}
function fmtTs(s){return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;}
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
function showErr(msg){errBox.textContent=msg; errBox.style.display='block';}
function hideErr(){errBox.style.display='none'; errBox.textContent='';}
