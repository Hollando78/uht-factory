/**
 * UHT Binary Utilities
 * Utility functions for manipulating UHT codes and binary representations
 */

// Layer configuration
export const LAYERS = [
  { name: 'Physical', color: '#FF6B35', bits: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: 'Functional', color: '#00E5FF', bits: [9, 10, 11, 12, 13, 14, 15, 16] },
  { name: 'Abstract', color: '#9C27B0', bits: [17, 18, 19, 20, 21, 22, 23, 24] },
  { name: 'Social', color: '#4CAF50', bits: [25, 26, 27, 28, 29, 30, 31, 32] }
] as const;

export const LAYER_COLORS: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
};

/**
 * Convert an 8-character hex UHT code to a 32-character binary string
 */
export function uhtToBinary(code: string): string {
  if (!code || code.length !== 8) return '0'.repeat(32);
  try {
    return parseInt(code, 16).toString(2).padStart(32, '0');
  } catch {
    return '0'.repeat(32);
  }
}

/**
 * Convert a 32-character binary string to an 8-character hex UHT code
 */
export function binaryToUht(binary: string): string {
  if (!binary || binary.length !== 32) return '00000000';
  try {
    return parseInt(binary, 2).toString(16).toUpperCase().padStart(8, '0');
  } catch {
    return '00000000';
  }
}

/**
 * Calculate the Hamming distance between two UHT codes
 * (number of bits that differ)
 */
export function hammingDistance(code1: string, code2: string): number {
  const binary1 = uhtToBinary(code1);
  const binary2 = uhtToBinary(code2);

  let distance = 0;
  for (let i = 0; i < 32; i++) {
    if (binary1[i] !== binary2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * Get the active trait bit positions (1-indexed) from a UHT code
 */
export function getActiveTraitBits(code: string): number[] {
  const binary = uhtToBinary(code);
  const activeBits: number[] = [];

  for (let i = 0; i < 32; i++) {
    if (binary[i] === '1') {
      activeBits.push(i + 1); // 1-indexed
    }
  }
  return activeBits;
}

/**
 * Check if a UHT code matches a pattern with tolerance
 * Pattern can contain: '0' (must be off), '1' (must be on), 'X' (wildcard)
 */
export function matchesPattern(code: string, pattern: string, tolerance: number = 0): boolean {
  if (pattern.length !== 32) return false;

  const binary = uhtToBinary(code);
  let mismatches = 0;

  for (let i = 0; i < 32; i++) {
    const patternBit = pattern[i].toUpperCase();
    if (patternBit === 'X') continue; // Wildcard, always matches

    if (binary[i] !== patternBit) {
      mismatches++;
      if (mismatches > tolerance) return false;
    }
  }

  return true;
}

/**
 * Count active bits in each layer of a UHT code
 * Returns [Physical, Functional, Abstract, Social]
 */
export function getLayerCounts(code: string): [number, number, number, number] {
  const binary = uhtToBinary(code);

  const counts: [number, number, number, number] = [0, 0, 0, 0];

  for (let i = 0; i < 32; i++) {
    if (binary[i] === '1') {
      const layerIndex = Math.floor(i / 8);
      counts[layerIndex]++;
    }
  }

  return counts;
}

/**
 * Get the dominant layer for a UHT code
 */
export function getDominantLayer(code: string): string {
  const counts = getLayerCounts(code);
  const maxCount = Math.max(...counts);
  const layerIndex = counts.indexOf(maxCount);
  return LAYERS[layerIndex].name;
}

/**
 * Get the hex value for a specific layer (2 characters)
 */
export function getLayerHex(code: string, layer: 'Physical' | 'Functional' | 'Abstract' | 'Social'): string {
  if (!code || code.length !== 8) return '00';

  const positions: Record<string, [number, number]> = {
    Physical: [0, 2],
    Functional: [2, 4],
    Abstract: [4, 6],
    Social: [6, 8]
  };

  const [start, end] = positions[layer];
  return code.slice(start, end).toUpperCase();
}

/**
 * Get the binary representation for a specific layer (8 characters)
 */
export function getLayerBinary(code: string, layer: 'Physical' | 'Functional' | 'Abstract' | 'Social'): string {
  const layerHex = getLayerHex(code, layer);
  return parseInt(layerHex, 16).toString(2).padStart(8, '0');
}

/**
 * Calculate Jaccard similarity between two UHT codes
 * (intersection over union of active traits)
 */
export function jaccardSimilarity(code1: string, code2: string): number {
  const bits1 = new Set(getActiveTraitBits(code1));
  const bits2 = new Set(getActiveTraitBits(code2));

  if (bits1.size === 0 && bits2.size === 0) return 1;

  let intersection = 0;
  bits1.forEach(bit => {
    if (bits2.has(bit)) intersection++;
  });

  const union = bits1.size + bits2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Get shared and unique traits between two UHT codes
 */
export function compareTraits(code1: string, code2: string): {
  shared: number[];
  uniqueToFirst: number[];
  uniqueToSecond: number[];
  neitherHas: number[];
} {
  const bits1 = new Set(getActiveTraitBits(code1));
  const bits2 = new Set(getActiveTraitBits(code2));

  const shared: number[] = [];
  const uniqueToFirst: number[] = [];
  const uniqueToSecond: number[] = [];
  const neitherHas: number[] = [];

  for (let bit = 1; bit <= 32; bit++) {
    const inFirst = bits1.has(bit);
    const inSecond = bits2.has(bit);

    if (inFirst && inSecond) {
      shared.push(bit);
    } else if (inFirst) {
      uniqueToFirst.push(bit);
    } else if (inSecond) {
      uniqueToSecond.push(bit);
    } else {
      neitherHas.push(bit);
    }
  }

  return { shared, uniqueToFirst, uniqueToSecond, neitherHas };
}

/**
 * Create an empty pattern (all wildcards)
 */
export function createEmptyPattern(): string {
  return 'X'.repeat(32);
}

/**
 * Create a pattern from a UHT code
 */
export function uhtToPattern(code: string): string {
  return uhtToBinary(code);
}

/**
 * Count non-wildcard bits in a pattern
 */
export function countPatternConstraints(pattern: string): number {
  let count = 0;
  for (const char of pattern) {
    if (char !== 'X' && char !== 'x') count++;
  }
  return count;
}

/**
 * Validate a pattern string
 */
export function isValidPattern(pattern: string): boolean {
  if (pattern.length !== 32) return false;
  return /^[01Xx]+$/.test(pattern);
}
