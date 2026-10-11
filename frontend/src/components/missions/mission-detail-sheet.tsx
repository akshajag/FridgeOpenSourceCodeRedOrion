"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MapPin, PlusCircle } from "lucide-react";
import type { Mission } from "@/types";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { formatDate, fridgeById, organizationById } from "@/lib/data/derived";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryBadge } from "@/components/shared/category-icon";
import { ProgressGauge } from "@/components/shared/progress-gauge";
import { StatusDot } from "@/components/shared/status-dot";
import { DemoTag } from "@/components/shared/demo-notice";
import { DonationDialog } from "./donation-dialog";
import { DonationTracker } from "./donation-status";
import { deadlineText, missionStatusLabel, missionStatusTone, rewardText } from "./mission-card";

export interface MissionDetailSheetProps {
  mission: Mission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distanceLabel?: string;
}

/** Full mission detail for donors: eligibility, drop-off, their own donations with status tracking, and the proposal entry point. */
export function MissionDetailSheet({ mission, open, onOpenChange, distanceLabel }: MissionDetailSheetProps) {
  const { data, actions, mode, currentUserId } = useFridgeyData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fridge = fridgeById(data, mission?.location.fridgeId);
  const organization = organizationById(data, mission?.organizationId);
  const myDonations = mission ? data.donations.filter((d) => d.missionId === mission.id && d.donorUserId === currentUserId).sort((a, b) => b.proposedAt.localeCompare(a.proposedAt)) : [];
  const joined = mission?.participantUserIds.includes(currentUserId) ?? false;
  const isOpen = mission?.status === "open";

  async function markDelivered(id: string) {
    setBusyId(id);
    try {
      await Promise.resolve(actions.markDonationDelivered(id));
      toast.success("Marked as delivered", { description: "The fridge operator will verify it shortly." });
    } catch (err) {
      toast.error("Couldn't update the donation", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleJoin() {
    if (!mission) return;
    setBusyId(mission.id);
    try {
      if (joined) {
        await Promise.resolve(actions.leaveMission(mission.id, currentUserId));
        toast.success("Left the mission");
      } else {
        await Promise.resolve(actions.joinMission(mission.id, currentUserId));
        toast.success("You joined the mission", { description: "Record a proposed donation when you're ready to drop off." });
      }
    } catch (err) {
      toast.error("Couldn't update the mission", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg" showCloseButton>
          {mission && (
            <>
              <SheetHeader className="pr-8">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusDot tone={missionStatusTone(mission.status)} label={missionStatusLabel(mission.status)} className="text-[12px] text-muted-foreground" />
                  {mode === "demo" && <DemoTag />}
                </div>
                <SheetTitle className="font-display text-[20px] leading-tight">{mission.title}</SheetTitle>
                <SheetDescription>{mission.foodType}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                <section className="space-y-3">
                  <ProgressGauge value={mission.quantityVerified} max={mission.quantityNeeded} unit={mission.unit} label={mission.quantityVerified >= mission.quantityNeeded ? "Goal reached" : undefined} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                    <div>
                      <dt className="text-muted-foreground">Requested by</dt>
                      <dd className="font-medium text-foreground">{organization?.name ?? "Food bank"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Deadline</dt>
                      <dd className="font-medium text-foreground">
                        {formatDate(mission.deadline)} <span className="font-normal text-muted-foreground">· {deadlineText(mission.deadline)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Category</dt>
                      <dd>
                        <CategoryBadge category={mission.category} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Participants</dt>
                      <dd className="tnum font-medium text-foreground">{mission.participantUserIds.length}</dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-lg border border-border bg-background/60 p-3.5">
                  <h3 className="font-display text-[14px] font-semibold">Drop-off location</h3>
                  <p className="mt-1 flex items-start gap-2 text-[13px] text-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>
                      {fridge ? (
                        <>
                          <span className="font-medium">{fridge.name}</span> · {fridge.neighborhood}
                          {distanceLabel ? <span className="text-muted-foreground"> · {distanceLabel} away</span> : null}
                          <span className="block text-muted-foreground">{fridge.hours}</span>
                        </>
                      ) : (
                        mission.location.label
                      )}
                    </span>
                  </p>
                </section>

                <section>
                  <h3 className="font-display text-[14px] font-semibold">What&apos;s eligible</h3>
                  {mission.eligibility.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {mission.eligibility.map((rule) => (
                        <li key={rule} className="flex items-start gap-2 text-[13px] text-foreground">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[13px] text-muted-foreground">No special rules. Bring food that matches the request and is within date.</p>
                  )}
                </section>

                <section className="rounded-lg bg-sage/40 p-3.5">
                  <h3 className="font-display text-[14px] font-semibold">Reward</h3>
                  <p className="mt-1 text-[13px] font-medium text-foreground">{rewardText(mission)}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{mission.rewardCondition}</p>
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-[14px] font-semibold">Your donations for this mission</h3>
                    {isOpen && (
                      <Button size="sm" onClick={() => setDialogOpen(true)}>
                        <PlusCircle data-icon="inline-start" /> Record a proposed donation
                      </Button>
                    )}
                  </div>
                  {myDonations.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {myDonations.map((d) => (
                        <DonationTracker key={d.id} donation={d} onMarkDelivered={markDelivered} busy={busyId === d.id} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-muted-foreground">{isOpen ? "Nothing recorded yet. Propose a donation, drop it off, and the operator will verify it." : "You didn't record a donation for this mission."}</p>
                  )}
                  <p className="mt-3 text-[12px] leading-snug text-muted-foreground">Only donations verified by the fridge operator count toward missions and points. Proposing a donation is a heads-up, not a guarantee.</p>
                </section>

                {isOpen && (
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                    <span className="text-[13px] text-muted-foreground">{joined ? "You're participating in this mission." : "Join to follow progress and get credit for your drop-offs."}</span>
                    <Button variant={joined ? "outline" : "default"} size="sm" disabled={busyId === mission.id} onClick={toggleJoin} aria-pressed={joined}>
                      {joined ? "Leave mission" : "Join mission"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {mission && <DonationDialog open={dialogOpen} onOpenChange={setDialogOpen} mission={mission} />}
    </>
  );
}
