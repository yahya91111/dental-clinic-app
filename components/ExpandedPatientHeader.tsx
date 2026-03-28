import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { updateReferralStatus } from '../lib/database';

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
  tooth_number: number;
  note: string;
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
}

type SectionType = 'dental' | 'referrals' | 'hygiene' | 'notes' | 'consent' | 'chart' | null;

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
}: ExpandedPatientHeaderProps) {
  const [expandedSection, setExpandedSection] = useState<SectionType>(null);

  // Total treatment issues count
  const totalTreatmentCount = dentalSummary
    ? dentalSummary.caries_count + dentalSummary.rct_needed_count + dentalSummary.extraction_needed_count + dentalSummary.broken_teeth_count + dentalSummary.filling_done_count
    : 0;

  // Icon configurations - unified white bg with distinct icon colors
  const iconBg = 'rgba(255, 255, 255, 0.6)';
  const icons = [
    { id: 'dental', label: 'Treatment', icon: 'tooth-outline', iconType: 'material', color: '#7C3AED', bgColor: iconBg, badge: totalTreatmentCount },
    { id: 'referrals', label: 'Referrals', icon: 'arrow-redo', iconType: 'ionicon', color: '#EA580C', bgColor: iconBg, badge: patientReferrals?.length || 0 },
    { id: 'hygiene', label: 'Hygiene', icon: 'sparkles', iconType: 'ionicon', color: '#059669', bgColor: iconBg, badge: 0 },
    { id: 'notes', label: 'Notes', icon: 'document-text', iconType: 'ionicon', color: '#7C3AED', bgColor: iconBg, badge: toothNotes?.length || 0 },
    { id: 'consent', label: 'Consent', icon: patientConsents?.some(c => !c.signed) ? 'alert-circle' : 'checkmark-circle', iconType: 'ionicon', color: patientConsents?.some(c => !c.signed) ? '#DC2626' : '#059669', bgColor: iconBg, badge: 0 },
    { id: 'chart', label: 'Chart', icon: 'open-outline', iconType: 'ionicon', color: '#2563EB', bgColor: iconBg, badge: 0 },
  ];

  const handleIconPress = (iconId: string) => {
    if (iconId === 'chart') {
      onOpenDentalChart();
      return;
    }
    if (iconId === 'consent') {
      onConsentPress();
      return;
    }
    if (iconId === 'referrals') {
      onLoadReferrals();
    }
    if (iconId === 'notes') {
      onLoadToothNotes();
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
          >
            {/* Badge */}
            {item.badge > 0 && (
              <View style={{
                position: 'absolute',
                top: -10,
                left: -10,
                backgroundColor: '#EF4444',
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
  const renderTreatmentContent = () => (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      {loadingDentalData ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : dentalSummary ? (
        <View style={{ gap: 14 }}>
          {/* Caries */}
          {dentalSummary.caries_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="alert-circle" size={20} color="#DC2626" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#DC2626' }}>
                    Caries
                  </Text>
                </View>
                <View style={{ backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.caries_count}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(220, 38, 38, 0.25)', marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.caries_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(220, 38, 38, 0.15)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: 'rgba(220, 38, 38, 0.4)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* RCT Needed */}
          {dentalSummary.rct_needed_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="medical" size={20} color="#EA580C" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#EA580C' }}>
                    RCT Needed
                  </Text>
                </View>
                <View style={{ backgroundColor: '#EA580C', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.rct_needed_count}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(234, 88, 12, 0.25)', marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.rct_needed_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(234, 88, 12, 0.15)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: 'rgba(234, 88, 12, 0.4)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#EA580C', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Extraction Needed */}
          {dentalSummary.extraction_needed_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="remove-circle" size={20} color="#7C3AED" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#7C3AED' }}>
                    Extraction Needed
                  </Text>
                </View>
                <View style={{ backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.extraction_needed_count}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(124, 58, 237, 0.25)', marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.extraction_needed_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(124, 58, 237, 0.15)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: 'rgba(124, 58, 237, 0.4)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Broken Tooth */}
          {dentalSummary.broken_teeth_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="flash" size={20} color="#D97706" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#D97706' }}>
                    Broken Tooth
                  </Text>
                </View>
                <View style={{ backgroundColor: '#D97706', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.broken_teeth_count}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(217, 119, 6, 0.25)', marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.broken_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(217, 119, 6, 0.15)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: 'rgba(217, 119, 6, 0.4)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Temporary Filling (Need Permanent) */}
          {dentalSummary.filling_done_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 2,
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="build" size={20} color="#2563EB" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#2563EB' }}>
                    Need Permanent Filling
                  </Text>
                </View>
                <View style={{ backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.filling_done_count}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(37, 99, 235, 0.25)', marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.filling_done_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(37, 99, 235, 0.15)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: 'rgba(37, 99, 235, 0.4)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#2563EB', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {dentalSummary.caries_count === 0 && dentalSummary.rct_needed_count === 0 && dentalSummary.extraction_needed_count === 0 && dentalSummary.broken_teeth_count === 0 && dentalSummary.filling_done_count === 0 && (
            <View style={{ alignItems: 'center', padding: 24 }}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={{ color: '#FFFFFF', marginTop: 12, fontSize: 16, fontWeight: '600' }}>No treatment needed</Text>
            </View>
          )}
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
  const renderHygieneContent = () => {
    const today = new Date();
    const isFluorideDoneToday = lastFluorideDate &&
      lastFluorideDate.getDate() === today.getDate() &&
      lastFluorideDate.getMonth() === today.getMonth() &&
      lastFluorideDate.getFullYear() === today.getFullYear();

    const isScalingDoneToday = lastScalingDate &&
      lastScalingDate.getDate() === today.getDate() &&
      lastScalingDate.getMonth() === today.getMonth() &&
      lastScalingDate.getFullYear() === today.getFullYear();

    return (
      <View style={{ flex: 1, padding: 16 }}>
        <View style={{ gap: 16 }}>
          {/* Fluoride Button */}
          <TouchableOpacity
            style={{
              backgroundColor: isFluorideDoneToday ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)',
              borderRadius: 16,
              padding: 20,
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 2,
              borderColor: isFluorideDoneToday ? '#10B981' : '#3B82F6',
            }}
            onPress={() => patient.permanent_patient_id && onFluoridePress(patient.permanent_patient_id)}
          >
            <MaterialCommunityIcons name="water" size={32} color={isFluorideDoneToday ? '#10B981' : '#3B82F6'} />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Fluoride</Text>
              <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>
                {isFluorideDoneToday ? 'Done today' : lastFluorideDate ? `Last: ${lastFluorideDate.toLocaleDateString()}` : 'Not recorded'}
              </Text>
            </View>
            {isFluorideDoneToday && <Ionicons name="checkmark-circle" size={28} color="#10B981" />}
          </TouchableOpacity>

          {/* Scaling Button */}
          <TouchableOpacity
            style={{
              backgroundColor: isScalingDoneToday ? 'rgba(16, 185, 129, 0.3)' : 'rgba(139, 92, 246, 0.3)',
              borderRadius: 16,
              padding: 20,
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 2,
              borderColor: isScalingDoneToday ? '#10B981' : '#8B5CF6',
            }}
            onPress={() => patient.permanent_patient_id && onScalingPress(patient.permanent_patient_id)}
          >
            <MaterialCommunityIcons name="tooth" size={32} color={isScalingDoneToday ? '#10B981' : '#8B5CF6'} />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Scaling</Text>
              <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>
                {isScalingDoneToday ? 'Done today' : lastScalingDate ? `Last: ${lastScalingDate.toLocaleDateString()}` : 'Not recorded'}
              </Text>
            </View>
            {isScalingDoneToday && <Ionicons name="checkmark-circle" size={28} color="#10B981" />}
          </TouchableOpacity>
        </View>
      </View>
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
            <View key={index} style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#A78BFA' }}>Tooth #{note.tooth_number}</Text>
              <Text style={{ fontSize: 14, color: '#FFFFFF', marginTop: 8 }}>{note.note}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginTop: 8 }}>
                {new Date(note.created_at).toLocaleDateString()}
              </Text>
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
