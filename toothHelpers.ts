// ===============================================================
// Tooth Helper Functions - Palmer Notation
// ===============================================================
// These functions help with tooth naming and quadrant detection
// using Palmer notation system

// Convert tooth number string (like "UR1") to FDI number (1-32)
export function palmerToFDI(palmerNotation: string): number {
  // UR (Upper Right): UR8→1, UR7→2, ... UR1→8
  // UL (Upper Left): UL1→9, UL2→10, ... UL8→16
  // LL (Lower Left): LL1→17, LL2→18, ... LL8→24
  // LR (Lower Right): LR8→25, LR7→26, ... LR1→32

  const quadrant = palmerNotation.substring(0, 2);
  const position = parseInt(palmerNotation.substring(2), 10);

  if (quadrant === 'UR') return 9 - position;      // UR1→8, UR8→1
  if (quadrant === 'UL') return 8 + position;       // UL1→9, UL8→16
  if (quadrant === 'LL') return 16 + position;      // LL1→17, LL8→24
  if (quadrant === 'LR') return 33 - position;      // LR1→32, LR8→25

  return 0; // Invalid
}

// Helper function to get tooth quadrant from Palmer notation string
export const getToothQuadrant = (toothNumber: string): 'UL' | 'UR' | 'LL' | 'LR' => {
  if (!toothNumber) return 'UL';

  // Extract quadrant from Palmer notation (e.g., "UR1" → "UR")
  const quadrant = toothNumber.substring(0, 2);

  if (quadrant === 'UL') return 'UL';
  if (quadrant === 'UR') return 'UR';
  if (quadrant === 'LL') return 'LL';
  if (quadrant === 'LR') return 'LR';

  return 'UL'; // Default
};

// Helper function to get tooth position number for display (from Palmer notation)
export const getToothPositionNumber = (toothNumber: string): string => {
  if (!toothNumber) return '';

  // Extract number from Palmer notation (e.g., "UL 1" → "1", "UR3" → "3")
  const match = toothNumber.match(/\d+/);
  return match ? match[0] : '';
};

// Helper function to get tooth name in English
export const getToothName = (toothNumber: string): { arabic: string; english: string } => {
  if (!toothNumber) return { arabic: 'سن', english: 'Tooth' };

  // Extract position from Palmer notation (e.g., "UL1" → "1")
  const positionMatch = toothNumber.match(/\d+/);
  if (!positionMatch) return { arabic: 'سن', english: 'Tooth' };

  const position = parseInt(positionMatch[0], 10);

  const names: Record<number, { arabic: string; english: string }> = {
    1: { arabic: 'القاطع المركزي', english: 'Central Incisor' },
    2: { arabic: 'القاطع الجانبي', english: 'Lateral Incisor' },
    3: { arabic: 'الناب', english: 'Canine' },
    4: { arabic: 'الضاحك الأول', english: 'First Premolar' },
    5: { arabic: 'الضاحك الثاني', english: 'Second Premolar' },
    6: { arabic: 'الطاحن الأول', english: 'First Molar' },
    7: { arabic: 'الطاحن الثاني', english: 'Second Molar' },
    8: { arabic: 'ضرس العقل', english: 'Third Molar' },
  };

  return names[position] || { arabic: 'سن', english: 'Tooth' };
};

// Treatment and Details options for dropdown
export const treatmentOptions = [
  { key: 'filling', label: 'Filling' },
  { key: 'pulpectomy', label: 'Pulpectomy' },
  { key: 'extraction', label: 'Extraction' },
];

export const detailsOptions = [
  { key: 'permanent_filling', label: 'Permanent Filling' },
  { key: 'direct_pulp_capping', label: 'Direct Pulp Capping' },
  { key: 'indirect_pulp_capping', label: 'Indirect Pulp Capping' },
  { key: 'gi_filling', label: 'GI Filling' },
  { key: 'temporary_filling', label: 'Temporary Filling' },
];
