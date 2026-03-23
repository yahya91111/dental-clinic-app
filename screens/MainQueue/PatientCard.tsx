import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Patient, TimelineEvent } from './constants';
import { CLINICS, CONDITIONS, TREATMENTS } from './constants';
import { styles } from './styles';
import { DentalSummary, ToothNumber, ToothCondition, ToothSurface, Referral, ToothNote } from '../../types';
import { getToothQuadrant, getToothPositionNumber, getToothName } from '../../toothHelpers';
import { shadows } from '../../theme';
import { ExpandedPatientHeader } from '../../components/ExpandedPatientHeader';
import {
  updateReferralStatus,
  getScalingRecords,
  createScalingRecord,
} from '../../lib/database';

export const CircularBadge = ({
  letter,
  backgroundColor,
  onPress
}: {
  letter: string;
  backgroundColor: string;
  onPress?: () => void;
}) => {
  const BadgeContent = (
    <View style={{
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: backgroundColor,
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
      shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
      shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
      shadowRadius: Platform.OS === 'android' ? 0 : 8,
      elevation: Platform.OS === 'android' ? 3 : 4,
    }}>
      <Text style={{
        fontSize: 13,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
      }}>
        {letter}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress}>
        {BadgeContent}
      </TouchableOpacity>
    );
  }

  return BadgeContent;
};

// Animated wrapper for PatientCard
export function AnimatedPatientCard({ index, animKey, ...props }: { index: number; animKey: number; patient: Patient; showTimeline: boolean; onMenuPress: () => void; onNotePress: () => void; onCardPress: () => void; onEditField: (patientId: string, field: 'clinic' | 'condition' | 'treatment') => void; expandedCardId: string | null; onViewDetails: (patientId: string) => void; cardTimelines: { [key: string]: TimelineEvent[] }; showTimelineTab: { [key: string]: boolean }; onToggleTab: (patientId: string) => void; onPatientNamePress?: (patientId: string, fileNumber: string) => void; expandedPermanentCardId: string | null; onTogglePermanentExpansion: (patient: Patient) => void; activeDentalTab: 'treatment' | 'referrals' | 'notes'; onDentalTabChange: (tab: 'treatment' | 'referrals' | 'notes') => void; dentalSummary?: DentalSummary; loadingDentalData?: boolean; onToothEditPress: (permanentPatientId: string, tooth: string) => void; patientReferrals?: Referral[]; onLoadReferrals?: () => void; onUpdateReferralStatus?: (referralId: string, newStatus: 'not_given' | 'given') => void; patientToothNotes?: ToothNote[]; onLoadToothNotes?: () => void; lastScalingDates?: { [key: string]: string | null }; currentDoctorName?: string; onUpdateScalingDate?: (patientId: string, timestamp: string) => void; patientConsents?: { [key: string]: boolean }; onToggleConsent?: (patient: Patient) => void; onOpenDentalChartScreen?: (permanentPatientId: string) => void; }) {
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const expandAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    slideAnim.setValue(0);
    Animated.spring(slideAnim, {
      toValue: 1,
      delay: index * 100,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
  }, [animKey]);

  const isFromRight = index % 2 === 0;

  const isPermanentPatient = props.patient.patient_type === 'permanent' || props.patient.permanent_patient_id != null;
  const isPermanentCardExpanded = props.expandedPermanentCardId === props.patient.id;

  // Animate expansion
  React.useEffect(() => {
    if (isPermanentPatient) {
      Animated.spring(expandAnim, {
        toValue: isPermanentCardExpanded ? 1 : 0,
        useNativeDriver: false,
        tension: 40,
        friction: 8,
      }).start();
    }
  }, [isPermanentCardExpanded, isPermanentPatient]);

  const isExpanded = props.expandedPermanentCardId === props.patient.id;

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [isFromRight ? 100 : -100, 0],
            }),
          },
          {
            translateY: expandAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0],
            }),
          },
        ],
        opacity: slideAnim,
        width: isExpanded ? '100%' : 'auto',
        alignSelf: isExpanded ? 'center' : 'auto',
        zIndex: isExpanded ? 100 : 1, // يظهر فوق كل العناصر عند التوسع
      }}
    >
      <PatientCard {...props} expandAnim={expandAnim} />
    </Animated.View>
  );
}

