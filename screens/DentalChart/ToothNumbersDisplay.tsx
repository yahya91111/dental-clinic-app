import React from 'react';
import { Text, Animated } from 'react-native';
import { styles } from './styles';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ToothNumbersDisplayProps {
  rightNumbersSlide: Animated.Value;
  leftNumbersSlide: Animated.Value;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export const ToothNumbersDisplay: React.FC<ToothNumbersDisplayProps> = ({
  rightNumbersSlide,
  leftNumbersSlide,
}) => {
  return (
    <>
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

      {/* Tooth Numbers for Lower Right Quadrant (17-24) */}
      <Animated.View style={[styles.toothNumber17, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>1</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber18, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>2</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber19, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>3</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber20, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>4</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber21, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>5</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber22, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>6</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber23, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>7</Text>
      </Animated.View>
      <Animated.View style={[styles.toothNumber24, { transform: [{ translateX: rightNumbersSlide }] }]}>
        <Text style={styles.toothNumberText}>8</Text>
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

export default ToothNumbersDisplay;
