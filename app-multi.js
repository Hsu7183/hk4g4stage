/* ===== 常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉','平倉'];
const EXIT_S = ['平買','強制平倉','平倉'];

/* 動作別名 */
var ACTION_MAP = new Map([
  ['新買','新買'], ['買進','新買'], ['作多','新買'], ['多單','新買'], ['新多','新買'],
  ['新賣','新賣'], ['賣出','新賣'], ['作空','新賣'], ['空單','新賣'], ['新空','新賣'],
  ['平買','平買'], ['平倉空','平買'], ['平空','平買'],
  ['平賣','平賣'], ['平倉多','平賣'], ['平多','平賣'],
  ['強制平倉','強制平倉'], ['強平','強制平倉'], ['強制','強制平倉'],
  ['平倉','平倉']
]);
function normAct(s){ s=(s||'').trim(); s=s.replace(/[（(].*?[)）]/g,''); if(s.length>3) s=s.slice(0,3); return ACTION_MAP.get(s)||s; }

/* ===== DOM ===== */
var filesInput = document.getElementById('filesInput');
var btnClear   = document.getElementById('btn-clear');
var tbl        = document.getElementById('tblBatch');
var thead      = tbl.querySelector('thead');
var tbody      = tbl.querySelector('tbody');
var cvs        = document.getElementById('equityChart');
var loadStat   = document.getElementById('loadStat');
var tradesBody = document.getElementById('tradesBody');
var kpiBlocks  = document.getElementById('kpiBlocks');
var paramBar   = document.getElementById('paramBar');
var pName      = document.getElementById('pName');
var pParams    = document.getElementById('pParams');
var chart = null;

