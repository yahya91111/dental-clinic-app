// ═══════════════════════════════════════════════════════════════
// Teeth Configuration Data
// ═══════════════════════════════════════════════════════════════

export type ToothShapeType =
  | 'SquareTiny'      // Molars (6,7,8)
  | 'SquareMedium'    // Premolars and some others (1,2,3,4,5)
  | 'Canine'
  | 'Incisor';

export interface ToothConfig {
  number: number;
  shape: ToothShapeType;
  baseRotation: string;       // الزاوية الأساسية عند عدم التحديد
  targetRotation: string;     // الزاوية المستهدفة عند التحديد
  quadrant: 'upperRight' | 'upperLeft' | 'lowerRight' | 'lowerLeft';
  slideDirection: 'right' | 'left';  // للتحريك مع View Mode
  surfaceLabels: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
  zIndexGroup?: number[];     // أسنان تؤثر على zIndex
  rotation?: number;          // للأسنان التي تحتاج rotation prop في ToothShape
}

// Upper Right Quadrant (1-8) - تتحرك مع rightTeethSlide
const UPPER_RIGHT: ToothConfig[] = [
  {
    number: 8,
    shape: 'SquareTiny',
    baseRotation: '0deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
  },
  {
    number: 7,
    shape: 'SquareTiny',
    baseRotation: '0deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
  },
  {
    number: 6,
    shape: 'SquareTiny',
    baseRotation: '0deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
  },
  {
    number: 5,
    shape: 'SquareMedium',
    baseRotation: '-15deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
  },
  {
    number: 4,
    shape: 'SquareMedium',
    baseRotation: '-20deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
    zIndexGroup: [5, 6, 7, 8],
  },
  {
    number: 3,
    shape: 'SquareMedium',
    baseRotation: '-35deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
    zIndexGroup: [5, 6, 7, 8],
  },
  {
    number: 2,
    shape: 'SquareMedium',
    baseRotation: '-60deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
    zIndexGroup: [5, 6, 7, 8],
  },
  {
    number: 1,
    shape: 'SquareMedium',
    baseRotation: '-80deg',
    targetRotation: '-90deg',
    quadrant: 'upperRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'P', right: 'B' },
    zIndexGroup: [5, 6, 7, 8],
  },
];

// Upper Left Quadrant (9-16) - تتحرك مع leftTeethSlide
const UPPER_LEFT: ToothConfig[] = [
  {
    number: 9,
    shape: 'SquareTiny',
    baseRotation: '0deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
  },
  {
    number: 10,
    shape: 'SquareTiny',
    baseRotation: '0deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
  },
  {
    number: 11,
    shape: 'SquareTiny',
    baseRotation: '0deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
  },
  {
    number: 12,
    shape: 'SquareMedium',
    baseRotation: '15deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
    zIndexGroup: [9, 10, 11],
  },
  {
    number: 13,
    shape: 'SquareMedium',
    baseRotation: '20deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
    zIndexGroup: [9, 10, 11],
  },
  {
    number: 14,
    shape: 'SquareMedium',
    baseRotation: '35deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
    zIndexGroup: [9, 10, 11],
  },
  {
    number: 15,
    shape: 'SquareMedium',
    baseRotation: '60deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
    zIndexGroup: [9, 10, 11],
  },
  {
    number: 16,
    shape: 'SquareMedium',
    baseRotation: '80deg',
    targetRotation: '90deg',
    quadrant: 'upperLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'M', bottom: 'D', left: 'B', right: 'P' },
    rotation: 90,
    zIndexGroup: [9, 10, 11, 12],
  },
];

