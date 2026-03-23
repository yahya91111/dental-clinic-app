import React from 'react';
import {
  View,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Patient } from './constants';

interface TimelineInfoProps {
  patient: Patient;
  isComplete: boolean;
  isPermanentPatient?: boolean;
}

export const TimelineInfo = ({
  patient,
  isComplete,
  isPermanentPatient,
}: TimelineInfoProps) => {
  // For complete cards: white text
  // For non-complete cards: blue for permanent, gray for walk-in
  const timelineColor = isComplete
    ? '#FFFFFF'
    : (isPermanentPatient ? '#2563EB' : '#9CA3AF');

  return (
    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.4)' }}>
      {patient.registered_at && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Ionicons name="add-circle-outline" size={14} color={timelineColor} />
          <Text style={{ fontSize: 11, color: timelineColor, marginLeft: 6 }}>
            Registered: {patient.registered_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Text>
        </View>
      )}
      {patient.clinic_entry_at && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Ionicons name="enter-outline" size={14} color={timelineColor} />
          <Text style={{ fontSize: 11, color: timelineColor, marginLeft: 6 }}>
            Entered Clinic: {patient.clinic_entry_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Text>
        </View>
      )}
      {patient.completed_at && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Ionicons name="checkmark-circle-outline" size={14} color={timelineColor} />
          <Text style={{ fontSize: 11, color: timelineColor, marginLeft: 6 }}>
            Completed: {patient.completed_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Text>
        </View>
      )}
      {patient.doctor_name && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isComplete ? 4 : 0 }}>
          <Ionicons name="person-outline" size={14} color={timelineColor} />
          <Text style={{ fontSize: 11, color: timelineColor, marginLeft: 6 }}>
            {isComplete ? 'Done by Dr.' : 'Doctor:'} {patient.doctor_name}
          </Text>
        </View>
      )}
      {isComplete && patient.assigned_by_doctor_name && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="people-outline" size={14} color={timelineColor} />
          <Text style={{ fontSize: 11, color: timelineColor, marginLeft: 6, fontStyle: 'italic' }}>
            Assigned by Dr. {patient.assigned_by_doctor_name}
          </Text>
        </View>
      )}
    </View>
  );
};
