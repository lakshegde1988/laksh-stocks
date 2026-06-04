import { createServerFn } from "@tanstack/react-start";
import symbolsData from "@/data/symbols.json";

export type ScanRow = {
  symbol: string;
  name?: string;
  lastClose: number;
  high52: number;
  pctFromHigh: number;
  spark: number[];
};

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type CacheEntry<T> = { at: number; data: T; version: number };
const CACHE_VERSION = 4;
const SCAN_TTL = 10 * 60 * 1000; // 10 min
const CHART_TTL = 5 * 60 * 1000;

const scanCache: { current?: CacheEntry<ScanRow[]> } = {};
const chartCache = new Map<string, CacheEntry<Candle[]>>();

async function fetchSymbols(): Promise<string[]> {
  const raw = symbolsData as unknown[];
  const syms: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") syms.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const s = o.symbol ?? o.Symbol ?? o.ticker ?? o.code;
      if (typeof s === "string") syms.push(s);
    }
  }
  return Array.from(new Set(syms.filter(Boolean)));
}

// NSE symbols from the source list need a `.NS` suffix for Yahoo Finance.
function toYahooSymbol(sym: string): string {
  if (sym.includes(".")) return sym;
  return `${sym}.NS`;
}

async function fetchYahooChart(
  symbol: string,
  range = "1y",
  interval = "1d",
): Promise<Candle[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=${interval}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const opens = q.open ?? [];
    const highs = q.high ?? [];
    const lows = q.low ?? [];
    const closes = q.close ?? [];
    const vols = q.volume ?? [];
    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = opens[i],
        h = highs[i],
        l = lows[i],
        c = closes[i],
        v = vols[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: v ?? 0 });
    }
    return candles;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export const runScan = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  if (
    scanCache.current &&
    scanCache.current.version === CACHE_VERSION &&
    scanCache.current.data.length > 0 &&
    now - scanCache.current.at < SCAN_TTL
  ) {
    return { rows: scanCache.current.data, cached: true };
  }

  const symbols = await fetchSymbols();

  const rows: ScanRow[] = [];
  await mapWithConcurrency(symbols, 20, async (sym) => {
    const yahooSym = toYahooSymbol(sym);
    const candles = await fetchYahooChart(yahooSym, "1y", "1d");
    if (!candles || candles.length < 5) return;
    let high = -Infinity;
    for (const c of candles) if (c.high > high) high = c.high;
    const last = candles[candles.length - 1].close;
    if (!isFinite(high) || !isFinite(last) || high <= 0) return;
    const pct = ((high - last) / high) * 100;
    if (pct >= 0 && pct <= 10) {
      const tail = candles.slice(-40).map((c) => c.close);
      rows.push({ symbol: sym, lastClose: last, high52: high, pctFromHigh: pct, spark: tail });
      chartCache.set(sym, { at: now, data: candles, version: CACHE_VERSION });
    }
  });

  rows.sort((a, b) => a.pctFromHigh - b.pctFromHigh);
  if (rows.length > 0) scanCache.current = { at: now, data: rows, version: CACHE_VERSION };
  return { rows, cached: false };
});

export const getChart = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string }) => {
    if (!d?.symbol || typeof d.symbol !== "string") throw new Error("symbol required");
    return { symbol: d.symbol };
  })
  .handler(async ({ data }) => {
    const now = Date.now();
    const cached = chartCache.get(data.symbol);
    if (cached && cached.version === CACHE_VERSION && cached.data.length > 0 && now - cached.at < CHART_TTL) {
      return { candles: cached.data };
    }
    const candles = await fetchYahooChart(toYahooSymbol(data.symbol), "1y", "1d");
    if (!candles) throw new Error("Failed to load chart");
    chartCache.set(data.symbol, { at: now, data: candles, version: CACHE_VERSION });
    return { candles };
  });
