"use client";

import { CalendarClock, MapPin, Users, Coins } from "lucide-react";
import type { Mission } from "@/types";
import { cn } from "@/lib/utils";
import { formatDate, formatRelative } from "@/lib/data/derived";
import { Button } from "@/components/ui/button";
import { CategoryBadge, CategoryIcon } from "@/components/shared/category-icon";
import { ProgressGauge } from "@/components/shared/progress-gauge";
import { StatusDot, type StatusTone } from "@/components/shared/status-dot";
import { useNow } from "./use-now";

export function missionStatusLabel(status: Mission["status"]): string {
  return status === "open" ? "Open" : status === "completed" ? "Completed" : status === "closed" ? "Closed" : "Draft";
}

export function missionStatusTone(status: Mission["status"]): StatusTone {
  return status === "open" ? "ok" : status === "completed" ? "info" : "neutral";
}

export function deadlineText(deadline: string, now = Date.now()): string {
  const diff = new Date(deadline).getTime() - now;
  if (diff <= 0) return "Deadline passed";
  return formatRelative(deadline, now);
}

export function rewardText(m: Mission): string {
  return m.rewardSol ? `${m.rewardSol} SOL reward` : "No reward — leaderboard recognition";
}

export interface MissionCardProps {
  mission: Mission;
  organizationName?: string;
  dropoff?: { name: string; neighborhood: string };
  distanceLabel?: string;
  joined: boolean;
  busy?: boolean;
  onJoinToggle?: () => void;
  onViewDetails?: () => void;
  mode?: "demo" | "live";
  className?: string;
}

/**
 * Donor-facing mission card. Warm, food-first composition: category tile, title, progress and a
 * quiet meta line. Intentionally distinct from sensor panels (no cool tones, no readouts).
 */
export function MissionCard({ mission, organizationName, dropoff, distanceLabel, joined, busy = false, onJoinToggle, onViewDetails, className }: MissionCardProps) {
  const now = useNow();
  const open = mission.status === "open";
  const passed = new Date(mission.deadline).getTime() <= now;
  const complete = mission.quantityVerified >= mission.quantityNeeded;
  return (
    <article className={cn("flex flex-col rounded-xl border border-border bg-card shadow-panel", className)} aria-labelledby={`mission-${mission.id}-title`}>
      <div className="flex items-start gap-4 px-5 pt-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-sage text-evergreen-deep" aria-hidden="true">
          <CategoryIcon category={mission.category} className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusDot tone={missionStatusTone(mission.status)} label={missionStatusLabel(mission.status)} className="text-[12px] text-muted-foreground" />

          </div>
          <h3 id={`mission-${mission.id}-title`} className="mt-1 font-display text-[17px] font-semibold leading-snug text-foreground">
            {mission.title}
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{mission.foodType}</p>
        </div>
      </div>

      <div className="mt-4 px-5">
        <ProgressGauge value={mission.quantityVerified} max={mission.quantityNeeded} unit={mission.unit} tone={complete ? "ok" : passed ? "amber" : "ok"} label={complete ? "Goal reached" : undefined} />
      </div>

      <dl className="mt-4 grid gap-x-4 gap-y-2 px-5 text-[13px] sm:grid-cols-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">Deadline</dt>
          <dd className={cn(passed && open && "text-amber")}>
            {formatDate(mission.deadline)} · {deadlineText(mission.deadline, now)}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="size-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">Participants</dt>
          <dd className="tnum">
            {mission.participantUserIds.length} {mission.participantUserIds.length === 1 ? "participant" : "participants"}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">Drop-off</dt>
          <dd className="truncate">
            {dropoff ? `${dropoff.name} · ${dropoff.neighborhood}` : mission.location.label}
            {distanceLabel ? ` · ${distanceLabel}` : ""}
          </dd>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground sm:col-span-2">
          <Coins className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">Reward</dt>
          <dd>
            <span className={cn(mission.rewardSol && "font-medium text-foreground")}>{rewardText(mission)}</span>
            {mission.rewardSol ? <span className="block text-[12px] leading-snug">{mission.rewardCondition}</span> : null}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <CategoryBadge category={mission.category} className="text-[12px]" />
          {organizationName && <span className="truncate">· {organizationName}</span>}
        </div>
        <div className="flex items-center gap-2">
          {onViewDetails && (
            <Button variant="ghost" size="sm" onClick={onViewDetails}>
              View details
            </Button>
          )}
          {onJoinToggle && open && (
            <Button variant={joined ? "outline" : "default"} size="sm" disabled={busy} onClick={onJoinToggle} aria-pressed={joined}>
              {joined ? "Leave" : "Join mission"}
            </Button>
          )}
          {joined && !open && <span className="text-[12px] text-muted-foreground">You participated</span>}
        </div>
      </div>
    </article>
  );
}
