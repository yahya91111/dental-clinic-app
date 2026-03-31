import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { updateReferralStatus, createScalingRecord, getScalingRecords, getGeneralNotes, createGeneralNote, deleteGeneralNote } from '../lib/database';

// ═══════════════════════════════════════════════════════════════
// Expanded Patient Header Component - iPhone Style Grid
// Shows 6 icons in a grid, clicking opens full content view
// ═══════════════════════════════════════════════════════════════

interface DentalSummary {
  caries_count: number;
  caries_teeth: number[];
  rct_needed_count: number;
  rct_needed_teeth: number[];
  extraction_needed_count: number;
  extraction_needed_teeth: number[];
  broken_teeth_count: number;
  broken_teeth: number[];
  filling_done_count: number;
  filling_done_teeth: number[];
  total_issues: number;
}

interface PatientReferral {
  id: string;
  department?: string;
  referral_type?: string;
  tooth_number?: string | null;
  reason?: string;
  notes?: string;
  doctor_name?: string;
  created_at: string;
  timestamp?: string;
  status: string;
}

interface ToothNote {
  tooth_number: number | string;
  note: string;
  doctor_name?: string;
  timestamp?: string;
  created_at: string;
}

interface PatientConsent {
  consent_type: string;
  signed: boolean;
  signed_at?: string;
}

interface Patient {
  id: string;
  permanent_patient_id?: string;
  file_number?: string;
  name: string;
}

interface ExpandedPatientHeaderProps {
  patient: Patient;
  // Dental Data
  dentalSummary: DentalSummary | null;
  loadingDentalData: boolean;
  // Referrals
  patientReferrals: PatientReferral[];
  loadingReferrals: boolean;
  onLoadReferrals: () => void;
  // Notes
  toothNotes: ToothNote[];
  loadingToothNotes: boolean;
  onLoadToothNotes: () => void;
  // Hygiene
  lastFluorideDate?: Date;
  lastScalingDate?: Date;
  onFluoridePress: (patientId: string) => void;
  onScalingPress: (patientId: string) => void;
  // Consent
  patientConsents: PatientConsent[];
  onConsentPress: () => void;
  // Chart
  onOpenDentalChart: () => void;
  // Collapse
  onTogglePermanentExpansion: (patient: Patient) => void;
  // Tooth Edit
  onToothEditPress: (patientId: string, toothNumber: number) => void;
  // Patient Name Press
  onPatientNamePress?: (patientId: string, fileNumber: string) => void;
  // Doctor Name
  doctorName?: string;
  // General Notes
  generalNotes?: any[];
  onLoadGeneralNotes?: () => void;
  onAddGeneralNote?: (note: string) => void;
  onDeleteGeneralNote?: (noteId: string) => void;
}

type SectionType = 'dental' | 'referrals' | 'hygiene' | 'notes' | 'consent' | 'general_notes' | null;

