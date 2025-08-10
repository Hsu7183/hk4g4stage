/* ===== 常數（和你舊版一致） ===== */
var MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
var ENTRY = ['新買','新賣'];
var EXIT_L = ['平賣','強制平倉','平倉'];
var EXIT_S = ['平買','強制平倉','平倉'];

/* ===== DOM ===== */
var cvs = document.getElementById('equityChart');
var tbl = document.getElementById('tbl');
var kpiBlocks = document.getElementById('kpiBlocks');
var errBox = document.getElementById('errBox');
var chart = null;

/* ===== 檔案 & 剪貼簿 ===== */
document.getElementById('btn-clip').onclick = function(e){
  navigator.clipboard.readText().then(function(txt){
    if(!txt || !txt.trim()) return showErr('剪貼簿是空的');
    run(txt); flash(e.target);
  }).catch(function(err){ showErr('讀取剪貼簿失敗：'+err.message); });
};
document.getElementById('fileInput').onchange = function(e){
  var f = e.target.files[0]; if(!f) return;
  readFile(f).then(function(raw){ run(raw); flash(document.getElementById('pick')); })
    .catch(function(err){ showErr('讀檔失敗：'+err.message); });
};
function readFile(file){
  function read(enc){ return new Promise(function(ok,no){
    var r=new FileReader(); r.onload=function(){ok(r.result)}; r.onerror=function(){no(r.error)};
    enc? r.readAsText(file,enc): r.readAsText(file);
  });}
  return read('big5').catch(function(){ return read(); });
}

/* ===== 交易動作正規化 ===== */
var ACTION_MAP = new Map([
  ['新買','新買'], ['買進','新買'], ['作多','新買'], ['多單','新買'], ['新多','新買'],
  ['新賣','新賣'], ['賣出','新賣'], ['作空','新賣'], ['空單','新賣'], ['新空','新賣'],
  ['平買','平買'], ['平空','平買'], ['平倉空','平買'],
  ['平賣','平賣'], ['平多','平賣'], ['平倉多','平賣'],
  ['強制平倉','強制平倉'], ['強平','強制平倉'], ['平倉','平倉']
]);
function normAct(s){
  s = (s||'').trim();
  s = s.replace(/[（(].*?[)）]/g,'');      // 去括號內容
  if(s.length>3) s = s.slice(0,3);
  return ACTION_MAP.get(s)||s;
}

/* ===== 字串小工具 ===== */
function onlyDigits(x){ return (x||'').replace(/\D/g,''); }
function parseTS(a,b){
  var d1=onlyDigits(a), d2=onlyDigits(b);
  var cand=d1; if(d1.length<=8 && d2) cand=d1+d2;
  if(cand.length>=14) return cand.slice(0,14);
  if(cand.length>=12) return cand.slice(0,12);
  if(cand.length>=8)  return cand.slice(0,8)+'0000';
  return '';
}
function parseLine(line){
  if(!line) return null;
  var s=line.replace(/[，,]/g,' ').replace(/\t+/g,' ').replace(/\s+/g,' ').trim();
  var parts=s.split(' '); if(parts.length<3) return null;

  var ts=parseTS(parts[0],parts[1]);
  var priceIdx=ts?2:1;

  var price=null, pIndex=-1;
  for(var i=priceIdx;i<parts.length;i++){
    if(/^[-+]?\d+(?:\.\d+)?$/.test(parts[i].replace(/,/g,''))){
      price=parseFloat(parts[i].replace(/,/g,'')); pIndex=i; break;
    }
  }
  if(!ts || price===null) return null;

  var act=''; 
  for(var j=pIndex+1;j<parts.length;j++){
    if(!/^[-+]?\d+(?:\.\d+)?$/.test(parts[j])){ act=normAct(parts[j]); break; }
  }
  if(!act) return null;

  var valid={'新買':1,'新賣':1,'平買':1,'平賣':1,'強制平倉':1,'平倉':1};
  if(!valid[act]) return null;
  return { ts:ts, price:price, act:act };
}

