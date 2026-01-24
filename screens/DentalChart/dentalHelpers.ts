// ===============================================================
// Dental Chart Helper Functions
// ===============================================================
// Utility functions for tooth position, naming, and surface mapping

import type { ToothCondition, ToothSurface } from '../../types';

// ---------------------------------------------------------------
// Tooth Surface Conditions Interface
// ---------------------------------------------------------------
export interface ToothSurfaceConditions {
  top: ToothCondition;
  bottom: ToothCondition;
  left: ToothCondition;
  right: ToothCondition;
  center: ToothCondition;
}

// ---------------------------------------------------------------
// Surface Name Functions
// ---------------------------------------------------------------

/**
 * Get the anatomical surface name for a given screen position
 * @param surface - The screen surface position (top, bottom, left, right, center)
 * @param toothNumber - The tooth number (1-32)
 * @returns The anatomical surface name (e.g., "Mesial Surface", "Buccal Surface")
 */
export const getSurfaceName = (surface: keyof ToothSurfaceConditions | null, toothNumber?: number): string => {
  if (!surface) return '';

  // For teeth on the left side (9-16 and 25-32), swap Buccal/Palatal names
  const isLeftSide = toothNumber && ((toothNumber >= 9 && toothNumber <= 16) || (toothNumber >= 25 && toothNumber <= 32));
  // For lower teeth (17-32), use Lingual instead of Palatal
  const isLowerTooth = toothNumber && toothNumber >= 17 && toothNumber <= 32;
  const palatalOrLingual = isLowerTooth ? 'Lingual Surface' : 'Palatal Surface';

  // Swap mesial and distal for all lower teeth (17-32) to match existing labels
  const swapMesialDistal = toothNumber && toothNumber >= 17 && toothNumber <= 32;

  const names = {
    top: swapMesialDistal ? 'Distal Surface' : 'Mesial Surface',
    bottom: swapMesialDistal ? 'Mesial Surface' : 'Distal Surface',
    left: isLeftSide ? 'Buccal Surface' : palatalOrLingual,
    right: isLeftSide ? palatalOrLingual : 'Buccal Surface',
    center: 'Occlusal Surface',
  };
  return names[surface] || '';
};

/**
 * Get Arabic surface name
 */
export const getArabicSurfaceName = (surface: keyof ToothSurfaceConditions): string => {
  const names: Record<keyof ToothSurfaceConditions, string> = {
    top: 'الميزيال',
    bottom: 'الدستال',
    left: 'الباكال/اللساني',
    right: 'الحنكي/الباكال',
    center: 'الإطباقي',
  };
  return names[surface] || surface;
};

// ---------------------------------------------------------------
// Tooth Position Functions
// ---------------------------------------------------------------

/**
 * Get tooth position string (e.g., "Upper Left 1")
 */
export const getToothPosition = (toothNumber: number): string => {
  if (toothNumber >= 1 && toothNumber <= 8) {
    return `Upper Left ${toothNumber}`;
  } else if (toothNumber >= 9 && toothNumber <= 16) {
    return `Upper Right ${17 - toothNumber}`;
  } else if (toothNumber >= 17 && toothNumber <= 24) {
    return `Lower Left ${toothNumber - 16}`;
  } else if (toothNumber >= 25 && toothNumber <= 32) {
    return `Lower Right ${33 - toothNumber}`;
  }
  return `Tooth ${toothNumber}`;
};

/**
 * Get tooth number within quadrant (1-8)
 */
export const getQuadrantToothNumber = (toothNumber: number): number => {
  if (toothNumber >= 1 && toothNumber <= 8) {
    return toothNumber; // Upper Left: 1-8
  } else if (toothNumber >= 9 && toothNumber <= 16) {
    return 17 - toothNumber; // Upper Right: 8-1
  } else if (toothNumber >= 17 && toothNumber <= 24) {
    return toothNumber - 16; // Lower Left: 1-8
  } else if (toothNumber >= 25 && toothNumber <= 32) {
    return 33 - toothNumber; // Lower Right: 8-1
  }
  return toothNumber;
};

/**
 * Convert tooth number to Palmer notation display name
 */
