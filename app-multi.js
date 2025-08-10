/* ===== 常數與工具 ===== */
var MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
var ENTRY=['新買','新賣'],EXIT_L=['平賣','強制平倉','平倉'],EXIT_S=['平買','強制平倉','平倉'];

var ACTION_MAP=new Map([['新買','新買'],['新賣','新賣'],['平買','平買'],['平賣','平賣'],['強制平倉','強制平倉'],['平倉','平倉']]);
function normAct(s){s=(s||'').trim().replace(/[（(].*?[)）]/g,'');if(s.length>3)s=s.slice(0,3);return ACTION_MAP.get(s)||s;}
function onlyDigits(x){return (x||'').replace(/\D/g,'');}
function looksLikeTS(tok){var d=onlyDigits(String(tok||'').split('.')[0]);return d.startsWith('20')&&d.length>=12;}
function parseTS(tok){var d=onlyDigits(String(tok||'').split('.')[0]);if(d.length>=14)return d.slice(0,14);if(d.length===12)return d+'00';if(d.length===8)return d+'0000';return'';}
function parseLine(line){
  if(!line) return null;
  var parts=line.trim().split(/\s+/); if(parts.length<3) return null;
  if(!looksLikeTS(parts[0])) return null;
  var ts=parseTS(parts[0]);
  var price=parseFloat(String(parts[1]).replace(/,/g,'')); if(isNaN(price)) return null;
  var act=normAct(parts[2]); var ok={'新買':1,'新賣':1,'平買':1,'平賣':1,'強制平倉':1,'平倉':1}; if(!ok[act])return null;
  return {ts:ts,price:price,act:act};
}
function fmt(n){if(typeof n==='number'&&isFinite(n))return n.toLocaleString('zh-TW',{maximumFractionDigits:0});if(typeof n==='string')return n;return'—';}
function fmtTs(s){var y=s.slice(0,4),m=s.slice(4,6),d=s.slice(6,8),hh=s.slice(8,10)||'00',mm=s.slice(10,12)||'00';return y+'/'+m+'/'+d+' '+hh+':'+mm;}
function paramsDisplay(s){if(!s)return'—';var t=s.trim().split(/\s+/).filter(Boolean);var ok=t.length>0&&t.every(function(x){return/^[-+]?\d+(?:\.\d+)?$/.test(x)});return ok?t.map(function(x){return String(Math.trunc(parseFloat(x)));}).join(' / '):s;}

/* ===== DOM ===== */
var filesInput=document.getElementById('filesInput');
var btnClear=document.getElementById('btn-clear');
var tbl=document.getElementById('tblBatch'), thead=tbl.querySelector('thead'), tbody=tbl.querySelector('tbody');
var cvs=document.getElementById('equityChart'), chart=null;
var tradesBody=document.getElementById('tradesBody'), kpiBlocks=document.getElementById('kpiBlocks');
var paramBar=document.getElementById('paramBar'), pName=document.getElementById('pName'), pParams=document.getElementById('pParams'), loadStat=document.getElementById('loadStat');

var rowsData=[];

/* ===== File 讀取 ===== */
function readFile(file){
  function read(enc){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(r.result)};r.onerror=function(){no(r.error)};enc?r.readAsText(file,enc):r.readAsText(file);});}
  return read('big5').catch(function(){return read();});
}

/* ===== 事件 ===== */
if(filesInput){
  filesInput.addEventListener('change',function(e){
    var files=[].slice.call(e.target.files||[]); if(!files.length) return;
    buildHeader(); rowsData=[]; tbody.innerHTML=''; updateStat(0,files.length,0);
    var failed=0, firstShown=false;

    (function loop(i){
      if(i>=files.length) return;
      var f=files[i];
      readFile(f).then(function(raw){
        var res=analyse(raw,{needFull:!firstShown,filename:f.name});
        rowsData.push({
          filename:f.name, shortName:res.shortName, paramsText:res.paramsText, fileRef:f,
          kpi:res.kpi, sortCache:sortCache(res.kpi),
          equitySeq:res.eq, tsSeq:res.ts, trades:res.trades
        });
        appendRow(res.shortName,res.paramsText,res.kpi);

        if(!firstShown && res.ts && res.ts.length){
          drawChart(res.ts,res.eq.tot,res.eq.lon,res.eq.sho,res.eq.sli);
          renderTrades(res.trades); renderKPI(res.kpi);
          showParam(res.shortName,res.paramsText);
          firstShown=true;
        }
      }).catch(function(err){ console.error(err); failed++; })
        .finally(function(){ updateStat(i+1,files.length,failed); loop(i+1);});
    })(0);
  });
}

