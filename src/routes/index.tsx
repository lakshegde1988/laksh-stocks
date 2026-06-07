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
  Rocket,
  RefreshCw,
  Sparkles,
  Layers,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { CandlestickChart } from "@/components/CandlestickChart";
import { Sparkline } from "@/components/Sparkline";
import { getChart, runScan, type ScanRow, type Universe } from "@/lib/scanner.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "52W High Scanner" },
      {
        name: "description",
        content:
          "Pick a stock universe — Nifty 500, Microcap 250 or Recent IPOs — and scan for stocks trading near their 52-week highs.",
      },
    ],
  }),
});

type SortKey = "pctFromHigh" | "symbol" | "lastClose";
type SortDir = "asc" | "desc";
type FilterKey = "all" | "strong" | "near" | "watch";

const SORT_LABELS: Record<SortKey, string> = {
  pctFromHigh: "% Away",
  symbol: "Symbol",
  lastClose: "Price",
};

const UNIVERSES: {
  key: Universe;
  label: string;
  tagline: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "nifty500",
    label: "Nifty 500",
    tagline: "India's 500 largest listed companies",
    icon: <Layers className="h-5 w-5" />,
  },
  {
    key: "microcaps",
    label: "Microcap 250",
    tagline: "Smaller, high-growth potential names",
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    key: "ipo",
    label: "Recent IPOs",
    tagline: "Freshly listed companies",
    icon: <Rocket className="h-5 w-5" />,
  },
];

const FILTERS: { key: FilterKey; label: string; test: (r: ScanRow) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "strong", label: "Strong (0–3%)", test: (r) => r.pctFromHigh < 3 },
  { key: "near", label: "Near (3–6%)", test: (r) => r.pctFromHigh >= 3 && r.pctFromHigh < 6 },
  { key: "watch", label: "Watch (6–10%)", test: (r) => r.pctFromHigh >= 6 },
];

function Index() {
  const scanFn = useServerFn(runScan);
  const chartFn = useServerFn(getChart);

  // null = show the selection form; set = run the scan
  const [universe, setUniverse] = useState<Universe | null>(null);

  const scanQuery = useQuery({
    queryKey: ["scan", universe],
    queryFn: () => scanFn({ data: { universe: universe! } }),
    enabled: !!universe,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [selected, setSelected] = useState<string | null>(null);
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
    queryKey: ["chart", selected],
    queryFn: () => chartFn({ data: { symbol: selected! } }),
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const selectedRow = rows.find((r) => r.symbol === selected) ?? null;
  const activeUniverse = UNIVERSES.find((u) => u.key === universe);

  // ---- Selection form (homepage) ----
  if (!universe) {
    return <UniverseForm onPick={(u) => setUniverse(u)} />;
  }

  return (
    <main className="min-h-screen text-foreground">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => {
                setUniverse(null);
                setSelected(null);
              }}
              aria-label="Change universe"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20 transition hover:bg-primary/25"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight leading-tight truncate">
                {activeUniverse?.label ?? "Scanner"}
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
            <p>Scanning {activeUniverse?.label}…</p>
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
      />
    </main>
  );
}

function UniverseForm({ onPick }: { onPick: (u: Universe) => void }) {
  const [choice, setChoice] = useState<Universe | null>(null);

  return (
    <main className="relative min-h-screen overflow-hidden text-foreground">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
            52W High Scanner
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Choose a stock universe to scan for names trading near their 52-week highs.
          </p>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Select universe
          </legend>
          {UNIVERSES.map((u) => {
            const active = choice === u.key;
            return (
              <button
                key={u.key}
                type="button"
                onClick={() => setChoice(u.key)}
                className={cn(
                  "group flex items-center gap-3.5 rounded-2xl border p-4 text-left transition active:scale-[0.99]",
                  active
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/50 bg-card/60 hover:border-border hover:bg-card",
                )}
              >
                <div
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition",
                    active
                      ? "bg-primary/20 text-primary"
                      : "bg-secondary/60 text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {u.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold tracking-tight">{u.label}</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">{u.tagline}</div>
                </div>
                <div
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                </div>
              </button>
            );
          })}
        </fieldset>

        <button
          type="button"
          disabled={!choice}
          onClick={() => choice && onPick(choice)}
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100"
        >
          <TrendingUp className="h-4 w-4" />
          Run Scan
        </button>
      </div>
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
      <div className="relative flex-1 px-2 pt-2">
        {/* In-chart info overlay */}
        <div className="absolute left-4 top-3 z-10 flex items-start justify-between gap-3 pr-4 w-[calc(100%-2rem)]">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              aria-label="Back"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground pointer-events-auto"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold tracking-tight">{symbol}</div>
              {row && (
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                  <span>{fmt(row.lastClose)}</span>
                  <span>·</span>
                  <span>52W {fmt(row.high52)}</span>
                </div>
              )}
            </div>
          </div>
          {row && tone && (
            <div
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-md tabular-nums"
              style={{ background: tone.gradient }}
            >
              -{row.pctFromHigh.toFixed(2)}%
            </div>
          )}
        </div>
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {candles && <CandlestickChart candles={candles} symbol={symbol} />}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/50 bg-background/80 px-4 py-1.5 backdrop-blur">
        <button
          onClick={onPrev}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-foreground/85 transition hover:bg-card hover:text-foreground disabled:opacity-40"
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
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-foreground/85 transition hover:bg-card hover:text-foreground disabled:opacity-40"
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