export function ExpandedPatientHeader({
  patient,
  dentalSummary,
  loadingDentalData,
  patientReferrals,
  loadingReferrals,
  onLoadReferrals,
  toothNotes,
  loadingToothNotes,
  onLoadToothNotes,
  lastFluorideDate,
  lastScalingDate,
  onFluoridePress,
  onScalingPress,
  patientConsents,
  onConsentPress,
  onOpenDentalChart,
  onTogglePermanentExpansion,
  onToothEditPress,
  onPatientNamePress,
  doctorName,
  generalNotes = [],
  onLoadGeneralNotes,
  onAddGeneralNote,
  onDeleteGeneralNote,
}: ExpandedPatientHeaderProps) {
  const [expandedSection, setExpandedSection] = useState<SectionType>(null);
  const [seenNotesCount, setSeenNotesCount] = useState<number | null>(null);
  const [seenGeneralNotesCount, setSeenGeneralNotesCount] = useState<number | null>(null);
  const [newGeneralNoteText, setNewGeneralNoteText] = useState('');
  const [localGeneralNotes, setLocalGeneralNotes] = useState<any[]>([]);

  // Load general notes internally if not provided via props
  const loadLocalGeneralNotes = useCallback(async () => {
    if (!patient.permanent_patient_id) return;
    const { data } = await getGeneralNotes(patient.permanent_patient_id);
    if (data) setLocalGeneralNotes(data);
  }, [patient.permanent_patient_id]);

  useEffect(() => {
    if (!generalNotes || generalNotes.length === 0) {
      loadLocalGeneralNotes();
    }
  }, [loadLocalGeneralNotes]);

  const effectiveGeneralNotes = (generalNotes && generalNotes.length > 0) ? generalNotes : localGeneralNotes;

  // Load seen notes count from AsyncStorage
  const storageKey = `notes_seen_${patient.permanent_patient_id || patient.id}`;
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((val) => {
      setSeenNotesCount(val ? parseInt(val, 10) : 0);
    });
  }, [storageKey]);

  // Notes badge logic: red if new unread notes, transparent if all read
  const notesCount = toothNotes?.length || 0;
  const hasUnreadNotes = seenNotesCount === null ? false : notesCount > seenNotesCount;

  // General Notes badge logic
  const generalNotesStorageKey = `gnotes_seen_${patient.permanent_patient_id || patient.id}`;
  useEffect(() => {
    AsyncStorage.getItem(generalNotesStorageKey).then((val) => {
      setSeenGeneralNotesCount(val ? parseInt(val, 10) : 0);
    });
  }, [generalNotesStorageKey]);
  const generalNotesCount = effectiveGeneralNotes?.length || 0;
  const hasUnreadGeneralNotes = seenGeneralNotesCount === null ? false : generalNotesCount > seenGeneralNotesCount;

  // Consent state
  const consentSigned = patientConsents?.length > 0 && patientConsents.every(c => c.signed);

  // Local scaling date (updates immediately after saving)
  const [localScalingDate, setLocalScalingDate] = useState<Date | undefined>(undefined);
  const effectiveScalingDate = localScalingDate || lastScalingDate;

  // Total treatment issues count
  const totalTreatmentCount = dentalSummary
    ? dentalSummary.caries_count + dentalSummary.rct_needed_count + dentalSummary.extraction_needed_count + dentalSummary.broken_teeth_count + dentalSummary.filling_done_count
    : 0;

  // Scaling status for icon color
  const monthsSinceScalingForIcon = effectiveScalingDate
    ? Math.floor((new Date().getTime() - effectiveScalingDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;
  const hygieneIconColor = monthsSinceScalingForIcon === null ? '#9CA3AF'
    : monthsSinceScalingForIcon > 6 ? '#DC2626'
    : monthsSinceScalingForIcon >= 4 ? '#D97706'
    : '#059669';

  // Icon configurations - unified white bg with distinct icon colors
  const iconBg = 'rgba(255, 255, 255, 0.6)';
  const icons = [
    { id: 'dental', label: 'Treatment', icon: 'tooth', iconType: 'material', color: '#2563EB', bgColor: iconBg, badge: totalTreatmentCount },
    { id: 'referrals', label: 'Referrals', icon: 'arrow-redo', iconType: 'ionicon', color: '#2563EB', bgColor: iconBg, badge: patientReferrals?.filter(r => r.status !== 'given').length || 0 },
    { id: 'hygiene', label: 'Hygiene', icon: 'sparkles', iconType: 'ionicon', color: hygieneIconColor, bgColor: iconBg, badge: 0 },
    { id: 'notes', label: 'Notes', icon: 'document-text', iconType: 'ionicon', color: '#2563EB', bgColor: iconBg, badge: notesCount, badgeColor: hasUnreadNotes ? '#EF4444' : 'rgba(107, 114, 128, 0.6)' },
    { id: 'consent', label: 'Consent', icon: consentSigned ? 'checkmark-circle' : 'close-circle', iconType: 'ionicon', color: consentSigned ? '#059669' : '#9CA3AF', bgColor: iconBg, badge: 0 },
    { id: 'general_notes', label: 'G. Notes', icon: 'document-text', iconType: 'ionicon', color: '#2563EB', bgColor: iconBg, badge: generalNotesCount, badgeColor: hasUnreadGeneralNotes ? '#EF4444' : 'rgba(107, 114, 128, 0.6)' },
  ];

  const handleIconPress = (iconId: string) => {
    if (iconId === 'general_notes') {
      onLoadGeneralNotes?.();
      setSeenGeneralNotesCount(generalNotesCount);
      AsyncStorage.setItem(generalNotesStorageKey, generalNotesCount.toString());
    }
    if (iconId === 'consent') {
      if (!consentSigned) {
        onConsentPress();
      }
      return;
    }
    if (iconId === 'referrals') {
      onLoadReferrals();
    }
    if (iconId === 'notes') {
      onLoadToothNotes();
      // Mark notes as seen - persist to AsyncStorage
      setSeenNotesCount(notesCount);
      AsyncStorage.setItem(storageKey, notesCount.toString());
    }
    setExpandedSection(iconId as SectionType);
  };

  const renderIcon = (item: typeof icons[0]) => {
    if (item.iconType === 'material') {
      return <MaterialCommunityIcons name={item.icon as any} size={32} color={item.color} />;
    }
    return <Ionicons name={item.icon as any} size={32} color={item.color} />;
  };

  // Render Icons Grid
  const renderIconsGrid = () => (
    <View style={{ padding: 16 }}>
      {/* Header Bar: Close + Name + File Number */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 16,
        padding: 12,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.35)',
      }}>
        {/* Close Button */}
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={(e) => {
            e.stopPropagation();
            onTogglePermanentExpansion(patient);
          }}
        >
          <Ionicons name="chevron-up" size={22} color="#1E3A8A" />
        </TouchableOpacity>

        {/* Name + File Number */}
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={(e) => {
            e.stopPropagation();
            if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
              onPatientNamePress(patient.permanent_patient_id, patient.file_number);
            }
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E3A8A' }}>{patient.name}</Text>
          {patient.file_number && (
            <Text style={{ fontSize: 13, color: '#3B5998', marginTop: 2, fontWeight: '600' }}>
              File: {patient.file_number}
            </Text>
          )}
        </TouchableOpacity>

        {/* Open Chart Arrow */}
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={(e) => {
            e.stopPropagation();
            onOpenDentalChart();
          }}
        >
          <Ionicons name="open-outline" size={20} color="#1E3A8A" />
        </TouchableOpacity>
      </View>

      {/* Icons Grid - 3 columns */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
        {icons.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={{
              width: 90,
              height: 90,
              backgroundColor: item.bgColor,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.6)',
            }}
            onPress={(e) => {
              e.stopPropagation();
              handleIconPress(item.id);
            }}
            onLongPress={(e) => {
              e.stopPropagation();
              if (item.id === 'consent' && consentSigned) {
                onConsentPress();
              }
            }}
            delayLongPress={2000}
          >
            {/* Badge */}
            {item.badge > 0 && (
              <View style={{
                position: 'absolute',
                top: -10,
                left: -10,
                backgroundColor: (item as any).badgeColor || '#EF4444',
                borderRadius: 14,
                minWidth: 28,
                height: 28,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 7,
                borderWidth: 2.5,
                borderColor: '#FFFFFF',
                zIndex: 10,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                  {item.badge}
                </Text>
              </View>
            )}
            {renderIcon(item)}
            <Text style={{ fontSize: 12, color: '#1E3A8A', marginTop: 8, fontWeight: '700' }}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Render Treatment Content
  const treatmentSections = dentalSummary ? [
    { key: 'caries', name: 'Caries', count: dentalSummary.caries_count, teeth: dentalSummary.caries_teeth },
    { key: 'rct', name: 'RCT Needed', count: dentalSummary.rct_needed_count, teeth: dentalSummary.rct_needed_teeth },
    { key: 'extraction', name: 'Extraction Needed', count: dentalSummary.extraction_needed_count, teeth: dentalSummary.extraction_needed_teeth },
    { key: 'broken', name: 'Broken Tooth', count: dentalSummary.broken_teeth_count, teeth: dentalSummary.broken_teeth },
    { key: 'filling', name: 'Need Permanent Filling', count: dentalSummary.filling_done_count, teeth: dentalSummary.filling_done_teeth },
  ].filter(s => s.count > 0) : [];

  const renderTreatmentContent = () => (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      {loadingDentalData ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : treatmentSections.length > 0 ? (
        <View style={{ gap: 14 }}>
          {treatmentSections.map((section) => (
            <View key={section.key} style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                marginHorizontal: -16, marginTop: -16, marginBottom: 12,
                paddingHorizontal: 16, paddingVertical: 12,
                borderTopLeftRadius: 14, borderTopRightRadius: 14,
                borderBottomWidth: 1, borderBottomColor: 'rgba(37, 99, 235, 0.2)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="tooth" size={20} color="#2563EB" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#2563EB' }}>
                    {section.name}
                  </Text>
                </View>
                <View style={{ backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{section.count}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {section.teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(250, 204, 21, 0.15)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: 'rgba(250, 204, 21, 0.4)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#1E3A8A', fontWeight: '700', fontSize: 14 }}>{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : dentalSummary ? (
        <View style={{ alignItems: 'center', padding: 24 }}>
          <Ionicons name="checkmark-circle" size={48} color="#10B981" />
          <Text style={{ color: '#FFFFFF', marginTop: 12, fontSize: 16, fontWeight: '600' }}>No treatment needed</Text>
        </View>
      ) : (
        <Text style={{ color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center' }}>No dental data available</Text>
      )}
    </ScrollView>
  );

  // Render Referrals Content
  const renderReferralsContent = () => (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      {loadingReferrals ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : patientReferrals.length > 0 ? (
        <View style={{ gap: 12 }}>
          {patientReferrals.map((referral) => {
            const isGiven = referral.status === 'given';
            const department = referral.department || referral.referral_type || 'Unknown';
            return (
              <View key={referral.id} style={{
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                borderRadius: 16,
                padding: 16,
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.7)',
              }}>
                {/* Department + Status Toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name="arrow-redo" size={18} color="#EA580C" />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#EA580C' }}>{department}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      const newStatus = isGiven ? 'not_given' : 'given';
                      try {
                        const { error } = await updateReferralStatus(referral.id, newStatus);
                        if (error) {
                          Alert.alert('Error', 'Failed to update status');
                          return;
                        }
                        // Reload referrals to reflect change
                        onLoadReferrals();
                      } catch (err) {
                        Alert.alert('Error', 'Unexpected error');
                      }
                    }}
                    style={{
                      backgroundColor: isGiven ? '#059669' : '#DC2626',
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Ionicons name={isGiven ? 'checkmark-circle' : 'close-circle'} size={16} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                      {isGiven ? 'Given' : 'Not Given'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={{ height: 1, backgroundColor: 'rgba(234, 88, 12, 0.2)', marginBottom: 10 }} />

                {/* Tooth + Doctor + Notes */}
                <View style={{ gap: 6 }}>
                  {referral.tooth_number && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="medical" size={14} color="#6B7280" />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E3A8A' }}>Tooth: #{referral.tooth_number}</Text>
                    </View>
                  )}
                  {referral.doctor_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="person" size={14} color="#6B7280" />
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151' }}>Dr. {referral.doctor_name}</Text>
                    </View>
                  )}
                  {(referral.notes || referral.reason) && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                      <Ionicons name="document-text" size={14} color="#6B7280" style={{ marginTop: 2 }} />
                      <Text style={{ fontSize: 13, color: '#6B7280', flex: 1 }}>{referral.notes || referral.reason}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="time" size={14} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {new Date(referral.timestamp || referral.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ alignItems: 'center', padding: 24 }}>
          <Ionicons name="document-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
          <Text style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: 12, fontSize: 16 }}>No referrals</Text>
        </View>
      )}
    </ScrollView>
  );

  // Render Hygiene Content
  const [showScalingConfirm, setShowScalingConfirm] = useState(false);
  const [scalingDate, setScalingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const renderHygieneContent = () => {
    // Calculate months since last scaling
    const monthsSinceScaling = effectiveScalingDate
      ? Math.floor((new Date().getTime() - effectiveScalingDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
      : null;

    // Status: green (<4), yellow (4-6), red (>6), gray (never)
    const getStatus = () => {
      if (monthsSinceScaling === null) return { color: '#9CA3AF', label: 'Not recorded', icon: 'help-circle' as const };
      if (monthsSinceScaling < 4) return { color: '#059669', label: 'Good', icon: 'checkmark-circle' as const };
      if (monthsSinceScaling <= 6) return { color: '#D97706', label: 'Due soon', icon: 'warning' as const };
      return { color: '#DC2626', label: 'Overdue', icon: 'alert-circle' as const };
    };
    const status = getStatus();
    const progressPercent = monthsSinceScaling !== null ? Math.min(monthsSinceScaling / 6, 1) : 0;

    return (
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Scaling Card */}
        <View style={{
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          borderRadius: 16,
          padding: 16,
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.7)',
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="tooth" size={20} color="#059669" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#059669' }}>Scaling</Text>
            </View>
            <View style={{ backgroundColor: status.color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={status.icon} size={14} color="#FFFFFF" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{status.label}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: 'rgba(5, 150, 105, 0.2)', marginBottom: 14 }} />

          {/* Last Scaling Date */}
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>Last scaling</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E3A8A', marginTop: 4 }}>
              {effectiveScalingDate ? effectiveScalingDate.toLocaleDateString() : '—'}
            </Text>
            {monthsSinceScaling !== null && (
              <Text style={{ fontSize: 13, color: status.color, fontWeight: '600', marginTop: 2 }}>
                {monthsSinceScaling === 0 ? 'This month' : `${monthsSinceScaling} month${monthsSinceScaling !== 1 ? 's' : ''} ago`}
              </Text>
            )}
          </View>

          {/* Progress Bar */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>0 months</Text>
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>6 months</Text>
            </View>
            <View style={{ height: 10, backgroundColor: 'rgba(0, 0, 0, 0.08)', borderRadius: 5 }}>
              <View style={{
                height: 10,
                width: `${progressPercent * 100}%`,
                backgroundColor: status.color,
                borderRadius: 5,
              }} />
            </View>
            {monthsSinceScaling !== null && monthsSinceScaling <= 6 && (
              <Text style={{ fontSize: 12, color: status.color, fontWeight: '600', textAlign: 'center', marginTop: 6 }}>
                {6 - monthsSinceScaling} month{6 - monthsSinceScaling !== 1 ? 's' : ''} remaining
              </Text>
            )}
            {monthsSinceScaling !== null && monthsSinceScaling > 6 && (
              <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700', textAlign: 'center', marginTop: 6 }}>
                Overdue by {monthsSinceScaling - 6} month{monthsSinceScaling - 6 !== 1 ? 's' : ''}!
              </Text>
            )}
          </View>

          {/* Scaling Done Button */}
          <TouchableOpacity
            style={{
              backgroundColor: '#059669',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
            onPress={() => {
              setScalingDate(new Date());
              setShowScalingConfirm(true);
              setShowDatePicker(false);
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Scaling Done</Text>
          </TouchableOpacity>
        </View>

        {/* Scaling Confirm Modal */}
        {showScalingConfirm && (
          <View style={{
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            borderRadius: 16,
            padding: 16,
            marginTop: 14,
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.7)',
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1E3A8A', textAlign: 'center', marginBottom: 14 }}>
              Confirm Scaling Date
            </Text>

            {/* Date Picker - always visible as spinner */}
            <View style={{
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: 'rgba(5, 150, 105, 0.3)',
              marginBottom: 14,
              overflow: 'hidden',
              alignItems: 'center',
            }}>
              <DateTimePicker
                value={scalingDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(event: any, date?: Date) => {
                  if (date) setScalingDate(date);
                }}
              />
            </View>

            {/* Confirm + Cancel */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0, 0, 0, 0.06)',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
                onPress={() => setShowScalingConfirm(false)}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#6B7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#059669',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
                onPress={async () => {
                  if (patient.permanent_patient_id) {
                    try {
                      const { error } = await createScalingRecord(patient.permanent_patient_id, doctorName || 'Doctor', scalingDate);
                      if (error) {
                        Alert.alert('Error', 'Failed to save scaling record');
                        return;
                      }
                      // Update local state immediately
                      setLocalScalingDate(scalingDate);
                      Alert.alert('Success', `Scaling recorded for ${scalingDate.toLocaleDateString()}`);
                    } catch (err) {
                      Alert.alert('Error', 'Unexpected error');
                    }
                  }
                  setShowScalingConfirm(false);
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  // Render Notes Content
  const renderNotesContent = () => (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      {loadingToothNotes ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : toothNotes.length > 0 ? (
        <View style={{ gap: 12 }}>
          {toothNotes.map((note, index) => (
            <View key={index} style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              {/* Tooth Number */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="document-text" size={18} color="#7C3AED" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#7C3AED' }}>Tooth #{note.tooth_number}</Text>
                </View>
              </View>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: 'rgba(124, 58, 237, 0.2)', marginBottom: 10 }} />

              {/* Note Text */}
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8, lineHeight: 20 }}>{note.note}</Text>

              {/* Doctor + Date */}
              <View style={{ gap: 4 }}>
                {note.doctor_name && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="person" size={14} color="#6B7280" />
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B7280' }}>Dr. {note.doctor_name}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time" size={14} color="#9CA3AF" />
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {new Date(note.timestamp || note.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ alignItems: 'center', padding: 24 }}>
          <Ionicons name="document-text-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
          <Text style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: 12, fontSize: 16 }}>No notes</Text>
        </View>
      )}
    </ScrollView>
  );

  // Render General Notes Content
  const renderGeneralNotesContent = () => (
    <View style={{ flex: 1, padding: 16 }}>
      {/* Input */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            borderRadius: 12,
            padding: 12,
            fontSize: 14,
            color: '#1E3A8A',
            borderWidth: 1.5,
            borderColor: 'rgba(255, 255, 255, 0.7)',
            minHeight: 44,
          }}
          placeholder="Write a general note..."
          placeholderTextColor="#9CA3AF"
          value={newGeneralNoteText}
          onChangeText={setNewGeneralNoteText}
          multiline
        />
        <TouchableOpacity
          style={{
            backgroundColor: newGeneralNoteText.trim() ? '#2563EB' : 'rgba(255, 255, 255, 0.3)',
            borderRadius: 12,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={async () => {
            if (newGeneralNoteText.trim() && patient.permanent_patient_id) {
              if (onAddGeneralNote) {
                onAddGeneralNote(newGeneralNoteText.trim());
              } else {
                await createGeneralNote(patient.permanent_patient_id, newGeneralNoteText.trim(), 'Doctor');
                loadLocalGeneralNotes();
              }
              setNewGeneralNoteText('');
              setSeenGeneralNotesCount(generalNotesCount + 1);
              AsyncStorage.setItem(generalNotesStorageKey, (generalNotesCount + 1).toString());
            }
          }}
          disabled={!newGeneralNoteText.trim()}
        >
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Notes List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {effectiveGeneralNotes.length > 0 ? (
          <View style={{ gap: 10 }}>
            {effectiveGeneralNotes.map((note: any) => (
              <View key={note.id} style={{
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                borderRadius: 14,
                padding: 14,
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.7)',
              }}>
                <Text style={{ fontSize: 14, color: '#1E3A8A', lineHeight: 20 }}>{note.note}</Text>
                <View style={{ height: 1, backgroundColor: 'rgba(37, 99, 235, 0.15)', marginVertical: 10 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="person" size={13} color="#6B7280" />
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>Dr. {note.doctor_name}</Text>
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {new Date(note.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      if (onDeleteGeneralNote) {
                        onDeleteGeneralNote(note.id);
                      } else {
                        await deleteGeneralNote(note.id);
                        loadLocalGeneralNotes();
                      }
                    }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ alignItems: 'center', padding: 30 }}>
            <Ionicons name="document-text-outline" size={48} color="rgba(255, 255, 255, 0.5)" />
            <Text style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: 10, fontSize: 15 }}>No general notes yet</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  // Render Section Content with Back Button
  const renderSectionContent = () => {
    let content = null;
    let sectionTitle = '';

    switch (expandedSection) {
      case 'dental':
        content = renderTreatmentContent();
        sectionTitle = 'Treatment';
        break;
      case 'referrals':
        content = renderReferralsContent();
        sectionTitle = 'Referrals';
        break;
      case 'hygiene':
        content = renderHygieneContent();
        sectionTitle = 'Hygiene';
        break;
      case 'notes':
        content = renderNotesContent();
        sectionTitle = 'Notes';
        break;
      case 'general_notes':
        content = renderGeneralNotesContent();
        sectionTitle = 'General Notes';
        break;
      default:
        return null;
    }

    return (
      <View style={{ flex: 1 }}>
        {/* Header Bar - same style as expanded card header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 16,
          padding: 12,
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 4,
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.35)',
        }}>
          {/* Back Button - Left */}
          <TouchableOpacity
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              width: 36,
              height: 36,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={(e) => {
              e.stopPropagation();
              setExpandedSection(null);
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#1E3A8A" />
          </TouchableOpacity>

          {/* Title - Center */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E3A8A', letterSpacing: 0.5 }}>
              {sectionTitle}
            </Text>
          </View>

          {/* Spacer to balance the back button */}
          <View style={{ width: 36 }} />
        </View>

        {/* Content */}
        {content}
      </View>
    );
  };

  return (
    <View style={{ marginBottom: 16 }}>
      {!expandedSection ? renderIconsGrid() : renderSectionContent()}
    </View>
  );
}