if(btnClear){
  btnClear.onclick=function(){
    filesInput.value=''; thead.innerHTML=''; tbody.innerHTML='';
    rowsData=[]; if(chart) chart.destroy(); tradesBody.innerHTML='<tr><td colspan="13" style="color:#777">尚未載入</td></tr>';
    kpiBlocks.innerHTML=''; paramBar.hidden=true; updateStat(0,0,0);
  };
}

/* ===== 分析主程式（單檔） ===== */
function analyse(raw,opt){
  opt=opt||{};
  var rows=(raw||'').replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
  if(!rows.length) throw new Error('空檔案');

  var paramLine='';
  if(!parseLine(rows[0])) paramLine=rows.shift();

  var q=[],tr=[],ts=[],tot=[],lon=[],sho=[],sli=[];
  var cum=0,cumL=0,cumS=0,cumSlip=0;

  for(var i=0;i<rows.length;i++){
    var t=parseLine(rows[i]); if(!t) continue;

    if(ENTRY.indexOf(t.act)>=0){ q.push({side:t.act==='新買'?'L':'S',pIn:t.price,tsIn:t.ts}); continue; }

    var qi=-1; for(var j=0;j<q.length;j++){var o=q[j]; if((o.side==='L'&&EXIT_L.indexOf(t.act)>=0)||(o.side==='S'&&EXIT_S.indexOf(t.act)>=0)){qi=j;break;}}
    if(qi===-1) continue;

    var pos=q.splice(qi,1)[0];
    var pts= pos.side==='L'?(t.price-pos.pIn):(pos.pIn-t.price);
    var fee=FEE*2, tax=Math.round(t.price*MULT*TAX);
    var gain=pts*MULT - fee - tax, gainSlip=gain - SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip; if(pos.side==='L') cumL+=gain; else cumS+=gain;
    tr.push({pos:pos,tsOut:t.ts,priceOut:t.price,pts:pts,gain:gain,gainSlip:gainSlip,fee:fee,tax:tax});

    if(opt.needFull){ ts.push(t.ts); tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip); }
  }

  var kpi=buildKPI(tr,{tot:tot,lon:lon,sho:sho,sli:sli});
  var pf=parseName(opt.filename||''); var params=paramLine?paramsDisplay(paramLine):pf.params;
  return {kpi:kpi, eq:opt.needFull?{tot:tot,lon:lon,sho:sho,sli:sli}:null, ts:opt.needFull?ts:null, trades:opt.needFull?tr:null, shortName:pf.short, paramsText:params};
}

/* ===== KPI、排序、呈現 ===== */
function buildKPI(tr,seq){
  function sum(a){return a.reduce(function(x,y){return x+y;},0);}
  function pct(x){return (x*100).toFixed(1)+'%';}
  function byDay(list){var m={};list.forEach(function(t){var d=(t.tsOut||'').slice(0,8);m[d]=(m[d]||0)+(t.gain||0)});return Object.values(m);}
  function up(s){if(!s.length)return 0;var m=s[0],u=0;s.forEach(function(v){if(v<m)m=v;if(v-m>u)u=v-m});return u;}
  function dn(s){if(!s.length)return 0;var p=s[0],d=0;s.forEach(function(v){if(v>p)p=v;if(v-p<d)d=v-p});return d;}
  function streak(list){var cw=0,cl=0,mw=0,ml=0;list.forEach(function(t){if(t.gain>0){cw++;cl=0;mw=Math.max(mw,cw)}else if(t.gain<0){cl++;cw=0;ml=Math.max(ml,cl)}});return{mw:mw,ml:ml};}
  var L=tr.filter(function(t){return t.pos&&t.pos.side==='L';});
  var S=tr.filter(function(t){return t.pos&&t.pos.side==='S';});
  function make(list,wrap){
    if(!list.length)return{n:0,winRate:'0.0%',lossRate:'0.0%',posPts:0,negPts:0,sumPts:0,sumGain:0,sumGainSlip:0,maxDay:0,minDay:0,maxRunUp:0,maxDrawdown:0,pf:'—',avgW:0,avgL:0,rr:'—',exp:0,maxW:0,maxL:0};
    var win=list.filter(function(t){return t.gain>0;}),loss=list.filter(function(t){return t.gain<0;});
    var winAmt=sum(win.map(function(t){return t.gain;})),lossAmt=-sum(loss.map(function(t){return t.gain;}));
    var pf=lossAmt===0?(winAmt>0?'∞':'—'):(winAmt/lossAmt).toFixed(2);
    var avgW=win.length?winAmt/win.length:0, avgL=loss.length?-(lossAmt/loss.length):0, rr=avgL===0?'—':Math.abs(avgW/avgL).toFixed(2);
    var st=streak(list);
    return{ n:list.length,winRate:pct(win.length/list.length),lossRate:pct(loss.length/list.length),
      posPts:sum(win.map(function(t){return t.pts;})),negPts:sum(loss.map(function(t){return t.pts;})),sumPts:sum(list.map(function(t){return t.pts;})),
      sumGain:sum(list.map(function(t){return t.gain;})),sumGainSlip:sum(list.map(function(t){return t.gainSlip;})),
      maxDay:Math.max.apply(null,byDay(list)),minDay:Math.min.apply(null,byDay(list)),
      maxRunUp:up(wrap.tot||[]),maxDrawdown:dn(wrap.tot||[]),
      pf:pf,avgW:avgW,avgL:avgL,rr:rr,exp:(winAmt-lossAmt)/list.length,maxW:st.mw,maxL:st.ml };
  }
  return {'全部':make(tr,seq),'多單':make(L,{tot:seq.lon}),'空單':make(S,{tot:seq.sho})};
}
var KPI_ORDER=[['交易數','n'],['勝率','winRate'],['敗率','lossRate'],['正點數','posPts'],['負點數','negPts'],['總點數','sumPts'],['累積獲利','sumGain'],['滑價累計獲利','sumGainSlip'],['單日最大獲利','maxDay'],['單日最大虧損','minDay'],['區間最大獲利','maxRunUp'],['區間最大回撤','maxDrawdown'],['Profit Factor','pf'],['平均獲利','avgW'],['平均虧損','avgL'],['盈虧比','rr'],['期望值(每筆)','exp'],['最大連勝','maxW'],['最大連敗','maxL']];
var GROUPS=['全部','多單','空單'];

