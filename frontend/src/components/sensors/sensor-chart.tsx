"use client";

/**
 * Single-series sensor line chart (Recharts). One axis per chart by design: temperature,
 * humidity, and air quality are separate measurements and get separate charts.
 */
import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SensorReading } from "@/types";

export interface SensorChartProps {
  readings: SensorReading[];
  unit: string;
  /** Acceptable band. Drawn as a quiet sage band behind the line. */
  band?: { min?: number; max?: number };
  rangeMs: number;
  height?: number;
  tone?: "sensor" | "ok" | "amber";
  ariaLabel: string;
  decimals?: number;
}

const toneColor = { sensor: "#2f7fbf", ok: "#2e8b5b", amber: "#c9801f" };

function formatTick(ts: number, rangeMs: number) {
  const d = new Date(ts);
  if (rangeMs <= 26 * 3_600_000) return d.toLocaleTimeString(undefined, { hour: "numeric" });
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function SensorChart({ readings, unit, band, rangeMs, height = 220, tone = "sensor", ariaLabel, decimals = 1 }: SensorChartProps) {
  const id = useId();
  const data = useMemo(() => readings.map((r) => ({ t: new Date(r.at).getTime(), v: r.value })), [readings]);
  const stats = useMemo(() => {
    if (!data.length) return null;
    const vals = data.map((d) => d.v);
    return { min: Math.min(...vals), max: Math.max(...vals), last: vals[vals.length - 1], avg: vals.reduce((a, b) => a + b, 0) / vals.length };
  }, [data]);
  const color = toneColor[tone];
  const domain = useMemo(() => {
    if (!stats) return [0, 10] as [number, number];
    const lo = Math.min(stats.min, band?.min ?? stats.min);
    const hi = Math.max(stats.max, band?.max ?? stats.max);
    const pad = Math.max((hi - lo) * 0.25, 0.5);
    return [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2] as [number, number];
  }, [stats, band]);

  if (!data.length) {
    return <div className="flex items-center justify-center text-[13px] text-muted-foreground" style={{ height }}>No readings in this range.</div>;
  }

  const summary = stats
    ? `${ariaLabel}: ${data.length} readings. Latest ${stats.last.toFixed(decimals)} ${unit}, range ${stats.min.toFixed(decimals)} to ${stats.max.toFixed(decimals)} ${unit}, average ${stats.avg.toFixed(decimals)} ${unit}.`
    : ariaLabel;

  return (
    <figure aria-label={ariaLabel}>
      <div style={{ height }} role="img" aria-describedby={`${id}-summary`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.14} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e4eae6" strokeWidth={1} />
            {band && band.min !== undefined && band.max !== undefined && <ReferenceArea y1={band.min} y2={band.max} fill="#dce7df" fillOpacity={0.45} stroke="none" />}
            {band?.max !== undefined && <ReferenceLine y={band.max} stroke="#b97835" strokeWidth={1} strokeDasharray="3 3" label={{ value: `max ${band.max}`, position: "insideTopRight", fill: "#8b5a22", fontSize: 11 }} />}
            {band?.min !== undefined && <ReferenceLine y={band.min} stroke="#427da8" strokeWidth={1} strokeDasharray="3 3" label={{ value: `min ${band.min}`, position: "insideBottomRight", fill: "#2f5f85", fontSize: 11 }} />}
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(v) => formatTick(v, rangeMs)} tickLine={false} axisLine={{ stroke: "#d9e1db" }} tick={{ fontSize: 11, fill: "#5c6e66" }} minTickGap={32} />
            <YAxis domain={domain} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5c6e66" }} tickFormatter={(v) => Number(v).toFixed(decimals === 0 ? 0 : 1)} width={48} />
            <Tooltip
              cursor={{ stroke: "#8b9a93", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { t: number; v: number };
                return (
                  <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] shadow-raised">
                    <div className="text-muted-foreground">{new Date(p.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                    <div className="tnum font-medium text-foreground">{p.v.toFixed(decimals)} {unit}</div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id}-fill)`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff", fill: color }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption id={`${id}-summary`} className="sr-only">{summary}</figcaption>
    </figure>
  );
}

export function Sparkline({ readings, tone = "sensor", height = 36 }: { readings: SensorReading[]; tone?: "sensor" | "ok" | "amber"; height?: number }) {
  const data = useMemo(() => readings.map((r) => ({ t: new Date(r.at).getTime(), v: r.value })), [readings]);
  if (data.length < 2) return null;
  const color = toneColor[tone];
  return (
    <div style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.08} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
