import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Parser from "rss-parser";
import { z } from "zod";
import { sourceConfig } from "./source-config.js";
import type { BreadthData, Direction, Lamp, MarketData, Metric, NewsData, NewsItem, SourceInfo, ViewpointItem, ViewpointsData } from "../src/lib/types.js";

const root = process.cwd();
const dataDir = path.join(root, "public", "data");
const now = new Date().toISOString();
const userAgent = "MarketWarRoom/1.0 (static personal dashboard; public data only)";
const parser = new Parser({ headers: { "User-Agent": userAgent } });

const metricSchema = z.object({
  id: z.string(), name: z.string(), symbol: z.string(), value: z.number().nullable(),
  change: z.number().nullable(), changePercent: z.number().nullable(), unit: z.string(),
  direction: z.enum(["bull", "bear", "mixed"]), asOf: z.string(), sourceId: z.string(),
  status: z.enum(["ok", "stale", "fallback", "sample", "error"]),
});

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function saveJson(file: string, value: unknown) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchText(url: string, timeoutMs = 14000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "text/csv, application/json, application/xml, text/xml, text/html;q=0.9" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function numberOf(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(change: number | null): Direction {
  if (change === null || Math.abs(change) < 0.05) return "mixed";
  return change > 0 ? "bull" : "bear";
}

function updatedMetric(old: Metric, value: number, previous: number | null, asOf: string, sourceId: string): Metric {
  const change = previous === null ? null : value - previous;
  const changePercent = previous && change !== null ? (change / previous) * 100 : null;
  return metricSchema.parse({ ...old, value, change, changePercent, direction: direction(changePercent), asOf, sourceId, status: "ok" });
}

function sourceState(old: SourceInfo | undefined, id: string, name: string, url: string, ok: boolean, asOf: string, message?: string): SourceInfo {
  return { id, name, url, status: ok ? "ok" : "fallback", asOf: ok ? asOf : old?.asOf ?? asOf, lastAttempt: now, message };
}

async function fetchYahoo(symbol: string) {
  const url = `${sourceConfig.yahoo.url}${encodeURIComponent(symbol)}?range=10d&interval=1d&events=history`;
  const payload = JSON.parse(await fetchText(url)) as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const rows = closes.map((close, index) => ({ value: close, timestamp: timestamps[index] })).filter((row): row is { value: number; timestamp: number } => typeof row.value === "number" && typeof row.timestamp === "number");
  if (!rows.length) throw new Error(`Yahoo ${symbol} 無有效資料列`);
  const latest = rows.at(-1)!;
  const previous = rows.at(-2);
  return { value: latest.value, previous: previous?.value ?? null, asOf: new Date(latest.timestamp * 1000).toISOString() };
}

async function fetchFred(seriesId: string) {
  const text = await fetchText(`${sourceConfig.fred.url}?id=${encodeURIComponent(seriesId)}`);
  const rows = text.trim().split(/\r?\n/).slice(1).map((line) => line.split(",")).filter((row) => row.length >= 2 && numberOf(row[1]) !== null);
  if (rows.length < 1) throw new Error(`FRED ${seriesId} 無有效資料列`);
  const latest = rows.at(-1)!;
  const previous = rows.at(-2);
  return { value: numberOf(latest[1])!, previous: previous ? numberOf(previous[1]) : null, asOf: new Date(`${latest[0]}T22:00:00Z`).toISOString() };
}

async function fetchTwse() {
  const raw = JSON.parse(await fetchText(sourceConfig.twse.url)) as Record<string, unknown>[];
  const rows = raw.map((row) => ({
    date: String(row.Date ?? row.date ?? row["日期"] ?? ""),
    close: numberOf(row.ClosingIndex ?? row.close ?? row["收盤指數"]),
  })).filter((row) => row.date && row.close !== null);
  if (!rows.length) throw new Error("TWSE 回傳格式無可用收盤指數");
  const latest = rows.at(-1)!;
  const previous = rows.at(-2);
  const asOf = parseTwseDate(latest.date) ?? now;
  return { value: latest.close!, previous: previous?.close ?? null, asOf };
}

function parseTwseDate(input: string) {
  const value = input.trim();
  let year: number, month: string, day: string;
  const separated = value.match(/(\d{3,4})\D(\d{1,2})\D(\d{1,2})/);
  if (separated) { year = Number(separated[1]); month = separated[2]; day = separated[3]; }
  else if (/^\d{7}$/.test(value)) { year = Number(value.slice(0, 3)); month = value.slice(3, 5); day = value.slice(5, 7); }
  else if (/^\d{8}$/.test(value)) { year = Number(value.slice(0, 4)); month = value.slice(4, 6); day = value.slice(6, 8); }
  else return null;
  if (year < 1911) year += 1911;
  const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T05:30:00Z`);
  return Number.isNaN(+parsed) ? null : parsed.toISOString();
}

async function fetchCboePutCall() {
  const html = await fetchText(sourceConfig.cboe.url);
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const match = plain.match(/TOTAL PUT\/CALL RATIO\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) throw new Error("Cboe 頁面未找到 Total Put/Call Ratio");
  return { value: Number(match[1]), previous: null, asOf: now };
}

function sourceById(market: MarketData, id: string) { return market.sources.find((item) => item.id === id); }
function replaceMetric(market: MarketData, id: string, next: Metric) { market.metrics = market.metrics.map((item) => item.id === id ? next : item); }
function oldMetric(market: MarketData, id: string) { const item = market.metrics.find((metric) => metric.id === id); if (!item) throw new Error(`缺少指標 ${id}`); return item; }

async function updateMarket(old: MarketData) {
  const market: MarketData = structuredClone(old);
  const attempts: Promise<void>[] = [];

  attempts.push((async () => {
    const results = await Promise.allSettled(Object.entries(sourceConfig.yahoo.symbols).map(async ([id, symbol]) => ({ id, result: await fetchYahoo(symbol) })));
    let latest = "";
    let okCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled") { const { id, result: value } = result.value; replaceMetric(market, id, updatedMetric(oldMetric(market, id), value.value, value.previous, value.asOf, "yahoo")); latest = value.asOf > latest ? value.asOf : latest; okCount++; }
    }
    for (const id of Object.keys(sourceConfig.yahoo.symbols)) if (oldMetric(market, id).status !== "ok") replaceMetric(market, id, { ...oldMetric(market, id), status: "fallback" });
    market.sources = market.sources.filter((s) => !["stooq", "yahoo"].includes(s.id)).concat(sourceState(sourceById(old, "yahoo") ?? sourceById(old, "stooq"), "yahoo", sourceConfig.yahoo.name, "https://finance.yahoo.com/", okCount > 0, latest || now, `${okCount}/5 個市場系列更新成功；非官方 API、無 SLA`));
  })());

  attempts.push((async () => {
    try { const result = await fetchTwse(); replaceMetric(market, "taiex", updatedMetric(oldMetric(market, "taiex"), result.value, result.previous, result.asOf, "twse")); market.sources = market.sources.filter((s) => s.id !== "twse").concat(sourceState(sourceById(old, "twse"), "twse", sourceConfig.twse.name, sourceConfig.twse.url, true, result.asOf)); }
    catch (error) { replaceMetric(market, "taiex", { ...oldMetric(market, "taiex"), status: "fallback" }); market.sources = market.sources.filter((s) => s.id !== "twse").concat(sourceState(sourceById(old, "twse"), "twse", sourceConfig.twse.name, sourceConfig.twse.url, false, now, String(error))); }
  })());

  attempts.push((async () => {
    const results = await Promise.allSettled(Object.entries(sourceConfig.fred.series).map(async ([id, series]) => ({ id, result: await fetchFred(series) })));
    let latest = "";
    let okCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled") { const { id, result: value } = result.value; replaceMetric(market, id, updatedMetric(oldMetric(market, id), value.value, value.previous, value.asOf, "fred")); latest = value.asOf > latest ? value.asOf : latest; okCount++; }
    }
    for (const id of Object.keys(sourceConfig.fred.series)) if (oldMetric(market, id).status !== "ok") replaceMetric(market, id, { ...oldMetric(market, id), status: "fallback" });
    market.sources = market.sources.filter((s) => s.id !== "fred").concat(sourceState(sourceById(old, "fred"), "fred", sourceConfig.fred.name, "https://fred.stlouisfed.org/", okCount > 0, latest || now, `${okCount}/3 個系列更新成功`));
  })());

  attempts.push((async () => {
    try { const result = await fetchCboePutCall(); replaceMetric(market, "putcall", updatedMetric(oldMetric(market, "putcall"), result.value, null, result.asOf, "cboe")); market.sources = market.sources.filter((s) => s.id !== "cboe").concat(sourceState(sourceById(old, "cboe"), "cboe", sourceConfig.cboe.name, sourceConfig.cboe.url, true, result.asOf)); }
    catch (error) { replaceMetric(market, "putcall", { ...oldMetric(market, "putcall"), status: "fallback" }); market.sources = market.sources.filter((s) => s.id !== "cboe").concat(sourceState(sourceById(old, "cboe"), "cboe", sourceConfig.cboe.name, sourceConfig.cboe.url, false, now, String(error))); }
  })());

  await Promise.all(attempts);
  market.updatedAt = now;
  market.session = taipeiSession();
  const ok = market.metrics.filter((item) => item.status === "ok").length;
  market.mode = ok === market.metrics.length ? "live" : ok > 0 ? "partial" : old.mode;
  market.dailyTrend = trendFromMetrics(market.metrics);
  market.hourlyTrend = "mixed";
  return market;
}

function taipeiSession(): MarketData["session"] {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return hour < 11 ? "morning" : hour < 18 ? "noon" : "night";
}

function trendFromMetrics(metrics: Metric[]): Direction {
  const directional = metrics.filter((item) => ["taiex", "sp500", "nasdaq", "dow", "sox"].includes(item.id) && item.changePercent !== null);
  const score = directional.reduce((sum, item) => sum + (item.changePercent! > 0.2 ? 1 : item.changePercent! < -0.2 ? -1 : 0), 0);
  return score >= 2 ? "bull" : score <= -2 ? "bear" : "mixed";
}

function lampForScore(score: number): Lamp { return score >= 65 ? "green" : score >= 50 ? "yellow" : score >= 35 ? "orange" : "red"; }
function riskLamp(value: number, green: number, orange: number, inverted = false): Lamp {
  const healthy = inverted ? value <= green : value >= green;
  const danger = inverted ? value >= orange : value <= orange;
  return healthy ? "green" : danger ? "orange" : "yellow";
}

function buildViewpoints(market: MarketData, breadth: BreadthData, manual: { knifeGod: ViewpointItem | null; bulls: ViewpointItem[]; bears: ViewpointItem[] }): ViewpointsData {
  const get = (id: string) => market.metrics.find((item) => item.id === id)?.value ?? null;
  const vix = get("vix"), putcall = get("putcall"), us2y = get("us2y"), us10y = get("us10y");
  let score = 50;
  if (breadth.advanceDeclineRatio !== null) score += breadth.advanceDeclineRatio >= 1.2 ? 8 : breadth.advanceDeclineRatio <= 0.8 ? -8 : 0;
  if (breadth.percentAbove50d !== null) score += breadth.percentAbove50d >= 60 ? 8 : breadth.percentAbove50d <= 40 ? -8 : 0;
  if (vix !== null) score += vix < 15 ? 8 : vix < 20 ? 3 : vix >= 30 ? -14 : vix >= 25 ? -10 : -5;
  if (putcall !== null) score += putcall >= 0.7 && putcall <= 1.1 ? 3 : putcall > 1.4 ? -6 : -2;
  if (us2y !== null && us10y !== null) score += us10y - us2y >= 0 ? 4 : -4;
  score += market.dailyTrend === "bull" ? 8 : market.dailyTrend === "bear" ? -8 : 0;
  score = Math.max(0, Math.min(100, score));
  market.temperature = { score, label: score >= 65 ? "風險偏好" : score >= 50 ? "中性偏穩" : score >= 35 ? "偏保守" : "高風險", lamp: lampForScore(score) };
  const dataCaveat = market.mode === "live" ? "" : "部分來源正在沿用舊值，結論信心需下調。";
  return {
    schemaVersion: 1, updatedAt: now,
    marketFacts: [
      `市場溫度 ${score}/100，規則判定為${market.temperature.label}。`,
      `主要指數日線結構：${market.dailyTrend === "bull" ? "偏多" : market.dailyTrend === "bear" ? "偏空" : "震盪"}；小時線因免費穩定來源不足，暫列 mixed。`,
      `VIX：${vix ?? "資料暫缺"}；Total Put/Call：${putcall ?? "資料暫缺"}。`,
      `美債 10Y–2Y 利差：${us2y !== null && us10y !== null ? `${(us10y - us2y).toFixed(2)} 個百分點` : "資料暫缺"}。`,
      dataCaveat || "主要資料來源本次更新正常。",
    ],
    knifeGod: manual.knifeGod, bulls: manual.bulls, bears: manual.bears,
    conclusion: `${score >= 65 ? "風險偏好較佳，但仍應等待價格確認。" : score >= 50 ? "訊號中性偏穩，適合觀察確認而非追逐單一題材。" : score >= 35 ? "訊號轉弱，優先控制曝險與事件風險。" : "多項風險同時升高，首要任務是避免情緒化決策。"} ${dataCaveat}`.trim(),
    scenarios: {
      oneWeek: market.dailyTrend === "bull" ? "若市場寬度續強且 VIX 不升，短線偏多結構可延續；跌破近期結構則回到震盪劇本。" : "以區間與事件風險為主，等待主要指數與市場寬度同向。",
      oneMonth: "觀察主要指數能否維持趨勢、企業消息是否支撐，以及殖利率是否造成估值壓力。",
      threeMonths: "以政策、企業獲利、流動性三主線驗證；任何一條明顯惡化，都應降低風險偏好假設。",
    },
    risks: [
      { id: "breadth", name: "市場寬度", lamp: breadth.percentAbove50d === null ? "yellow" : riskLamp(breadth.percentAbove50d, 60, 40), value: breadth.percentAbove50d === null ? "暫缺" : `${breadth.percentAbove50d}%`, reason: "站上 50 日線比率" },
      { id: "vix", name: "波動率", lamp: vix === null ? "yellow" : riskLamp(vix, 18, 25, true), value: vix === null ? "暫缺" : vix.toFixed(2), reason: "VIX 高於 25 轉橘" },
      { id: "putcall", name: "Put/Call", lamp: putcall === null ? "yellow" : putcall > 1.4 || putcall < 0.6 ? "orange" : "yellow", value: putcall === null ? "暫缺" : putcall.toFixed(2), reason: "情緒是否進入極端" },
      { id: "yield", name: "殖利率", lamp: us2y !== null && us10y !== null && us10y - us2y >= 0 ? "green" : "orange", value: us2y !== null && us10y !== null ? `${(us10y - us2y).toFixed(2)}%` : "暫缺", reason: "10Y–2Y 利差" },
      { id: "trend", name: "趨勢一致", lamp: market.dailyTrend === market.hourlyTrend && market.dailyTrend !== "mixed" ? "green" : "yellow", value: market.dailyTrend, reason: "日線與小時線是否同向" },
    ],
    doNotDo: ["不因單一指標追價或殺低。", "不把公開評論轉成個人化買賣建議。", "不忽略卡片的資料時間與降級狀態。", "不繞過登入、CAPTCHA 或付費牆。"],
    disclaimer: "本頁僅為公開資訊整理與固定規則的一般性市場觀察，不考量任何人的財務狀況、風險承受度或持倉，不構成投資建議、招攬或獲利保證。",
  };
}

function hasCjk(value: string) { return /[\u3400-\u9fff]/.test(value); }
function zhHeadline(title: string, category: string) { return hasCjk(title) ? title : `【${category}｜英文原題待人工校訂】${title}`; }
function idFor(url: string) { return createHash("sha1").update(url).digest("hex").slice(0, 14); }

async function fetchFeedItems() {
  const groups = await Promise.allSettled(sourceConfig.feeds.map(async (feed) => {
    const parsed = await parser.parseURL(feed.url);
    return parsed.items.map((item): NewsItem => ({ id: idFor(item.link ?? item.guid ?? item.title ?? Math.random().toString()), title: item.title ?? "Untitled", titleZh: zhHeadline(item.title ?? "Untitled", feed.category), source: feed.name, publishedAt: new Date(item.isoDate ?? item.pubDate ?? now).toISOString(), category: feed.category, url: item.link ?? feed.url }));
  }));
  const items = groups.flatMap((group) => group.status === "fulfilled" ? group.value : []);
  if (!items.length) throw new Error("官方 RSS 均未取得新聞");
  return items;
}

async function fetchTwseNews() {
  const raw = JSON.parse(await fetchText(sourceConfig.twseNews.url)) as Record<string, unknown>[];
  return raw.slice(0, 30).map((item): NewsItem => {
    const title = String(item.Title ?? item.title ?? item["標題"] ?? "證交所公告");
    const url = String(item.Url ?? item.url ?? item.Link ?? item["網址"] ?? "https://www.twse.com.tw/zh/about/news/news.html");
    const rawDate = String(item.PublishDate ?? item.Date ?? item["發布日期"] ?? now);
    const parsed = parseTwseDate(rawDate) ?? (Number.isNaN(+new Date(rawDate)) ? now : new Date(rawDate).toISOString());
    return { id: idFor(`${url}${title}`), title, titleZh: title, source: sourceConfig.twseNews.name, publishedAt: parsed, category: sourceConfig.twseNews.category, url };
  });
}

async function updateNews(old: NewsData): Promise<NewsData> {
  const results = await Promise.allSettled([fetchFeedItems(), fetchTwseNews()]);
  const fresh = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!fresh.length) return { ...old, updatedAt: now, status: "fallback" };
  const merged = [...old.items.filter((item) => !item.id.startsWith("sample-")), ...fresh];
  const unique = [...new Map(merged.map((item) => [item.id, item])).values()].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  const selected: NewsItem[] = [];
  const counts = new Map<string, number>();
  for (const item of unique) {
    const cap = item.source === sourceConfig.twseNews.name ? 10 : 6;
    if ((counts.get(item.source) ?? 0) >= cap) continue;
    selected.push(item); counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    if (selected.length === 20) break;
  }
  for (const item of unique) {
    if (selected.length === 20) break;
    if (!selected.some((chosen) => chosen.id === item.id)) selected.push(item);
  }
  selected.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  return { schemaVersion: 1, updatedAt: now, status: results.every((result) => result.status === "fulfilled") ? "ok" : "fallback", items: selected };
}

async function main() {
  const marketFile = path.join(dataDir, "market.json");
  const breadthFile = path.join(dataDir, "breadth.json");
  const newsFile = path.join(dataDir, "news.json");
  const viewpointsFile = path.join(dataDir, "viewpoints.json");
  const reportsFile = path.join(dataDir, "reports.json");
  const [oldMarket, oldBreadth, oldNews, manualBreadth, manualViewpoints, reports] = await Promise.all([
    readJson<MarketData>(marketFile), readJson<BreadthData>(breadthFile), readJson<NewsData>(newsFile),
    readJson<Omit<BreadthData, "schemaVersion" | "status" | "sourceId">>(path.join(root, "content", "manual-breadth.json")),
    readJson<{ knifeGod: ViewpointItem | null; bulls: ViewpointItem[]; bears: ViewpointItem[] }>(path.join(root, "content", "manual-viewpoints.json")),
    readJson<{ schemaVersion: number; updatedAt: string; reports: unknown[] }>(reportsFile),
  ]);
  const breadth: BreadthData = { ...oldBreadth, ...manualBreadth, schemaVersion: 1, status: "fallback", sourceId: "manual-breadth" };
  const [market, news] = await Promise.all([updateMarket(oldMarket), updateNews(oldNews)]);
  market.sources = market.sources.filter((source) => source.id !== "feeds").concat(sourceState(sourceById(oldMarket, "feeds"), "feeds", "官方新聞 RSS / OpenAPI", "https://www.sec.gov/newsroom/press-releases", news.status === "ok", news.updatedAt, `${news.items.length} 則新聞；${news.status === "ok" ? "來源更新正常" : "部分來源降級"}`));
  const viewpoints = buildViewpoints(market, breadth, manualViewpoints);
  const report = { date: now.slice(0, 10), session: market.session, generatedAt: now, temperature: market.temperature, dailyTrend: market.dailyTrend, conclusion: viewpoints.conclusion, verification: null };
  const nextReports = { schemaVersion: 1, updatedAt: now, reports: [report, ...reports.reports].slice(0, 270) };
  await Promise.all([saveJson(marketFile, market), saveJson(breadthFile, breadth), saveJson(newsFile, news), saveJson(viewpointsFile, viewpoints), saveJson(reportsFile, nextReports)]);
  console.log(JSON.stringify({ updatedAt: now, mode: market.mode, metricsOk: market.metrics.filter((item) => item.status === "ok").length, news: news.items.length }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
