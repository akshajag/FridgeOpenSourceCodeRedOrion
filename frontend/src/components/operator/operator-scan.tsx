"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, CameraOff, ImageIcon, Plus, ScanLine, Sparkles } from "lucide-react";
import type { FoodCategory } from "@/types";
import { FOOD_CATEGORIES } from "@/types";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Confidence } from "@/components/shared/confidence";
import { DemoTag } from "@/components/shared/demo-notice";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useOperatorFridge } from "./use-operator-fridge";
import { NoFridge } from "./no-fridge";
import { fromDateInput, toDateInput } from "./sensor-state";

type RecognizedItem = { name: string; category: FoodCategory; quantity: number; unit: string; expiresAt?: string | null; confidence: number };
type RecognitionResponse = { items: RecognizedItem[]; source: "gemini" | "demo_recognition"; model?: string };
type CameraState = "idle" | "requesting" | "live" | "denied" | "unavailable" | "demo";

interface ResultRow extends RecognizedItem {
  key: string;
  expiresInput: string;
  added: boolean;
}

export function OperatorScan() {
  return (
    <DataGate>
      <ScanContent />
    </DataGate>
  );
}

function ScanContent() {
  const { actions, mode, fridge } = useOperatorFridge();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [source, setSource] = useState<RecognitionResponse["source"] | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { gemini?: boolean } | null) => {
        if (!cancelled) setGeminiConfigured(Boolean(j?.gemini));
      })
      .catch(() => {
        if (!cancelled) setGeminiConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const startCamera = async () => {
    setCameraError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      setCameraError("This browser does not expose a camera API.");
      return;
    }
    setCamera("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCamera("live");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch (err) {
      const name = (err as DOMException).name;
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      setCameraError(name === "NotAllowedError" ? "Camera permission was denied." : name === "NotFoundError" ? "No camera was found on this device." : (err as Error).message);
    }
  };

  const drawDemoFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1f2a26";
    ctx.fillRect(0, 0, 640, 480);
    // Shelves
    ctx.fillStyle = "#e9efeb";
    for (const y of [150, 290, 430]) ctx.fillRect(40, y, 560, 10);
    // Item silhouettes
    const items: [number, number, number, number, string][] = [
      [80, 70, 90, 80, "#cfe4f3"],
      [200, 90, 60, 60, "#f1d9b5"],
      [300, 60, 110, 90, "#d8e8d0"],
      [460, 80, 70, 70, "#f3e3c7"],
      [90, 220, 120, 70, "#e3d3e6"],
      [250, 200, 90, 90, "#f5c6b4"],
      [380, 230, 150, 60, "#cfe4f3"],
      [120, 360, 80, 70, "#d8e8d0"],
      [300, 350, 100, 80, "#f1d9b5"],
    ];
    for (const [x, y, w, h, c] of items) {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText("Demo frame", 24, 36);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#b8c7bf";
    ctx.fillText("Placeholder shelves, no real photo. Used for the demo recognition path.", 24, 58);
    stopStream();
    setCamera("demo");
    setCameraError(null);
  };

  const capture = async () => {
    if (!fridge) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (camera === "live") {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        toast.error("The camera has not produced a frame yet. Try again in a second.");
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
    } else if (camera !== "demo") {
      toast.error("Start the camera or use the demo frame first.");
      return;
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const image = dataUrl.split(",")[1] ?? "";
    setRecognizing(true);
    try {
      const res = await fetch("/api/recognize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, mimeType: "image/jpeg", mode }) });
      const json = (await res.json()) as RecognitionResponse & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `Recognition failed (${res.status})`);
      setSource(json.source);
      setResults(json.items.map((it, idx) => ({ ...it, key: `${Date.now()}-${idx}`, expiresInput: toDateInput(it.expiresAt ?? undefined), added: false })));
      toast.success(json.items.length === 1 ? "Recognized 1 item." : `Recognized ${json.items.length} items.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRecognizing(false);
    }
  };

  const updateRow = (key: string, patch: Partial<ResultRow>) => setResults((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = (row: ResultRow) => {
    if (!fridge || !source) return;
    if (row.name.trim().length < 2) {
      toast.error("Give the item a name before adding it.");
      return;
    }
    if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
      toast.error("Quantity must be above zero.");
      return;
    }
    try {
      actions.addInventoryItem(
        { fridgeId: fridge.id, name: row.name.trim(), category: row.category, quantity: row.quantity, unit: row.unit.trim() || "pcs", expiresAt: fromDateInput(row.expiresInput), recognitionSource: source, recognitionConfidence: row.confidence },
        "camera",
      );
      updateRow(row.key, { added: true });
      toast.success(`${row.name} added as “needs review”. Confirm it from the inventory page.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!fridge) return <NoFridge title="Camera scan" />;
  const hasInterior = fridge.capabilities.interiorCamera;
  const canCapture = camera === "live" || camera === "demo";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Camera scan"
        description={hasInterior ? "On the physical fridge the interior camera captures a frame after every door close and runs this recognition automatically. Use this page to scan from your own device when the shelves change by hand." : "This fridge has no interior camera, so recognition runs only from frames you capture here."}
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusDot tone={geminiConfigured ? "ok" : "neutral"} label={geminiConfigured === null ? "Checking Gemini…" : geminiConfigured ? "Gemini configured" : "Gemini not configured"} className="text-[13px]" />
            {mode === "demo" && <DemoTag label="Demo persona: recognition is simulated" />}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Frame" description={camera === "live" ? "Live preview from this device’s camera." : camera === "demo" ? "Placeholder frame drawn locally." : "Start your camera or use a demo frame."} />
          <PanelBody>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-ink">
              <video ref={videoRef} playsInline muted className={cn("absolute inset-0 size-full object-cover", camera === "live" ? "block" : "hidden")} aria-label="Camera preview" />
              <canvas ref={canvasRef} className={cn("absolute inset-0 size-full object-cover", camera === "demo" ? "block" : "hidden")} aria-label="Captured frame" />
              {camera !== "live" && camera !== "demo" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-[13px] text-stone">
                  {camera === "denied" || camera === "unavailable" ? <CameraOff className="size-6 text-amber" aria-hidden="true" /> : <Camera className="size-6" aria-hidden="true" />}
                  {camera === "requesting" ? (
                    <span>Waiting for camera permission…</span>
                  ) : camera === "denied" || camera === "unavailable" ? (
                    <>
                      <span className="font-medium text-background">Camera unavailable</span>
                      <span>{cameraError} You can still try recognition with a demo frame.</span>
                    </>
                  ) : (
                    <span>No frame yet.</span>
                  )}
                </div>
              )}
              {camera === "live" && <span className="absolute left-3 top-3"><StatusDot tone="ok" label="Live" pulse className="rounded-sm bg-background/90 px-2 py-0.5 text-[12px]" /></span>}
              {camera === "demo" && <span className="absolute left-3 top-3"><DemoTag label="Demo frame" /></span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {camera !== "live" ? (
                <Button type="button" variant="outline" size="sm" onClick={startCamera} disabled={camera === "requesting"}><Camera aria-hidden="true" /> {camera === "denied" || camera === "unavailable" ? "Retry camera" : "Start camera"}</Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => { stopStream(); setCamera("idle"); }}><CameraOff aria-hidden="true" /> Stop camera</Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={drawDemoFrame}><ImageIcon aria-hidden="true" /> Use demo frame</Button>
              <Button type="button" size="sm" onClick={capture} disabled={recognizing || !canCapture}><ScanLine aria-hidden="true" /> {recognizing ? "Recognizing…" : "Capture & recognize"}</Button>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              The frame is sent once to <code className="rounded-sm bg-muted px-1">/api/recognize</code> as a JPEG and is not stored. {mode === "demo" ? "Demo personas never reach Gemini; the server returns a labeled demo recognition." : geminiConfigured ? "Gemini reads names, counts, and any legible dates." : "Without a Gemini key the server returns a labeled demo recognition."}
            </p>
          </PanelBody>
        </Panel>

        <Panel tone={source === "demo_recognition" ? "sage" : "default"}>
          <PanelHeader
            title="Recognized items"
            description={results.length ? "Correct anything that looks wrong, then add each item. Added items land as “needs review” until you confirm them." : "Results appear here after a capture."}
            action={source ? <SourceLabel source={source} /> : undefined}
          />
          <PanelBody flush>
            {results.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState compact icon={<Sparkles />} title="Nothing recognized yet" description="Capture a frame to see what the model finds." /></div>
            ) : (
              <ul className="divide-y divide-border">
                {results.map((row) => (
                  <li key={row.key} className={cn("px-5 py-4", row.added && "opacity-60")}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Confidence value={row.confidence} source={source ?? "demo_recognition"} />
                      {row.added ? (
                        <span className="text-[12px] font-medium text-primary">Added to inventory</span>
                      ) : (
                        <Button type="button" size="sm" onClick={() => addRow(row)}><Plus aria-hidden="true" /> Add to inventory</Button>
                      )}
                    </div>
                    <fieldset disabled={row.added} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                      <legend className="sr-only">Recognized item details</legend>
                      <div className="col-span-2 space-y-1 sm:col-span-3">
                        <Label htmlFor={`${row.key}-name`} className="text-[12px] text-muted-foreground">Name</Label>
                        <Input id={`${row.key}-name`} value={row.name} onChange={(e) => updateRow(row.key, { name: e.target.value })} />
                      </div>
                      <div className="col-span-2 space-y-1 sm:col-span-3">
                        <Label htmlFor={`${row.key}-category`} className="text-[12px] text-muted-foreground">Category</Label>
                        <Select value={row.category} onValueChange={(v) => updateRow(row.key, { category: v as FoodCategory })}>
                          <SelectTrigger id={`${row.key}-category`} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FOOD_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 sm:col-span-1">
                        <Label htmlFor={`${row.key}-qty`} className="text-[12px] text-muted-foreground">Qty</Label>
                        <Input id={`${row.key}-qty`} type="number" min={1} step={1} inputMode="numeric" value={row.quantity} onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })} className="tnum" />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor={`${row.key}-unit`} className="text-[12px] text-muted-foreground">Unit</Label>
                        <Input id={`${row.key}-unit`} value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value })} />
                      </div>
                      <div className="col-span-2 space-y-1 sm:col-span-3">
                        <Label htmlFor={`${row.key}-exp`} className="text-[12px] text-muted-foreground">Expires</Label>
                        <Input id={`${row.key}-exp`} type="date" value={row.expiresInput} onChange={(e) => updateRow(row.key, { expiresInput: e.target.value })} className="tnum" />
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
            )}
            {results.some((r) => r.added) && (
              <div className="border-t border-border px-5 py-3 text-[13px]">
                <Link href="/dashboard/operator/inventory?status=needs_review" className="font-medium text-foreground underline-offset-4 hover:underline">Review added items in inventory</Link>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function SourceLabel({ source }: { source: RecognitionResponse["source"] }) {
  if (source === "gemini") {
    return <span className="inline-flex items-center gap-1.5 rounded-sm bg-sensor-soft px-2 py-1 text-[12px] font-medium text-sensor"><Sparkles className="size-3.5" aria-hidden="true" /> Recognized by Gemini</span>;
  }
  return <DemoTag label="Demo recognition — Gemini is not connected in this environment" className="max-w-[220px] whitespace-normal text-left leading-snug sm:max-w-none" />;
}
