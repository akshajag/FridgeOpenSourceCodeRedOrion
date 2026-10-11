"use client";

import type { ReactNode } from "react";
import { List, Map as MapIcon } from "lucide-react";
import type { ConnectionStatus, DonationStatus, EventStatus, MissionStatus, RewardStatus } from "@/types";
import { StatusDot, type StatusTone } from "@/components/shared/status-dot";
import { DAY_MS, HOUR_MS } from "@/lib/data/derived";
import { cn } from "@/lib/utils";

type Kind = "donation" | "mission" | "reward" | "connection" | "event";
type StatusOf<K extends Kind> = K extends "donation" ? DonationStatus : K extends "mission" ? MissionStatus : K extends "reward" ? RewardStatus : K extends "connection" ? ConnectionStatus : EventStatus;

const LABELS: Record<Kind, Record<string, { label: string; tone: StatusTone }>> = {
  donation: {
    proposed: { label: "Proposed", tone: "neutral" },
    delivered: { label: "Delivered, awaiting check-in", tone: "info" },
    accepted: { label: "Accepted", tone: "ok" },
    rejected: { label: "Rejected", tone: "critical" },
  },
  mission: {
    draft: { label: "Draft", tone: "neutral" },
    open: { label: "Open", tone: "ok" },
    completed: { label: "Completed", tone: "info" },
    closed: { label: "Closed", tone: "neutral" },
  },
  reward: {
    eligible: { label: "Eligible", tone: "info" },
    pending_verification: { label: "Verification requested", tone: "warning" },
    approved: { label: "Approved, unpaid", tone: "ok" },
    paid: { label: "Paid", tone: "ok" },
    rejected: { label: "Rejected", tone: "critical" },
  },
  connection: {
    pending: { label: "Request pending", tone: "warning" },
    approved: { label: "Connected", tone: "ok" },
    rejected: { label: "Declined", tone: "critical" },
  },
  event: {
    draft: { label: "Draft", tone: "neutral" },
    published: { label: "Published", tone: "ok" },
    closed: { label: "Closed", tone: "neutral" },
  },
};

export function statusLabel<K extends Kind>(kind: K, status: StatusOf<K>): string {
  return LABELS[kind][status as string]?.label ?? String(status);
}

/** Text + square indicator for any domain status. Never color alone. */
export function StatusPill<K extends Kind>({ kind, status, short = false, className }: { kind: K; status: StatusOf<K>; short?: boolean; className?: string }) {
  const meta = LABELS[kind][status as string] ?? { label: String(status), tone: "neutral" as StatusTone };
  const label = short ? meta.label.split(",")[0] : meta.label;
  return <StatusDot tone={meta.tone} label={label} className={cn("text-[13px]", className)} />;
}

/** Map / list switch used wherever a map is shown. */
export function ViewToggle({ view, onChange, mapDisabled = false, className }: { view: "map" | "list"; onChange: (v: "map" | "list") => void; mapDisabled?: boolean; className?: string }) {
  const btn = "inline-flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className={cn("inline-flex overflow-hidden rounded-lg border border-border bg-card", className)} role="group" aria-label="View as map or list">
      <button type="button" aria-pressed={view === "map"} disabled={mapDisabled} onClick={() => onChange("map")} className={cn(btn, view === "map" ? "bg-sage text-evergreen-deep" : "text-muted-foreground hover:bg-muted")}>
        <MapIcon className="size-3.5" aria-hidden="true" /> Map
      </button>
      <button type="button" aria-pressed={view === "list"} onClick={() => onChange("list")} className={cn(btn, "border-l border-border", view === "list" ? "bg-sage text-evergreen-deep" : "text-muted-foreground hover:bg-muted")}>
        <List className="size-3.5" aria-hidden="true" /> List
      </button>
    </div>
  );
}

/** Deadline countdown copy such as "2d 6h left" or "Overdue by 3h". */
export function deadlineLabel(iso: string, now: number): { text: string; overdue: boolean; urgent: boolean } {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / DAY_MS);
  const hours = Math.floor((abs % DAY_MS) / HOUR_MS);
  const mins = Math.floor((abs % HOUR_MS) / 60_000);
  const span = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${Math.max(1, mins)} min`;
  if (diff < 0) return { text: `Overdue by ${span}`, overdue: true, urgent: true };
  return { text: `${span} left`, overdue: false, urgent: diff < DAY_MS };
}

/** "in 3h" style label for expirations, with a tone for how close it is. */
export function expiryTone(iso: string, now: number): StatusTone {
  const diff = new Date(iso).getTime() - now;
  if (diff < 0) return "critical";
  if (diff < 24 * HOUR_MS) return "warning";
  return "info";
}

export function formatSol(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
}

/** Form field wrapper: label, control, inline error. */
export function Field({ id, label, error, hint, children, className }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-critical">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** datetime-local helpers (local time in the input, ISO in the data). */
export function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function truncateMiddle(s: string, keep = 6): string {
  return s.length <= keep * 2 + 1 ? s : `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
