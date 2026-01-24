import React, { useRef } from 'react';
import { Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Tooth position data for animation calculations
interface ToothPosition {
  right?: number;
  left?: number;
  top?: string;
  bottom?: string;
  width: number;
  height: number;
  baseRotation: string; // Base rotation when not selected
}

// Position data for all 32 teeth
const TOOTH_POSITIONS: Record<number, ToothPosition> = {
  // Upper Right Quadrant (1-8)
  1: { right: 160, top: '7.5%', width: 33, height: 42, baseRotation: '-80deg' },
  2: { right: 120, top: '10%', width: 33, height: 42, baseRotation: '-60deg' },
  3: { right: 90, top: '14%', width: 33, height: 42, baseRotation: '-35deg' },
  4: { right: 67, top: '18.5%', width: 33, height: 42, baseRotation: '-20deg' },
  5: { right: 55, top: '24%', width: 33, height: 42, baseRotation: '-15deg' },
  6: { right: 45, top: '30%', width: 37, height: 47, baseRotation: '-5deg' },
  7: { right: 45, top: '36%', width: 37, height: 47, baseRotation: '0deg' },
  8: { right: 45, top: '42%', width: 37, height: 47, baseRotation: '0deg' },

  // Upper Left Quadrant (9-16)
  9: { left: 160, top: '7.5%', width: 33, height: 42, baseRotation: '80deg' },
  10: { left: 120, top: '10%', width: 33, height: 42, baseRotation: '60deg' },
  11: { left: 90, top: '14%', width: 33, height: 42, baseRotation: '35deg' },
  12: { left: 67, top: '18.5%', width: 33, height: 42, baseRotation: '20deg' },
  13: { left: 55, top: '24%', width: 33, height: 42, baseRotation: '15deg' },
  14: { left: 45, top: '30%', width: 37, height: 47, baseRotation: '5deg' },
  15: { left: 45, top: '36%', width: 37, height: 47, baseRotation: '0deg' },
  16: { left: 45, top: '42%', width: 37, height: 47, baseRotation: '0deg' },

  // Lower Right Quadrant (17-24)
  17: { right: 45, top: '58%', width: 37, height: 47, baseRotation: '0deg' },
  18: { right: 45, top: '64%', width: 37, height: 47, baseRotation: '0deg' },
  19: { right: 45, top: '70%', width: 37, height: 47, baseRotation: '5deg' },
  20: { right: 55, top: '76%', width: 33, height: 42, baseRotation: '20deg' },
  21: { right: 67, top: '81.5%', width: 33, height: 42, baseRotation: '15deg' },
  22: { right: 90, top: '86%', width: 33, height: 42, baseRotation: '0deg' },
  23: { right: 120, top: '90%', width: 33, height: 42, baseRotation: '0deg' },
  24: { right: 160, top: '92.5%', width: 33, height: 42, baseRotation: '0deg' },

  // Lower Left Quadrant (25-32)
  25: { left: 160, bottom: '7.5%', width: 33, height: 42, baseRotation: '80deg' },
  26: { left: 120, bottom: '10%', width: 33, height: 42, baseRotation: '60deg' },
  27: { left: 90, bottom: '14%', width: 33, height: 42, baseRotation: '35deg' },
  28: { left: 67, bottom: '18.5%', width: 33, height: 42, baseRotation: '20deg' },
  29: { left: 55, bottom: '24%', width: 33, height: 42, baseRotation: '15deg' },
  30: { left: 90, bottom: '14%', width: 33, height: 42, baseRotation: '-35deg' },
  31: { left: 120, bottom: '10%', width: 33, height: 42, baseRotation: '-60deg' },
  32: { left: 160, bottom: '7.5%', width: 33, height: 42, baseRotation: '-80deg' },
};

export interface ToothAnimationValues {
  scale: Animated.Value;
  rotation: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
}

export interface UseToothAnimationsReturn {
  // Get animation values for a specific tooth
  getToothAnimations: (toothNumber: number) => ToothAnimationValues;

  // Stop all animations for a tooth and reset to default
  stopToothAnimations: (toothNumber: number) => void;

  // Animate tooth to center of screen
  animateToothToCenter: (toothNumber: number) => void;

  // Animate tooth back to original position
  animateToothToOriginal: (toothNumber: number, callback?: () => void) => void;

  // View mode animations
  rightTeethSlide: Animated.Value;
  leftTeethSlide: Animated.Value;
  editButtonSlide: Animated.Value;
  verticalTopLineSlide: Animated.Value;
  verticalBottomLineSlide: Animated.Value;
  horizontalRightLineSlide: Animated.Value;
  horizontalLeftLineSlide: Animated.Value;
  rightNumbersSlide: Animated.Value;
  leftNumbersSlide: Animated.Value;
  oralHygieneOpacity: Animated.Value;
  viewButtonPositionAnim: Animated.Value;
  buttonsOpacity: Animated.Value;
  referralContainerSlide: Animated.Value;
  referralSectionsHeight: Animated.Value;
  treatmentRecordSlide: Animated.Value;
  planningRecordSlide: Animated.Value;
  treatmentRecordPushDown: Animated.Value;
  planningRecordPushDown: Animated.Value;

  // Get base rotation for tooth
  getBaseRotation: (toothNumber: number) => string;

  // Get tooth position data
  getToothPosition: (toothNumber: number) => ToothPosition | undefined;
}

export function useToothAnimations(): UseToothAnimationsReturn {
  // Create animated values for all 32 teeth
  const toothAnimations = useRef<Record<number, ToothAnimationValues>>({});

  // Initialize animations for each tooth lazily
  const getToothAnimations = (toothNumber: number): ToothAnimationValues => {
    if (!toothAnimations.current[toothNumber]) {
      toothAnimations.current[toothNumber] = {
        scale: new Animated.Value(1),
        rotation: new Animated.Value(0),
        translateX: new Animated.Value(0),
        translateY: new Animated.Value(0),
      };
    }
    return toothAnimations.current[toothNumber];
  };

  // View mode animation values
  const rightTeethSlide = useRef(new Animated.Value(0)).current;
  const leftTeethSlide = useRef(new Animated.Value(0)).current;
  const editButtonSlide = useRef(new Animated.Value(0)).current;
  const verticalTopLineSlide = useRef(new Animated.Value(0)).current;
  const verticalBottomLineSlide = useRef(new Animated.Value(0)).current;
  const horizontalRightLineSlide = useRef(new Animated.Value(0)).current;
  const horizontalLeftLineSlide = useRef(new Animated.Value(0)).current;
  const rightNumbersSlide = useRef(new Animated.Value(0)).current;
  const leftNumbersSlide = useRef(new Animated.Value(0)).current;
  const oralHygieneOpacity = useRef(new Animated.Value(1)).current;
  const viewButtonPositionAnim = useRef(new Animated.Value(0)).current;
  const buttonsOpacity = useRef(new Animated.Value(1)).current;
  const referralContainerSlide = useRef(new Animated.Value(1000)).current;
  const referralSectionsHeight = useRef(new Animated.Value(0)).current;
  const treatmentRecordSlide = useRef(new Animated.Value(-1000)).current;
  const planningRecordSlide = useRef(new Animated.Value(1000)).current;
  const treatmentRecordPushDown = useRef(new Animated.Value(0)).current;
  const planningRecordPushDown = useRef(new Animated.Value(0)).current;

  // Stop all animations for a specific tooth
  const stopToothAnimations = (toothNumber: number) => {
    const anims = getToothAnimations(toothNumber);
    anims.scale.stopAnimation();
    anims.rotation.stopAnimation();
    anims.translateX.stopAnimation();
    anims.translateY.stopAnimation();

    // Reset to default values
    anims.scale.setValue(1);
    anims.rotation.setValue(0);
    anims.translateX.setValue(0);
    anims.translateY.setValue(0);
  };

  // Calculate move coordinates to center
  const calculateMoveToCenter = (toothNumber: number): { moveX: number; moveY: number } => {
    const pos = TOOTH_POSITIONS[toothNumber];
    if (!pos) return { moveX: 0, moveY: 0 };

    const screenCenterX = SCREEN_WIDTH / 2;
    const screenCenterY = SCREEN_HEIGHT / 2;

    let toothCenterX: number;
    let toothCenterY: number;

    if (pos.right !== undefined && pos.top !== undefined) {
      // Upper right or lower right teeth with top position
      const topPercent = parseFloat(pos.top) / 100;
      toothCenterX = SCREEN_WIDTH - pos.right - pos.width / 2;
      toothCenterY = SCREEN_HEIGHT * topPercent + pos.height / 2;
    } else if (pos.left !== undefined && pos.top !== undefined) {
      // Upper left teeth
      const topPercent = parseFloat(pos.top) / 100;
      toothCenterX = pos.left + pos.width / 2;
      toothCenterY = SCREEN_HEIGHT * topPercent + pos.height / 2;
    } else if (pos.left !== undefined && pos.bottom !== undefined) {
      // Lower left teeth
      const bottomPercent = parseFloat(pos.bottom) / 100;
      toothCenterX = pos.left + pos.width / 2;
      toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height / 2);
    } else {
      return { moveX: 0, moveY: 0 };
    }

    // Offset for right side teeth to accommodate menu
    const offsetX = pos.right !== undefined ? 20 : 0;

    return {
      moveX: screenCenterX - toothCenterX + offsetX,
      moveY: screenCenterY - toothCenterY,
    };
  };

  // Animate tooth to center of screen
  const animateToothToCenter = (toothNumber: number) => {
    const anims = getToothAnimations(toothNumber);

    // Stop any running animations
    anims.scale.stopAnimation();
    anims.rotation.stopAnimation();
    anims.translateX.stopAnimation();
    anims.translateY.stopAnimation();

    // Reset values
    anims.scale.setValue(1);
    anims.rotation.setValue(0);
    anims.translateX.setValue(0);
    anims.translateY.setValue(0);

    // Calculate move coordinates
    const { moveX, moveY } = calculateMoveToCenter(toothNumber);

    // Run animations in parallel
    Animated.parallel([
      Animated.spring(anims.scale, {
        toValue: 8,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(anims.rotation, {
        toValue: 1, // Will be interpolated to target rotation
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(anims.translateX, {
        toValue: moveX,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(anims.translateY, {
        toValue: moveY,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
    ]).start();
  };

  // Animate tooth back to original position
  const animateToothToOriginal = (toothNumber: number, callback?: () => void) => {
    const anims = getToothAnimations(toothNumber);

    Animated.parallel([
      Animated.spring(anims.scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(anims.rotation, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(anims.translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(anims.translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
    ]).start(callback);
  };

  // Get base rotation for a tooth
  const getBaseRotation = (toothNumber: number): string => {
    return TOOTH_POSITIONS[toothNumber]?.baseRotation || '0deg';
  };

  // Get tooth position data
  const getToothPosition = (toothNumber: number): ToothPosition | undefined => {
    return TOOTH_POSITIONS[toothNumber];
  };

  return {
    getToothAnimations,
    stopToothAnimations,
    animateToothToCenter,
    animateToothToOriginal,
    rightTeethSlide,
    leftTeethSlide,
    editButtonSlide,
    verticalTopLineSlide,
    verticalBottomLineSlide,
    horizontalRightLineSlide,
    horizontalLeftLineSlide,
    rightNumbersSlide,
    leftNumbersSlide,
    oralHygieneOpacity,
    viewButtonPositionAnim,
    buttonsOpacity,
    referralContainerSlide,
    referralSectionsHeight,
    treatmentRecordSlide,
    planningRecordSlide,
    treatmentRecordPushDown,
    planningRecordPushDown,
    getBaseRotation,
    getToothPosition,
  };
}

// Export tooth positions for external use
export { TOOTH_POSITIONS };
export type { ToothPosition };