/* ===== 工具 ===== */
function formatParamsDisplay(s){ if(!s) return '—'; var t=s.replace(/[，,]/g,' ').trim().split(/\s+/).filter(Boolean); var ok=t.length>0&&t.every(function(x){return /^[-+]?\d+(?:\.\d+)?$/.test(x);}); return ok?t.map(function(x){return String(Math.trunc(parseFloat(x)));}).join(' / '):s; }
function onlyDigits(x){ return (x||'').replace(/\D/g,''); }
function parseTSFlex(a,b){ var d1=onlyDigits(a), d2=onlyDigits(b); var cand=d1; if(d1.length<=8 && d2) cand=d1+d2; if(cand.length>=14) return cand.slice(0,14); if(cand.length>=12) return cand.slice(0,12); if(cand.length>=8) return cand.slice(0,8)+'0000'; return ''; }
function parseTradeLine(line){
  if(!line) return null;
  var s = line.replace(/[，,]/g,' ').replace(/\t+/g,' ').replace(/\s+/g,' ').trim();
  var parts = s.split(' ');
  if(parts.length<3) return null;

  var ts = parseTSFlex(parts[0], parts[1]);
  var priceIdx = ts ? 2 : 1;

  var price=null, pIndex=-1;
  for(var i=priceIdx;i<parts.length;i++){
    if(/^[-+]?\d+(?:\.\d+)?$/.test(parts[i].replace(/,/g,''))){ price=parseFloat(parts[i].replace(/,/g,'')); pIndex=i; break; }
  }
  if(!ts || price===null) return null;

  var act='';
  for(var j=pIndex+1;j<parts.length;j++){
    if(!/^[-+]?\d+(?:\.\d+)?$/.test(parts[j])){ act=normAct(parts[j]); break; }
  }
  if(!act) return null;

  var valid={'新買':1,'新賣':1,'平買':1,'平賣':1,'強制平倉':1,'平倉':1};
  if(!valid[act] || !isFinite(price)) return null;
  return { ts:ts, price:price, act:act };
}
function fmt(n){ if(typeof n==='number'&&isFinite(n)) return n.toLocaleString('zh-TW',{maximumFractionDigits:0}); if(typeof n==='string') return n; return '—'; }
function fmtTs(s){ var y=s.slice(0,4), m=s.slice(4,6), d=s.slice(6,8), hh=s.slice(8,10)||'00', mm=s.slice(10,12)||'00'; return y+'/'+m+'/'+d+' '+hh+':'+mm; }
function escapeHTML(s){ s=String(s||''); return s.replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

/* ===== KPI 定義 ===== */
var KPI_ORDER = [
  ['交易數','n'], ['勝率','winRate'], ['敗率','lossRate'],
  ['正點數','posPts'], ['負點數','negPts'], ['總點數','sumPts'],
  ['累積獲利','sumGain'], ['滑價累計獲利','sumGainSlip'],
  ['單日最大獲利','maxDay'], ['單日最大虧損','minDay'],
  ['區間最大獲利','maxRunUp'], ['區間最大回撤','maxDrawdown'],
  ['Profit Factor','pf'], ['平均獲利','avgW'], ['平均虧損','avgL'],
  ['盈虧比','rr'], ['期望值(每筆)','expectancy'],
  ['最大連勝','maxWinStreak'], ['最大連敗','maxLossStreak']
];
var GROUPS = ['全部','多單','空單'];

/* ===== 狀態 ===== */
var rowsData = [];

/* ===== 檔案讀取 ===== */
function readFileWithFallback(file){
  function read(enc){
    return new Promise(function(ok,no){
      var r=new FileReader();
      r.onload=function(){ ok(r.result); };
      r.onerror=function(){ no(r.error); };
      if(enc) r.readAsText(file,enc); else r.readAsText(file);
    });
  }
  return read('big5').catch(function(){ return read(); });
}

/* ===== 事件：選檔 ===== */
filesInput.addEventListener('change', function(e){
  var files = Array.prototype.slice.call(e.target.files||[]);
  if(!files.length) return;

  buildHeader(); rowsData=[]; tbody.innerHTML=''; updateLoadStat(0,files.length,0);
  var failed=0, firstDrawn=false;

  (function loop(i){
    if(i>=files.length){ return; }
    var f = files[i];
    readFileWithFallback(f).then(function(raw){
      var needFull = !firstDrawn;
      var res = analyse(raw, { needFull:needFull, filename:f.name });
      rowsData.push({
        filename:f.name, shortName:res.shortName, paramsText:res.paramsText, fileRef:f,
        kpi:res.kpi, sortCache:buildSortCache(res.kpi),
        equitySeq: needFull? res.equitySeq : null,
        tsSeq:     needFull? res.tsSeq     : null,
        trades:    needFull? res.trades    : null
      });
      appendRow(res.shortName, res.paramsText, res.kpi);

      if(needFull && res.tsSeq && res.tsSeq.length && res.equitySeq && res.equitySeq.tot && res.equitySeq.tot.length){
        drawChart(res.tsSeq, res.equitySeq.tot, res.equitySeq.lon, res.equitySeq.sho, res.equitySeq.sli);
        renderTrades(res.trades); renderTopKPI(res.kpi); renderParamBar(res.shortName, res.paramsText);
        firstDrawn=true;
      }
    }).catch(function(err){
      console.error('解析失敗：', f.name, err); failed++;
    }).finally(function(){
      updateLoadStat(i+1, files.length, failed);
      loop(i+1);
    });
  })(0);
});

btnClear.addEventListener('click', function(){
  filesInput.value=''; thead.innerHTML=''; tbody.innerHTML=''; rowsData=[];
  updateLoadStat(0,0,0); if(chart) chart.destroy();
  tradesBody.innerHTML='<tr><td colspan="13" style="color:#777">尚未載入</td></tr>';
  kpiBlocks.innerHTML=''; paramBar.hidden=true;
});

/* ===== 解析主函式 ===== */
function analyse(raw, opts){
  opts = opts || {};
  var rows = (raw||'').replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
  if(!rows.length) throw new Error('空檔案');

  var paramLine=''; if(!parseTradeLine(rows[0])) paramLine = rows.shift();

  var q=[], tr=[], tsArr=[], tot=[], lon=[], sho=[], sli=[];
  var cum=0,cumL=0,cumS=0,cumSlip=0;

  for(var i=0;i<rows.length;i++){
    var t = parseTradeLine(rows[i]); if(!t) continue;

    if(ENTRY.indexOf(t.act)>=0){ q.push({side:t.act==='新買'?'L':'S', pIn:t.price, tsIn:t.ts}); continue; }

    var qi=-1;
    for(var j=0;j<q.length;j++){
      var o=q[j];
      if( (o.side==='L' && (EXIT_L.indexOf(t.act)>=0)) ||
          (o.side==='S' && (EXIT_S.indexOf(t.act)>=0)) ){ qi=j; break; }
    }
    if(qi===-1) continue;

    var pos=q.splice(qi,1)[0];
    var pts = pos.side==='L' ? t.price-pos.pIn : pos.pIn-t.price;
    var fee=FEE*2, tax=Math.round(t.price*MULT*TAX);
    var gain=pts*MULT - fee - tax, gainSlip=gain - SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip; if(pos.side==='L') cumL+=gain; else cumS+=gain;

    var rec={pos:pos, tsOut:t.ts, priceOut:t.price, pts:pts, gain:gain, gainSlip:gainSlip, fee:fee, tax:tax};
    tr.push(rec);

    if(opts.needFull){
      tsArr.push(t.ts); tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
    }
  }

  var kpi = buildKPI(tr, { tot:tot, lon:lon, sho:sho, sli:sli });
  var eq  = opts.needFull ? { tot:tot, lon:lon, sho:sho, sli:sli } : null;
  var pf  = parseFilename(opts.filename||'');
  var paramsText = formatParamsDisplay(paramLine || pf.paramsText);

  return { kpi:kpi, equitySeq:eq, tsSeq: opts.needFull? tsArr:null, trades: opts.needFull? tr:null,
           shortName:pf.shortName, paramsText:paramsText };
}

/* ===== KPI 同單檔 ===== */
function buildKPI(tr, seq){
  function sum(a){ return a.reduce(function(x,y){return x+y;},0); }
  function pct(x){ return (x*100).toFixed(1)+'%'; }
  function safeMax(a){ return a.length?Math.max.apply(null,a):0; }
  function safeMin(a){ return a.length?Math.min.apply(null,a):0; }
  function byDay(list){ var m={}; list.forEach(function(t){ var d=(t.tsOut||'').slice(0,8); m[d]=(m[d]||0)+(t.gain||0); }); return Object.values(m); }
  function runUp(s){ if(!s.length) return 0; var min=s[0], up=0; s.forEach(function(v){ if(v<min) min=v; if(v-min>up) up=v-min; }); return up; }
  function drawDn(s){ if(!s.length) return 0; var peak=s[0], dn=0; s.forEach(function(v){ if(v>peak) peak=v; if(v-peak<dn) dn=v-peak; }); return dn; }
  function streaks(list){ var cw=0,cl=0,mw=0,ml=0; list.forEach(function(t){ if(t.gain>0){ cw++; cl=0; if(cw>mw) mw=cw; } else if(t.gain<0){ cl++; cw=0; if(cl>ml) ml=cl; } }); return {mw:mw, ml:ml}; }
  var longs=tr.filter(function(t){return t.pos&&t.pos.side==='L';});
  var shorts=tr.filter(function(t){return t.pos&&t.pos.side==='S';});
  function make(list, seqWrap){
    if(!list.length) return {n:0,winRate:'0.0%',lossRate:'0.0%',posPts:0,negPts:0,sumPts:0,sumGain:0,sumGainSlip:0,maxDay:0,minDay:0,maxRunUp:0,maxDrawdown:0,pf:'—',avgW:0,avgL:0,rr:'—',expectancy:0,maxWinStreak:0,maxLossStreak:0};
    var sumF=sum(list.map(function(t){return t.gain;}));
    var win=list.filter(function(t){return t.gain>0;});
    var loss=list.filter(function(t){return t.gain<0;});
    var winAmt=sum(win.map(function(t){return t.gain;}));
    var lossAmt=-sum(loss.map(function(t){return t.gain;}));
    var pf=lossAmt===0?(winAmt>0?'∞':'—'):(winAmt/lossAmt).toFixed(2);
    var avgW=win.length?winAmt/win.length:0;
    var avgL=loss.length?-(lossAmt/loss.length):0;
    var rr=avgL===0?'—':Math.abs(avgW/avgL).toFixed(2);
    var exp=(win.length+loss.length)?(winAmt-lossAmt)/(win.length+loss.length):0;
    var st=streaks(list);
    return { n:list.length, winRate:pct(win.length/list.length), lossRate:pct(loss.length/list.length),
      posPts:sum(win.map(function(t){return t.pts;})), negPts:sum(loss.map(function(t){return t.pts;})), sumPts:sum(list.map(function(t){return t.pts;})),
      sumGain:sumF, sumGainSlip:sum(list.map(function(t){return t.gainSlip;})),
      maxDay:safeMax(byDay(list)), minDay:safeMin(byDay(list)),
      maxRunUp:runUp((seqWrap&&seqWrap.tot)?seqWrap.tot:[]), maxDrawdown:drawDn((seqWrap&&seqWrap.tot)?seqWrap.tot:[]),
      pf:pf, avgW:avgW, avgL:avgL, rr:rr, expectancy:exp, maxWinStreak:st.mw, maxLossStreak:st.ml };
  }
  return { '全部':make(tr,seq), '多單':make(longs,{tot:seq.lon}), '空單':make(shorts,{tot:seq.sho}) };
}

/* ===== 表頭 / 排序 ===== */
function buildHeader(){
  var cells = [
    '<th class="sortable nowrap" data-key="__filename">短檔名</th>',
    '<th class="sortable nowrap" data-key="__params">參數</th>'
  ];
  for(var gi=0; gi<GROUPS.length; gi++){
    var g=GROUPS[gi];
    for(var ki=0; ki<KPI_ORDER.length; ki++){
      var pair=KPI_ORDER[ki];
      cells.push('<th class="sortable nowrap" data-key="'+g+'.'+pair[1]+'">'+g+'-'+pair[0]+'</th>');
    }
  }
  thead.innerHTML = '<tr>'+cells.join('')+'</tr>';

  var curKey=null, curDir='asc';
  var ths = thead.querySelectorAll('th.sortable');
  Array.prototype.forEach.call(ths, function(th){
    th.addEventListener('click', function(){
      var key = th.getAttribute('data-key');
      curDir = (curKey===key ? (curDir==='asc'?'desc':'asc') : 'asc');
      curKey = key;
      Array.prototype.forEach.call(ths, function(h){ h.classList.remove('asc','desc'); });
      th.classList.add(curDir);
      sortRows(curKey, curDir);
      redrawFromTopRow();
    });
  });
}
function buildSortCache(kpi){
  var flat = {};
  for(var gi=0; gi<GROUPS.length; gi++){
    var g=GROUPS[gi], obj=kpi[g]||{};
    for(var ki=0; ki<KPI_ORDER.length; ki++){
      var key=KPI_ORDER[ki][1];
      var v=obj[key];
      if(typeof v==='number') flat[g+'.'+key]=v;
      else if(typeof v==='string'){
        if(v.slice(-1)==='%') flat[g+'.'+key]=parseFloat(v);
        else if(v==='—') flat[g+'.'+key]=-Infinity;
        else if(v==='∞') flat[g+'.'+key]=Number.POSITIVE_INFINITY;
        else flat[g+'.'+key]=parseFloat(v.replace(/,/g,''))||-Infinity;
      }else flat[g+'.'+key]=-Infinity;
    }
  }
  return flat;
}
function sortRows(key, dir){
  var factor = dir==='asc' ? 1 : -1;
  rowsData.sort(function(a,b){
    if(key==='__filename') return a.shortName.localeCompare(b.shortName)*factor;
    if(key==='__params')   return a.paramsText.localeCompare(b.paramsText)*factor;
    var av = a.sortCache && a.sortCache[key]!==undefined ? a.sortCache[key] : -Infinity;
    var bv = b.sortCache && b.sortCache[key]!==undefined ? b.sortCache[key] : -Infinity;
    var diff = (av - bv) * factor;
    return diff || a.shortName.localeCompare(b.shortName)*factor;
  });
  tbody.innerHTML='';
  for(var i=0;i<rowsData.length;i++){
    var r=rowsData[i];
    if(r.kpi) appendRow(r.shortName, r.paramsText, r.kpi);
  }
}
function redrawFromTopRow(){
  var first = null;
  for(var i=0;i<rowsData.length;i++){ if(rowsData[i].kpi){ first=rowsData[i]; break; } }
  if(!first){
    if(chart) chart.destroy();
    tradesBody.innerHTML='<tr><td colspan="13" style="color:#777">沒有可用資料</td></tr>';
    kpiBlocks.innerHTML=''; paramBar.hidden=true;
    return;
  }
  function proceed(){
    var tsSeq = first.tsSeq;
    var eq = first.equitySeq;
    drawChart(tsSeq, eq.tot, eq.lon, eq.sho, eq.sli);
    renderTrades(first.trades); renderTopKPI(first.kpi); renderParamBar(first.shortName, first.paramsText);
  }
  if(!first.tsSeq || !first.equitySeq || !first.trades){
    readFileWithFallback(first.fileRef).then(function(raw){
      var r = analyse(raw, { needFull:true, filename:first.filename });
      first.equitySeq=r.equitySeq; first.tsSeq=r.tsSeq; first.trades=r.trades; proceed();
    }).catch(function(err){ console.error('重算第一列失敗：', first.filename, err); });
  }else{
    proceed();
  }
}

/* ===== 下方表格渲染 ===== */
function appendRow(shortName, paramsText, kpi){
  var tds = [
    '<td class="nowrap" title="'+escapeHTML(shortName)+'">'+escapeHTML(shortName)+'</td>',
    '<td class="nowrap" title="'+escapeHTML(paramsText)+'">'+escapeHTML(paramsText)+'</td>'
  ];
  for(var gi=0; gi<GROUPS.length; gi++){
    var obj = kpi[GROUPS[gi]] || {};
    for(var ki=0; ki<KPI_ORDER.length; ki++){
      var key = KPI_ORDER[ki][1];
      tds.push('<td>'+fmt(obj[key])+'</td>');
    }
  }
  tbody.insertAdjacentHTML('beforeend', '<tr>'+tds.join('')+'</tr>');
}

/* ===== 上方：圖表 / 交易 / KPI / 參數列 ===== */
function drawChart(tsArr, T,L,S,P){
  if(chart) chart.destroy();
  if(!tsArr || !tsArr.length) return;

  function ym2Date(ym){ return new Date(+ym.slice(0,4), +ym.slice(4,6)-1); }
  function addM(d,n){ return new Date(d.getFullYear(), d.getMonth()+n); }
  var start = addM(ym2Date(tsArr[0].slice(0,6)),-1);
  var months=[], d=start;
  while(months.length<26){ months.push(d.getFullYear()+'/'+('0'+(d.getMonth()+1)).slice(-2)); d = addM(d,1); }
  var mIdx={}; months.forEach(function(m,i){ mIdx[m.replace('/','')] = i; });
  function dim(y,m){ return new Date(y,m,0).getDate(); }

  var X = tsArr.map(function(ts){
    var y=+ts.slice(0,4), m=+ts.slice(4,6), dd=+ts.slice(6,8), hh=+ts.slice(8,10)||0, mm=+ts.slice(10,12)||0;
    return mIdx[ts.slice(0,6)] + (dd-1+(hh+mm/60)/24)/dim(y,m);
  });

  function mk(d,c){ return { data:d, stepped:true, borderColor:c, borderWidth:2, pointRadius:3 }; }

  chart = new Chart(cvs, {
    type:'line',
    data:{ labels:X, datasets:[ mk(T,'#f6b300'), mk(L,'#2e7d32'), mk(S,'#d32f2f'), mk(P,'#000') ] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return ' '+c.parsed.y.toLocaleString('zh-TW'); } } } },
      scales:{
        x:{ type:'linear', min:0, max:25.999, grid:{display:false},
            ticks:{ callback:function(v,i){ return months[i] || ''; } } },
        y:{ ticks:{ callback:function(v){ return v.toLocaleString('zh-TW'); } } }
      }
    }
  });
}
function renderTrades(list){
  if(!list || !list.length){
    tradesBody.innerHTML='<tr><td colspan="13" style="color:#777">此檔沒有成功配對的交易</td></tr>';
    return;
  }
  var cg=0, cs=0, html=[];
  for(var i=0;i<list.length;i++){
    var t=list[i]; cg+=t.gain; cs+=t.gainSlip; var dir=t.pos.side==='L'?'多':'空';
    html.push(
      '<tr>'+
      '<td>'+(i+1)+'</td>'+
      '<td>'+fmtTs(t.pos.tsIn)+'</td><td>'+fmt(t.pos.pIn)+'</td>'+
      '<td>'+fmtTs(t.tsOut)+'</td><td>'+fmt(t.priceOut)+'</td>'+
      '<td>'+dir+'</td><td>'+fmt(t.pts)+'</td><td>'+fmt(t.fee)+'</td><td>'+fmt(t.tax)+'</td>'+
      '<td>'+fmt(t.gain)+'</td><td>'+fmt(cg)+'</td>'+
      '<td>'+fmt(t.gainSlip)+'</td><td>'+fmt(cs)+'</td>'+
      '</tr>'
    );
  }
  tradesBody.innerHTML = html.join('');
}
function renderTopKPI(kpi){
  if(!kpi){ kpiBlocks.innerHTML=''; return; }
  function line(obj){
    return KPI_ORDER.map(function(p){
      var lab=p[0], key=p[1]; var v=(obj && obj[key]!==undefined)? obj[key] : '—';
      return '<span class="kpi-item"><span class="kpi-key">'+lab+
             '</span>：<span class="kpi-val">'+fmt(v)+'</span></span>';
    }).join('');
  }
  var parts=[];
  for(var gi=0;gi<GROUPS.length;gi++){
    var g=GROUPS[gi];
    parts.push('<div class="kpi-block"><div class="kpi-title">'+g+'</div><div class="kpi-line">'+line(kpi[g])+'</div></div>');
  }
  kpiBlocks.innerHTML = parts.join('');
}
function renderParamBar(shortName, paramsText){
  pName.textContent = shortName || '—';
  pParams.textContent = paramsText || '—';
  paramBar.hidden=false;
}
function updateLoadStat(done,total,failed){
  if(!total){ loadStat.textContent=''; return; }
  loadStat.textContent = '載入：'+done+'/'+total+'，成功：'+(done-failed)+'，失敗：'+failed;
}
function parseFilename(name){
  name=name||''; var base=name.replace(/\.[^.]+$/,''); var parts=base.split('_').filter(Boolean);
  var short=parts.slice(0,3).join('_')||base; var params=parts.slice(3).join(' ／ ')||'—';
  return { shortName:short, paramsText:formatParamsDisplay(params) };
}
