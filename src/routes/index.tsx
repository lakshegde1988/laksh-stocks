import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { CandlestickChart } from "@/components/CandlestickChart";
import { getChart, runScan, type ScanRow } from "@/lib/scanner.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Near 52-Week High Scanner" },
      {
        name: "description",
        content:
          "Mobile-first stock scanner finding tickers within 10% of their 52-week high, with interactive candlestick charts.",
      },
    ],
  }),
});

type SortKey = "symbol" | "lastClose" | "high52" | "pctFromHigh";
type SortDir = "asc" | "desc";

function Index() {
  const scanFn = useServerFn(runScan);
  const chartFn = useServerFn(getChart);

  const scanQuery = useQuery({
    queryKey: ["scan"],
    queryFn: () => scanFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("pctFromHigh");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [mobileView, setMobileView] = useState<"list" | "chart">("list");

  const rows = scanQuery.data?.rows ?? [];

  useEffect(() => {
    if (!selected && rows.length > 0) setSelected(rows[0].symbol);
  }, [rows, selected]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number")
        return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const chartQuery = useQuery({
    queryKey: ["chart", selected],
    queryFn: () => chartFn({ data: { symbol: selected! } }),
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "asc");
    }
  };

  const selectedRow = rows.find((r) => r.symbol === selected);
  const selectedIndex = selected ? sortedRows.findIndex((r) => r.symbol === selected) : -1;

  const goTo = (offset: number) => {
    if (sortedRows.length === 0) return;
    const base = selectedIndex >= 0 ? selectedIndex : 0;
    const next = (base + offset + sortedRows.length) % sortedRows.length;
    setSelected(sortedRows[next].symbol);
    setMobileView("chart");
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight truncate">
                52-Week High Scanner
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                Stocks within 10% of their yearly high
              </p>
            </div>
          </div>
          <button
            onClick={() => scanQuery.refetch()}
            disabled={scanQuery.isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2.5 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", scanQuery.isFetching && "animate-spin")}
            />
            <span className="hidden sm:inline">Rescan</span>
          </button>
        </div>

        {/* Mobile tabs */}
        <div className="flex border-t border-border/60 lg:hidden">
          {(["list", "chart"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setMobileView(v)}
              className={cn(
                "flex-1 py-2 text-xs font-medium uppercase tracking-wide transition",
                mobileView === v
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground border-b-2 border-transparent",
              )}
            >
              {v === "list" ? `Results${rows.length ? ` (${rows.length})` : ""}` : "Chart"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row lg:overflow-hidden">
        {/* Results panel */}
        <section
          className={cn(
            "flex-col border-border/60 lg:flex lg:w-[420px] lg:border-r lg:min-h-0 lg:overflow-hidden",
            mobileView === "list" ? "flex flex-1 min-h-0" : "hidden lg:flex",
          )}
        >
          <div className="hidden lg:flex items-center justify-between px-4 py-2 border-b border-border/60">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Results {rows.length > 0 && `(${rows.length})`}
            </span>
            {scanQuery.data?.cached && (
              <span className="text-[10px] text-muted-foreground">cached</span>
            )}
          </div>

          {scanQuery.isLoading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p>Scanning ~2,500 symbols…</p>
              <p className="text-xs">First load can take a minute.</p>
            </div>
          )}

          {scanQuery.isError && (
            <div className="px-4 py-8 text-sm text-destructive">
              Failed to run scan. Try again.
            </div>
          )}

          {!scanQuery.isLoading && rows.length === 0 && !scanQuery.isError && (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              No stocks within 10% of their 52-week high right now.
            </div>
          )}

          {rows.length > 0 && (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <Th label="Symbol" k="symbol" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <Th label="Last" k="lastClose" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                    <Th label="52W High" k="high52" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                    <Th label="% Off" k="pctFromHigh" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const active = row.symbol === selected;
                    return (
                      <tr
                        key={row.symbol}
                        onClick={() => {
                          setSelected(row.symbol);
                          setMobileView("chart");
                        }}
                        className={cn(
                          "cursor-pointer border-b border-border/40 transition-colors",
                          active
                            ? "bg-primary/10 text-foreground"
                            : "hover:bg-secondary/40",
                        )}
                      >
                        <td className="px-3 py-2.5 font-medium">{row.symbol}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {fmt(row.lastClose)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {fmt(row.high52)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums font-medium",
                            row.pctFromHigh < 3
                              ? "text-emerald-400"
                              : row.pctFromHigh < 7
                                ? "text-amber-400"
                                : "text-orange-400",
                          )}
                        >
                          {row.pctFromHigh.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Chart panel */}
        <section
          className={cn(
            "flex-1 min-h-0 flex-col",
            mobileView === "chart" ? "flex" : "hidden lg:flex",
          )}
        >
          <ChartHeader row={selectedRow} symbol={selected} />
          <div className="relative flex-1 min-h-0 px-2 pb-2 lg:px-4 lg:pb-4">
            {scanQuery.isLoading && !selected && (
              <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 text-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>Loading first chart…</span>
                </div>
              </div>
            )}
            {chartQuery.isLoading && (
              <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            {chartQuery.data && selected && (
              <CandlestickChart candles={chartQuery.data.candles} symbol={selected} />
            )}
            {!selected && !scanQuery.isLoading && (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                Select a stock to view its chart.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Fixed footer pagination */}
      <footer className="shrink-0 border-t border-border/60 bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 py-2 lg:px-6">
          <button
            onClick={() => goTo(-1)}
            disabled={sortedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Prev</span>
          </button>
          <div className="text-[11px] tabular-nums text-muted-foreground truncate">
            {sortedRows.length > 0 && selectedIndex >= 0 ? (
              <>
                <span className="font-medium text-foreground">{selectedIndex + 1}</span>
                <span> / {sortedRows.length}</span>
                {selected && <span className="ml-2 text-foreground">{selected}</span>}
              </>
            ) : (
              <span>No selection</span>
            )}
          </div>
          <button
            onClick={() => goTo(1)}
            disabled={sortedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </main>
  );
}

function Th({
  label,
  k,
  sortKey,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium select-none cursor-pointer hover:text-foreground",
        align === "right" && "text-right",
      )}
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </span>
    </th>
  );
}

function ChartHeader({ row, symbol }: { row?: ScanRow; symbol: string | null }) {
  if (!symbol) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border/60 px-4 py-3">
      <h2 className="text-lg font-semibold tracking-tight">{symbol}</h2>
      {row && (
        <>
          <span className="text-sm tabular-nums">
            <span className="text-muted-foreground">Last </span>
            {fmt(row.lastClose)}
          </span>
          <span className="text-sm tabular-nums">
            <span className="text-muted-foreground">52W High </span>
            {fmt(row.high52)}
          </span>
          <span className="text-sm tabular-nums text-emerald-400">
            -{row.pctFromHigh.toFixed(2)}% off high
          </span>
        </>
      )}
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
