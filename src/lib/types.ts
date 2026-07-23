export type Direction = "bull" | "bear" | "mixed";
export type DataStatus = "ok" | "stale" | "fallback" | "sample" | "error";
export type Lamp = "green" | "yellow" | "orange" | "red";

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  status: DataStatus;
  asOf: string;
  lastAttempt: string;
  message?: string;
}

export interface Metric {
  id: string;
  name: string;
  symbol: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  unit: string;
  direction: Direction;
  asOf: string;
  sourceId: string;
  status: DataStatus;
}

export interface MarketData {
  schemaVersion: number;
  mode: "sample" | "live" | "partial";
  updatedAt: string;
  timezone: "Asia/Taipei";
  session: "morning" | "noon" | "night" | "manual";
  dailyTrend: Direction;
  hourlyTrend: Direction;
  temperature: { score: number; label: string; lamp: Lamp };
  metrics: Metric[];
  sources: SourceInfo[];
}

export interface BreadthData {
  schemaVersion: number;
  updatedAt: string;
  status: DataStatus;
  advanceDeclineRatio: number | null;
  percentAbove20d: number | null;
  percentAbove50d: number | null;
  newHighLowRatio: number | null;
  sourceId: string;
  note: string;
}

export interface NewsItem {
  id: string;
  title: string;
  titleZh: string;
  source: string;
  publishedAt: string;
  category: string;
  url: string;
}

export interface NewsData {
  schemaVersion: number;
  updatedAt: string;
  status: DataStatus;
  items: NewsItem[];
}

export interface ViewpointItem {
  author: string;
  stance: "bull" | "bear" | "neutral";
  summary: string;
  publishedAt: string;
  sourceUrl: string;
  verification: "public-link" | "manual" | "unavailable";
}

export interface RiskSignal {
  id: string;
  name: string;
  lamp: Lamp;
  value: string;
  reason: string;
}

export interface ViewpointsData {
  schemaVersion: number;
  updatedAt: string;
  marketFacts: string[];
  knifeGod: ViewpointItem | null;
  bulls: ViewpointItem[];
  bears: ViewpointItem[];
  conclusion: string;
  scenarios: { oneWeek: string; oneMonth: string; threeMonths: string };
  risks: RiskSignal[];
  doNotDo: string[];
  disclaimer: string;
}