// Lower Right Quadrant (17-24) - تتحرك مع rightTeethSlide
const LOWER_RIGHT: ToothConfig[] = [
  {
    number: 17,
    shape: 'SquareMedium',
    baseRotation: '0deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
  },
  {
    number: 18,
    shape: 'SquareMedium',
    baseRotation: '0deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
  },
  {
    number: 19,
    shape: 'SquareMedium',
    baseRotation: '0deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
  },
  {
    number: 20,
    shape: 'SquareMedium',
    baseRotation: '15deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
    zIndexGroup: [17, 18, 19],
  },
  {
    number: 21,
    shape: 'SquareMedium',
    baseRotation: '20deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
    zIndexGroup: [17, 18, 19],
  },
  {
    number: 22,
    shape: 'SquareTiny',
    baseRotation: '35deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
    zIndexGroup: [17, 18, 19],
  },
  {
    number: 23,
    shape: 'SquareTiny',
    baseRotation: '60deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
    zIndexGroup: [17, 18, 19, 20],
  },
  {
    number: 24,
    shape: 'SquareTiny',
    baseRotation: '80deg',
    targetRotation: '-90deg',
    quadrant: 'lowerRight',
    slideDirection: 'right',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'L', right: 'B' },
    zIndexGroup: [17, 18, 19, 20, 21],
  },
];

// Lower Left Quadrant (25-32) - تتحرك مع leftTeethSlide
const LOWER_LEFT: ToothConfig[] = [
  {
    number: 25,
    shape: 'SquareTiny',
    baseRotation: '80deg',
    targetRotation: '90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    rotation: 90,
  },
  {
    number: 26,
    shape: 'SquareTiny',
    baseRotation: '60deg',
    targetRotation: '90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    rotation: 90,
  },
  {
    number: 27,
    shape: 'SquareTiny',
    baseRotation: '35deg',
    targetRotation: '90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    rotation: 90,
  },
  {
    number: 28,
    shape: 'SquareMedium',
    baseRotation: '20deg',
    targetRotation: '90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    rotation: 90,
    zIndexGroup: [25, 26, 27],
  },
  {
    number: 29,
    shape: 'SquareMedium',
    baseRotation: '-20deg',
    targetRotation: '-90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    zIndexGroup: [25, 26, 27, 28],
  },
  {
    number: 30,
    shape: 'SquareMedium',
    baseRotation: '-35deg',
    targetRotation: '-90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    zIndexGroup: [25, 26, 27, 28],
  },
  {
    number: 31,
    shape: 'SquareMedium',
    baseRotation: '-60deg',
    targetRotation: '-90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    zIndexGroup: [25, 26, 27, 28],
  },
  {
    number: 32,
    shape: 'SquareMedium',
    baseRotation: '-80deg',
    targetRotation: '-90deg',
    quadrant: 'lowerLeft',
    slideDirection: 'left',
    surfaceLabels: { top: 'D', bottom: 'M', left: 'B', right: 'L' },
    zIndexGroup: [25, 26, 27, 28],
  },
];

// الأسنان مرتبة حسب الترتيب
export const TEETH_CONFIG: ToothConfig[] = [
  ...UPPER_RIGHT,
  ...UPPER_LEFT,
  ...LOWER_RIGHT,
  ...LOWER_LEFT,
];

// Helper للحصول على بيانات سن محددة
export const getToothConfig = (toothNumber: number): ToothConfig | undefined => {
  return TEETH_CONFIG.find(t => t.number === toothNumber);
};

// Helper للحصول على أرقام Palmer
export const getPalmerNumber = (toothNumber: number): string => {
  // Upper Right: 1-8 → 8-1
  if (toothNumber >= 1 && toothNumber <= 8) {
    return String(9 - toothNumber);
  }
  // Upper Left: 9-16 → 1-8
  if (toothNumber >= 9 && toothNumber <= 16) {
    return String(toothNumber - 8);
  }
  // Lower Right: 17-24 → 8-1
  if (toothNumber >= 17 && toothNumber <= 24) {
    return String(25 - toothNumber);
  }
  // Lower Left: 25-32 → 1-8
  if (toothNumber >= 25 && toothNumber <= 32) {
    return String(toothNumber - 24);
  }
  return String(toothNumber);
};
