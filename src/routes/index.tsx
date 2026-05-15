import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { CandlestickChart } from "@/components/CandlestickChart";
import { Sparkline } from "@/components/Sparkline";
import { getChart, runScan, type ScanRow } from "@/lib/scanner.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "52W High Scanner" },
      {
        name: "description",
        content:
          "Mobile-first scanner for stocks trading near their 52-week highs, with a clean dark UI and instant charts.",
      },
    ],
  }),
});

type SortKey = "pctFromHigh" | "symbol" | "lastClose";
type SortDir = "asc" | "desc";
type FilterKey = "all" | "strong" | "near" | "watch";
type ChartRange = "3mo" | "6mo" | "1y" | "2y" | "5y";

const RANGES: { key: ChartRange; label: string }[] = [
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "5y", label: "5Y" },
];

const SORT_LABELS: Record<SortKey, string> = {
  pctFromHigh: "% Away",
  symbol: "Symbol",
  lastClose: "Price",
};

const FILTERS: { key: FilterKey; label: string; test: (r: ScanRow) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "strong", label: "Strong (0–3%)", test: (r) => r.pctFromHigh < 3 },
  { key: "near", label: "Near (3–6%)", test: (r) => r.pctFromHigh >= 3 && r.pctFromHigh < 6 },
  { key: "watch", label: "Watch (6–10%)", test: (r) => r.pctFromHigh >= 6 },
];

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
  const [range, setRange] = useState<ChartRange>("1y");
  const [sortKey, setSortKey] = useState<SortKey>("pctFromHigh");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const rows = scanQuery.data?.rows ?? [];

  const filteredRows = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter)?.test ?? (() => true);
    return rows.filter(test);
  }, [rows, filter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
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
  }, [filteredRows, sortKey, sortDir]);

  const chartQuery = useQuery({
    queryKey: ["chart", selected, range],
    queryFn: () => chartFn({ data: { symbol: selected!, range } }),
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const selectedRow = rows.find((r) => r.symbol === selected) ?? null;

  return (
    <main className="min-h-screen text-foreground">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight leading-tight truncate">
                52W High Scanner
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">
                Stocks near their yearly highs
              </p>
            </div>
          </div>
          <button
            onClick={() => scanQuery.refetch()}
            disabled={scanQuery.isFetching}
            aria-label="Refresh scan"
            className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground transition hover:text-foreground hover:bg-card disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", scanQuery.isFetching && "animate-spin")} />
          </button>
        </div>

        {/* Filter + Sort pills */}
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 pb-3">
          <PillMenu
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            label={FILTERS.find((f) => f.key === filter)?.label ?? "Filter"}
            open={filterOpen}
            setOpen={(v) => {
              setFilterOpen(v);
              if (v) setSortOpen(false);
            }}
          >
            {FILTERS.map((f) => (
              <MenuItem
                key={f.key}
                active={filter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  setFilterOpen(false);
                }}
              >
                {f.label}
              </MenuItem>
            ))}
          </PillMenu>

          <PillMenu
            icon={<ArrowDownUp className="h-3.5 w-3.5" />}
            label={`${SORT_LABELS[sortKey]} ${sortDir === "asc" ? "↑" : "↓"}`}
            open={sortOpen}
            setOpen={(v) => {
              setSortOpen(v);
              if (v) setFilterOpen(false);
            }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <MenuItem
                key={k}
                active={sortKey === k}
                onClick={() => {
                  if (sortKey === k) {
                    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                  } else {
                    setSortKey(k);
                    setSortDir(k === "symbol" ? "asc" : "asc");
                  }
                  setSortOpen(false);
                }}
              >
                {SORT_LABELS[k]}
              </MenuItem>
            ))}
          </PillMenu>

          <div className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {scanQuery.isLoading ? "Scanning…" : `${sortedRows.length} results`}
          </div>
        </div>
      </header>

      {/* Card list */}
      <div className="mx-auto max-w-2xl px-4 py-4 pb-10">
        {scanQuery.isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p>Scanning the market…</p>
            <p className="text-xs">First load can take a moment.</p>
          </div>
        )}

        {scanQuery.isError && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            Failed to run scan. Pull down to retry.
          </div>
        )}

        {!scanQuery.isLoading && rows.length === 0 && !scanQuery.isError && (
          <div className="rounded-2xl border border-border/50 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
            No stocks within 10% of their 52-week high right now.
          </div>
        )}

        {sortedRows.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {sortedRows.map((row) => (
              <StockCard
                key={row.symbol}
                row={row}
                onClick={() => setSelected(row.symbol)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Chart sheet */}
      <ChartSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        row={selectedRow}
        symbol={selected}
        loading={chartQuery.isLoading}
        candles={chartQuery.data?.candles ?? null}
        onPrev={() => {
          if (!selected || sortedRows.length === 0) return;
          const i = sortedRows.findIndex((r) => r.symbol === selected);
          const next = sortedRows[(i - 1 + sortedRows.length) % sortedRows.length];
          setSelected(next.symbol);
        }}
        onNext={() => {
          if (!selected || sortedRows.length === 0) return;
          const i = sortedRows.findIndex((r) => r.symbol === selected);
          const next = sortedRows[(i + 1) % sortedRows.length];
          setSelected(next.symbol);
        }}
        position={
          selected
            ? sortedRows.findIndex((r) => r.symbol === selected) + 1
            : 0
        }
        total={sortedRows.length}
        range={range}
        onRangeChange={setRange}
      />

    </main>
  );
}

function StockCard({ row, onClick }: { row: ScanRow; onClick: () => void }) {
  const tone = pctTone(row.pctFromHigh);
  return (
    <li>
      <button
        onClick={onClick}
        className="group w-full rounded-2xl border border-border/50 bg-card/70 p-4 text-left shadow-[var(--shadow-card)] backdrop-blur-sm transition active:scale-[0.985] hover:border-border hover:bg-card"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-tight">
              {row.symbol}
            </div>
            <div className="mt-0.5 text-sm tabular-nums text-foreground/90">
              {fmt(row.lastClose)}
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              52W High · {fmt(row.high52)}
            </div>
          </div>

          <div className={cn("shrink-0", tone.spark)}>
            <Sparkline data={row.spark} width={72} height={36} />
          </div>

          <div
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums text-white shadow-md"
            style={{ background: tone.gradient }}
          >
            -{row.pctFromHigh.toFixed(2)}%
          </div>
        </div>
      </button>
    </li>
  );
}

function pctTone(pct: number) {
  if (pct < 3)
    return {
      gradient: "var(--gradient-good)",
      spark: "text-emerald-400",
    };
  if (pct < 6)
    return {
      gradient: "var(--gradient-warn)",
      spark: "text-amber-400",
    };
  return {
    gradient: "var(--gradient-bad)",
    spark: "text-rose-400/80",
  };
}

function PillMenu({
  icon,
  label,
  open,
  setOpen,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
          open
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border/60 bg-card/60 text-foreground/80 hover:bg-card hover:text-foreground",
        )}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[180px] overflow-hidden rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
        active ? "bg-primary/15 text-primary" : "text-foreground/85 hover:bg-secondary/60",
      )}
    >
      <span>{children}</span>
      {active && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function ChartSheet({
  open,
  onClose,
  row,
  symbol,
  loading,
  candles,
  onPrev,
  onNext,
  position,
  total,
  range,
  onRangeChange,
}: {
  open: boolean;
  onClose: () => void;
  row: ScanRow | null;
  symbol: string | null;
  loading: boolean;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[] | null;
  onPrev: () => void;
  onNext: () => void;
  position: number;
  total: number;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
}) {
  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !symbol) return null;
  const tone = row ? pctTone(row.pctFromHigh) : null;
  const disabled = total <= 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-in fade-in duration-150">
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
        <button
          onClick={onClose}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-tight">{symbol}</div>
          {row && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
              <span>{fmt(row.lastClose)}</span>
              <span>·</span>
              <span>52W {fmt(row.high52)}</span>
            </div>
          )}
        </div>
        {row && tone && (
          <div
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-md tabular-nums"
            style={{ background: tone.gradient }}
          >
            -{row.pctFromHigh.toFixed(2)}%
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2 overflow-x-auto">
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold tabular-nums transition",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 bg-card/60 text-foreground/75 hover:bg-card hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {range === "2y" || range === "5y" ? "Weekly" : "Daily"}
        </span>
      </div>
      <div className="relative flex-1 px-2 pt-2">
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {candles && <CandlestickChart candles={candles} symbol={symbol} />}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/50 bg-background/80 px-4 py-3 backdrop-blur">
        <button
          onClick={onPrev}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-4 py-2 text-xs font-medium text-foreground/85 transition hover:bg-card hover:text-foreground disabled:opacity-40"
          aria-label="Previous stock"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <div className="text-[11px] tabular-nums text-muted-foreground">
          {position} / {total}
        </div>
        <button
          onClick={onNext}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-4 py-2 text-xs font-medium text-foreground/85 transition hover:bg-card hover:text-foreground disabled:opacity-40"
          aria-label="Next stock"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
