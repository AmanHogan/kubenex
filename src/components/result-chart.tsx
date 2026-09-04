"use client";

import { useMemo, useState } from "react";
import { LuChartBar, LuChartLine, LuChartArea } from "react-icons/lu";
import { cn } from "@/lib/utils";

/**
 * Chart view for a SQL result set.
 *
 * Hand-rolled SVG rather than a charting dependency: the shapes needed here are
 * simple, and it keeps full control of the mark specs (thin marks, 2px lines,
 * rounded data-ends, recessive grid) without pulling in a library.
 *
 * Deliberate constraints:
 *   - One value axis. Two measures of different scale get two charts, never a
 *     second y-scale.
 *   - Series colors are assigned in fixed order and never cycled; past the
 *     eighth series the extras are dropped rather than given generated hues.
 *   - Text uses text tokens, never the series colour; the mark beside a label
 *     carries identity.
 */

export type ChartKind = "bar" | "line" | "area";

/** Fixed slot order. A ninth series is never given a generated hue. */
const MAX_SERIES = 8;
const SERIES_VARS = Array.from({ length: MAX_SERIES }, (_, i) => `var(--viz-${i + 1})`);

const KINDS: { id: ChartKind; label: string; icon: typeof LuChartBar }[] = [
  { id: "bar", label: "Bar", icon: LuChartBar },
  { id: "line", label: "Line", icon: LuChartLine },
  { id: "area", label: "Area", icon: LuChartArea },
];

interface Props {
  columns: string[];
  rows: Record<string, string | null>[];
}

/** A column counts as numeric when every non-null value parses as a number. */
function numericColumns(columns: string[], rows: Record<string, string | null>[]): string[] {
  return columns.filter((c) => {
    const values = rows.map((r) => r[c]).filter((v) => v !== null && v !== "");
    if (values.length === 0) return false;
    return values.every((v) => Number.isFinite(Number(v)));
  });
}

/** Axis ticks at a round step covering [0, max]. */
function ticksFor(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) out.push(v);
  return out;
}