function buildHeader(){
  var cells=['<th class="sortable nowrap" data-key="__f">短檔名</th>','<th class="sortable nowrap" data-key="__p">參數</th>'];
  GROUPS.forEach(function(g){ KPI_ORDER.forEach(function(p){ cells.push('<th class="sortable nowrap" data-key="'+g+'.'+p[1]+'">'+g+'-'+p[0]+'</th>');});});
  thead.innerHTML='<tr>'+cells.join('')+'</tr>';
  var curKey=null,curDir='asc',ths=thead.querySelectorAll('th.sortable');
  [].forEach.call(ths,function(th){
    th.addEventListener('click',function(){
      var key=th.getAttribute('data-key'); curDir=(curKey===key?(curDir==='asc'?'desc':'asc'):'asc'); curKey=key;
      [].forEach.call(ths,function(h){h.classList.remove('asc','desc')}); th.classList.add(curDir);
      sortRows(curKey,curDir); redrawTop();
    });
  });
}
function sortCache(kpi){
  var flat={};
  GROUPS.forEach(function(g){
    var obj=kpi[g]||{};
    KPI_ORDER.forEach(function(p){
      var v=obj[p[1]];
      if(typeof v==='number') flat[g+'.'+p[1]]=v;
      else if(typeof v==='string'){
        if(v.slice(-1)==='%') flat[g+'.'+p[1]]=parseFloat(v);
        else if(v==='—') flat[g+'.'+p[1]]=-Infinity;
        else if(v==='∞') flat[g+'.'+p[1]]=Number.POSITIVE_INFINITY;
        else flat[g+'.'+p[1]]=parseFloat(v.replace(/,/g,''))||-Infinity;
      }else flat[g+'.'+p[1]]=-Infinity;
    });
  });
  return flat;
}
var rowsDataCache=null;
function sortRows(key,dir){
  var f=dir==='asc'?1:-1;
  rowsData.sort(function(a,b){
    if(key==='__f') return a.shortName.localeCompare(b.shortName)*f;
    if(key==='__p') return a.paramsText.localeCompare(b.paramsText)*f;
    var av=(a.sortCache[key]!==undefined)?a.sortCache[key]:-Infinity;
    var bv=(b.sortCache[key]!==undefined)?b.sortCache[key]:-Infinity;
    var d=(av-bv)*f; return d||a.shortName.localeCompare(b.shortName)*f;
  });
  tbody.innerHTML=''; rowsData.forEach(function(r){ appendRow(r.shortName,r.paramsText,r.kpi); });
}
function appendRow(short,params,kpi){
  var tds=['<td class="nowrap">'+short+'</td>','<td class="nowrap">'+params+'</td>'];
  GROUPS.forEach(function(g){var obj=kpi[g]||{}; KPI_ORDER.forEach(function(p){ tds.push('<td>'+fmt(obj[p[1]])+'</td>');});});
  tbody.insertAdjacentHTML('beforeend','<tr>'+tds.join('')+'</tr>');
}

