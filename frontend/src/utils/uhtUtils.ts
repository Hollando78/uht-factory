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

// ============================================================================
// Bitwise Operations for Hex Calculator
// ============================================================================

export type HexOperation = 'XOR' | 'AND' | 'OR' | 'ONE_HOT';

/**
 * XOR two 8-character hex UHT codes
 * Note: >>> 0 converts to unsigned 32-bit integer (JS bitwise ops use signed)
 */
export function xorHexCodes(hex1: string, hex2: string): string {
  const int1 = parseInt(hex1, 16);
  const int2 = parseInt(hex2, 16);
  return ((int1 ^ int2) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * AND two 8-character hex UHT codes (common traits)
 * Note: >>> 0 converts to unsigned 32-bit integer (JS bitwise ops use signed)
 */
export function andHexCodes(hex1: string, hex2: string): string {
  const int1 = parseInt(hex1, 16);
  const int2 = parseInt(hex2, 16);
  return ((int1 & int2) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * OR two 8-character hex UHT codes (union of traits)
 * Note: >>> 0 converts to unsigned 32-bit integer (JS bitwise ops use signed)
 */
export function orHexCodes(hex1: string, hex2: string): string {
  const int1 = parseInt(hex1, 16);
  const int2 = parseInt(hex2, 16);
  return ((int1 | int2) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * XOR multiple hex codes together (left to right)
 */
export function xorMultipleHexCodes(hexCodes: string[]): string {
  if (hexCodes.length === 0) return '00000000';
  if (hexCodes.length === 1) return hexCodes[0].toUpperCase().padStart(8, '0');
  return hexCodes.reduce((acc, hex) => xorHexCodes(acc, hex));
}

/**
 * AND multiple hex codes together (left to right) - common traits
 */
export function andMultipleHexCodes(hexCodes: string[]): string {
  if (hexCodes.length === 0) return '00000000';
  if (hexCodes.length === 1) return hexCodes[0].toUpperCase().padStart(8, '0');
  return hexCodes.reduce((acc, hex) => andHexCodes(acc, hex));
}

/**
 * OR multiple hex codes together (left to right) - union of traits
 */
export function orMultipleHexCodes(hexCodes: string[]): string {
  if (hexCodes.length === 0) return '00000000';
  if (hexCodes.length === 1) return hexCodes[0].toUpperCase().padStart(8, '0');
  return hexCodes.reduce((acc, hex) => orHexCodes(acc, hex));
}

/**
 * ONE-HOT detection: result bit = 1 only if EXACTLY ONE entity has that bit
 * This finds traits that are unique to a single entity (true differences)
 */
export function oneHotHexCodes(hexCodes: string[]): string {
  if (hexCodes.length === 0) return '00000000';
  if (hexCodes.length === 1) return hexCodes[0].toUpperCase().padStart(8, '0');

  // Convert all to binary
  const binaries = hexCodes.map(hex => uhtToBinary(hex));

  // For each bit position, count how many have it set
  let resultBinary = '';
  for (let i = 0; i < 32; i++) {
    let count = 0;
    for (const binary of binaries) {
      if (binary[i] === '1') count++;
    }
    // One-hot: only 1 if exactly one entity has this bit
    resultBinary += count === 1 ? '1' : '0';
  }

  return binaryToUht(resultBinary);
}

/**
 * Apply operation to multiple hex codes
 */
export function applyHexOperation(hexCodes: string[], operation: HexOperation): string {
  switch (operation) {
    case 'XOR': return xorMultipleHexCodes(hexCodes);
    case 'AND': return andMultipleHexCodes(hexCodes);
    case 'OR': return orMultipleHexCodes(hexCodes);
    case 'ONE_HOT': return oneHotHexCodes(hexCodes);
    default: return xorMultipleHexCodes(hexCodes);
  }
}

/**
 * Get detailed diff between two hex codes after XOR
 * Shows which bits changed, which were added (0->1), and removed (1->0)
 */
export function getXorDiff(hex1: string, hex2: string): {
  resultHex: string;
  changed: number[];    // Bits that differ (1-indexed)
  addedFrom2: number[]; // Bits that are ON in hex2 but OFF in hex1
  addedFrom1: number[]; // Bits that are ON in hex1 but OFF in hex2
} {
  const bin1 = uhtToBinary(hex1);
  const bin2 = uhtToBinary(hex2);
  const resultHex = xorHexCodes(hex1, hex2);
  const resultBin = uhtToBinary(resultHex);

  const changed: number[] = [];
  const addedFrom2: number[] = [];
  const addedFrom1: number[] = [];

  for (let i = 0; i < 32; i++) {
    if (resultBin[i] === '1') {
      changed.push(i + 1);
      if (bin1[i] === '0' && bin2[i] === '1') {
        addedFrom2.push(i + 1);
      } else if (bin1[i] === '1' && bin2[i] === '0') {
        addedFrom1.push(i + 1);
      }
    }
  }

  return { resultHex, changed, addedFrom2, addedFrom1 };
}

/**
 * Get layer summary for a hex code
 */
export function getLayerSummary(hex: string): {
  Physical: { hex: string; count: number };
  Functional: { hex: string; count: number };
  Abstract: { hex: string; count: number };
  Social: { hex: string; count: number };
} {
  const counts = getLayerCounts(hex);
  return {
    Physical: { hex: getLayerHex(hex, 'Physical'), count: counts[0] },
    Functional: { hex: getLayerHex(hex, 'Functional'), count: counts[1] },
    Abstract: { hex: getLayerHex(hex, 'Abstract'), count: counts[2] },
    Social: { hex: getLayerHex(hex, 'Social'), count: counts[3] }
  };
}
