import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { scale } from '../../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { Patient } from './constants';
import { styles } from './styles';
import { CircularBadge } from './PatientCard';

interface CardHeaderProps {
  patient: Patient;
  isPermanentPatient: boolean;
  isPermanentCardExpanded: boolean;
  isComplete: boolean;
  textColor: string;
  onMenuPress: () => void;
  onNotePress: () => void;
  onTogglePermanentExpansion: (patient: Patient) => void;
  onPatientNamePress?: (patientId: string, fileNumber: string) => void;
}

export const CardHeader = ({
  patient,
  isPermanentPatient,
  isPermanentCardExpanded,
  isComplete,
  textColor,
  onMenuPress,
  onNotePress,
  onTogglePermanentExpansion,
  onPatientNamePress,
}: CardHeaderProps) => {
  if (isPermanentCardExpanded) {
    return null; // Expanded header is handled by ExpandedPatientHeader
  }

  const menuIconColor = isComplete
    ? '#FFFFFF'
    : (isPermanentPatient ? '#1E3A8A' : textColor);

  const nameColor = isComplete ? '#FFFFFF' : (isPermanentPatient ? '#1E3A8A' : textColor);

  const chevronColor = isComplete ? '#FFFFFF' : '#1E3A8A';

  return (
    <View style={styles.cardHeader}>
      <View style={styles.leftSection}>
        {/* Menu Button */}
        <TouchableOpacity
          style={styles.menuButton}
          onPress={(e) => {
            if (!isComplete) e.stopPropagation();
            onMenuPress();
          }}
        >
          <Text style={[styles.menuIcon, { color: menuIconColor }]}>⋮</Text>
        </TouchableOpacity>

        {/* Expand/Collapse Button - Only for Permanent Patients */}
        {isPermanentPatient && (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={(e) => {
              e.stopPropagation();
              onTogglePermanentExpansion(patient);
            }}
          >
            <Ionicons
              name="chevron-down"
              size={scale(18)}
              color={chevronColor}
            />
          </TouchableOpacity>
        )}
      </View>

      {isPermanentPatient ? (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
              onPatientNamePress(patient.permanent_patient_id, patient.file_number);
            }
          }}
        >
          <Text style={[styles.patientName, { color: nameColor, ...(isComplete ? { fontSize: scale(20) } : {}) }]}>{patient.name}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.patientName, { color: isComplete ? '#FFFFFF' : textColor }]}>{patient.name}</Text>
      )}
    </View>
  );
};
