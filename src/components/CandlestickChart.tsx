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
    const map = new Map<string, { time: string; open: number; high: number; low: number; close: number }>();
    for (const c of candles) {
      const d = new Date(c.time * 1000);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      map.set(day, { time: day, open: c.open, high: c.high, low: c.low, close: c.close });
    }
    const data = Array.from(map.values()).sort((a, b) => (a.time < b.time ? -1 : 1));
    seriesRef.current.setData(data as never);
    chartRef.current.timeScale().fitContent();
  }, [candles, symbol]);

  return <div ref={containerRef} className="h-full w-full" />;
}
