<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>三劍客台指期策略分析（單檔）</title>
  <link rel="stylesheet" href="style.css" />
  <style>
    body{background:#f5f6f8}
    header, .sub, .chart-wrap, .kpi-wrap, .table-wrap {max-width:1200px; margin:1rem auto; padding:0 1rem}
    header{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
    h1{margin:0;font-size:1.45rem}
    .btn-group{display:flex;gap:.6rem}
    .btn{display:inline-flex;align-items:center;padding:.55rem 1.05rem;border:1px solid #e5e7eb;border-radius:.6rem;background:#fff;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.06)}
    .btn.primary{background:#2563eb;color:#fff;border-color:transparent}
    .box{background:#fff;border:1px solid #e5e7eb;border-radius:.6rem;box-shadow:0 8px 20px rgba(0,0,0,.06);padding:.7rem}
    .chart-wrap .box{height:420px}
    #equityChart{width:100%!important;height:100%!important}
    .error{color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;border-radius:.5rem;padding:.5rem .7rem;margin:.6rem 0;display:none}
    /* 參數列 */
    .param-bar{display:flex;gap:1rem;flex-wrap:wrap;margin:.6rem 0}
    .param-item{display:flex;gap:.5rem;align-items:center;white-space:nowrap}
    .param-key{color:#374151;font-weight:700}
    .param-val{color:#111827}
    /* KPI */
    #topKPI.box{padding:1rem}
    .kpi-block{margin:.5rem 0 .8rem}
    .kpi-title{font-weight:800;margin:.2rem 0 .5rem}
    .kpi-line{display:flex;flex-wrap:wrap;gap:1rem .9rem}
    .kpi-item{white-space:nowrap}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
  <header>
    <h1>三劍客台指期策略分析（單檔）</h1>
    <div class="btn-group">
      <button id="btn-clip" class="btn primary">貼上內容</button>
      <label class="btn primary" id="pick">選擇檔案
        <input type="file" id="fileInput" accept=".txt,.TF" hidden />
      </label>
    </div>
  </header>

  <div class="chart-wrap">
    <div class="box"><canvas id="equityChart"></canvas></div>
    <div id="errBox" class="error"></div>
  </div>

  <div class="kpi-wrap">
    <div id="topKPI" class="box">
      <h2 class="sub" style="margin:.2rem 0 .6rem">參數 / 數值彙整（全部／多單／空單）</h2>
      <div id="paramBar" class="param-bar" hidden>
        <div class="param-item"><span class="param-key">短檔名</span><span class="param-val" id="pName">—</span></div>
        <div class="param-item"><span class="param-key">參數</span><span class="param-val" id="pParams">—</span></div>
      </div>
      <div id="kpiBlocks"></div>
    </div>
  </div>

  <h2 class="sub">交易紀錄</h2>
  <div class="table-wrap">
    <table id="tbl" hidden>
      <thead>
        <tr>
          <th>筆數</th>
          <th>進場時間</th><th>進場價</th>
          <th>出場時間</th><th>出場價</th>
          <th>方向</th><th>點數</th><th>手續費</th><th>期交稅</th>
          <th>獲利</th><th>累積獲利</th><th>滑價獲利</th><th>累積滑價獲利</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>

  <script defer src="single.js?v=2025-08-10c"></script>
</body>
</html>