function redrawTop(){
  var first=null; for(var i=0;i<rowsData.length;i++){ if(rowsData[i].tsSeq){ first=rowsData[i]; break;} }
  if(!first){ if(chart) chart.destroy(); tradesBody.innerHTML='<tr><td colspan="13" style="color:#777">沒有可用資料</td></tr>'; kpiBlocks.innerHTML=''; paramBar.hidden=true; return; }
  drawChart(first.tsSeq,first.equitySeq.tot,first.equitySeq.lon,first.equitySeq.sho,first.equitySeq.sli);
  renderTrades(first.trades); renderKPI(first.kpi); showParam(first.shortName,first.paramsText);
}

/* ===== 畫圖 / 表格呈現 ===== */
function drawChart(tsArr,T,L,S,P){
  if(chart) chart.destroy();
  function ym2Date(ym){return new Date(+ym.slice(0,4),+ym.slice(4,6)-1);} function addM(d,n){return new Date(d.getFullYear(),d.getMonth()+n);}
  var start=addM(ym2Date(tsArr[0].slice(0,6)),-1),months=[],d=start; while(months.length<26){months.push(d.getFullYear()+'/'+('0'+(d.getMonth()+1)).slice(-2));d=addM(d,1);}
  var mIdx={}; months.forEach(function(m,i){mIdx[m.replace('/','')]=i;}); function dim(y,m){return new Date(y,m,0).getDate();}
  var X=tsArr.map(function(ts){var y=+ts.slice(0,4),m=+ts.slice(4,6),dd=+ts.slice(6,8),hh=+ts.slice(8,10)||0,mm=+ts.slice(10,12)||0;return mIdx[ts.slice(0,6)]+(dd-1+(hh+mm/60)/24)/dim(y,m);});
  function mk(d,c){return{data:d,stepped:true,borderColor:c,borderWidth:2,pointRadius:3};}
  chart=new Chart(cvs,{type:'line',data:{labels:X,datasets:[mk(T,'#f6b300'),mk(L,'#2e7d32'),mk(S,'#d32f2f'),mk(P,'#000')]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return' '+c.parsed.y.toLocaleString('zh-TW');}}}},
    scales:{x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},y:{ticks:{callback:function(v){return v.toLocaleString('zh-TW');}}}}});
}
function renderTrades(list){
  if(!list||!list.length){ tradesBody.innerHTML='<tr><td colspan="13" style="color:#777">此檔沒有成功配對的交易</td></tr>'; return; }
  var cg=0,cs=0,html=[];
  list.forEach(function(t,i){
    cg+=t.gain; cs+=t.gainSlip; var dir=t.pos.side==='L'?'多':'空';
    html.push('<tr><td>'+(i+1)+'</td><td>'+fmtTs(t.pos.tsIn)+'</td><td>'+fmt(t.pos.pIn)+'</td><td>'+fmtTs(t.tsOut)+'</td><td>'+fmt(t.priceOut)+'</td><td>'+dir+'</td><td>'+fmt(t.pts)+'</td><td>'+fmt(t.fee)+'</td><td>'+fmt(t.tax)+'</td><td>'+fmt(t.gain)+'</td><td>'+fmt(cg)+'</td><td>'+fmt(t.gainSlip)+'</td><td>'+fmt(cs)+'</td></tr>');
  });
  tradesBody.innerHTML=html.join('');
}
function renderKPI(kpi){
  var html=''; ['全部','多單','空單'].forEach(function(g){
    html+='<div class="kpi-block"><div class="kpi-title">'+g+'</div><div class="kpi-line">';
    KPI_ORDER.forEach(function(p){ var v=kpi[g][p[1]]; html+='<span class="kpi-item"><span class="kpi-key">'+p[0]+'</span>：<span class="kpi-val">'+fmt(v)+'</span></span>'; });
    html+='</div></div>';
  }); kpiBlocks.innerHTML=html;
}
function showParam(name,params){ pName.textContent=name||'—'; pParams.textContent=params||'—'; paramBar.hidden=false; }
function parseName(name){ name=name||''; var base=name.replace(/\.[^.]+$/,''),parts=base.split('_').filter(Boolean); var short=parts.slice(0,3).join('_')||base; var params=parts.slice(3).join(' ／ ')||'—'; return {short:short,params:params}; }
function updateStat(done,total,failed){ if(!loadStat) return; if(!total){loadStat.style.display='none'; loadStat.textContent='';return;} loadStat.style.display='inline-block'; loadStat.textContent='載入：'+done+'/'+total+'，成功：'+(done-failed)+'，失敗：'+failed; }
