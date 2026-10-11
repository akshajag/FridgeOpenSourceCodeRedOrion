"use client";

import { Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import type { Alert } from "@/types";
import type { FridgeyActions } from "@/lib/data/actions";
import { formatDateTime, formatRelative } from "@/lib/data/derived";
import { StatusDot, severityTone } from "@/components/shared/status-dot";
import { Rows, Row } from "@/components/shared/inline-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALERT_TYPE_LABEL } from "./sensor-state";

const severityLabel: Record<Alert["severity"], string> = { info: "Info", warning: "Warning", critical: "Critical" };

/**
 * Divided list of alerts with acknowledge / resolve controls. Resolved alerts render
 * without actions. `compact` hides the detail paragraph for overview use.
 */
export function AlertList({ alerts, actions, compact = false, className }: { alerts: Alert[]; actions: FridgeyActions; compact?: boolean; className?: string }) {
  const acknowledge = (a: Alert) => {
    try {
      actions.acknowledgeAlert(a.id);
      toast.success(`Acknowledged: ${a.title}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const resolve = (a: Alert) => {
    try {
      actions.resolveAlert(a.id);
      toast.success(`Resolved: ${a.title}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Rows className={className}>
      {alerts.map((a) => {
        const resolved = Boolean(a.resolvedAt);
        return (
          <Row
            key={a.id}
            className={cn("items-start", compact ? "px-5 py-2.5" : "px-5 py-3.5")}
            trailing={
              resolved ? (
                <span className="text-[12px] text-muted-foreground">Resolved {formatRelative(a.resolvedAt!)}</span>
              ) : (
                <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                  {a.acknowledgedAt ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                      <Check className="size-3.5" aria-hidden="true" /> Acknowledged
                    </span>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" onClick={() => acknowledge(a)}>
                      <Check aria-hidden="true" /> Acknowledge
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => resolve(a)}>
                    <CheckCheck aria-hidden="true" /> Resolve
                  </Button>
                </div>
              )
            }
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusDot tone={resolved ? "neutral" : severityTone(a.severity)} label={severityLabel[a.severity]} pulse={!resolved && a.severity === "critical"} className="text-[12px]" />
              <span className="text-[12px] text-muted-foreground">{ALERT_TYPE_LABEL[a.type]}</span>
            </div>
            <div className={cn("mt-1 font-medium text-foreground", compact ? "text-[13px]" : "text-[14px]")}>{a.title}</div>
            {!compact && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{a.detail}</p>}
            <div className="mt-1 text-[12px] text-muted-foreground">
              <time dateTime={a.createdAt}>{formatDateTime(a.createdAt)}</time> · {formatRelative(a.createdAt)}
            </div>
          </Row>
        );
      })}
    </Rows>
  );
}
