import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { scale } from '../../lib/scale';
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
  onGeneralNotesPress?: () => void;
  generalNotesCount?: number;
}

export function HeaderAndPlanningButtons({
  onBack,
  isEditModeActive,
  pendingPlanningRecordsCount,
  onPlanningCancel,
  onPlanningSubmit,
  onGeneralNotesPress,
  generalNotesCount = 0,
}: HeaderAndPlanningButtonsProps) {
  return (
    <>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={scale(28)} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Dental Chart</Text>

        <TouchableOpacity
          onPress={onGeneralNotesPress}
          style={{
            width: scale(42),
            height: scale(42),
            borderRadius: scale(12),
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: scale(2),
            borderColor: 'rgba(255, 255, 255, 0.6)',
          }}
        >
          <Ionicons name="document-text" size={scale(26)} color="#93C5FD" />
          {generalNotesCount > 0 && (
            <View style={{
              position: 'absolute',
              top: scale(-6),
              right: scale(-6),
              backgroundColor: '#FACC15',
              borderRadius: scale(10),
              minWidth: scale(20),
              height: scale(20),
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: scale(4),
              borderWidth: scale(2),
              borderColor: '#FFFFFF',
            }}>
              <Text style={{ fontSize: scale(11), fontWeight: '800', color: '#1E3A8A' }}>{generalNotesCount}</Text>
            </View>
          )}
        </TouchableOpacity>
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
