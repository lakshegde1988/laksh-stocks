import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { Candle } from "@/lib/scanner.functions";

interface Props {
  candles: Candle[];
  symbol: string;
}

// Pivot level definitions: key, label, color.
const PIVOT_LEVELS = [
  { key: "r3", label: "R3", color: "#f87171" },
  { key: "r2", label: "R2", color: "#fb923c" },
  { key: "r1", label: "R1", color: "#fbbf24" },
  { key: "p", label: "P", color: "#60a5fa" },
  { key: "s1", label: "S1", color: "#4ade80" },
  { key: "s2", label: "S2", color: "#34d399" },
  { key: "s3", label: "S3", color: "#22d3ee" },
] as const;

type PivotKey = (typeof PIVOT_LEVELS)[number]["key"];

export function CandlestickChart({ candles, symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const pivotSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#cbd5e1",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
    rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
    timeScale: {
      borderColor: "rgba(148,163,184,0.15)",
      timeVisible: false,
      rightOffset: 5,
      barSpacing: 8,
      minBarSpacing: 4,
    },
      crosshair: { mode: 1 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const pivotSeries: Record<string, ISeriesApi<"Line">> = {};
    for (const lvl of PIVOT_LEVELS) {
      pivotSeries[lvl.key] = chart.addSeries(LineSeries, {
        color: lvl.color,
        lineWidth: 1,
        lineStyle: lvl.key === "p" ? LineStyle.Solid : LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: lvl.label,
      });
    }
    pivotSeriesRef.current = pivotSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      pivotSeriesRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    // Convert to business-day strings and dedupe so lightweight-charts gets
    // strictly ascending, unique daily bars regardless of intraday timestamps.
    type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number };
    const map = new Map<string, Bar>();
    for (const c of candles) {
      const d = new Date(c.time * 1000);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      map.set(day, { time: day, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 });
    }
    const sorted = Array.from(map.values()).sort((a, b) => (a.time < b.time ? -1 : 1));

    // High-volume highlight: volume >= 2x of 20-period SMA (prior 20 bars).
    const PERIOD = 20;
    const MULT = 2;
    const HV_UP = "#ffd400"; // vivid yellow
    const HV_DOWN = "#ff4fa3"; // pink
    const data = sorted.map((b, i) => {
      const start = Math.max(0, i - PERIOD);
      const slice = sorted.slice(start, i);
      const avg = slice.length ? slice.reduce((s, x) => s + x.volume, 0) / slice.length : 0;
      const isHV = avg > 0 && b.volume >= MULT * avg;
      const isUp = b.close > b.open;
      if (isHV) {
        const color = isUp ? HV_UP : HV_DOWN;
        return {
          time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
          color, borderColor: color, wickColor: color,
        };
      }
      return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
    });
    seriesRef.current.setData(data as never);

    // ---- Monthly pivot points ----
    // Aggregate daily bars into months, computing each month's H/L/C.
    type MonthAgg = { ym: string; high: number; low: number; close: number };
    const monthsMap = new Map<string, MonthAgg>();
    const monthOrder: string[] = [];
    for (const b of sorted) {
      const ym = b.time.slice(0, 7); // YYYY-MM
      const agg = monthsMap.get(ym);
      if (!agg) {
        monthsMap.set(ym, { ym, high: b.high, low: b.low, close: b.close });
        monthOrder.push(ym);
      } else {
        agg.high = Math.max(agg.high, b.high);
        agg.low = Math.min(agg.low, b.low);
        agg.close = b.close; // last close of the month
      }
    }

    // Pivots for month N come from month N-1's HLC.
    const pivotByMonth = new Map<string, Record<PivotKey, number>>();
    for (let i = 1; i < monthOrder.length; i++) {
      const prev = monthsMap.get(monthOrder[i - 1])!;
      const p = (prev.high + prev.low + prev.close) / 3;
      const range = prev.high - prev.low;
      pivotByMonth.set(monthOrder[i], {
        p,
        r1: 2 * p - prev.low,
        s1: 2 * p - prev.high,
        r2: p + range,
        s2: p - range,
        r3: prev.high + 2 * (p - prev.low),
        s3: prev.low - 2 * (prev.high - p),
      });
    }

    // Build per-day stepped lines so each month shows its own pivot levels.
    const lineData: Record<PivotKey, { time: string; value: number }[]> = {
      p: [], r1: [], r2: [], r3: [], s1: [], s2: [], s3: [],
    };
    for (const b of sorted) {
      const ym = b.time.slice(0, 7);
      const pivots = pivotByMonth.get(ym);
      if (!pivots) continue;
      for (const lvl of PIVOT_LEVELS) {
        lineData[lvl.key].push({ time: b.time, value: pivots[lvl.key] });
      }
    }
    for (const lvl of PIVOT_LEVELS) {
      const s = pivotSeriesRef.current[lvl.key];
      if (s) s.setData(lineData[lvl.key] as never);
    }

    chartRef.current.timeScale().fitContent();
  }, [candles, symbol]);

  return <div ref={containerRef} className="h-full w-full" />;
}
