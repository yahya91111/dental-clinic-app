import React from 'react';
import { View, Text, Animated } from 'react-native';
import { styles } from './styles';
import {
  ToothWithSectionsSquareTiny,
  ToothWithSectionsSquareMedium,
} from './ToothShapes';
import { CONDITION_COLORS } from './constants';
import { ToothSurfaceConditions } from './dentalHelpers';
import type { ToothCondition } from '../../types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

// Re-export ToothSurfaceConditions for external use
export type { ToothSurfaceConditions };

// Interface لـ Animated Values لكل سن
export interface ToothAnimValues {
  scale: Animated.Value;
  rotation: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
}

// Props للمكون
export interface TeethGridProps {
  // State
  selectedTooth: number | string | null;
  isClosing: boolean;
  isEditModeActive: boolean;
  toothConditions: Record<number | string, ToothSurfaceConditions>;
  toothBorderColors: Record<number | string, ToothCondition>;

  // Slide animations
  rightTeethSlide: Animated.Value;
  leftTeethSlide: Animated.Value;
  rightNumbersSlide: Animated.Value;
  leftNumbersSlide: Animated.Value;

  // Individual tooth animations (1-32)
  getToothAnims: (toothNumber: number) => ToothAnimValues;

  // Callbacks
  onToothPress: (toothNumber: number) => void;
  onSurfacePress: (surface: keyof ToothSurfaceConditions) => void;
}

// ═══════════════════════════════════════════════════════════════
// Helper: Surface Label Component
// ═══════════════════════════════════════════════════════════════

const SurfaceLabel: React.FC<{
  position: 'top' | 'bottom' | 'left' | 'right';
  label: string;
}> = ({ position, label }) => {
  const baseStyle: any = {
    position: 'absolute',
    fontSize: 4,
    fontWeight: 'bold',
    color: 'rgba(135, 206, 250, 0.95)',
  };

  const positionStyles: Record<string, any> = {
    top: { top: -4, left: '50%', transform: [{ translateX: -2 }] },
    bottom: { bottom: -4, left: '50%', transform: [{ translateX: -2 }] },
    left: { left: -4, top: '50%', transform: [{ translateY: -0.5 }] },
    right: { right: -4, top: '50%', transform: [{ translateY: -0.5 }] },
  };

  return (
    <Text pointerEvents="none" style={[baseStyle, positionStyles[position]]}>
      {label}
    </Text>
  );
};

// ═══════════════════════════════════════════════════════════════
// Surface Labels for different quadrants
// ═══════════════════════════════════════════════════════════════

const UpperRightLabels = () => (
  <>
    <SurfaceLabel position="top" label="M" />
    <SurfaceLabel position="bottom" label="D" />
    <SurfaceLabel position="left" label="P" />
    <SurfaceLabel position="right" label="B" />
  </>
);

const UpperLeftLabels = () => (
  <>
    <SurfaceLabel position="top" label="M" />
    <SurfaceLabel position="bottom" label="D" />
    <SurfaceLabel position="left" label="B" />
    <SurfaceLabel position="right" label="P" />
  </>
);

const LowerRightLabels = () => (
  <>
    <SurfaceLabel position="top" label="D" />
    <SurfaceLabel position="bottom" label="M" />
    <SurfaceLabel position="left" label="L" />
    <SurfaceLabel position="right" label="B" />
  </>
);

