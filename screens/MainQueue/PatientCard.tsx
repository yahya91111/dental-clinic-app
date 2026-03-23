import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Patient, TimelineEvent } from './constants';
import { styles } from './styles';
import { DentalSummary, Referral, ToothNote } from '../../types';
import { shadows } from '../../theme';
import { CardHeader } from './CardHeader';
import { TimelineInfo } from './TimelineInfo';
import { ExpandedPatientHeader } from '../../components/ExpandedPatientHeader';
import { getScalingRecords, createScalingRecord } from '../../lib/database';

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
        : ['rgba(191, 219, 254, 0.25)', 'rgba(219, 234, 254, 0.25)'])  // أزرق شفاف للمريض الدائم العادي
    : (patient.status === 'complete'
        ? ['#B8D4F1', '#D4B8E8']  // أزرق/بنفسجي للمريض العادي المكتمل
        : ['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']);  // أزرق/بنفسجي شفاف للمريض العادي

  // Queue Number colors - ألوان أكثر حيوية ووضوحاً
  const queueNumberColors: [string, string] = isPermanentPatient
    ? ['#60A5FA', '#93C5FD']  // أزرق حيوي للمريض الدائم
    : gradientColors;  // نفس لون الكرت للمريض العادي
  // Check if permanent patient card is expanded (for dental info)
  const isPermanentCardExpanded = expandedPermanentCardId === patient.id;

  const textColor = '#4A5568';

  // Unified color variables for complete vs non-complete
  const isComplete = patient.status === 'complete';
  const dividerColor = isComplete ? 'rgba(255, 255, 255, 0.4)' : (isPermanentPatient ? 'rgba(147, 197, 253, 0.3)' : 'rgba(0, 0, 0, 0.08)');

  // Tag background colors per tag type
  const clinicTagBg = isComplete
    ? (isPermanentPatient ? 'rgba(147, 197, 253, 0.3)' : 'rgba(255, 255, 255, 0.3)')
    : (isPermanentPatient ? 'rgba(147, 197, 253, 0.75)' : 'rgba(184, 212, 241, 0.75)');
  const conditionTagBg = isComplete
    ? (isPermanentPatient ? 'rgba(191, 219, 254, 0.3)' : 'rgba(255, 255, 255, 0.3)')
    : (isPermanentPatient ? 'rgba(191, 219, 254, 0.75)' : 'rgba(200, 198, 236, 0.75)');
  const treatmentTagBg = isComplete
    ? (isPermanentPatient ? 'rgba(219, 234, 254, 0.3)' : 'rgba(255, 255, 255, 0.3)')
    : (isPermanentPatient ? 'rgba(219, 234, 254, 0.75)' : 'rgba(212, 184, 232, 0.75)');

  // Tag text style: complete uses white, non-complete uses orange for set values, black for defaults
  const getTagTextStyle = (value: string | undefined, defaultLabel: string) => {
    if (isComplete) {
      return { color: '#FFFFFF' };
    }
    return value && value !== defaultLabel
      ? { color: '#C2410C', fontWeight: '700' as const }
      : { color: '#000000', fontWeight: '700' as const };
  };

  return (
    <View style={[styles.patientCardWrapper, shadows.card]}>
      {/* Patient Card Content */}
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
              outputRange: [60, 10],
            }),
          }}
        >
          {/* Header - CardHeader handles isPermanentCardExpanded internally (returns null when expanded) */}
          <CardHeader
            patient={patient}
            isPermanentPatient={isPermanentPatient}
            isPermanentCardExpanded={isPermanentCardExpanded}
            isComplete={isComplete}
            textColor={textColor}
            onMenuPress={onMenuPress}
            onNotePress={onNotePress}
            onTogglePermanentExpansion={onTogglePermanentExpansion}
            onPatientNamePress={onPatientNamePress}
          />

          {/* Expanded Patient Header - iPhone style icon grid */}
          {isPermanentPatient && isPermanentCardExpanded && (
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
                if (!patient.permanent_patient_id) return;
                try {
                  const { error } = await createScalingRecord(patient.permanent_patient_id, currentDoctorName || 'Doctor');
                  if (error) { Alert.alert('Error', 'Failed to save'); return; }
                  const { data: recs } = await getScalingRecords(patient.permanent_patient_id);
                  if (recs && recs.length > 0) {
                    const mostRecent = recs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
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
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
          )}

          {/* Tags Row - Hide when expanded for permanent patients */}
          {!isPermanentCardExpanded && (
            <View style={styles.tagsRow}>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: clinicTagBg }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'clinic'); }}
              >
                <Text style={[styles.tagText, getTagTextStyle(patient.clinic, 'Clinic')]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: conditionTagBg }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'condition'); }}
              >
                <Text style={[styles.tagText, getTagTextStyle(patient.condition, 'Condition')]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: treatmentTagBg }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'treatment'); }}
              >
                <Text style={[styles.tagText, getTagTextStyle(patient.treatment, 'Treatment')]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Timeline Info */}
          {showTimeline && (
            <TimelineInfo
              patient={patient}
              isComplete={isComplete}
              isPermanentPatient={isPermanentPatient}
            />
          )}

        </Animated.View>
      </LinearGradient>

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
