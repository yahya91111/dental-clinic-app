import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

// ═══════════════════════════════════════════════════════════════
// Header and Planning Buttons Component
// Top navigation header with back button and floating planning buttons
// ═══════════════════════════════════════════════════════════════

interface HeaderAndPlanningButtonsProps {
  onBack: () => void;
  isEditModeActive: boolean;
  pendingPlanningRecordsCount: number;
  onPlanningCancel: () => void;
  onPlanningSubmit: () => void;
}

export function HeaderAndPlanningButtons({
  onBack,
  isEditModeActive,
  pendingPlanningRecordsCount,
  onPlanningCancel,
  onPlanningSubmit,
}: HeaderAndPlanningButtonsProps) {
  return (
    <>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Dental Chart</Text>

        <View style={{ width: 40 }} />
      </View>

      {/* Planning Submit/Cancel Buttons - Floating */}
      {!isEditModeActive && pendingPlanningRecordsCount > 0 && (
        <>
          {/* Cancel Button (Left) */}
          <TouchableOpacity
            style={styles.planningCancelButton}
            onPress={onPlanningCancel}
            activeOpacity={0.8}
          >
            <Text style={styles.planningCancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          {/* Submit Button (Right) */}
          <TouchableOpacity
            style={styles.planningSubmitButton}
            onPress={onPlanningSubmit}
            activeOpacity={0.8}
          >
            <Text style={styles.planningSubmitButtonText}>Submit</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}
