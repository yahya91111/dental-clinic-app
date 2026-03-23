import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

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
}

interface PatientReferral {
  id: string;
  department: string;
  reason?: string;
  created_at: string;
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

  // Icon configurations
  const icons = [
    { id: 'dental', label: 'Treatment', icon: 'tooth-outline', iconType: 'material', color: '#8B5CF6', bgColor: 'rgba(139, 92, 246, 0.35)' },
    { id: 'referrals', label: 'Referrals', icon: 'arrow-redo', iconType: 'ionicon', color: '#F97316', bgColor: 'rgba(249, 115, 22, 0.35)' },
    { id: 'hygiene', label: 'Hygiene', icon: 'sparkles', iconType: 'ionicon', color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.35)' },
    { id: 'notes', label: 'Notes', icon: 'document-text', iconType: 'ionicon', color: '#A78BFA', bgColor: 'rgba(167, 139, 250, 0.35)' },
    { id: 'consent', label: 'Consent', icon: patientConsents?.some(c => !c.signed) ? 'alert-circle' : 'checkmark-circle', iconType: 'ionicon', color: patientConsents?.some(c => !c.signed) ? '#EF4444' : '#10B981', bgColor: patientConsents?.some(c => !c.signed) ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)' },
    { id: 'chart', label: 'Chart', icon: 'open-outline', iconType: 'ionicon', color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.35)' },
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
      {/* Close Button */}
      <View style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 4,
          }}
          onPress={(e) => {
            e.stopPropagation();
            onTogglePermanentExpansion(patient);
          }}
        >
          <Ionicons name="chevron-up" size={20} color="#1E3A8A" />
        </TouchableOpacity>
      </View>

      {/* Patient Name */}
      <TouchableOpacity
        style={{ alignItems: 'center', marginTop: 32, marginBottom: 24 }}
        onPress={(e) => {
          e.stopPropagation();
          if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
            onPatientNamePress(patient.permanent_patient_id, patient.file_number);
          }
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF' }}>{patient.name}</Text>
        {patient.file_number && (
          <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>
            File: {patient.file_number}
          </Text>
        )}
      </TouchableOpacity>

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
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }}
            onPress={(e) => {
              e.stopPropagation();
              handleIconPress(item.id);
            }}
          >
            {renderIcon(item)}
            <Text style={{ fontSize: 12, color: '#FFFFFF', marginTop: 8, fontWeight: '500' }}>
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
      <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 18, letterSpacing: 0.3 }}>
        Dental Treatment Summary
      </Text>

      {loadingDentalData ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : dentalSummary ? (
        <View style={{ gap: 14 }}>
          {/* Caries */}
          {dentalSummary.caries_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(239, 68, 68, 0.45)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 3,
              borderColor: '#FFFFFF',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                    Caries
                  </Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.caries_count}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.caries_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.35)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* RCT Needed */}
          {dentalSummary.rct_needed_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(249, 115, 22, 0.45)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 3,
              borderColor: '#FFFFFF',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="medical" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                    RCT Needed
                  </Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.rct_needed_count}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.rct_needed_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.35)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Extraction Needed */}
          {dentalSummary.extraction_needed_count > 0 && (
            <View style={{
              backgroundColor: 'rgba(139, 92, 246, 0.45)',
              borderRadius: 16,
              padding: 16,
              borderWidth: 3,
              borderColor: '#FFFFFF',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="remove-circle" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                    Extraction Needed
                  </Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{dentalSummary.extraction_needed_count}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dentalSummary.extraction_needed_teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.35)',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>#{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {dentalSummary.caries_count === 0 && dentalSummary.rct_needed_count === 0 && dentalSummary.extraction_needed_count === 0 && (
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
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 16 }}>
        Referrals
      </Text>

      {loadingReferrals ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : patientReferrals.length > 0 ? (
        <View style={{ gap: 12 }}>
          {patientReferrals.map((referral) => (
            <View key={referral.id} style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>{referral.department}</Text>
              {referral.reason && (
                <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>{referral.reason}</Text>
              )}
              <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginTop: 8 }}>
                {new Date(referral.created_at).toLocaleDateString()}
              </Text>
            </View>
          ))}
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
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 24 }}>
          Oral Hygiene
        </Text>

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
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 16 }}>
        Tooth Notes
      </Text>

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
        {/* Back Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)' }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 8,
            }}
            onPress={(e) => {
              e.stopPropagation();
              setExpandedSection(null);
            }}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            <Text style={{ fontSize: 16, color: '#FFFFFF', marginLeft: 8 }}>Back</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginLeft: 16 }}>{sectionTitle}</Text>
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
