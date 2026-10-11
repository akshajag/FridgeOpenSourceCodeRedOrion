"use client";
import type { FridgeyDataset } from "@/types";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { ShieldAlert } from "lucide-react";
export function RiskPanel({
  risk,
  age,
}: {
  risk?: FridgeyDataset["hardwareRisk"];
  age?: number | null;
}) {
  if (!risk) return null;
  return (
    <Panel tone="sensor">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldAlert className="size-4" />
            Live anomaly assessment
          </span>
        }
        description="Sensor-based warning scores · refreshes every 5 seconds"
        action={
          <span
            className={`readout text-3xl font-semibold ${risk.overall_score !== null && risk.overall_score >= 70 ? "text-critical" : "text-evergreen"}`}
          >
            {risk.overall_score === null ? "—" : `${risk.overall_score}%`}
          </span>
        }
      />
      <PanelBody>
        <p className="mb-4 text-sm text-muted-foreground">
          {risk.overall_score === null
            ? "Monitoring incomplete—check the sensor connection."
            : risk.overall_score >= 70
              ? "Strong sensor deviation. Inspect the fridge now."
              : risk.overall_score >= 30
                ? "Possible issue. Check the highlighted sensors."
                : "Low anomaly evidence at the current readings."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {risk.channels.map((c) => (
            <div key={c.key} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xs font-medium">{c.label}</h3>
                <span
                  className={`readout text-xl font-semibold ${c.level === "high" ? "text-critical" : c.level === "watch" ? "text-amber" : "text-evergreen"}`}
                >
                  {c.score === null ? "—" : `${c.score}%`}
                </span>
              </div>
              <div className="my-3 h-1.5 overflow-hidden rounded bg-muted">
                <div
                  className={`h-full ${c.level === "high" ? "bg-critical" : c.level === "watch" ? "bg-amber" : "bg-evergreen"}`}
                  style={{ width: `${c.score ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {c.value === null
                  ? "No valid reading"
                  : `${c.value.toFixed(c.key === "movement" ? 3 : c.key === "temperature" ? 1 : 0)} ${c.unit}`}{" "}
                ·{" "}
                {c.level === "unknown"
                  ? "Unknown"
                  : c.level === "high"
                    ? "Inspect now"
                    : c.level === "watch"
                      ? "Watch"
                      : "Low"}
              </p>
              <p className="mt-2 text-xs leading-relaxed">{c.recommendation}</p>
            </div>
          ))}
        </div>
        <details className="mt-4 rounded-lg bg-sage/30 p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            What these scores mean
          </summary>
          <p className="mt-2 leading-relaxed">
            {risk.definition} Overall is the highest channel score; quiet
            sensors cannot cancel an abnormal one. Missing readings never count
            as healthy.
          </p>
          <p className="mt-2">
            Temperature reference:{" "}
            {risk.channels.find((c) => c.key === "temperature")?.reference} °C.
            Warming trend:{" "}
            {risk.temperature_slope_c_per_minute === null
              ? "insufficient continuous data"
              : `${risk.temperature_slope_c_per_minute.toFixed(3)} °C/min`}
            .
          </p>
          <p className="mt-2">{risk.dew_point.reason}</p>
        </details>
        <p className="mt-3 text-xs text-muted-foreground">
          Sample age at evaluation:{" "}
          {age == null ? "unknown" : `${age.toFixed(1)}s`} · Last 5-minute
          coverage: {risk.coverage_percent.toFixed(1)}%. Scores prioritize
          inspection; they do not diagnose a leak, theft, spoilage, or
          compressor failure.
        </p>
      </PanelBody>
    </Panel>
  );
}
