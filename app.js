/* ===== 參數 ===== */
const MULT=200,FEE=45,TAX=0.00004,SLIP=1.5;
const ENTRY=['新買','新賣'],
      EXIT_L=['平賣','強制平倉'],
      EXIT_S=['平買','強制平倉'];

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  qs('#btn-clip').addEventListener('click',async e=>{
    try{analyse(await navigator.clipboard.readText());flash(e.target);}
    catch(err){alert('讀取剪貼簿失敗\n'+err.message);}
  });

  qs('#fileInput').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>analyse(decodeBuffer(rd.result));
    rd.readAsArrayBuffer(f);
  });
});

/* ===== 解碼工具 ===== */
function decodeBuffer(buf){
  /* 先 UTF-8 → Big5 → Latin-1 */
  for(const enc of ['utf-8','big5','iso-8859-1']){
    try{return new TextDecoder(enc,{fatal:true}).decode(buf);}
    catch{/* next */}
  }
  throw new Error('無法解碼檔案');
}

/* ===== 主分析 ===== */
function analyse(text){
  const RE=/(\d{8,14})\s+(\d+(?:\.\d+)?)\s+(\S+)/;
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const q=[],tr=[],lab=[],tot=[],lon=[],sho=[],slp=[];
  let cT=0,cL=0,cS=0,cP=0;

  for(const l of lines){
    const m=l.match(RE); if(!m)continue;
    const [ ,tsRaw,priceRaw,act]=m;
    const ts=tsRaw.slice(0,12), price=+priceRaw;

    if(ENTRY.includes(act)){
      q.push({side:act==='新買'?'L':'S',tsIn:ts,price});
      continue;
    }

    const idx=q.findIndex(o=>(o.side==='L'&&EXIT_L.includes(act))||(o.side==='S'&&EXIT_S.includes(act)));
    if(idx===-1)continue;
    const pos=q.splice(idx,1)[0];

    const pts=pos.side==='L'?price-pos.price:pos.price-price;
    const fee=FEE*2, tax=Math.round(price*MULT*TAX);
    const gain=pts*MULT-fee-tax;
    const gainSlip=gain-SLIP*MULT;

    cT+=gain; cP+=gainSlip;
    pos.side==='L'?cL+=gain:cS+=gain;

    tr.push({in:{ts:pos.tsIn,price:pos.price,type:pos.side==='L'?'新買':'新賣'},
             out:{ts,price,type:act,pts,fee,tax,gain,cT,gainSlip,cP}});

    lab.push(ts.slice(0,6).replace(/(\d{4})(\d{2})/,'$1/$2'));
    tot.push(cT); lon.push(cL); sho.push(cS); slp.push(cP);
  }

  if(!tr.length){alert('沒有成功配對的交易！');return;}

  renderTable(tr); drawChart(lab,tot,lon,sho,slp);
}

/* ===== 表格 ===== */
function renderTable(data){
  const tb=qs('#tbl tbody');tb.innerHTML='';
  data.forEach((o,i)=>{
    tb.insertAdjacentHTML('beforeend',`
      <tr><td rowspan="2">${i+1}</td>
        <td>${o.in.ts}</td><td>${o.in.price}</td><td>${o.in.type}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      <tr><td>${o.out.ts}</td><td>${o.out.price}</td><td>${o.out.type}</td>
        <td>${fmt(o.out.pts)}</td><td>${fmt(o.out.fee)}</td><td>${fmt(o.out.tax)}</td>
        <td>${fmt(o.out.gain)}</td><td>${fmt(o.out.cT)}</td>
        <td>${fmt(o.out.gainSlip)}</td><td>${fmt(o.out.cP)}</td></tr>`);
  });
  qs('#tbl').hidden=false;
}

/* ===== Chart ===== */
let chart;
function drawChart(lbl,T,L,S,P){
  if(chart)chart.destroy();

  const stripe={id:'stripe',beforeDraw(c){
    const {ctx,chartArea:{top,bottom}}=c,x=c.scales.x;
    ctx.save();
    lbl.forEach((_,i)=>{if(i%2===0){
      const x0=x.getPixelForValue(i),x1=x.getPixelForValue(i+1)||x0+(x.getPixelForValue(1)-x0);
      ctx.fillStyle='rgba(0,0,0,.05)';
      ctx.fillRect(x0,top,x1-x0,bottom-top);
    }});ctx.restore();
  }};

  const line=(col)=>({borderColor:col,borderWidth:2,stepped:true,
    fill:false,pointRadius:0});
  const last=(arr,col)=>({
    data:arr.map((v,i)=>i===arr.length-1?v:null),showLine:false,
    pointRadius:5,pointBackgroundColor:col,datalabels:{
      align:'left',anchor:'end',offset:6,formatter:v=>fmt(v)
    }
  });
  const max=Math.max(...T),min=Math.min(...T),
        iMax=T.indexOf(max),iMin=T.indexOf(min);

  chart=new Chart(qs('#equityChart'),{
    type:'line',
    data:{
      labels:lbl,
      datasets:[
        {label:'總',data:T,...line('#fbc02d'),
         fill:{target:'origin',above:'rgba(255,138,128,.18)',below:'rgba(200,230,201,.18)'}},
        {label:'多',data:L,...line('#d32f2f')},
        {label:'空',data:S,...line('#2e7d32')},
        {label:'滑',data:P,...line('#212121')},
        last(T,'#fbc02d'),last(L,'#d32f2f'),last(S,'#2e7d32'),last(P,'#212121'),
        {data:T.map((v,i)=>i===iMax?v:null),showLine:false,pointRadius:6,
         pointBackgroundColor:'#d32f2f',datalabels:{align:'left',anchor:'end',offset:6,formatter:v=>fmt(v)}},
        {data:T.map((v,i)=>i===iMin?v:null),showLine:false,pointRadius:6,
         pointBackgroundColor:'#2e7d32',datalabels:{align:'left',anchor:'end',offset:6,formatter:v=>fmt(v)}}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}},
        datalabels:{display:false}
      },
      scales:{
        x:{grid:{display:false}},
        y:{ticks:{callback:v=>fmt(v)}}
      }
    },
    plugins:[stripe,window.ChartDataLabels]
  });
}

/* ===== Utils ===== */
const qs=s=>document.querySelector(s);
const fmt=v=>(v===undefined||v==='')?'':(+v).toLocaleString('zh-TW');
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
