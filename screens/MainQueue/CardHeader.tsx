import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
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
        <>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={(e) => {
              if (!isComplete) e.stopPropagation();
              onMenuPress();
            }}
          >
            <Text style={[styles.menuIcon, { color: menuIconColor }]}>⋮</Text>
          </TouchableOpacity>

          {/* Done Badge - Green Circle (only for complete) */}
          {isComplete && (
            <CircularBadge letter="D" backgroundColor="#10B981" />
          )}

          {/* Elderly Badge - Orange Circle */}
          {patient.isElderly && (
            <CircularBadge letter="E" backgroundColor="#F97316" />
          )}

          {/* Special Needs Badge - Purple Circle */}
          {patient.isSpecialNeeds && (
            <CircularBadge letter="S" backgroundColor="#8B5CF6" />
          )}

          {/* N/A Badge - Gray Circle (only for non-complete) */}
          {!isComplete && patient.status === 'na' && (
            <CircularBadge letter="X" backgroundColor="#6B7280" />
          )}

          {/* Note Badge - Blue Circle with tap action */}
          {patient.note && (
            isComplete ? (
              <CircularBadge letter="N" backgroundColor="#3B82F6" onPress={onNotePress} />
            ) : (
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); onNotePress(); }}>
                <CircularBadge letter="N" backgroundColor="#3B82F6" />
              </TouchableOpacity>
            )
          )}
        </>

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
              size={18}
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
          <Text style={[styles.patientName, { color: nameColor, ...(isComplete ? { fontSize: 20 } : {}) }]}>{patient.name}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.patientName, { color: isComplete ? '#FFFFFF' : textColor }]}>{patient.name}</Text>
      )}
    </View>
  );
};