export const getToothDisplayName = (toothNumber: number): string => {
  // Quadrant 1: Teeth 1-8 (UL)
  if (toothNumber === 1) return 'UL 1';
  if (toothNumber === 2) return 'UL 2';
  if (toothNumber === 3) return 'UL 3';
  if (toothNumber === 4) return 'UL 4';
  if (toothNumber === 5) return 'UL 5';
  if (toothNumber === 6) return 'UL 6';
  if (toothNumber === 7) return 'UL 7';
  if (toothNumber === 8) return 'UL 8';

  // Quadrant 2: Teeth 9-16 (UR)
  if (toothNumber === 9) return 'UR 8';
  if (toothNumber === 10) return 'UR 7';
  if (toothNumber === 11) return 'UR 6';
  if (toothNumber === 12) return 'UR 5';
  if (toothNumber === 13) return 'UR 4';
  if (toothNumber === 14) return 'UR 3';
  if (toothNumber === 15) return 'UR 2';
  if (toothNumber === 16) return 'UR 1';

  // Quadrant 3: Teeth 25-32 (LR)
  if (toothNumber === 25) return 'LR 8';
  if (toothNumber === 26) return 'LR 7';
  if (toothNumber === 27) return 'LR 6';
  if (toothNumber === 28) return 'LR 5';
  if (toothNumber === 29) return 'LR 4';
  if (toothNumber === 30) return 'LR 3';
  if (toothNumber === 31) return 'LR 2';
  if (toothNumber === 32) return 'LR 1';

  // Quadrant 4: Teeth 17-24 (LL)
  if (toothNumber === 17) return 'LL 1';
  if (toothNumber === 18) return 'LL 2';
  if (toothNumber === 19) return 'LL 3';
  if (toothNumber === 20) return 'LL 4';
  if (toothNumber === 21) return 'LL 5';
  if (toothNumber === 22) return 'LL 6';
  if (toothNumber === 23) return 'LL 7';
  if (toothNumber === 24) return 'LL 8';

  return toothNumber.toString();
};

/**
 * Convert Palmer notation to number (reverse of getToothDisplayName)
 */
export const palmerToNumber = (palmer: string): number => {
  const mapping: Record<string, number> = {
    'UL 1': 1, 'UL 2': 2, 'UL 3': 3, 'UL 4': 4, 'UL 5': 5, 'UL 6': 6, 'UL 7': 7, 'UL 8': 8,
    'UR 8': 9, 'UR 7': 10, 'UR 6': 11, 'UR 5': 12, 'UR 4': 13, 'UR 3': 14, 'UR 2': 15, 'UR 1': 16,
    'LL 1': 17, 'LL 2': 18, 'LL 3': 19, 'LL 4': 20, 'LL 5': 21, 'LL 6': 22, 'LL 7': 23, 'LL 8': 24,
    'LR 8': 25, 'LR 7': 26, 'LR 6': 27, 'LR 5': 28, 'LR 4': 29, 'LR 3': 30, 'LR 2': 31, 'LR 1': 32,
  };
  return mapping[palmer] || parseInt(palmer);
};

/**
 * Get position number only (1-8) for modal display
 */
export const getToothPositionNumber = (toothNumber: number): string => {
  const palmerName = getToothDisplayName(toothNumber);
  const match = palmerName.match(/\d+/);
  return match ? match[0] : toothNumber.toString();
};

/**
 * Get tooth quadrant (UL/UR/LL/LR)
 */
export const getToothQuadrant = (toothNumber: number): 'UL' | 'UR' | 'LL' | 'LR' => {
  if (toothNumber >= 1 && toothNumber <= 8) return 'UL';
  if (toothNumber >= 9 && toothNumber <= 16) return 'UR';
  if (toothNumber >= 17 && toothNumber <= 24) return 'LL';
  return 'LR';
};

/**
 * Get tooth name in Arabic and English
 */
