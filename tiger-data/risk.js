// Engineering anomaly indices, not calibrated probabilities of failure or theft.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function deviationScore(ratio) {
  if (!Number.isFinite(ratio)) return null;
  const r = Math.max(0, ratio);
  return r <= 1 ? 40 * r : 40 + 55 * (1 - Math.exp(-(r - 1) / 2));
}
export function riskAssessment(
  conditions,
  baseline,
  {
    evaluatedAt,
    lastReadingAgeSeconds,
    coveragePercent,
    temperatureSlopeCPerMinute = null,
  } = {},
) {
  const labels = {
    temperature: "Cooling anomaly",
    moisture: "Possible wet contact / leak",
    air: "Unusual air-sensor response",
    movement: "Unexpected movement",
  };
  const recommendations = {
    temperature:
      "Check cooling power and the temperature probe. The reference is the configured demo temperature baseline.",
    moisture: "Inspect the probe and fridge floor for water or a spill.",
    air: "Inspect for vapors or a changed environment. This sensor does not identify spoiled food.",
    movement:
      "Check the cart and ask whether someone is intentionally moving it. Movement alone cannot prove theft.",
  };
  const ratios = {
    temperature: (c) =>
      Math.max(0, c.value - baseline.temperature_c) /
      baseline.thresholds.temperature_rise_c,
    moisture: (c) =>
      Math.max(0, c.value - baseline.moisture_raw) /
      baseline.thresholds.moisture_increase_raw,
    air: (c) =>
      Math.max(0, c.value - baseline.air_quality_raw) /
      baseline.thresholds.air_increase_raw,
    movement: (c) =>
      Math.max(
        0,
        Math.max(c.value, c.recent_peak_g ?? 0) -
          baseline.thresholds.motion_peak_g * 0.75,
      ) /
      (baseline.thresholds.motion_peak_g * 0.25),
  };
  const channels = conditions.map((c) => {
    const unavailable =
      c.state === "unknown" ||
      c.value === null ||
      !Number.isFinite(c.value) ||
      lastReadingAgeSeconds === null ||
      lastReadingAgeSeconds > 20;
    const duration = c.since
      ? Math.max(0, (Date.parse(evaluatedAt) - Date.parse(c.since)) / 1000)
      : 0;
    const base = unavailable ? null : deviationScore(ratios[c.key](c));
    const persistence = c.key === "movement" ? 0 : Math.min(10, duration * 2);
    const warming =
      c.key === "temperature" && Number.isFinite(temperatureSlopeCPerMinute)
        ? Math.min(15, Math.max(0, temperatureSlopeCPerMinute) * 30)
        : 0;
    const score =
      base === null
        ? null
        : Math.round(clamp(base + persistence + warming, 0, 95));
    return {
      key: c.key,
      label: labels[c.key],
      score,
      level:
        score === null
          ? "unknown"
          : score >= 70
            ? "high"
            : score >= 30
              ? "watch"
              : "low",
      value: c.value,
      threshold: c.threshold,
      unit: c.unit,
      state: c.state,
      reference:
        c.key === "temperature"
          ? baseline.temperature_c
          : c.key === "air"
            ? baseline.air_quality_raw
            : c.key === "moisture"
              ? baseline.moisture_raw
              : baseline.thresholds.motion_peak_g * 0.75,
      duration_seconds: Math.round(duration),
      recommendation: recommendations[c.key],
    };
  });
  const available = channels.filter((c) => c.score !== null),
    complete = available.length === channels.length;
  return {
    version: "anomaly-index-v1",
    evaluated_at: evaluatedAt,
    overall_score: complete ? Math.max(...available.map((c) => c.score)) : null,
    highest_observed_score: available.length
      ? Math.max(...available.map((c) => c.score))
      : null,
    coverage_percent: coveragePercent,
    temperature_slope_c_per_minute: temperatureSlopeCPerMinute,
    channels,
    definition:
      "Heuristic 0–95 anomaly index from reference deviation, duration and temperature trend. Not a probability of equipment failure, food spoilage, or theft. Missing/stale data is unknown.",
    dew_point: {
      available: false,
      reason:
        "No relative-humidity sensor is installed. Contact wetness cannot supply RH for the Magnus equation.",
    },
  };
}