export function PatientCard({ patient, showTimeline, onMenuPress, onNotePress, onCardPress, onEditField, expandedCardId, onViewDetails, cardTimelines, showTimelineTab, onToggleTab, onPatientNamePress, expandedPermanentCardId, onTogglePermanentExpansion, activeDentalTab, onDentalTabChange, dentalSummary, loadingDentalData, expandAnim, onToothEditPress, patientReferrals, onLoadReferrals, onUpdateReferralStatus, patientToothNotes, onLoadToothNotes, lastScalingDates, currentDoctorName, onUpdateScalingDate, patientConsents, onToggleConsent, onOpenDentalChartScreen }: {
  patient: Patient;
  showTimeline: boolean;
  onMenuPress: () => void;
  onNotePress: () => void;
  onCardPress: () => void;
  onEditField: (patientId: string, field: 'clinic' | 'condition' | 'treatment') => void;
  expandedCardId: string | null;
  onViewDetails: (patientId: string) => void;
  cardTimelines: { [key: string]: TimelineEvent[] };
  showTimelineTab: { [key: string]: boolean };
  onToggleTab: (patientId: string) => void;
  onPatientNamePress?: (patientId: string, fileNumber: string) => void;
  expandedPermanentCardId: string | null;
  onTogglePermanentExpansion: (patient: Patient) => void;
  activeDentalTab: 'treatment' | 'referrals' | 'notes';
  onDentalTabChange: (tab: 'treatment' | 'referrals' | 'notes') => void;
  dentalSummary?: DentalSummary;
  loadingDentalData?: boolean;
  expandAnim: Animated.Value;
  onToothEditPress?: (permanentPatientId: string, tooth: string) => void;
  patientReferrals?: Referral[];
  onLoadReferrals?: () => void;
  patientToothNotes?: ToothNote[];
  onLoadToothNotes?: () => void;
  onUpdateReferralStatus?: (referralId: string, newStatus: 'not_given' | 'given') => void;
  lastScalingDates?: { [key: string]: string | null };
  currentDoctorName?: string;
  onUpdateScalingDate?: (patientId: string, timestamp: string) => void;
  patientConsents?: { [key: string]: boolean };
  onToggleConsent?: (patient: Patient) => void;
  onOpenDentalChartScreen?: (permanentPatientId: string) => void;
}) {
  // تأثير زجاجي: نفس الألوان لكن شفافة (0.75 = واضح جداً)
  // إذا كان DONE: نفس تدرج الكرت الصلب (بدون شفافية)
  // المريض الدائم: لون أخضر فاتح
  const isPermanentPatient = patient.patient_type === 'permanent' || patient.permanent_patient_id != null;

  const gradientColors: [string, string] = isPermanentPatient
    ? (patient.status === 'complete'
        ? ['#BFDBFE', '#DBEAFE']  // أزرق فاتح للمريض الدائم المكتمل
        : ['rgba(191, 219, 254, 0.75)', 'rgba(219, 234, 254, 0.75)'])  // أزرق شفاف للمريض الدائم العادي
    : (patient.status === 'complete'
        ? ['#B8D4F1', '#D4B8E8']  // أزرق/بنفسجي للمريض العادي المكتمل
        : ['rgba(184, 212, 241, 0.75)', 'rgba(212, 184, 232, 0.75)']);  // أزرق/بنفسجي شفاف للمريض العادي

  // Queue Number colors - ألوان أكثر حيوية ووضوحاً
  const queueNumberColors: [string, string] = isPermanentPatient
    ? ['#60A5FA', '#93C5FD']  // أزرق حيوي للمريض الدائم
    : gradientColors;  // نفس لون الكرت للمريض العادي
  const clinicColor = CLINICS.find(c => c.name === patient.clinic)?.color || '#E5E7EB';
  const conditionColor = CONDITIONS.find(c => c.name === patient.condition)?.color || '#E5E7EB';
  const treatmentColor = TREATMENTS.find(t => t.name === patient.treatment)?.color || '#E5E7EB';

  // Check if this card is expanded
  const isExpanded = expandedCardId === patient.id;
  const patientTimeline = cardTimelines[patient.id] || [];
  const showingTimeline = showTimelineTab[patient.id] !== false; // default true

  // Check if permanent patient card is expanded (for dental info)
  const isPermanentCardExpanded = expandedPermanentCardId === patient.id;

  // Determine card background color based on status
  let cardBgColor = 'transparent'; // شفاف ليظهر التصميم الزجاجي
  if (patient.status === 'na') cardBgColor = 'rgba(209, 213, 219, 0.3)'; // رمادي شفاف
  if (patient.status === 'elderly') cardBgColor = 'rgba(254, 215, 170, 0.3)'; // برتقالي شفاف
  // complete cards use gradient, not background color

  const textColor = '#4A5568';

  return (
    <View style={[
      styles.patientCardWrapper,
      shadows.card
    ]}>
      {/* Patient Card Content */}
      {patient.status === 'complete' ? (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.patientCardContent}
        >
          <Animated.View
            style={{
              flex: 1,
              paddingRight: expandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [60, 10], // من 60 إلى 10 عند التوسع
              }),
            }}
          >
          {/* Header Row: Menu (left) - Status Badges - Name */}
          {!isPermanentCardExpanded ? (
            // Normal Collapsed Header
            <View style={styles.cardHeader}>
              <View style={styles.leftSection}>
                <>
                  <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
                    <Text style={[styles.menuIcon, { color: '#FFFFFF' }]}>⋮</Text>
                  </TouchableOpacity>

                  {/* Done Badge - Green Circle */}
                  <CircularBadge letter="D" backgroundColor="#10B981" />

                  {/* Elderly Badge - Orange Circle */}
                  {patient.isElderly && (
                    <CircularBadge letter="E" backgroundColor="#F97316" />
                  )}

                  {/* Special Needs Badge - Purple Circle */}
                  {patient.isSpecialNeeds && (
                    <CircularBadge letter="S" backgroundColor="#8B5CF6" />
                  )}

                  {/* Note Badge - Blue Circle with tap action */}
                  {patient.note && (
                    <CircularBadge letter="N" backgroundColor="#3B82F6" onPress={onNotePress} />
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
                      color="#FFFFFF"
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
                  <Text style={[styles.patientName, { color: '#FFFFFF', fontSize: 20 }]}>{patient.name}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.patientName, { color: '#FFFFFF' }]}>{patient.name}</Text>
              )}
            </View>
          ) : (
            // iPhone Style Expanded Header - New Design
            <ExpandedPatientHeader
              patient={patient}
              dentalSummary={(dentalSummary || null) as any}
              loadingDentalData={loadingDentalData || false}
              patientReferrals={(patientReferrals || []) as any}
              loadingReferrals={false}
              onLoadReferrals={onLoadReferrals || (() => {})}
              toothNotes={(patientToothNotes || []) as any}
              loadingToothNotes={false}
              onLoadToothNotes={onLoadToothNotes || (() => {})}
              lastScalingDate={lastScalingDates?.[patient.id] ? new Date(lastScalingDates[patient.id]!) : undefined}
              onFluoridePress={() => {}}
              onScalingPress={async () => {
                if (!patient.permanent_patient_id) {
                  Alert.alert('Error', 'Patient ID not found');
                  return;
                }
                try {
                  const { error } = await createScalingRecord(patient.permanent_patient_id, currentDoctorName || 'Doctor');
                  if (error) { Alert.alert('Error', 'Failed to save'); return; }
                  const { data: recs } = await getScalingRecords(patient.permanent_patient_id);
                  if (recs && recs.length > 0) {
                    const mostRecent = recs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                    onUpdateScalingDate?.(patient.id, mostRecent.timestamp);
                  }
                  Alert.alert('Success', 'Scaling record saved');
                } catch (err) { Alert.alert('Error', 'Unexpected error'); }
              }}
              patientConsents={[]}
              onConsentPress={() => onToggleConsent?.(patient)}
              onOpenDentalChart={() => {
                if (patient.permanent_patient_id) {
                  onOpenDentalChartScreen?.(patient.permanent_patient_id);
                }
              }}
              onTogglePermanentExpansion={onTogglePermanentExpansion as any}
              onToothEditPress={(patientId: string, tooth: any) => onToothEditPress?.(patientId, String(tooth))}
              onPatientNamePress={onPatientNamePress}
            />
          )}

          {/* Divider - Only show when NOT expanded */}
          {!isPermanentCardExpanded && (
            <View style={[styles.divider, { backgroundColor: 'rgba(255, 255, 255, 0.4)' }]} />
          )}

          {/* Tags Row - Hide when expanded for permanent patients */}
          {!isPermanentCardExpanded && (
            <View style={styles.tagsRow}>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(147, 197, 253, 0.3)' : 'rgba(255, 255, 255, 0.3)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'clinic'); }}
              >
                <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(191, 219, 254, 0.3)' : 'rgba(255, 255, 255, 0.3)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'condition'); }}
              >
                <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(219, 234, 254, 0.3)' : 'rgba(255, 255, 255, 0.3)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'treatment'); }}
              >
                <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {showTimeline && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.4)' }}>
              {patient.registered_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="add-circle-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Registered: {patient.registered_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.clinic_entry_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="enter-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Entered Clinic: {patient.clinic_entry_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.completed_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Completed: {patient.completed_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.doctor_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="person-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Done by Dr. {patient.doctor_name}
                  </Text>
                </View>
              )}
              {patient.assigned_by_doctor_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="people-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6, fontStyle: 'italic' }}>
                    Assigned by Dr. {patient.assigned_by_doctor_name}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Expanded Dental Info - Inside Card */}
          {isPermanentPatient && isPermanentCardExpanded && (
            <Animated.View
              style={{
                maxHeight: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 800], // ارتفاع الكرت الموسع - زيادة من 580 إلى 800
                }),
                opacity: expandAnim,
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingTop: 10, marginTop: 6, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' }}>
                {/* White Divider Line */}
                <View style={{
                  height: 2,
                  backgroundColor: '#FFFFFF',
                  marginBottom: 14,
                }} />

                {/* Segmented Control - Enhanced Design */}
                <View
                  style={{
                    backgroundColor: 'rgba(219, 234, 254, 0.95)',
                    borderRadius: 12,
                    padding: 4,
                    marginBottom: 14,
                    flexDirection: 'row',
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => onDentalTabChange('treatment')}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'treatment' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="medkit"
                        size={14}
                        color={activeDentalTab === 'treatment' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: activeDentalTab === 'treatment' ? '#FFFFFF' : '#64748B',
                      }}>Treatment</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      onDentalTabChange('referrals');
                      if (onLoadReferrals) {
                        onLoadReferrals();
                      }
                    }}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'referrals' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="people"
                        size={14}
                        color={activeDentalTab === 'referrals' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: activeDentalTab === 'referrals' ? '#FFFFFF' : '#64748B',
                      }}>Referrals</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      onDentalTabChange('notes');
                      if (onLoadToothNotes) {
                        onLoadToothNotes();
                      }
                    }}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'notes' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="document-text"
                        size={14}
                        color={activeDentalTab === 'notes' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: activeDentalTab === 'notes' ? '#FFFFFF' : '#64748B',
                      }}>Notes</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Tab Content */}
                <View style={[styles.dentalTabContent, { backgroundColor: 'transparent' }]}>
                  {activeDentalTab === 'treatment' && (
                    <>
                      {loadingDentalData ? (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>Loading...</Text>
                      ) : dentalSummary && dentalSummary.total_issues > 0 ? (
                        <ScrollView
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={{ paddingBottom: 150 }}
                        >
                          <View style={styles.treatmentContainer}>
                          {/* Caries Section - Modern Card Design */}
                          {dentalSummary.caries_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Caries</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.caries_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.caries_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Pulpectomy Section - Modern Card Design */}
                          {dentalSummary.rct_needed_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Pulpectomy</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.rct_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.rct_needed_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Extraction Section - Modern Card Design */}
                          {dentalSummary.extraction_needed_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Extraction</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.extraction_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.extraction_needed_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Broken Teeth Section - Modern Card Design */}
                          {dentalSummary.broken_teeth_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Broken Tooth/Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.broken_teeth_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.broken_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Temporary Filling Section - Modern Card Design */}
                          {dentalSummary.filling_done_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Need Permanent Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.filling_done_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.filling_done_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}
                        </View>
                        </ScrollView>
                      ) : (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>No treatment needed</Text>
                      )}
                    </>
                  )}
                  {activeDentalTab === 'referrals' && (
                    <>
                      {patientReferrals && patientReferrals.length > 0 ? (
                        <ScrollView
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={{ paddingBottom: 150 }}
                        >
                          <View style={{ gap: 12 }}>
                            {/* SECTION 1: Need Referral - Orange Cards */}
                            {(() => {
                              const notGivenReferrals = patientReferrals.filter(r => r.status === 'not_given');
                              if (notGivenReferrals.length === 0) return null;

                              return (
                                <>
                                  {/* Section Header */}
                                  <View style={{ marginBottom: 8, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(254, 215, 170, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#EA580C' }}>
                                      Need Referral ({notGivenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {notGivenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(254, 215, 170, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#EA580C' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <TouchableOpacity
                                          style={{
                                            backgroundColor: 'rgba(251, 146, 60, 0.3)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: 'rgba(251, 146, 60, 0.5)',
                                          }}
                                          onPress={async () => {
                                            const { data, error } = await updateReferralStatus(referral.id, 'given');
                                            if (data && onUpdateReferralStatus) {
                                              onUpdateReferralStatus(referral.id, 'given');
                                            }
                                          }}
                                          activeOpacity={0.6}
                                        >
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>Not Given</Text>
                                        </TouchableOpacity>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(234, 88, 12, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(234, 88, 12, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                                            {referral.tooth_number || 'General'}
                                          </Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {referral.doctor_name}
                                        </Text>
                                      </View>
                                    </View>
                                  ))}
                                </>
                              );
                            })()}

                            {/* SECTION 2: Referrals Records - Green Cards */}
                            {(() => {
                              const givenReferrals = patientReferrals.filter(r => r.status === 'given');
                              if (givenReferrals.length === 0) return null;

                              return (
                                <>
                                  {/* Section Header */}
                                  <View style={{ marginBottom: 8, marginTop: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(167, 243, 208, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669' }}>
                                      Referrals Records ({givenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {givenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(167, 243, 208, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#059669' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <View style={{
                                          backgroundColor: 'rgba(52, 211, 153, 0.3)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 4,
                                          borderRadius: 12,
                                          borderWidth: 1,
                                          borderColor: 'rgba(52, 211, 153, 0.5)',
                                        }}>
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>Given ✔</Text>
                                        </View>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(5, 150, 105, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(5, 150, 105, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{referral.tooth_number}</Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {referral.doctor_name}
                                        </Text>
                                      </View>
                                    </View>
                                  ))}
                                </>
                              );
                            })()}
                          </View>
                        </ScrollView>
                      ) : (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>No referrals found.</Text>
                      )}
                    </>
                  )}
                  {activeDentalTab === 'notes' && (
                    <>
                      {patientToothNotes && patientToothNotes.length > 0 ? (
                        <ScrollView contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 4, paddingBottom: 80 }} showsVerticalScrollIndicator={true}>
                          {patientToothNotes
                            .slice()
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map((note) => (
                            <View
                              key={note.id}
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              {/* Header: Tooth Number + Badge */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <View style={{
                                  backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                                    {note.tooth_number}
                                  </Text>
                                </View>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E3A8A' }}>
                                    Note
                                  </Text>
                                </View>
                              </View>

                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                              {/* Note Content */}
                              <View style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                padding: 10,
                                borderRadius: 8,
                                marginBottom: 8,
                              }}>
                                <Text style={{ fontSize: 13, color: '#1E293B', lineHeight: 18, fontStyle: 'italic' }}>
                                  "{note.note}"
                                </Text>
                              </View>

                              {/* Footer: Doctor & Date */}
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                  Dr. {note.doctor_name}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                  {new Date(note.timestamp).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>
                          No notes for this patient
                        </Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            </Animated.View>
          )}

          </Animated.View>
        </LinearGradient>
      ) : (
        <LinearGradient
            colors={isPermanentPatient
              ? ['rgba(191, 219, 254, 0.25)', 'rgba(219, 234, 254, 0.25)']  // أزرق فاتح للمريض الدائم
              : ['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']}  // أزرق/بنفسجي للووك-ان
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.patientCardContent}
          >
            <Animated.View
              style={{
                flex: 1,
                paddingRight: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [60, 10], // من 60 إلى 10 عند التوسع
                }),
              }}
            >
            {/* Header Row: Menu (left) - Status Badges - Name */}
            {!isPermanentCardExpanded ? (
              // Normal Collapsed Header
              <View style={styles.cardHeader}>
                <View style={styles.leftSection}>
                  <>
                    <TouchableOpacity style={styles.menuButton} onPress={(e) => { e.stopPropagation(); onMenuPress(); }}>
                      <Text style={[styles.menuIcon, { color: isPermanentPatient ? '#1E3A8A' : textColor }]}>⋮</Text>
                    </TouchableOpacity>

                    {/* Elderly Badge - Orange Circle */}
                    {patient.isElderly && (
                      <CircularBadge letter="E" backgroundColor="#F97316" />
                    )}

                    {/* Special Needs Badge - Purple Circle */}
                    {patient.isSpecialNeeds && (
                      <CircularBadge letter="S" backgroundColor="#8B5CF6" />
                    )}

                    {/* N/A Badge - Gray Circle */}
                    {patient.status === 'na' && (
                      <CircularBadge letter="X" backgroundColor="#6B7280" />
                    )}

                    {/* Note Badge - Blue Circle with tap action */}
                    {patient.note && (
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); onNotePress(); }}>
                        <CircularBadge letter="N" backgroundColor="#3B82F6" />
                      </TouchableOpacity>
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
                        color="#1E3A8A"
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
                    <Text style={[styles.patientName, { color: '#1E3A8A' }]}>{patient.name}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.patientName, { color: textColor }]}>{patient.name}</Text>
                )}
              </View>
            ) : (
            // iPhone Style Expanded Header - New Design
            <ExpandedPatientHeader
              patient={patient}
              dentalSummary={(dentalSummary || null) as any}
              loadingDentalData={loadingDentalData || false}
              patientReferrals={(patientReferrals || []) as any}
              loadingReferrals={false}
              onLoadReferrals={onLoadReferrals || (() => {})}
              toothNotes={(patientToothNotes || []) as any}
              loadingToothNotes={false}
              onLoadToothNotes={onLoadToothNotes || (() => {})}
              lastScalingDate={lastScalingDates?.[patient.id] ? new Date(lastScalingDates[patient.id]!) : undefined}
              onFluoridePress={() => {}}
              onScalingPress={async () => {
                if (!patient.permanent_patient_id) {
                  Alert.alert('Error', 'Patient ID not found');
                  return;
                }
                try {
                  const { error } = await createScalingRecord(patient.permanent_patient_id, currentDoctorName || 'Doctor');
                  if (error) { Alert.alert('Error', 'Failed to save'); return; }
                  const { data: recs } = await getScalingRecords(patient.permanent_patient_id);
                  if (recs && recs.length > 0) {
                    const mostRecent = recs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                    onUpdateScalingDate?.(patient.id, mostRecent.timestamp);
                  }
                  Alert.alert('Success', 'Scaling record saved');
                } catch (err) { Alert.alert('Error', 'Unexpected error'); }
              }}
              patientConsents={[]}
              onConsentPress={() => onToggleConsent?.(patient)}
              onOpenDentalChart={() => {
                if (patient.permanent_patient_id) {
                  onOpenDentalChartScreen?.(patient.permanent_patient_id);
                }
              }}
              onTogglePermanentExpansion={onTogglePermanentExpansion as any}
              onToothEditPress={(patientId: string, tooth: any) => onToothEditPress?.(patientId, String(tooth))}
              onPatientNamePress={onPatientNamePress}
            />
            )}

          {/* Divider - Only show when NOT expanded */}
          {!isPermanentCardExpanded && (
            <View style={styles.divider} />
          )}

          {/* Tags Row - Hide when expanded for permanent patients */}
          {!isPermanentCardExpanded && (
            <View style={styles.tagsRow}>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(147, 197, 253, 0.75)' : 'rgba(184, 212, 241, 0.75)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'clinic'); }}
              >
                <Text style={[styles.tagText, patient.clinic && patient.clinic !== 'Clinic' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(191, 219, 254, 0.75)' : 'rgba(200, 198, 236, 0.75)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'condition'); }}
              >
                <Text style={[styles.tagText, patient.condition && patient.condition !== 'Condition' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(219, 234, 254, 0.75)' : 'rgba(212, 184, 232, 0.75)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'treatment'); }}
              >
                <Text style={[styles.tagText, patient.treatment && patient.treatment !== 'Treatment' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {showTimeline && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.4)' }}>
              {patient.registered_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="add-circle-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Registered: {patient.registered_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.clinic_entry_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="enter-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Entered Clinic: {patient.clinic_entry_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.completed_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Completed: {patient.completed_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.doctor_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Doctor: {patient.doctor_name}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Expanded Dental Info - Inside Card (Non-Complete) */}
          {isPermanentPatient && isPermanentCardExpanded && (
            <Animated.View
              style={{
                maxHeight: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 800], // ارتفاع الكرت الموسع - زيادة من 580 إلى 800
                }),
                opacity: expandAnim,
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingTop: 10, marginTop: 6, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' }}>
                {/* White Divider Line */}
                <View style={{
                  height: 2,
                  backgroundColor: '#FFFFFF',
                  marginBottom: 14,
                }} />

                {/* Segmented Control - Enhanced Design */}
                <View
                  style={{
                    backgroundColor: 'rgba(219, 234, 254, 0.95)',
                    borderRadius: 12,
                    padding: 4,
                    marginBottom: 14,
                    flexDirection: 'row',
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => onDentalTabChange('treatment')}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'treatment' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="medkit"
                        size={14}
                        color={activeDentalTab === 'treatment' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: activeDentalTab === 'treatment' ? '#FFFFFF' : '#64748B',
                      }}>Treatment</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      onDentalTabChange('referrals');
                      if (onLoadReferrals) {
                        onLoadReferrals();
                      }
                    }}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'referrals' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="people"
                        size={14}
                        color={activeDentalTab === 'referrals' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: activeDentalTab === 'referrals' ? '#FFFFFF' : '#64748B',
                      }}>Referrals</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      onDentalTabChange('notes');
                      if (onLoadToothNotes) {
                        onLoadToothNotes();
                      }
                    }}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'notes' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="document-text"
                        size={14}
                        color={activeDentalTab === 'notes' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: activeDentalTab === 'notes' ? '#FFFFFF' : '#64748B',
                      }}>Notes</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Tab Content */}
                <View style={[styles.dentalTabContent, { backgroundColor: 'transparent' }]}>
                  {activeDentalTab === 'treatment' && (
                    <>
                      {loadingDentalData ? (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>Loading...</Text>
                      ) : dentalSummary && dentalSummary.total_issues > 0 ? (
                        <ScrollView
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={{ paddingBottom: 150 }}
                        >
                          <View style={styles.treatmentContainer}>
                          {/* Caries Section - Modern Card Design */}
                          {dentalSummary.caries_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Caries</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.caries_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.caries_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Pulpectomy Section - Modern Card Design */}
                          {dentalSummary.rct_needed_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Pulpectomy</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.rct_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.rct_needed_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Extraction Section - Modern Card Design */}
                          {dentalSummary.extraction_needed_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Extraction</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.extraction_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.extraction_needed_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Broken Teeth Section - Modern Card Design */}
                          {dentalSummary.broken_teeth_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Broken Tooth/Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.broken_teeth_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.broken_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Temporary Filling Section - Modern Card Design */}
                          {dentalSummary.filling_done_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Need Permanent Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.filling_done_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
                              <View style={styles.teethGrid}>
                                {dentalSummary.filling_done_teeth.map((tooth) => (
                                  <TouchableOpacity
                                    key={tooth}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                      if (patient.permanent_patient_id && onToothEditPress) {
                                        onToothEditPress(patient.permanent_patient_id, tooth);
                                      }
                                    }}
                                  >
                                    <View
                                      style={{
                                        backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
                                        fontWeight: '700',
                                        color: '#FFFFFF',
                                        textAlign: 'center',
                                      }}>{tooth}</Text>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                          )}
                        </View>
                        </ScrollView>
                      ) : (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>No treatment needed</Text>
                      )}
                    </>
                  )}
                  {activeDentalTab === 'referrals' && (
                    <>
                      {patientReferrals && patientReferrals.length > 0 ? (
                        <ScrollView
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={{ paddingBottom: 150 }}
                        >
                          <View style={{ gap: 12 }}>
                            {/* SECTION 1: Need Referral - Orange Cards */}
                            {(() => {
                              const notGivenReferrals = patientReferrals.filter(r => r.status === 'not_given');
                              if (notGivenReferrals.length === 0) return null;

                              return (
                                <>
                                  {/* Section Header */}
                                  <View style={{ marginBottom: 8, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(254, 215, 170, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#EA580C' }}>
                                      Need Referral ({notGivenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {notGivenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(254, 215, 170, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#EA580C' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <TouchableOpacity
                                          style={{
                                            backgroundColor: 'rgba(251, 146, 60, 0.3)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: 'rgba(251, 146, 60, 0.5)',
                                          }}
                                          onPress={async () => {
                                            const { data, error } = await updateReferralStatus(referral.id, 'given');
                                            if (data && onUpdateReferralStatus) {
                                              onUpdateReferralStatus(referral.id, 'given');
                                            }
                                          }}
                                          activeOpacity={0.6}
                                        >
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>Not Given</Text>
                                        </TouchableOpacity>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(234, 88, 12, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(234, 88, 12, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                                            {referral.tooth_number || 'General'}
                                          </Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {referral.doctor_name}
                                        </Text>
                                      </View>
                                    </View>
                                  ))}
                                </>
                              );
                            })()}

                            {/* SECTION 2: Referrals Records - Green Cards */}
                            {(() => {
                              const givenReferrals = patientReferrals.filter(r => r.status === 'given');
                              if (givenReferrals.length === 0) return null;

                              return (
                                <>
                                  {/* Section Header */}
                                  <View style={{ marginBottom: 8, marginTop: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(167, 243, 208, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669' }}>
                                      Referrals Records ({givenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {givenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(167, 243, 208, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#059669' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <View style={{
                                          backgroundColor: 'rgba(52, 211, 153, 0.3)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 4,
                                          borderRadius: 12,
                                          borderWidth: 1,
                                          borderColor: 'rgba(52, 211, 153, 0.5)',
                                        }}>
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>Given ✔</Text>
                                        </View>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(5, 150, 105, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(5, 150, 105, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{referral.tooth_number}</Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {referral.doctor_name}
                                        </Text>
                                      </View>
                                    </View>
                                  ))}
                                </>
                              );
                            })()}
                          </View>
                        </ScrollView>
                      ) : (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>No referrals found.</Text>
                      )}
                    </>
                  )}
                  {activeDentalTab === 'notes' && (
                    <>
                      {patientToothNotes && patientToothNotes.length > 0 ? (
                        <ScrollView contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 4, paddingBottom: 80 }} showsVerticalScrollIndicator={true}>
                          {patientToothNotes
                            .slice()
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map((note) => (
                            <View
                              key={note.id}
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              {/* Header: Tooth Number + Badge */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <View style={{
                                  backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                                    {note.tooth_number}
                                  </Text>
                                </View>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E3A8A' }}>
                                    Note
                                  </Text>
                                </View>
                              </View>

                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                              {/* Note Content */}
                              <View style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                padding: 10,
                                borderRadius: 8,
                                marginBottom: 8,
                              }}>
                                <Text style={{ fontSize: 13, color: '#1E293B', lineHeight: 18, fontStyle: 'italic' }}>
                                  "{note.note}"
                                </Text>
                              </View>

                              {/* Footer: Doctor & Date */}
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                  Dr. {note.doctor_name}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                  {new Date(note.timestamp).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={[styles.dentalTabContentText, { color: '#1E3A8A' }]}>
                          No notes for this patient
                        </Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            </Animated.View>
          )}

          </Animated.View>
        </LinearGradient>
      )}

      {/* Queue Number Section - Right Side Integrated - Slides out when expanded */}
      <Animated.View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 50,
          transform: [{
            translateX: expandAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 100], // Slide out 100px to the right when expanded
            }),
          }],
          opacity: expandAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0], // Fade out when expanded
          }),
        }}
      >
        <LinearGradient
          colors={queueNumberColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.queueNumberSection}
        >
          <Text style={styles.queueNumberText}>{patient.queue_number === 0 ? '-' : patient.queue_number}</Text>
        </LinearGradient>
      </Animated.View>

    </View>
  );
}
