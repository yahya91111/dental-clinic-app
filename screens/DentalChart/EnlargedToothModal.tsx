import React from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, Text } from 'react-native';
import { scale } from '../../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import {
  ToothWithSectionsSquareTiny,
  ToothWithSectionsSquareMedium,
} from './ToothShapes';
import { ToothSurfaceConditions, getToothLabel } from './dentalHelpers';

// ═══════════════════════════════════════════════════════════════
// Enlarged Tooth Modal Component
// Modal overlay for teeth NOT in the 1-32 range (legacy support)
// ═══════════════════════════════════════════════════════════════

interface EnlargedToothModalProps {
  selectedTooth: number | string | null;
  toothConditions: Record<number | string, ToothSurfaceConditions>;
  onClose: () => void;
  onSurfacePress: (surface: keyof ToothSurfaceConditions) => void;
}

export function EnlargedToothModal({
  selectedTooth,
  toothConditions,
  onClose,
  onSurfacePress,
}: EnlargedToothModalProps) {
  // Only show for teeth NOT in 1-32 range
  const allTeeth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

  if (!selectedTooth || allTeeth.includes(selectedTooth as number)) {
    return null;
  }

  const tinyTeeth = [6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27];
  const isTinyTooth = tinyTeeth.includes(selectedTooth as number);
  const swapSides = (selectedTooth as number) >= 17 && (selectedTooth as number) <= 32;

  return (
    <Modal
      transparent
      visible={!!selectedTooth}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.enlargedToothOverlay}>
        {/* Background dimmer */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Close button */}
        <TouchableOpacity
          style={styles.enlargedToothCloseButton}
          onPress={onClose}
        >
          <Ionicons name="close-circle" size={scale(50)} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Enlarged tooth container */}
        <View style={styles.enlargedToothContainer}>
          {/* Render the enlarged tooth based on tooth number */}
          {isTinyTooth ? (
            <ToothWithSectionsSquareTiny
              colors={toothConditions[selectedTooth]}
              onSurfacePress={onSurfacePress}
              swapSides={swapSides}
            />
          ) : (
            <ToothWithSectionsSquareMedium
              colors={toothConditions[selectedTooth]}
              onSurfacePress={onSurfacePress}
              swapSides={swapSides}
            />
          )}

          {/* Tooth number display */}
          <View style={styles.enlargedToothNumberBadge}>
            <Text style={styles.enlargedToothNumberText}>{getToothLabel(selectedTooth)}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
