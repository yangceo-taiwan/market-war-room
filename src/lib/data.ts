import market from "../../public/data/market.json";
import breadth from "../../public/data/breadth.json";
import news from "../../public/data/news.json";
import viewpoints from "../../public/data/viewpoints.json";
import reports from "../../public/data/reports.json";
import type { BreadthData, MarketData, NewsData, ViewpointsData } from "./types";

export const data = {
  market: market as MarketData,
  breadth: breadth as BreadthData,
  news: news as NewsData,
  viewpoints: viewpoints as ViewpointsData,
  reports,
};

export function metric(id: string) {
  return data.market.metrics.find((item) => item.id === id);
}

export function basePath(path = "/") {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL.slice(0, -1)
    : import.meta.env.BASE_URL;
  return `${base}${path.startsWith("/") ? path : `/${path}`}` || "/";
}
