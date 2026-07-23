export const sourceConfig = {
  twse: {
    name: "臺灣證券交易所 OpenAPI",
    url: "https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST",
  },
  fred: {
    name: "FRED（聖路易聯邦準備銀行）",
    url: "https://fred.stlouisfed.org/graph/fredgraph.csv",
    series: { vix: "VIXCLS", us2y: "DGS2", us10y: "DGS10" },
  },
  cboe: {
    name: "Cboe Daily Market Statistics",
    url: "https://www.cboe.com/us/options/market_statistics/daily/",
  },
  yahoo: {
    name: "Yahoo Finance 公開圖表端點",
    url: "https://query1.finance.yahoo.com/v8/finance/chart/",
    symbols: { sp500: "^GSPC", nasdaq: "^IXIC", dow: "^DJI", sox: "^SOX", usdtwd: "TWD=X" },
  },
  feeds: [
    { name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", category: "央行" },
    { name: "U.S. SEC", url: "https://www.sec.gov/news/pressreleases.rss", category: "法規" },
  ],
  twseNews: {
    name: "臺灣證券交易所",
    url: "https://openapi.twse.com.tw/v1/news/newsList",
    category: "台股",
  },
} as const;