const LowerLeftLabels = () => (
  <>
    <SurfaceLabel position="top" label="D" />
    <SurfaceLabel position="bottom" label="M" />
    <SurfaceLabel position="left" label="B" />
    <SurfaceLabel position="right" label="L" />
  </>
);

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export const TeethGrid: React.FC<TeethGridProps> = ({
  selectedTooth,
  isClosing,
  isEditModeActive,
  toothConditions,
  toothBorderColors,
  rightTeethSlide,
  leftTeethSlide,
  rightNumbersSlide,
  leftNumbersSlide,
  getToothAnims,
  onToothPress,
  onSurfacePress,
}) => {
  // Helper to get border color
  const getBorderColor = (toothNum: number) =>
    toothBorderColors[toothNum] ? CONDITION_COLORS[toothBorderColors[toothNum]] : undefined;

  // Helper to get surface press handler
  const getSurfacePressHandler = (toothNum: number) =>
    selectedTooth === toothNum && !isClosing ? onSurfacePress : undefined;

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Upper Right Quadrant (1-8) */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* Tooth #8 */}
      <Animated.View
        style={[
          styles.tooth8,
          {
            zIndex: selectedTooth === 8 ? 1001 : 999,
            elevation: selectedTooth === 8 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 8 ? getToothAnims(8).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 8 ? getToothAnims(8).translateY : 0 },
              { scale: selectedTooth === 8 ? getToothAnims(8).scale : 1 },
              { rotate: selectedTooth === 8 ? getToothAnims(8).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '-90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[8]}
          onToothPress={() => onToothPress(8)}
          onSurfacePress={getSurfacePressHandler(8)}
          borderColor={getBorderColor(8)}
        />
        {selectedTooth === 8 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth #7 */}
      <Animated.View
        style={[
          styles.tooth7,
          {
            zIndex: selectedTooth === 7 ? 1001 : 999,
            elevation: selectedTooth === 7 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 7 ? getToothAnims(7).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 7 ? getToothAnims(7).translateY : 0 },
              { scale: selectedTooth === 7 ? getToothAnims(7).scale : 1 },
              { rotate: selectedTooth === 7 ? getToothAnims(7).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '-90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[7]}
          onToothPress={() => onToothPress(7)}
          onSurfacePress={getSurfacePressHandler(7)}
          borderColor={getBorderColor(7)}
        />
        {selectedTooth === 7 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth #6 */}
      <Animated.View
        style={[
          styles.tooth6,
          {
            zIndex: selectedTooth === 6 ? 1001 : 999,
            elevation: selectedTooth === 6 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 6 ? getToothAnims(6).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 6 ? getToothAnims(6).translateY : 0 },
              { scale: selectedTooth === 6 ? getToothAnims(6).scale : 1 },
              { rotate: selectedTooth === 6 ? getToothAnims(6).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '-90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[6]}
          onToothPress={() => onToothPress(6)}
          onSurfacePress={getSurfacePressHandler(6)}
          borderColor={getBorderColor(6)}
        />
        {selectedTooth === 6 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth #5 */}
      <Animated.View
        style={[
          styles.tooth5,
          {
            zIndex: selectedTooth === 5 ? 1001 : 999,
            elevation: selectedTooth === 5 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 5 ? getToothAnims(5).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 5 ? getToothAnims(5).translateY : 0 },
              { scale: selectedTooth === 5 ? getToothAnims(5).scale : 1 },
              { rotate: selectedTooth === 5 ? getToothAnims(5).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-15deg', '-90deg'],
              }) : '-15deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[5]}
          onToothPress={() => onToothPress(5)}
          onSurfacePress={getSurfacePressHandler(5)}
          borderColor={getBorderColor(5)}
        />
        {selectedTooth === 5 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth #4 */}
      <Animated.View
        style={[
          styles.tooth4,
          {
            zIndex: selectedTooth === 4 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 4 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 4 ? getToothAnims(4).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 4 ? getToothAnims(4).translateY : 0 },
              { scale: selectedTooth === 4 ? getToothAnims(4).scale : 1 },
              { rotate: selectedTooth === 4 ? getToothAnims(4).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-20deg', '-90deg'],
              }) : '-20deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[4]}
          onToothPress={() => onToothPress(4)}
          onSurfacePress={getSurfacePressHandler(4)}
          borderColor={getBorderColor(4)}
        />
        {selectedTooth === 4 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth #3 */}
      <Animated.View
        style={[
          styles.tooth3,
          {
            zIndex: selectedTooth === 3 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 3 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 3 ? getToothAnims(3).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 3 ? getToothAnims(3).translateY : 0 },
              { scale: selectedTooth === 3 ? getToothAnims(3).scale : 1 },
              { rotate: selectedTooth === 3 ? getToothAnims(3).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-35deg', '-90deg'],
              }) : '-35deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[3]}
          onToothPress={() => onToothPress(3)}
          onSurfacePress={getSurfacePressHandler(3)}
          borderColor={getBorderColor(3)}
        />
        {selectedTooth === 3 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth #2 */}
      <Animated.View
        style={[
          styles.tooth2,
          {
            zIndex: selectedTooth === 2 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 2 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 2 ? getToothAnims(2).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 2 ? getToothAnims(2).translateY : 0 },
              { scale: selectedTooth === 2 ? getToothAnims(2).scale : 1 },
              { rotate: selectedTooth === 2 ? getToothAnims(2).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-60deg', '-90deg'],
              }) : '-60deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[2]}
          onToothPress={() => onToothPress(2)}
          onSurfacePress={getSurfacePressHandler(2)}
          borderColor={getBorderColor(2)}
        />
        {selectedTooth === 2 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth #1 */}
      <Animated.View
        style={[
          styles.tooth1,
          {
            zIndex: selectedTooth === 1 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 1 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 1 ? getToothAnims(1).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 1 ? getToothAnims(1).translateY : 0 },
              { scale: selectedTooth === 1 ? getToothAnims(1).scale : 1 },
              { rotate: selectedTooth === 1 ? getToothAnims(1).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-80deg', '-90deg'],
              }) : '-80deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[1]}
          onToothPress={() => onToothPress(1)}
          onSurfacePress={getSurfacePressHandler(1)}
          borderColor={getBorderColor(1)}
        />
        {selectedTooth === 1 && !isClosing && <UpperRightLabels />}
      </Animated.View>

      {/* Tooth Numbers for Upper Right Quadrant (1-8) */}
      <Animated.View style={[styles.toothNumber1, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>1</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber2, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>2</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber3, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>3</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber4, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>4</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber5, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>5</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber6, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>6</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber7, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>7</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber8, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>8</Text>
      </Animated.View>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Upper Left Quadrant (9-16) */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* Tooth #9 */}
      <Animated.View
        style={[
          styles.tooth9,
          {
            zIndex: selectedTooth === 9 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 9 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 9 ? getToothAnims(9).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 9 ? getToothAnims(9).translateY : 0 },
              { scale: selectedTooth === 9 ? getToothAnims(9).scale : 1 },
              { rotate: selectedTooth === 9 ? getToothAnims(9).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[9]}
          onToothPress={() => onToothPress(9)}
          onSurfacePress={getSurfacePressHandler(9)}
          rotation={90}
          borderColor={getBorderColor(9)}
        />
        {selectedTooth === 9 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth #10 */}
      <Animated.View
        style={[
          styles.tooth10,
          {
            zIndex: selectedTooth === 10 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 10 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 10 ? getToothAnims(10).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 10 ? getToothAnims(10).translateY : 0 },
              { scale: selectedTooth === 10 ? getToothAnims(10).scale : 1 },
              { rotate: selectedTooth === 10 ? getToothAnims(10).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[10]}
          onToothPress={() => onToothPress(10)}
          onSurfacePress={getSurfacePressHandler(10)}
          rotation={90}
          borderColor={getBorderColor(10)}
        />
        {selectedTooth === 10 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth #11 */}
      <Animated.View
        style={[
          styles.tooth11,
          {
            zIndex: selectedTooth === 11 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 11 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 11 ? getToothAnims(11).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 11 ? getToothAnims(11).translateY : 0 },
              { scale: selectedTooth === 11 ? getToothAnims(11).scale : 1 },
              { rotate: selectedTooth === 11 ? getToothAnims(11).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[11]}
          onToothPress={() => onToothPress(11)}
          onSurfacePress={getSurfacePressHandler(11)}
          rotation={90}
          borderColor={getBorderColor(11)}
        />
        {selectedTooth === 11 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth #12 */}
      <Animated.View
        style={[
          styles.tooth12,
          {
            zIndex: selectedTooth === 12 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 12 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 12 ? getToothAnims(12).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 12 ? getToothAnims(12).translateY : 0 },
              { scale: selectedTooth === 12 ? getToothAnims(12).scale : 1 },
              { rotate: selectedTooth === 12 ? getToothAnims(12).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['15deg', '90deg'],
              }) : '15deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[12]}
          onToothPress={() => onToothPress(12)}
          onSurfacePress={getSurfacePressHandler(12)}
          rotation={90}
          borderColor={getBorderColor(12)}
        />
        {selectedTooth === 12 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth #13 */}
      <Animated.View
        style={[
          styles.tooth13,
          {
            zIndex: selectedTooth === 13 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 13 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 13 ? getToothAnims(13).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 13 ? getToothAnims(13).translateY : 0 },
              { scale: selectedTooth === 13 ? getToothAnims(13).scale : 1 },
              { rotate: selectedTooth === 13 ? getToothAnims(13).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['20deg', '90deg'],
              }) : '20deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[13]}
          onToothPress={() => onToothPress(13)}
          onSurfacePress={getSurfacePressHandler(13)}
          rotation={90}
          borderColor={getBorderColor(13)}
        />
        {selectedTooth === 13 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth #14 */}
      <Animated.View
        style={[
          styles.tooth14,
          {
            zIndex: selectedTooth === 14 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 14 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 14 ? getToothAnims(14).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 14 ? getToothAnims(14).translateY : 0 },
              { scale: selectedTooth === 14 ? getToothAnims(14).scale : 1 },
              { rotate: selectedTooth === 14 ? getToothAnims(14).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['35deg', '90deg'],
              }) : '35deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[14]}
          onToothPress={() => onToothPress(14)}
          onSurfacePress={getSurfacePressHandler(14)}
          rotation={90}
          borderColor={getBorderColor(14)}
        />
        {selectedTooth === 14 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth #15 */}
      <Animated.View
        style={[
          styles.tooth15,
          {
            zIndex: selectedTooth === 15 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 15 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 15 ? getToothAnims(15).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 15 ? getToothAnims(15).translateY : 0 },
              { scale: selectedTooth === 15 ? getToothAnims(15).scale : 1 },
              { rotate: selectedTooth === 15 ? getToothAnims(15).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['60deg', '90deg'],
              }) : '60deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[15]}
          onToothPress={() => onToothPress(15)}
          onSurfacePress={getSurfacePressHandler(15)}
          rotation={90}
          borderColor={getBorderColor(15)}
        />
        {selectedTooth === 15 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth #16 */}
      <Animated.View
        style={[
          styles.tooth16,
          {
            zIndex: selectedTooth === 16 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 16 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 16 ? getToothAnims(16).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 16 ? getToothAnims(16).translateY : 0 },
              { scale: selectedTooth === 16 ? getToothAnims(16).scale : 1 },
              { rotate: selectedTooth === 16 ? getToothAnims(16).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['80deg', '90deg'],
              }) : '80deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[16]}
          onToothPress={() => onToothPress(16)}
          onSurfacePress={getSurfacePressHandler(16)}
          rotation={90}
          borderColor={getBorderColor(16)}
        />
        {selectedTooth === 16 && !isClosing && <UpperLeftLabels />}
      </Animated.View>

      {/* Tooth Numbers for Upper Left Quadrant (9-16) */}
      <Animated.View style={[styles.toothNumber9, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>1</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber10, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>2</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber11, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>3</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber12, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>4</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber13, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>5</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber14, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>6</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber15, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>7</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber16, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>8</Text>
      </Animated.View>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Lower Right Quadrant (17-24) */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* Tooth #17 */}
      <Animated.View
        style={[
          styles.tooth17,
          {
            zIndex: selectedTooth === 17 ? 1001 : 999,
            elevation: selectedTooth === 17 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 17 ? getToothAnims(17).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 17 ? getToothAnims(17).translateY : 0 },
              { scale: selectedTooth === 17 ? getToothAnims(17).scale : 1 },
              { rotate: selectedTooth === 17 ? getToothAnims(17).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '-90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[17]}
          onToothPress={() => onToothPress(17)}
          onSurfacePress={getSurfacePressHandler(17)}
          borderColor={getBorderColor(17)}
        />
        {selectedTooth === 17 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth #18 */}
      <Animated.View
        style={[
          styles.tooth18,
          {
            zIndex: selectedTooth === 18 ? 1001 : 999,
            elevation: selectedTooth === 18 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 18 ? getToothAnims(18).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 18 ? getToothAnims(18).translateY : 0 },
              { scale: selectedTooth === 18 ? getToothAnims(18).scale : 1 },
              { rotate: selectedTooth === 18 ? getToothAnims(18).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '-90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[18]}
          onToothPress={() => onToothPress(18)}
          onSurfacePress={getSurfacePressHandler(18)}
          borderColor={getBorderColor(18)}
        />
        {selectedTooth === 18 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth #19 */}
      <Animated.View
        style={[
          styles.tooth19,
          {
            zIndex: selectedTooth === 19 ? 1001 : 999,
            elevation: selectedTooth === 19 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 19 ? getToothAnims(19).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 19 ? getToothAnims(19).translateY : 0 },
              { scale: selectedTooth === 19 ? getToothAnims(19).scale : 1 },
              { rotate: selectedTooth === 19 ? getToothAnims(19).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '-90deg'],
              }) : '0deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[19]}
          onToothPress={() => onToothPress(19)}
          onSurfacePress={getSurfacePressHandler(19)}
          borderColor={getBorderColor(19)}
        />
        {selectedTooth === 19 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth #20 */}
      <Animated.View
        style={[
          styles.tooth20,
          {
            zIndex: selectedTooth === 20 ? 1001 : (selectedTooth && [17,18,19].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 20 ? 1001 : (selectedTooth && [17,18,19].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 20 ? getToothAnims(20).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 20 ? getToothAnims(20).translateY : 0 },
              { scale: selectedTooth === 20 ? getToothAnims(20).scale : 1 },
              { rotate: selectedTooth === 20 ? getToothAnims(20).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['15deg', '-90deg'],
              }) : '15deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[20]}
          onToothPress={() => onToothPress(20)}
          onSurfacePress={getSurfacePressHandler(20)}
          borderColor={getBorderColor(20)}
        />
        {selectedTooth === 20 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth #21 */}
      <Animated.View
        style={[
          styles.tooth21,
          {
            zIndex: selectedTooth === 21 ? 1001 : (selectedTooth && [17,18,19].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 21 ? 1001 : (selectedTooth && [17,18,19].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 21 ? getToothAnims(21).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 21 ? getToothAnims(21).translateY : 0 },
              { scale: selectedTooth === 21 ? getToothAnims(21).scale : 1 },
              { rotate: selectedTooth === 21 ? getToothAnims(21).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['20deg', '-90deg'],
              }) : '20deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[21]}
          onToothPress={() => onToothPress(21)}
          onSurfacePress={getSurfacePressHandler(21)}
          borderColor={getBorderColor(21)}
        />
        {selectedTooth === 21 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth #22 */}
      <Animated.View
        style={[
          styles.tooth22,
          {
            zIndex: selectedTooth === 22 ? 1001 : (selectedTooth && [17,18,19].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 22 ? 1001 : (selectedTooth && [17,18,19].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 22 ? getToothAnims(22).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 22 ? getToothAnims(22).translateY : 0 },
              { scale: selectedTooth === 22 ? getToothAnims(22).scale : 1 },
              { rotate: selectedTooth === 22 ? getToothAnims(22).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['35deg', '-90deg'],
              }) : '35deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[22]}
          onToothPress={() => onToothPress(22)}
          onSurfacePress={getSurfacePressHandler(22)}
          borderColor={getBorderColor(22)}
        />
        {selectedTooth === 22 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth #23 */}
      <Animated.View
        style={[
          styles.tooth23,
          {
            zIndex: selectedTooth === 23 ? 1001 : (selectedTooth && [17,18,19,20].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 23 ? 1001 : (selectedTooth && [17,18,19,20].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 23 ? getToothAnims(23).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 23 ? getToothAnims(23).translateY : 0 },
              { scale: selectedTooth === 23 ? getToothAnims(23).scale : 1 },
              { rotate: selectedTooth === 23 ? getToothAnims(23).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['60deg', '-90deg'],
              }) : '60deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[23]}
          onToothPress={() => onToothPress(23)}
          onSurfacePress={getSurfacePressHandler(23)}
          borderColor={getBorderColor(23)}
        />
        {selectedTooth === 23 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth #24 */}
      <Animated.View
        style={[
          styles.tooth24,
          {
            zIndex: selectedTooth === 24 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 24 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 24 ? getToothAnims(24).translateX : new Animated.Value(0), rightTeethSlide) },
              { translateY: selectedTooth === 24 ? getToothAnims(24).translateY : 0 },
              { scale: selectedTooth === 24 ? getToothAnims(24).scale : 1 },
              { rotate: selectedTooth === 24 ? getToothAnims(24).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['80deg', '-90deg'],
              }) : '80deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[24]}
          onToothPress={() => onToothPress(24)}
          onSurfacePress={getSurfacePressHandler(24)}
          borderColor={getBorderColor(24)}
        />
        {selectedTooth === 24 && !isClosing && <LowerRightLabels />}
      </Animated.View>

      {/* Tooth Numbers for Lower Right Quadrant (17-24) */}
      <Animated.View style={[styles.toothNumber17, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>8</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber18, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>7</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber19, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>6</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber20, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>5</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber21, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>4</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber22, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>3</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber23, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>2</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber24, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>1</Text>
      </Animated.View>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Lower Left Quadrant (25-32) */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* Tooth #25 */}
      <Animated.View
        style={[
          styles.tooth25,
          {
            zIndex: selectedTooth === 25 ? 1001 : 999,
            elevation: selectedTooth === 25 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 25 ? getToothAnims(25).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 25 ? getToothAnims(25).translateY : 0 },
              { scale: selectedTooth === 25 ? getToothAnims(25).scale : 1 },
              { rotate: selectedTooth === 25 ? getToothAnims(25).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['80deg', '90deg'],
              }) : '80deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[25]}
          onToothPress={() => onToothPress(25)}
          onSurfacePress={getSurfacePressHandler(25)}
          rotation={90}
          borderColor={getBorderColor(25)}
        />
        {selectedTooth === 25 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth #26 */}
      <Animated.View
        style={[
          styles.tooth26,
          {
            zIndex: selectedTooth === 26 ? 1001 : 999,
            elevation: selectedTooth === 26 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 26 ? getToothAnims(26).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 26 ? getToothAnims(26).translateY : 0 },
              { scale: selectedTooth === 26 ? getToothAnims(26).scale : 1 },
              { rotate: selectedTooth === 26 ? getToothAnims(26).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['60deg', '90deg'],
              }) : '60deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[26]}
          onToothPress={() => onToothPress(26)}
          onSurfacePress={getSurfacePressHandler(26)}
          rotation={90}
          borderColor={getBorderColor(26)}
        />
        {selectedTooth === 26 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth #27 */}
      <Animated.View
        style={[
          styles.tooth27,
          {
            zIndex: selectedTooth === 27 ? 1001 : 999,
            elevation: selectedTooth === 27 ? 1001 : 999,
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 27 ? getToothAnims(27).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 27 ? getToothAnims(27).translateY : 0 },
              { scale: selectedTooth === 27 ? getToothAnims(27).scale : 1 },
              { rotate: selectedTooth === 27 ? getToothAnims(27).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['35deg', '90deg'],
              }) : '35deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareTiny
          colors={toothConditions[27]}
          onToothPress={() => onToothPress(27)}
          onSurfacePress={getSurfacePressHandler(27)}
          rotation={90}
          borderColor={getBorderColor(27)}
        />
        {selectedTooth === 27 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth #28 */}
      <Animated.View
        style={[
          styles.tooth28,
          {
            zIndex: selectedTooth === 28 ? 1001 : (selectedTooth && [25,26,27].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 28 ? 1001 : (selectedTooth && [25,26,27].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 28 ? getToothAnims(28).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 28 ? getToothAnims(28).translateY : 0 },
              { scale: selectedTooth === 28 ? getToothAnims(28).scale : 1 },
              { rotate: selectedTooth === 28 ? getToothAnims(28).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['20deg', '90deg'],
              }) : '20deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[28]}
          onToothPress={() => onToothPress(28)}
          onSurfacePress={getSurfacePressHandler(28)}
          rotation={90}
          borderColor={getBorderColor(28)}
        />
        {selectedTooth === 28 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth #29 */}
      <Animated.View
        style={[
          styles.tooth29,
          {
            zIndex: selectedTooth === 29 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 29 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 29 ? getToothAnims(29).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 29 ? getToothAnims(29).translateY : 0 },
              { scale: selectedTooth === 29 ? getToothAnims(29).scale : 1 },
              { rotate: selectedTooth === 29 ? getToothAnims(29).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-20deg', '-90deg'],
              }) : '-20deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[29]}
          onToothPress={() => onToothPress(29)}
          onSurfacePress={getSurfacePressHandler(29)}
          borderColor={getBorderColor(29)}
        />
        {selectedTooth === 29 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth #30 */}
      <Animated.View
        style={[
          styles.tooth30,
          {
            zIndex: selectedTooth === 30 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 30 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 30 ? getToothAnims(30).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 30 ? getToothAnims(30).translateY : 0 },
              { scale: selectedTooth === 30 ? getToothAnims(30).scale : 1 },
              { rotate: selectedTooth === 30 ? getToothAnims(30).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-35deg', '-90deg'],
              }) : '-35deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[30]}
          onToothPress={() => onToothPress(30)}
          onSurfacePress={getSurfacePressHandler(30)}
          borderColor={getBorderColor(30)}
        />
        {selectedTooth === 30 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth #31 */}
      <Animated.View
        style={[
          styles.tooth31,
          {
            zIndex: selectedTooth === 31 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 31 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 31 ? getToothAnims(31).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 31 ? getToothAnims(31).translateY : 0 },
              { scale: selectedTooth === 31 ? getToothAnims(31).scale : 1 },
              { rotate: selectedTooth === 31 ? getToothAnims(31).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-60deg', '-90deg'],
              }) : '-60deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[31]}
          onToothPress={() => onToothPress(31)}
          onSurfacePress={getSurfacePressHandler(31)}
          borderColor={getBorderColor(31)}
        />
        {selectedTooth === 31 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth #32 */}
      <Animated.View
        style={[
          styles.tooth32,
          {
            zIndex: selectedTooth === 32 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
            elevation: selectedTooth === 32 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth as number) ? 998 : 1000),
          },
          {
            transform: [
              { translateX: Animated.add(selectedTooth === 32 ? getToothAnims(32).translateX : new Animated.Value(0), leftTeethSlide) },
              { translateY: selectedTooth === 32 ? getToothAnims(32).translateY : 0 },
              { scale: selectedTooth === 32 ? getToothAnims(32).scale : 1 },
              { rotate: selectedTooth === 32 ? getToothAnims(32).rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['-80deg', '-90deg'],
              }) : '-80deg' },
            ],
          },
          isEditModeActive && styles.toothGlowEffect,
        ]}
      >
        <ToothWithSectionsSquareMedium
          colors={toothConditions[32]}
          onToothPress={() => onToothPress(32)}
          onSurfacePress={getSurfacePressHandler(32)}
          borderColor={getBorderColor(32)}
        />
        {selectedTooth === 32 && !isClosing && <LowerLeftLabels />}
      </Animated.View>

      {/* Tooth Numbers for Lower Left Quadrant (25-32) */}
      <Animated.View style={[styles.toothNumber25, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>1</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber26, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>2</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber27, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>3</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber28, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>4</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber29, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>5</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber30, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>6</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber31, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>7</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber32, { transform: [{ translateX: leftNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>8</Text>
      </Animated.View>
    </>
  );
};

export default TeethGrid;
