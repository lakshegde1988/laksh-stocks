import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { Candle } from "@/lib/scanner.functions";

interface Props {
  candles: Candle[];
  symbol: string;
}

export function CandlestickChart({ candles, symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
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
    const HV_UP = "#00e5ff"; // bright cyan
    const HV_DOWN = "#ffd400"; // vivid yellow
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
    chartRef.current.timeScale().fitContent();
  }, [candles, symbol]);

  return <div ref={containerRef} className="h-full w-full" />;
}
