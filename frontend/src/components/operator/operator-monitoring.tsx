"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Mic, Radio, Save, FlaskConical, PenLine } from "lucide-react";
import type {
  Fridge,
  FridgeThresholds,
  FridgeyDataset,
  SensorMetric,
} from "@/types";
import {
  DAY_MS,
  HOUR_MS,
  formatDateTime,
  formatRelative,
  latestReading,
  readingsInRange,
} from "@/lib/data/derived";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import {
  StatusDot,
  fridgeStatusLabel,
  fridgeStatusTone,
} from "@/components/shared/status-dot";
import { DemoTag } from "@/components/shared/demo-notice";
import { SensorChart } from "@/components/sensors/sensor-chart";
import { SensorReadout } from "@/components/sensors/sensor-readout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useNow, useOperatorFridge } from "./use-operator-fridge";
import {
  METRICS,
  METRIC_DECIMALS,
  METRIC_LABEL,
  METRIC_UNIT,
  bandFor,
  metricSupported,
  sensorState,
  stateLabel,
  summarize,
} from "./sensor-state";
import { RiskPanel } from "./risk-panel";
import { NoFridge } from "./no-fridge";

const RANGES = [
  { key: "1h", label: "1h", ms: HOUR_MS },
  { key: "6h", label: "6h", ms: 6 * HOUR_MS },
  { key: "24h", label: "24h", ms: DAY_MS },
  { key: "7d", label: "7d", ms: 7 * DAY_MS },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

export function OperatorMonitoring() {
  return (
    <DataGate>
      <MonitoringContent />
    </DataGate>
  );
}

function MonitoringContent() {
  const { data, actions, mode, fridge } = useOperatorFridge();
  const [range, setRange] = useState<RangeKey>("24h");
  const rangeMs = RANGES.find((r) => r.key === range)!.ms;
  const localNow = useNow();
  const now = data.hardwareEvaluatedAt
    ? Date.parse(data.hardwareEvaluatedAt)
    : localNow;

  if (!fridge) return <NoFridge title="Live monitoring" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live monitoring"
        description="One axis per measurement. Bands show the thresholds configured for this fridge; readings outside a band raise an alert."
        actions={
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <TabsList aria-label="Time range">
              {RANGES.map((r) => (
                <TabsTrigger key={r.key} value={r.key} className="px-3">
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <RiskPanel risk={data.hardwareRisk} age={data.hardwareSampleAgeSeconds} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="space-y-4">
          <MetricPanel
            metric="temperature"
            data={data}
            fridge={fridge}
            rangeMs={rangeMs}
            now={now}
            height={280}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <MetricPanel
              metric={fridge.capabilities.moisture ? "moisture" : "humidity"}
              data={data}
              fridge={fridge}
              rangeMs={rangeMs}
              now={now}
              height={200}
            />
            <MetricPanel
              metric="air_quality"
              data={data}
              fridge={fridge}
              rangeMs={rangeMs}
              now={now}
              height={200}
            />
          </div>
          {fridge.capabilities.movement && (
            <MetricPanel
              metric="movement"
              data={data}
              fridge={fridge}
              rangeMs={rangeMs}
              now={now}
              height={240}
            />
          )}
        </div>

        <div className="space-y-4">
          <ConnectionPanel
            fridge={fridge}
            now={now}
            conditions={data.hardwareConditions}
          />
          <ThresholdsPanel
            fridge={fridge}
            onSave={(thresholds) =>
              actions.updateFridge(fridge.id, { thresholds })
            }
          />
          <ReadingPanel
            fridge={fridge}
            mode={mode}
            record={(metric, value) =>
              actions.recordSensorReading(
                fridge.id,
                metric,
                value,
                mode === "demo" ? "demo" : "hardware",
              )
            }
          />
          <TimestampsPanel data={data} fridge={fridge} now={now} />
        </div>
      </div>
    </div>
  );
}

function MetricPanel({
  metric,
  data,
  fridge,
  rangeMs,
  now,
  height,
}: {
  metric: SensorMetric;
  data: FridgeyDataset;
  fridge: Fridge;
  rangeMs: number;
  now: number;
  height: number;
}) {
  const supported = metricSupported(metric, fridge.capabilities);
  const readings = useMemo(
    () =>
      supported ? readingsInRange(data, fridge.id, metric, rangeMs, now) : [],
    [supported, data, fridge.id, metric, rangeMs, now],
  );
  const unit = METRIC_UNIT[metric];
  const decimals = METRIC_DECIMALS[metric];
  if (!supported) {
    return (
      <SensorReadout
        metric={metric}
        history={[]}
        unit={unit}
        state="stale"
        supported={false}
      />
    );
  }
  const latest = latestReading(data, fridge.id, metric);
  const state = sensorState(metric, latest, fridge.thresholds, now);
  const band = bandFor(metric, fridge.thresholds);
  const stats = summarize(readings);
  const tone =
    state === "critical"
      ? "text-critical"
      : state === "warning"
        ? "text-amber"
        : state === "stale"
          ? "text-ink-faint"
          : "text-sensor";
  const measurementNote =
    metric === "moisture"
      ? "Contact wetness · alert at or above threshold · older buckets show maximum"
      : metric === "movement"
        ? "Acceleration change peak · alert above threshold · older buckets show maximum peak"
        : undefined;
  const bandText =
    band.min !== undefined && band.max !== undefined
      ? `Band ${band.min}–${band.max} ${unit}`
      : band.max !== undefined
        ? `Max ${band.max.toLocaleString()} ${unit}`
        : "No threshold set";

  return (
    <Panel tone="sensor">
      <PanelHeader
        title={METRIC_LABEL[metric]}
        description={
          measurementNote ? `${bandText} · ${measurementNote}` : bandText
        }
        action={
          <div className="text-right">
            <div
              className={cn(
                "readout flex items-baseline justify-end gap-1 leading-none",
                tone,
              )}
            >
              <span className="text-[28px] font-semibold">
                {latest ? latest.value.toFixed(decimals) : "—"}
              </span>
              <span className="font-sans text-[12px] font-medium text-muted-foreground">
                {unit}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {latest ? `Updated ${formatRelative(latest.at, now)} · ` : ""}
              <span
                className={cn(
                  "font-medium",
                  state === "ok" ? "text-primary" : tone,
                )}
              >
                {stateLabel(state)}
              </span>
            </div>
          </div>
        }
      />
      <PanelBody>
        <SensorChart
          readings={readings}
          unit={unit}
          band={band}
          rangeMs={rangeMs}
          height={height}
          tone="sensor"
          ariaLabel={`${METRIC_LABEL[metric]} readings`}
          decimals={decimals}
        />
        {stats && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              Min{" "}
              <span className="tnum text-foreground">
                {stats.min.toFixed(decimals)} {unit}
              </span>
            </span>
            <span>
              Max{" "}
              <span className="tnum text-foreground">
                {stats.max.toFixed(decimals)} {unit}
              </span>
            </span>
            <span>
              Avg{" "}
              <span className="tnum text-foreground">
                {stats.avg.toFixed(decimals)} {unit}
              </span>
            </span>
            <span className="tnum">{stats.count} readings</span>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function ConnectionPanel({
  fridge,
  now,
  conditions,
}: {
  fridge: Fridge;
  now: number;
  conditions?: FridgeyDataset["hardwareConditions"];
}) {
  const caps = fridge.capabilities;
  const cameraState = (installed: boolean) => {
    if (!installed) return { tone: "neutral" as const, label: "Not installed" };
    if (fridge.status === "offline")
      return { tone: "critical" as const, label: "Offline" };
    if (fridge.status === "degraded")
      return { tone: "warning" as const, label: "Reconnecting" };
    return { tone: "ok" as const, label: "Streaming" };
  };
  const front = cameraState(caps.frontCamera);
  const interior = cameraState(caps.interiorCamera);
  return (
    <Panel>
      <PanelHeader
        title="Connection"
        description="Board heartbeat and attached devices."
      />
      <PanelBody>
        <dl className="space-y-2.5 text-[13px]">
          {conditions && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Data coverage · last 5 min
                </dt>
                <dd>{conditions.confidence.toFixed(1)}%</dd>
              </div>
            </>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Radio className="size-3.5" aria-hidden="true" /> Board
            </dt>
            <dd>
              <StatusDot
                tone={fridgeStatusTone(fridge.status)}
                label={fridgeStatusLabel(fridge.status)}
                pulse={fridge.status === "online"}
                className="text-[13px]"
              />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Last heartbeat</dt>
            <dd className="tnum text-right text-foreground">
              {formatRelative(fridge.lastSeenAt, now)}
              <span className="block text-[11px] text-muted-foreground">
                {formatDateTime(fridge.lastSeenAt)}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Camera className="size-3.5" aria-hidden="true" /> Front camera
            </dt>
            <dd>
              <StatusDot
                tone={front.tone}
                label={front.label}
                className="text-[13px]"
              />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Camera className="size-3.5" aria-hidden="true" /> Interior camera
            </dt>
            <dd>
              <StatusDot
                tone={interior.tone}
                label={interior.label}
                className="text-[13px]"
              />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Mic className="size-3.5" aria-hidden="true" /> Voice assistant
            </dt>
            <dd>
              <StatusDot
                tone={caps.voiceAssistant ? "ok" : "neutral"}
                label={caps.voiceAssistant ? "Installed" : "Not installed"}
                className="text-[13px]"
              />
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3 border-t border-border pt-2.5">
            <dt className="text-muted-foreground">Hardware</dt>
            <dd className="text-right text-foreground">
              {fridge.hardwareVersion}
            </dd>
          </div>
        </dl>
      </PanelBody>
    </Panel>
  );
}

function ThresholdsPanel({
  fridge,
  onSave,
}: {
  fridge: Fridge;
  onSave: (t: FridgeThresholds) => void;
}) {
  const caps = fridge.capabilities;
  const th = fridge.thresholds;
  const [tempMin, setTempMin] = useState(String(th.tempMinC));
  const [tempMax, setTempMax] = useState(String(th.tempMaxC));
  const [humidityMax, setHumidityMax] = useState(
    th.humidityMaxPct !== undefined ? String(th.humidityMaxPct) : "",
  );
  const [airMax, setAirMax] = useState(
    th.airQualityMaxPpm !== undefined ? String(th.airQualityMaxPpm) : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const min = Number(tempMin);
    const max = Number(tempMax);
    if (tempMin.trim() === "" || Number.isNaN(min))
      next.tempMin = "Enter a number.";
    if (tempMax.trim() === "" || Number.isNaN(max))
      next.tempMax = "Enter a number.";
    if (!next.tempMin && !next.tempMax && min >= max)
      next.tempMax = "Max must be above min.";
    const h = humidityMax.trim() === "" ? undefined : Number(humidityMax);
    if (
      caps.humidity &&
      h !== undefined &&
      (Number.isNaN(h) || h <= 0 || h > 100)
    )
      next.humidityMax = "Enter a percentage between 1 and 100.";
    const a = airMax.trim() === "" ? undefined : Number(airMax);
    if (caps.airQuality && a !== undefined && (Number.isNaN(a) || a <= 0))
      next.airMax = "Enter a positive raw sensor value.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      onSave({
        tempMinC: min,
        tempMaxC: max,
        ...(caps.humidity ? { humidityMaxPct: h } : {}),
        ...(caps.airQuality ? { airQualityMaxPpm: a } : {}),
      });
      toast.success("Alert thresholds saved.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    unit: string,
    step: string,
    error?: string,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => set(e.target.value)}
          className="tnum"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span className="w-9 shrink-0 text-[12px] text-muted-foreground">
          {unit}
        </span>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[12px] text-critical">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <Panel>
      <PanelHeader
        title="Alert thresholds"
        description="Readings outside these limits open an alert."
      />
      <PanelBody>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field(
              "th-temp-min",
              "Temp min",
              tempMin,
              setTempMin,
              "°C",
              "0.1",
              errors.tempMin,
            )}
            {field(
              "th-temp-max",
              "Temp max",
              tempMax,
              setTempMax,
              "°C",
              "0.1",
              errors.tempMax,
            )}
          </div>
          {caps.humidity &&
            field(
              "th-humidity-max",
              "Humidity max",
              humidityMax,
              setHumidityMax,
              "%",
              "1",
              errors.humidityMax,
            )}
          {caps.airQuality &&
            field(
              "th-air-max",
              "Air response max",
              airMax,
              setAirMax,
              "raw",
              "10",
              errors.airMax,
            )}
          {!caps.humidity && !caps.airQuality && (
            <p className="text-[12px] text-muted-foreground">
              Humidity and air-quality limits appear when those sensors are
              installed.
            </p>
          )}
          <Button type="submit" size="sm" disabled={saving}>
            <Save aria-hidden="true" /> Save thresholds
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}

function ReadingPanel({
  fridge,
  mode,
  record,
}: {
  fridge: Fridge;
  mode: "demo" | "live";
  record: (
    metric: SensorMetric,
    value: number,
  ) => { alert?: { title: string; severity: string } };
}) {
  const available = METRICS.filter((m) =>
    metricSupported(m, fridge.capabilities),
  );
  const [metric, setMetric] = useState<SensorMetric>(
    available[0] ?? "temperature",
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isDemo = mode === "demo";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(value);
    if (value.trim() === "" || Number.isNaN(v)) {
      setError("Enter a numeric value.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = record(metric, v);
      if (result.alert) {
        toast.warning(result.alert.title, {
          description: "An alert was opened. See Active alerts.",
        });
      } else {
        toast.success(
          `${METRIC_LABEL[metric]} reading of ${v} ${METRIC_UNIT[metric]} recorded.`,
        );
      }
      setValue("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (available.length === 0) return null;

  return (
    <Panel tone={isDemo ? "sage" : "default"}>
      <PanelHeader
        title={isDemo ? "Simulate reading" : "Record manual reading"}
        description={
          isDemo
            ? "Demo tool: pushes a synthetic reading through the same path hardware uses, so you can trigger alerts."
            : "Log a reading taken with a handheld instrument. Hardware readings arrive automatically."
        }
        action={isDemo ? <DemoTag label="Demo tool" /> : undefined}
      />
      <PanelBody>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sim-metric">Metric</Label>
            <Select
              value={metric}
              onValueChange={(v) => setMetric(v as SensorMetric)}
            >
              <SelectTrigger id="sim-metric" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {available.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METRIC_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-value">Value ({METRIC_UNIT[metric]})</Label>
            <Input
              id="sim-value"
              type="number"
              inputMode="decimal"
              step={metric === "temperature" ? "0.1" : "1"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                metric === "temperature"
                  ? "e.g. 7.5"
                  : metric === "humidity"
                    ? "e.g. 70"
                    : "e.g. 1200"
              }
              className="tnum"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "sim-value-error" : undefined}
            />
            {error && (
              <p id="sim-value-error" className="text-[12px] text-critical">
                {error}
              </p>
            )}
          </div>
          <Button
            type="submit"
            size="sm"
            variant={isDemo ? "secondary" : "default"}
            disabled={busy}
          >
            {isDemo ? (
              <FlaskConical aria-hidden="true" />
            ) : (
              <PenLine aria-hidden="true" />
            )}
            {isDemo ? "Simulate reading" : "Record reading"}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}

function TimestampsPanel({
  data,
  fridge,
  now,
}: {
  data: FridgeyDataset;
  fridge: Fridge;
  now: number;
}) {
  return (
    <Panel tone="plain">
      <PanelHeader
        title="Sensor update timestamps"
        description="Latest sample per metric."
      />
      <PanelBody>
        <ul className="divide-y divide-border text-[13px]">
          {METRICS.map((m) => {
            const supported = metricSupported(m, fridge.capabilities);
            const latest = supported
              ? latestReading(data, fridge.id, m)
              : undefined;
            return (
              <li
                key={m}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-muted-foreground">{METRIC_LABEL[m]}</span>
                {!supported ? (
                  <span className="text-[12px] text-ink-faint">
                    Not installed
                  </span>
                ) : latest ? (
                  <span className="tnum text-right text-foreground">
                    {formatDateTime(latest.at)}
                    <span className="block text-[11px] text-muted-foreground">
                      {formatRelative(latest.at, now)} ·{" "}
                      {latest.source === "demo" ? "demo source" : "hardware"}
                    </span>
                  </span>
                ) : (
                  <span className="text-[12px] text-muted-foreground">
                    No readings
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
