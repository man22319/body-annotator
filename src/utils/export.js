// ===========================================================================
// Export helpers
// ===========================================================================

import { rdpSimplify } from "./rdp";
import { simplifyPolygon, enforceWindingCCW, validatePolygon } from "./geometry";

export function quantize(v) {
  return Math.round(v * 1e6) / 1e6;
}

export function downloadJSON(data, filename = "regions.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export raw format — original behavior.
 * Returns { regionName: { winding, pointCount, points } }
 */
export function buildRawExport(regions) {
  const output = {};
  const errors = [];

  for (const region of regions) {
    const key = region.name;
    const validation = validatePolygon(region.points);
    if (!validation.valid) {
      errors.push(`${key}: ${validation.reason}`);
      continue;
    }
    const simplified = simplifyPolygon(region.points);
    const wound = enforceWindingCCW(simplified);
    const quantized = wound.map(([x, y]) => [quantize(x), quantize(y)]);
    output[key] = {
      winding: "ccw",
      pointCount: quantized.length,
      points: quantized,
    };
  }

  return { output, errors };
}

/**
 * Export structured format for gym-plan.
 * Regions sorted alphabetically. RDP applied with given epsilon.
 *
 * Output shape:
 * {
 *   "view": "front",
 *   "muscles": {
 *     "muscle_name": [[x, y], ...],
 *     ...
 *   }
 * }
 */
export function buildGymPlanExport(regions, view, rdpEpsilon) {
  const errors = [];
  const muscles = {};

  // Sort regions alphabetically by name
  const sorted = [...regions].sort((a, b) => a.name.localeCompare(b.name));

  for (const region of sorted) {
    const key = region.name;
    const validation = validatePolygon(region.points);
    if (!validation.valid) {
      errors.push(`${key}: ${validation.reason}`);
      continue;
    }

    let pts = simplifyPolygon(region.points);

    // Apply RDP if epsilon > 0
    if (rdpEpsilon > 0) {
      pts = rdpSimplify(pts, rdpEpsilon);
    }

    pts = enforceWindingCCW(pts);
    muscles[key] = pts.map(([x, y]) => [quantize(x), quantize(y)]);
  }

  return {
    output: { view, muscles },
    errors,
  };
}