function formatValue(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function ResultChart({ columns, rows }: Props): React.JSX.Element {
  const numeric = useMemo(() => numericColumns(columns, rows), [columns, rows]);
  const categorical = useMemo(
    () => columns.filter((c) => !numeric.includes(c)),
    [columns, numeric]
  );

  const [kind, setKind] = useState<ChartKind>("bar");
  const [xCol, setXCol] = useState<string>(categorical[0] ?? columns[0] ?? "");
  const [yCols, setYCols] = useState<string[]>(numeric.slice(0, 1));
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  if (numeric.length === 0) {
    return (
      <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-10 text-center">
        <LuChartBar className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Nothing to plot</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          This result has no numeric columns.
        </p>
      </div>
    );
  }

  const series = yCols.slice(0, MAX_SERIES);
  const data = rows.slice(0, 100);
  const labels = data.map((r) => String(r[xCol] ?? ""));

  const maxValue = Math.max(
    0,
    ...data.flatMap((r) => series.map((c) => Number(r[c] ?? 0) || 0))
  );
  const ticks = ticksFor(maxValue);
  const axisMax = ticks[ticks.length - 1] || 1;

  // A second y-axis is never the answer to mismatched scales, so when one
  // series would flatten another into the baseline, say so and let the reader
  // split them rather than silently rendering an unreadable chart.
  const seriesMax = series.map((c) =>
    Math.max(0, ...data.map((r) => Number(r[c] ?? 0) || 0))
  );
  const largest = Math.max(...seriesMax, 0);
  const smallest = Math.min(...seriesMax.filter((v) => v > 0), largest);
  const scaleMismatch =
    series.length > 1 && smallest > 0 && largest / smallest >= 20;

  // Geometry. A fixed viewBox keeps the SVG responsive without measuring.
  const W = 720;
  const H = 260;
  const padL = 52;
  const padR = 16;
  const padT = 12;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xFor = (i: number): number =>
    data.length === 1 ? padL + plotW / 2 : padL + (i * plotW) / (data.length - 1);
  const yFor = (v: number): number => padT + plotH - (v / axisMax) * plotH;

  const bandW = plotW / Math.max(data.length, 1);
  // Thin marks: a handful of categories should not produce slab-wide bars, so
  // the band-derived width is capped. The -2 leaves a surface gap between
  // adjacent bars in a group.
  const MAX_BAR = 48;
  const barW = Math.min(
    MAX_BAR,
    Math.max(3, (bandW / Math.max(series.length, 1)) * 0.7 - 2)
  );

  function toggleY(col: string): void {
    setYCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col].slice(0, MAX_SERIES)
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls — one row above the chart. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {KINDS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setKind(id)}
              title={label}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                kind === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          X
          <select
            value={xCol}
            onChange={(e) => setXCol(e.target.value)}
            className="rounded-lg border-2 border-border/60 bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {columns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Y</span>
          {numeric.map((c) => {
            const on = series.includes(c);
            const slot = series.indexOf(c);
            return (
              <button
                key={c}
                onClick={() => toggleY(c)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors",
                  on ? "bg-muted text-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: on ? SERIES_VARS[slot] : "currentColor", opacity: on ? 1 : 0.4 }}
                />
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {scaleMismatch && (
        <p className="rounded-lg border-2 border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          These series differ in scale by more than 20×, so the smaller one is
          flattened against the baseline. Plot them one at a time — a second
          value axis would make the two look comparable when they are not.
        </p>
      )}

      {series.length === 0 ? (
        <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-10 text-center text-xs text-muted-foreground">
          Pick at least one numeric column to plot.
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border-2 border-border/60 bg-card p-3">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full"
            style={{ minWidth: 520, maxHeight: 300 }}
          >
            {/* Recessive grid + value axis */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)}
                  stroke="var(--viz-grid)" strokeWidth={1}
                />
                <text
                  x={padL - 8} y={yFor(t) + 3} textAnchor="end"
                  className="fill-muted-foreground" style={{ fontSize: 10 }}
                >
                  {formatValue(t)}
                </text>
              </g>
            ))}

            {/* Category labels — thinned so they never collide. */}
            {labels.map((label, i) => {
              const every = Math.ceil(labels.length / 12);
              if (i % every !== 0) return null;
              return (
                <text
                  key={i}
                  x={kind === "bar" ? padL + bandW * i + bandW / 2 : xFor(i)}
                  y={H - padB + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 10 }}
                >
                  {label.length > 12 ? `${label.slice(0, 11)}…` : label}
                </text>
              );
            })}

            {kind === "bar" &&
              series.map((col, s) => (
                <g key={col}>
                  {data.map((row, i) => {
                    const v = Number(row[col] ?? 0) || 0;
                    const h = Math.max(0, plotH - (yFor(v) - padT));
                    const x = padL + bandW * i + (bandW - barW * series.length) / 2 + s * barW;
                    return (
                      <rect
                        key={i}
                        x={x} y={yFor(v)} width={Math.max(barW - 2, 1)} height={h}
                        rx={4}
                        fill={SERIES_VARS[s]}
                        onMouseEnter={() => setHover({ i, x: x + barW / 2, y: yFor(v) })}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                </g>
              ))}

            {kind !== "bar" &&
              series.map((col, s) => {
                const points = data.map((row, i) => `${xFor(i)},${yFor(Number(row[col] ?? 0) || 0)}`);
                return (
                  <g key={col}>
                    {kind === "area" && (
                      <polygon
                        points={`${padL},${padT + plotH} ${points.join(" ")} ${xFor(data.length - 1)},${padT + plotH}`}
                        fill={SERIES_VARS[s]}
                        opacity={0.18}
                      />
                    )}
                    <polyline
                      points={points.join(" ")}
                      fill="none"
                      stroke={SERIES_VARS[s]}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {data.map((row, i) => (
                      <circle
                        key={i}
                        cx={xFor(i)} cy={yFor(Number(row[col] ?? 0) || 0)} r={4}
                        fill={SERIES_VARS[s]}
                        stroke="var(--card)"
                        strokeWidth={2}
                        onMouseEnter={() =>
                          setHover({ i, x: xFor(i), y: yFor(Number(row[col] ?? 0) || 0) })
                        }
                        onMouseLeave={() => setHover(null)}
                      />
                    ))}
                  </g>
                );
              })}
          </svg>

          {/* Tooltip — values in text tokens, the swatch carries identity. */}
          {hover && data[hover.i] && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border-2 border-border/60 bg-background px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{
                left: `calc(${(hover.x / W) * 100}% )`,
                top: `calc(${(hover.y / H) * 100}% - 8px)`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="mb-0.5 font-medium text-foreground">
                {String(data[hover.i][xCol] ?? "")}
              </div>
              {series.map((col, s) => (
                <div key={col} className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: SERIES_VARS[s] }}
                  />
                  <span className="font-mono">{col}</span>
                  <span className="ml-auto pl-2 font-mono tabular-nums text-foreground">
                    {String(data[hover.i][col] ?? "—")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Legend — always present for two or more series. */}
          {series.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border/40 pt-2">
              {series.map((col, s) => (
                <span key={col} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: SERIES_VARS[s] }}
                  />
                  <span className="font-mono">{col}</span>
                </span>
              ))}
            </div>
          )}

          {(rows.length > data.length || yCols.length > MAX_SERIES) && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {rows.length > data.length && `Plotting the first ${data.length} of ${rows.length} rows.`}
              {yCols.length > MAX_SERIES && ` Showing ${MAX_SERIES} of ${yCols.length} series.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
