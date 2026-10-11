"use client";

import { Check, Clock, PackageCheck, Truck, X } from "lucide-react";
import type { Donation } from "@/types";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/data/derived";
import { Button } from "@/components/ui/button";
import { StatusDot, type StatusTone } from "@/components/shared/status-dot";

/** Donor-facing text for a donation's verification state. */
export function donationStatusText(d: Donation): string {
  switch (d.status) {
    case "proposed":
      return "Proposed";
    case "delivered":
      return "Delivered, awaiting operator check";
    case "accepted":
      return `Accepted · +${d.pointsAwarded} points`;
    case "rejected":
      return d.rejectionReason ? `Rejected: ${d.rejectionReason}` : "Rejected";
  }
}

export function donationStatusTone(status: Donation["status"]): StatusTone {
  return status === "accepted" ? "ok" : status === "rejected" ? "critical" : status === "delivered" ? "info" : "neutral";
}

export function DonationStatus({ donation, className }: { donation: Donation; className?: string }) {
  return <StatusDot tone={donationStatusTone(donation.status)} label={donationStatusText(donation)} className={cn("text-[13px]", className)} />;
}

/**
 * Step tracker for one donation: Proposed -> Delivered -> Verified by the operator.
 * Offers "Mark as delivered" while the donation is still proposed.
 */
export function DonationTracker({ donation, onMarkDelivered, busy = false, className }: { donation: Donation; onMarkDelivered?: (id: string) => void; busy?: boolean; className?: string }) {
  const stage = donation.status === "proposed" ? 0 : donation.status === "delivered" ? 1 : 2;
  const rejected = donation.status === "rejected";
  const steps = [
    { label: "Proposed", icon: Clock, at: donation.proposedAt },
    { label: "Delivered", icon: Truck, at: donation.deliveredAt },
    { label: rejected ? "Rejected" : "Verified", icon: rejected ? X : PackageCheck, at: donation.verifiedAt },
  ];
  return (
    <div className={cn("rounded-lg border border-border bg-background/60 p-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-foreground">
            {donation.quantity} {donation.unit} · {donation.itemName}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Proposed {formatRelative(donation.proposedAt)}</p>
        </div>
        <DonationStatus donation={donation} className="shrink-0" />
      </div>
      <ol className="mt-3 flex items-center gap-2" aria-label="Donation progress">
        {steps.map((s, i) => {
          const reached = i <= stage;
          const Icon = s.icon;
          const tone = rejected && i === 2 ? "bg-critical text-white" : reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";
          return (
            <li key={s.label} className="flex min-w-0 flex-1 items-center gap-2">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", tone)} aria-hidden="true">
                {reached ? <Icon className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={cn("truncate text-[12px]", reached ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
              {i < steps.length - 1 && <span className={cn("h-px flex-1", i < stage ? "bg-primary" : "bg-border")} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        {donation.status === "proposed" && (
          <>
            <span>Dropped it off? Let the operator know it has arrived.</span>
            {onMarkDelivered && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onMarkDelivered(donation.id)}>
                <Check data-icon="inline-start" /> Mark as delivered
              </Button>
            )}
          </>
        )}
        {donation.status === "delivered" && <span>Awaiting operator verification. Points are awarded once the fridge operator checks the item in.</span>}
        {donation.status === "accepted" && <span>Verified by the fridge operator{donation.verifiedAt ? ` ${formatRelative(donation.verifiedAt)}` : ""}.</span>}
        {donation.status === "rejected" && <span>Not counted toward missions or points.</span>}
      </div>
    </div>
  );
}
