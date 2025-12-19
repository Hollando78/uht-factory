/**
 * Utility functions for the scatter plot visualization.
 */

export const LAYER_COLORS = {
  Physical: '#FF6B35',   // Orange
  Functional: '#00E5FF', // Cyan
  Abstract: '#9C27B0',   // Purple
  Social: '#4CAF50'      // Green
} as const;

export type LayerName = keyof typeof LAYER_COLORS;

/**
 * Adaptive font size based on zoom level and cluster size.
 */
export function getLabelFontSize(scale: number, clusterSize: number, maxSize: number): number {
  const baseFontSize = 11;
  const scaleFactor = Math.sqrt(scale);
  const sizeFactor = 1 + (clusterSize / maxSize) * 0.3;
  return Math.max(10, Math.min(18, baseFontSize * scaleFactor * sizeFactor));
}

/**
 * Get label opacity based on cluster size (larger = more visible).
 */
export function getLabelOpacity(clusterSize: number, maxSize: number): number {
  const minOpacity = 0.6;
  const maxOpacity = 1.0;
  const sizeRatio = clusterSize / maxSize;
  return minOpacity + sizeRatio * (maxOpacity - minOpacity);
}

/**
 * Get the dominant layer from a UHT code based on bit count.
 */
export function getDominantLayer(uhtCode: string): LayerName {
  if (!uhtCode || uhtCode.length !== 8) return 'Physical';

  const layers = {
    Physical: 0,
    Functional: 0,
    Abstract: 0,
    Social: 0
  };

  try {
    const physical = parseInt(uhtCode.slice(0, 2), 16);
    const functional = parseInt(uhtCode.slice(2, 4), 16);
    const abstract = parseInt(uhtCode.slice(4, 6), 16);
    const social = parseInt(uhtCode.slice(6, 8), 16);

    layers.Physical = physical.toString(2).split('1').length - 1;
    layers.Functional = functional.toString(2).split('1').length - 1;
    layers.Abstract = abstract.toString(2).split('1').length - 1;
    layers.Social = social.toString(2).split('1').length - 1;
  } catch {
    return 'Physical';
  }

  return Object.entries(layers).reduce((a, b) => b[1] > a[1] ? b : a)[0] as LayerName;
}

/**
 * Count active traits (1 bits) in a UHT code.
 */
export function getTraitCount(uhtCode: string): number {
  try {
    const num = parseInt(uhtCode, 16);
    return num.toString(2).split('1').length - 1;
  } catch {
    return 0;
  }
}

/**
 * Map trait count to a color on a blue-green-yellow-red gradient.
 */
export function traitCountToColor(count: number): string {
  const normalized = Math.min(count / 32, 1);
  if (normalized < 0.25) {
    return `hsl(200, 80%, ${50 + normalized * 100}%)`;
  } else if (normalized < 0.5) {
    return `hsl(${200 - (normalized - 0.25) * 400}, 80%, 60%)`;
  } else if (normalized < 0.75) {
    return `hsl(${100 - (normalized - 0.5) * 200}, 80%, 55%)`;
  } else {
    return `hsl(${50 - (normalized - 0.75) * 200}, 80%, 50%)`;
  }
}

/**
 * Calculate Hamming distance between two UHT codes (0-32).
 */
export function hammingDistance(code1: string, code2: string): number {
  try {
    const num1 = parseInt(code1, 16);
    const num2 = parseInt(code2, 16);
    const xor = num1 ^ num2;
    return xor.toString(2).split('1').length - 1;
  } catch {
    return 32;
  }
}

/**
 * Map Hamming distance to a heatmap color (green=close, red=far).
 */
export function distanceToColor(distance: number): string {
  const normalized = Math.min(distance / 32, 1);
  if (normalized < 0.25) {
    return `hsl(${120 - normalized * 120}, 90%, 50%)`;
  } else if (normalized < 0.5) {
    return `hsl(${90 - (normalized - 0.25) * 180}, 85%, 50%)`;
  } else if (normalized < 0.75) {
    return `hsl(${45 - (normalized - 0.5) * 90}, 80%, 50%)`;
  } else {
    return `hsl(${22 - (normalized - 0.75) * 88}, 75%, 45%)`;
  }
}

/**
 * Check if a specific bit (trait) is set in a UHT code.
 * Trait index is 1-32, where 1-8 are Physical, 9-16 Functional, 17-24 Abstract, 25-32 Social.
 */
export function hasTraitBit(uhtCode: string, traitIndex: number): boolean {
  try {
    const num = parseInt(uhtCode, 16);
    const bitPosition = 32 - traitIndex;
    return ((num >> bitPosition) & 1) === 1;
  } catch {
    return false;
  }
}

/**
 * Get layer name for a trait index.
 */
export function getLayerForTrait(traitIndex: number): string {
  if (traitIndex <= 8) return 'Physical';
  if (traitIndex <= 16) return 'Functional';
  if (traitIndex <= 24) return 'Abstract';
  return 'Social';
}

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 */
export function pointInPolygon(x: number, y: number, polygon: Array<{x: number, y: number}>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Generate a seeded random number for consistent colors.
 */
export function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash % 1000) / 1000;
}

/**
 * Easing function for smooth animations.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Calculate distance between two points.
 */
export function distance(p1: {x: number, y: number}, p2: {x: number, y: number}): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

/**
 * Generate a curved path between two points with control points.
 */
export function generateCurvedPath(
  start: {x: number, y: number},
  end: {x: number, y: number},
  steps: number = 60
): Array<{x: number, y: number}> {
  const path: Array<{x: number, y: number}> = [];

  // Create control points for a nice curve
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Perpendicular offset for curve
  const perpX = -dy * 0.3;
  const perpY = dx * 0.3;

  const ctrl = { x: midX + perpX, y: midY + perpY };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Quadratic Bezier
    const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * ctrl.x + t ** 2 * end.x;
    const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * ctrl.y + t ** 2 * end.y;
    path.push({ x, y });
  }

  return path;
}