/* ===== 主流程 ===== */
function run(raw){
  try{
    hideErr();
    var rows = (raw||'').replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
    if(!rows.length) return showErr('空檔案');

    // 若第一行不是交易，就當參數行丟掉（不影響舊資料）
    if(!parseLine(rows[0])) rows.shift();

    var q=[], tr=[], tsArr=[], tot=[], lon=[], sho=[], sli=[];
    var cum=0,cumL=0,cumS=0,cumSlip=0;

    for(var i=0;i<rows.length;i++){
      var t=parseLine(rows[i]); if(!t) continue;

      if(ENTRY.indexOf(t.act)>=0){ q.push({side:t.act==='新買'?'L':'S', pIn:t.price, tsIn:t.ts}); continue; }

      var qi=-1;
      for(var j=0;j<q.length;j++){
        var o=q[j];
        if((o.side==='L' && EXIT_L.indexOf(t.act)>=0) ||
           (o.side==='S' && EXIT_S.indexOf(t.act)>=0)){ qi=j; break; }
      }
      if(qi===-1) continue;

      var pos=q.splice(qi,1)[0];
      var pts = pos.side==='L' ? (t.price-pos.pIn) : (pos.pIn-t.price);
      var fee=FEE*2, tax=Math.round(t.price*MULT*TAX);
      var gain=pts*MULT - fee - tax, gainSlip=gain - SLIP*MULT;

      cum+=gain; cumSlip+=gainSlip; if(pos.side==='L') cumL+=gain; else cumS+=gain;

      tr.push({pos:pos, tsOut:t.ts, priceOut:t.price, pts:pts, gain:gain, gainSlip:gainSlip, fee:fee, tax:tax});
      tsArr.push(t.ts); tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
    }

    if(!tr.length) return showErr('沒有成功配對的交易');

    drawChart(tsArr, tot, lon, sho, sli);
    renderKPI(tr, {tot:tot,lon:lon,sho:sho,sli:sli});
    renderTrades(tr);
  }catch(err){ showErr('處理資料錯誤：'+err.message); }
}

/* ===== KPI（沿用你舊版指標） ===== */
var KPI_DEF = [
  ['交易數','n'],['勝率','winRate'],['敗率','lossRate'],
  ['正點數','posPts'],['負點數','negPts'],['總點數','sumPts'],
  ['累積獲利','sumGain'],['滑價累計獲利','sumGainSlip'],
  ['單日最大獲利','maxDay'],['單日最大虧損','minDay'],
  ['區間最大獲利','maxRunUp'],['區間最大回撤','maxDrawdown'],
  ['Profit Factor','pf'],['平均獲利','avgW'],['平均虧損','avgL'],
  ['盈虧比','rr'],['期望值(每筆)','exp'],
  ['最大連勝','maxW'],['最大連敗','maxL']
];
function renderKPI(tr, seq){
  function sum(a){return a.reduce(function(x,y){return x+y;},0);}
  function pct(x){return (x*100).toFixed(1)+'%';}
  function byDay(list){var m={};list.forEach(function(t){var d=(t.tsOut||'').slice(0,8);m[d]=(m[d]||0)+(t.gain||0)});return Object.values(m);}
  function runUp(s){if(!s.length)return 0;var m=s[0],u=0;s.forEach(function(v){if(v<m)m=v;if(v-m>u)u=v-m});return u;}
  function drawDn(s){if(!s.length)return 0;var p=s[0],d=0;s.forEach(function(v){if(v>p)p=v;if(v-p<d)d=v-p});return d;}
  function streak(list){var cw=0,cl=0,mw=0,ml=0;list.forEach(function(t){if(t.gain>0){cw++;cl=0;if(cw>mw)mw=cw}else if(t.gain<0){cl++;cw=0;if(cl>ml)ml=cl}});return{mw:mw,ml:ml};}
  var L=tr.filter(function(t){return t.pos.side==='L';});
  var S=tr.filter(function(t){return t.pos.side==='S';});
  function make(list,seqArr){
    if(!list.length)return{n:0,winRate:'0.0%',lossRate:'0.0%',posPts:0,negPts:0,sumPts:0,sumGain:0,sumGainSlip:0,maxDay:0,minDay:0,maxRunUp:0,maxDrawdown:0,pf:'—',avgW:0,avgL:0,rr:'—',exp:0,maxW:0,maxL:0};
    var win=list.filter(function(t){return t.gain>0;});
    var loss=list.filter(function(t){return t.gain<0;});
    var winAmt=sum(win.map(function(t){return t.gain;}));
    var lossAmt=-sum(loss.map(function(t){return t.gain;}));
    var pf=lossAmt===0?(winAmt>0?'∞':'—'):(winAmt/lossAmt).toFixed(2);
    var avgW=win.length?winAmt/win.length:0;
    var avgL=loss.length?-(lossAmt/loss.length):0;
    var rr=avgL===0?'—':Math.abs(avgW/avgL).toFixed(2);
    var st=streak(list);
    return{
      n:list.length,winRate:pct(win.length/list.length),lossRate:pct(loss.length/list.length),
      posPts:sum(win.map(function(t){return t.pts;})),negPts:sum(loss.map(function(t){return t.pts;})),sumPts:sum(list.map(function(t){return t.pts;})),
      sumGain:sum(list.map(function(t){return t.gain;})),sumGainSlip:sum(list.map(function(t){return t.gainSlip;})),
      maxDay:Math.max.apply(null,byDay(list)),minDay:Math.min.apply(null,byDay(list)),
      maxRunUp:runUp(seqArr.tot),maxDrawdown:drawDn(seqArr.tot),
      pf:pf,avgW:avgW,avgL:avgL,rr:rr,exp:(winAmt-lossAmt)/list.length,maxW:st.mw,maxL:st.ml
    };
  }
  var data={'全部':make(tr,seq),'多單':make(L,{tot:seq.lon}),'空單':make(S,{tot:seq.sho})};
  var html='';
  ['全部','多單','空單'].forEach(function(g){
    html+='<div class="kpi-block"><div class="kpi-title">'+g+'</div><div class="kpi-line">';
    KPI_DEF.forEach(function(pair){
      var lab=pair[0],key=pair[1],v=data[g][key]; html+='<span class="kpi-item"><span class="kpi-key">'+lab+'</span>：<span class="kpi-val">'+fmt(v)+'</span></span>';
    });
    html+='</div></div>';
  });
  kpiBlocks.innerHTML=html;
}

