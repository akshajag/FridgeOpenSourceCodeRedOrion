import { ArrowDownToLine, ArrowUpFromLine, Pencil, CheckCircle2, CalendarX2, AlertTriangle, HandHeart } from "lucide-react";
import type { InventoryEvent } from "@/types";
import { formatDateTime, formatRelative } from "@/lib/data/derived";
import { Rows, Row } from "@/components/shared/inline-list";
import { cn } from "@/lib/utils";
import { ACTOR_LABEL, EVENT_TYPE_LABEL } from "./sensor-state";

const ICONS: Record<InventoryEvent["type"], React.ComponentType<{ className?: string }>> = {
  added: ArrowDownToLine,
  removed: ArrowUpFromLine,
  edited: Pencil,
  confirmed: CheckCircle2,
  expired: CalendarX2,
  unconfirmed_removal: AlertTriangle,
  donation_received: HandHeart,
};

function toneClass(type: InventoryEvent["type"]) {
  switch (type) {
    case "unconfirmed_removal":
      return "bg-amber-soft text-amber";
    case "expired":
      return "bg-critical-soft text-critical";
    case "donation_received":
    case "confirmed":
      return "bg-sage text-evergreen-deep";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Inventory event feed. Unconfirmed removals are labeled as anomalies that need review;
 * the feed never characterizes them as theft.
 */
export function EventFeed({ events, className, showDate = false }: { events: InventoryEvent[]; className?: string; showDate?: boolean }) {
  return (
    <Rows className={className}>
      {events.map((ev) => {
        const Icon = ICONS[ev.type];
        const delta = ev.quantityDelta;
        return (
          <Row
            key={ev.id}
            className="items-start py-3"
            leading={
              <span className={cn("mt-0.5 flex size-7 items-center justify-center rounded-md", toneClass(ev.type))}>
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
            }
            trailing={
              <div className="text-right">
                <div className={cn("tnum text-[14px] font-medium", delta > 0 ? "text-primary" : delta < 0 ? "text-foreground" : "text-muted-foreground")}>
                  {delta > 0 ? `+${delta}` : delta === 0 ? "—" : delta}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  <time dateTime={ev.at}>{showDate ? formatDateTime(ev.at) : formatRelative(ev.at)}</time>
                </div>
              </div>
            }
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[14px] font-medium text-foreground">{ev.itemName}</span>
              <span className={cn("text-[12px]", ev.type === "unconfirmed_removal" ? "font-medium text-amber" : "text-muted-foreground")}>{EVENT_TYPE_LABEL[ev.type]}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {ACTOR_LABEL[ev.actor]}
              {ev.note ? ` · ${ev.note}` : ""}
            </div>
          </Row>
        );
      })}
    </Rows>
  );
}
