export function parseSensorLine(line) {
  const match=line.match(/^Temperature:\s*(-?\d+(?:\.\d+)?)\s*C\s*\/\s*-?\d+(?:\.\d+)?\s*F\s*\|\s*Moisture raw:\s*(\d+)\s*\|\s*Air raw:\s*(\d+)\s*$/);
  if (!match) return null;
  const [temperature_c,moisture_raw,air_quality_raw]=match.slice(1).map(Number);
  if (temperature_c < -40 || temperature_c > 85 || moisture_raw > 1023 || air_quality_raw > 1023) return null;
  return {temperature_c,moisture_raw,air_quality_raw};
}