/* ===== 交易表 ===== */
function renderTrades(list){
  var body=tbl.querySelector('tbody'); body.innerHTML='';
  var cg=0, cs=0;
  for(var i=0;i<list.length;i++){
    var t=list[i]; cg+=t.gain; cs+=t.gainSlip; var dir=t.pos.side==='L'?'多':'空';
    body.insertAdjacentHTML('beforeend',
      '<tr>'+
        '<td>'+(i+1)+'</td>'+
        '<td>'+fmtTs(t.pos.tsIn)+'</td><td>'+fmt(t.pos.pIn)+'</td>'+
        '<td>'+fmtTs(t.tsOut)+'</td><td>'+fmt(t.priceOut)+'</td>'+
        '<td>'+dir+'</td><td>'+fmt(t.pts)+'</td><td>'+fmt(t.fee)+'</td><td>'+fmt(t.tax)+'</td>'+
        '<td>'+fmt(t.gain)+'</td><td>'+fmt(cg)+'</td>'+
        '<td>'+fmt(t.gainSlip)+'</td><td>'+fmt(cs)+'</td>'+
      '</tr>');
  }
  tbl.hidden=false;
}

/* ===== 圖表（總=黃、多=綠、空=紅、滑價=黑） ===== */
function drawChart(tsArr,T,L,S,P){
  if(chart) chart.destroy();
  function ym2Date(ym){return new Date(+ym.slice(0,4),+ym.slice(4,6)-1);}
  function addM(d,n){return new Date(d.getFullYear(),d.getMonth()+n);}
  var start=addM(ym2Date(tsArr[0].slice(0,6)),-1), months=[], d=start;
  while(months.length<26){ months.push(d.getFullYear()+'/'+('0'+(d.getMonth()+1)).slice(-2)); d=addM(d,1); }
  var mIdx={}; months.forEach(function(m,i){mIdx[m.replace('/','')]=i;});
  function dim(y,m){return new Date(y,m,0).getDate();}
  var X=tsArr.map(function(ts){var y=+ts.slice(0,4),m=+ts.slice(4,6),dd=+ts.slice(6,8),hh=+ts.slice(8,10)||0,mm=+ts.slice(10,12)||0;return mIdx[ts.slice(0,6)]+(dd-1+(hh+mm/60)/24)/dim(y,m);});
  function mk(d,c){return{data:d,stepped:true,borderColor:c,borderWidth:2,pointRadius:3};}
  chart=new Chart(cvs,{type:'line',data:{labels:X,datasets:[mk(T,'#f6b300'),mk(L,'#2e7d32'),mk(S,'#d32f2f'),mk(P,'#000')]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return' '+c.parsed.y.toLocaleString('zh-TW');}}}},scales:{x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},y:{ticks:{callback:function(v){return v.toLocaleString('zh-TW');}}}}});
}

/* ===== 雜項 ===== */
function fmt(n){ if(typeof n==='number'&&isFinite(n)) return n.toLocaleString('zh-TW',{maximumFractionDigits:0}); if(typeof n==='string') return n; return '—'; }
function fmtTs(s){ var y=s.slice(0,4),m=s.slice(4,6),d=s.slice(6,8),hh=s.slice(8,10)||'00',mm=s.slice(10,12)||'00'; return y+'/'+m+'/'+d+' '+hh+':'+mm; }
function flash(el){ el.classList.add('flash'); setTimeout(function(){el.classList.remove('flash');},600); }
function showErr(m){ errBox.textContent=m; errBox.style.display='inline-block'; }
function hideErr(){ errBox.style.display='none'; errBox.textContent=''; }
