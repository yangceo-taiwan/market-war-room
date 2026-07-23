export function formatNumber(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatChange(value: number | null, suffix = "") {
  if (value === null || Number.isNaN(value)) return "資料暫缺";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

export function formatTaipei(value: string) {
  if (!value) return "時間未提供";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export const directionText = { bull: "偏多", bear: "偏空", mixed: "震盪" } as const;
export const lampText = { green: "綠燈", yellow: "黃燈", orange: "橘燈", red: "紅燈" } as const;