export const getToothName = (toothNumber: number): { arabic: string; english: string } => {
  const position = getQuadrantToothNumber(toothNumber);

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

/**
 * Get quadrant type (for styling)
 */
export const getQuadrant = (toothNumber: number): 'upper-left' | 'upper-right' | 'lower-left' | 'lower-right' => {
  if (toothNumber >= 1 && toothNumber <= 8) return 'upper-left';
  if (toothNumber >= 9 && toothNumber <= 16) return 'upper-right';
  if (toothNumber >= 17 && toothNumber <= 24) return 'lower-left';
  return 'lower-right';
};

// ---------------------------------------------------------------
// Condition Name Functions
// ---------------------------------------------------------------

/**
 * Get condition name in Arabic and English
 */
export const getConditionName = (condition: ToothCondition): { arabic: string; english: string } => {
  const names: Record<string, { arabic: string; english: string }> = {
    caries: { arabic: 'تسوس', english: 'Caries' },
    broken: { arabic: 'سن مكسور/حشوة غير مناسبة', english: 'Broken/Inappropriate Filling' },
    pulpectomy: { arabic: 'علاج عصب', english: 'Pulpectomy' },
    extraction: { arabic: 'خلع', english: 'Extraction' },
    follow_up: { arabic: 'متابعة', english: 'Follow-up' },
    filling_replacement: { arabic: 'حشوة مؤقتة', english: 'Temporary Filling' },
    missing: { arabic: 'سن مفقود', english: 'Missing Tooth' },
    permanent_filling: { arabic: 'حشوة دائمة', english: 'Permanent Filling' },
    treated: { arabic: 'علاج جذور', english: 'Root Canal Treated' },
    needs_diagnosis: { arabic: 'يحتاج لتشخيص أدق', english: 'Needs More Diagnosis' },
    direct_pulp_capping: { arabic: 'تغطية اللب المباشرة', english: 'Direct Pulp Capping' },
    indirect_pulp_capping: { arabic: 'تغطية اللب غير المباشرة', english: 'Indirect Pulp Capping' },
    gi: { arabic: 'جلاس أيونومر', english: 'GI' },
  };
  return condition ? names[condition] : { arabic: 'سليم', english: 'Healthy' };
};

/**
 * Get referral department name
 */
export const getReferralName = (key: string): string => {
  const names: Record<string, string> = {
    endodontics: 'Endodontics',
    oralSurgery: 'Oral Surgery',
    orthodontics: 'Orthodontics',
    periodontics: 'Periodontics',
    prosthodontics: 'Prosthodontics',
    oralMedicine: 'Oral Medicine',
  };
  return names[key] || key;
};

// ---------------------------------------------------------------
// Tooth Angle and Position Functions
// ---------------------------------------------------------------

/**
 * Get tooth rotation angle for display
 */
export const getToothAngle = (toothNumber: number): number => {
  // Upper right (teeth 1-8)
  if (toothNumber === 1) return -80;
  if (toothNumber === 2) return -60;
  if (toothNumber === 3) return -35;
  if (toothNumber === 4) return -20;
  if (toothNumber === 5) return -15;
  if (toothNumber >= 6 && toothNumber <= 8) return 0;

  // Upper left (teeth 9-16)
  if (toothNumber >= 9 && toothNumber <= 11) return 0;
  if (toothNumber === 12) return 15;
  if (toothNumber === 13) return 20;
  if (toothNumber === 14) return 35;
  if (toothNumber === 15) return 60;
  if (toothNumber === 16) return 80;

  // Lower right (teeth 17-24)
  if (toothNumber === 17) return 80;
  if (toothNumber === 18) return 60;
  if (toothNumber === 19) return 35;
  if (toothNumber === 20) return 20;
  if (toothNumber === 21) return 15;
  if (toothNumber >= 22 && toothNumber <= 24) return 0;

  // Lower left (teeth 25-32)
  if (toothNumber >= 25 && toothNumber <= 27) return 0;
  if (toothNumber === 28) return -15;
  if (toothNumber === 29) return -20;
  if (toothNumber === 30) return -35;
  if (toothNumber === 31) return -60;
  if (toothNumber === 32) return -80;

  return 0;
};

/**
 * Get approximate tooth SVG coordinates (viewBox 0 0 100 100)
 */
export const getToothSVGCoordinates = (toothNumber: number): { x: number; y: number } => {
  // Upper right quadrant (teeth 1-8)
  if (toothNumber === 1) return { x: 75, y: 8 };
  if (toothNumber === 2) return { x: 72, y: 11 };
  if (toothNumber === 3) return { x: 67, y: 15 };
  if (toothNumber === 4) return { x: 62, y: 20 };
  if (toothNumber === 5) return { x: 58, y: 26 };
  if (toothNumber === 6) return { x: 56, y: 32 };
  if (toothNumber === 7) return { x: 56, y: 38 };
  if (toothNumber === 8) return { x: 56, y: 44 };

  // Upper left quadrant (teeth 9-16)
  if (toothNumber === 9) return { x: 44, y: 44 };
  if (toothNumber === 10) return { x: 44, y: 38 };
  if (toothNumber === 11) return { x: 44, y: 32 };
  if (toothNumber === 12) return { x: 42, y: 26 };
  if (toothNumber === 13) return { x: 38, y: 20 };
  if (toothNumber === 14) return { x: 33, y: 15 };
  if (toothNumber === 15) return { x: 28, y: 11 };
  if (toothNumber === 16) return { x: 25, y: 8 };

  // Lower right quadrant (teeth 17-24)
  if (toothNumber === 17) return { x: 75, y: 92 };
  if (toothNumber === 18) return { x: 72, y: 89 };
  if (toothNumber === 19) return { x: 67, y: 85 };
  if (toothNumber === 20) return { x: 62, y: 80 };
  if (toothNumber === 21) return { x: 58, y: 74 };
  if (toothNumber === 22) return { x: 56, y: 68 };
  if (toothNumber === 23) return { x: 56, y: 62 };
  if (toothNumber === 24) return { x: 56, y: 56 };

  // Lower left quadrant (teeth 25-32)
  if (toothNumber === 25) return { x: 44, y: 56 };
  if (toothNumber === 26) return { x: 44, y: 62 };
  if (toothNumber === 27) return { x: 44, y: 68 };
  if (toothNumber === 28) return { x: 42, y: 74 };
  if (toothNumber === 29) return { x: 38, y: 80 };
  if (toothNumber === 30) return { x: 33, y: 85 };
  if (toothNumber === 31) return { x: 28, y: 89 };
  if (toothNumber === 32) return { x: 25, y: 92 };

  return { x: 50, y: 50 }; // default center
};

// ---------------------------------------------------------------
// Surface Mapping Functions
// ---------------------------------------------------------------

/**
 * Get all available surfaces for a tooth
 */
export const getAllSurfaces = (toothNumber: number): Array<{ key: string; label: string }> => {
  const isLowerTooth = toothNumber >= 17 && toothNumber <= 32;
  const swapMesialDistal = isLowerTooth;
  const palatalOrLingual = isLowerTooth ? 'Lingual' : 'Palatal';

  return [
    { key: 'top', label: swapMesialDistal ? 'Distal' : 'Mesial' },
    { key: 'bottom', label: swapMesialDistal ? 'Mesial' : 'Distal' },
    { key: 'left', label: palatalOrLingual },
    { key: 'right', label: 'Buccal' },
    { key: 'center', label: 'Occlusal' },
  ];
};

/**
 * Get surface mapping for database operations
 * Lower teeth (17-32) have swapped mesial/distal positions on screen
 */
export const getSurfaceMap = (toothNumber: number): Record<keyof ToothSurfaceConditions, ToothSurface> => {
  const isLowerTooth = toothNumber >= 17 && toothNumber <= 32;

  return {
    top: isLowerTooth ? 'distal' : 'mesial',
    bottom: isLowerTooth ? 'mesial' : 'distal',
    left: 'lingual',
    right: 'buccal',
    center: 'occlusal',
  };
};

/**
 * Get surface name mapping (database → UI keys)
 * Lower teeth (17-32) have swapped mesial/distal positions on screen
 */
export const getSurfaceNameMap = (toothNumber: number): Record<string, keyof ToothSurfaceConditions> => {
  const isLowerTooth = toothNumber >= 17 && toothNumber <= 32;

  return {
    'mesial': isLowerTooth ? 'bottom' : 'top',
    'distal': isLowerTooth ? 'top' : 'bottom',
    'buccal': 'right',
    'lingual': 'left',
    'palatal': 'left',
    'occlusal': 'center',
  };
};
