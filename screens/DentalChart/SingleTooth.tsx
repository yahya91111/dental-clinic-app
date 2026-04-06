import React from 'react';
import { View, Text, Animated } from 'react-native';
import { scaledStyleSheet } from '../../lib/scale';
import {
  ToothWithSectionsSquareTiny,
  ToothWithSectionsSquareMedium,
} from './ToothShapes';
import { ToothConfig } from './TeethConfig';
import { CONDITION_COLORS } from './constants';
import type { ToothCondition } from '../../types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ToothSurfaceConditions {
  mesial?: string;
  distal?: string;
  buccal?: string;
  lingual?: string;
  occlusal?: string;
  palatal?: string;
  incisal?: string;
}

export interface SingleToothProps {
  config: ToothConfig;
  style: any;
  selectedTooth: number | string | null;
  isClosing: boolean;
  isEditModeActive: boolean;
  toothConditions: Record<number | string, ToothSurfaceConditions>;
  toothBorderColors: Record<number | string, ToothCondition>;
  // Animation values
  translateX: Animated.Value;
  translateY: Animated.Value;
  scale: Animated.Value;
  rotation: Animated.Value;
  slideAnim: Animated.Value;
  // Callbacks
  onToothPress: (toothNumber: number) => void;
  onSurfacePress: (surface: string) => void;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export const SingleTooth: React.FC<SingleToothProps> = ({
  config,
  style,
  selectedTooth,
  isClosing,
  isEditModeActive,
  toothConditions,
  toothBorderColors,
  translateX,
  translateY,
  scale,
  rotation,
  slideAnim,
  onToothPress,
  onSurfacePress,
}) => {
  const { number, shape, baseRotation, targetRotation, surfaceLabels, zIndexGroup } = config;
  const isSelected = selectedTooth === number;

  // Calculate zIndex based on selected tooth
  const calculateZIndex = (): number => {
    if (isSelected) return 1001;
    if (selectedTooth && zIndexGroup?.includes(selectedTooth as number)) return 998;
    return 999;
  };

  // Get the appropriate tooth shape component
  const ToothShape = shape === 'SquareTiny'
    ? ToothWithSectionsSquareTiny
    : ToothWithSectionsSquareMedium;

  return (
    <Animated.View
      style={[
        style,
        {
          zIndex: calculateZIndex(),
          elevation: calculateZIndex(),
        },
        {
          transform: [
            { translateX: Animated.add(isSelected ? translateX : new Animated.Value(0), slideAnim) },
            { translateY: isSelected ? translateY : 0 },
            { scale: isSelected ? scale : 1 },
            {
              rotate: isSelected
                ? rotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [baseRotation, targetRotation],
                  })
                : baseRotation,
            },
          ],
        },
        isEditModeActive && styles.toothGlowEffect,
      ]}
    >
      <ToothShape
        colors={toothConditions[number]}
        onToothPress={() => onToothPress(number)}
        onSurfacePress={isSelected && !isClosing ? onSurfacePress : undefined}
        borderColor={toothBorderColors[number] ? CONDITION_COLORS[toothBorderColors[number]] : undefined}
        rotation={config.rotation}
      />

      {/* Surface labels - shown when tooth is selected */}
      {isSelected && !isClosing && (
        <>
          <Text
            pointerEvents="none"
            style={[styles.surfaceLabel, styles.topLabel]}
          >
            {surfaceLabels.top}
          </Text>
          <Text
            pointerEvents="none"
            style={[styles.surfaceLabel, styles.bottomLabel]}
          >
            {surfaceLabels.bottom}
          </Text>
          <Text
            pointerEvents="none"
            style={[styles.surfaceLabel, styles.leftLabel]}
          >
            {surfaceLabels.left}
          </Text>
          <Text
            pointerEvents="none"
            style={[styles.surfaceLabel, styles.rightLabel]}
          >
            {surfaceLabels.right}
          </Text>
        </>
      )}
    </Animated.View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = scaledStyleSheet({
  toothGlowEffect: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  surfaceLabel: {
    position: 'absolute',
    fontSize: 4,
    fontWeight: 'bold',
    color: 'rgba(135, 206, 250, 0.95)',
  },
  topLabel: {
    top: -4,
    left: '50%',
    transform: [{ translateX: -2 }],
  },
  bottomLabel: {
    bottom: -4,
    left: '50%',
    transform: [{ translateX: -2 }],
  },
  leftLabel: {
    left: -4,
    top: '50%',
    transform: [{ translateY: -0.5 }],
  },
  rightLabel: {
    right: -4,
    top: '50%',
    transform: [{ translateY: -0.5 }],
  },
});

export default SingleTooth;
