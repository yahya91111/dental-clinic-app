import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { scale } from '../../lib/scale';
import { BlurView } from 'expo-blur';
import { styles, SCREEN_WIDTH, SCREEN_HEIGHT } from './styles';
import { ToothNumberBadge } from './DentalChartComponents';
import { getToothName } from './dentalHelpers';
import {
  REFERRAL_HEADER_HEIGHT,
  REFERRAL_CONTENT_MIN,
  REFERRAL_CONTENT_MAX,
  CONTAINER_SPACING,
} from './constants';
import type { ReferralsState, ReferralStatusState } from './DepartmentModal';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ToothRecord {
  type: 'editing' | 'planning';
  treatment?: string;
  details?: string;
  surfaces?: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  action?: 'diagnosed' | 'canceled';
  condition?: string;
  isChange?: boolean;
  previousCondition?: string;
}

export interface ScalingRecord {
  id: string;
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

export interface ReferralRecord {
  departmentKey: string;
  departmentName: string;
  teeth: number[];
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

export interface TreatmentRecordContainerProps {
  // Animation values
  treatmentRecordSlide: Animated.Value;
  treatmentRecordPushDown: Animated.Value;
  treatmentRecordExpandAnim: Animated.Value;

  // State
  isTreatmentRecordExpanded: boolean;
  isPlanningRecordExpanded: boolean;
  isViewModeActive: boolean;
  referralTab: 'department' | 'records';
  referrals: ReferralsState;
  referralStatus: ReferralStatusState;
  referralRecords: ReferralRecord[];
  toothRecords: Record<number | string, ToothRecord[]>;
  scalingRecords: ScalingRecord[];

  // Setters
  setIsTreatmentRecordExpanded: (expanded: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════
// Treatment Record Card Sub-component
// ═══════════════════════════════════════════════════════════════

interface TreatmentRecordCardProps {
  record: {
    type: 'treatment' | 'scaling';
    toothNumber?: number;
    treatment?: string;
    details?: string;
    surfaces?: string[];
    timestamp: string;
    doctorName: string;
  };
}

const TreatmentRecordCard: React.FC<TreatmentRecordCardProps> = ({ record }) => {
  if (record.type === 'scaling') {
    return (
      <View style={{
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderRadius: scale(18),
        padding: scale(20),
        marginBottom: scale(16),
        borderWidth: scale(2),
        borderColor: 'rgba(16, 185, 129, 0.35)',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(12) }}>
          <View style={{
            width: scale(10),
            height: scale(10),
            borderRadius: scale(5),
            backgroundColor: '#047857',
            marginRight: scale(10),
          }} />
          <Text style={{ fontSize: scale(18), fontWeight: '700', color: '#047857' }}>
            Scaling Done
          </Text>
        </View>
        <View style={{ borderTopWidth: scale(1), borderTopColor: 'rgba(16, 185, 129, 0.2)', paddingTop: scale(12), marginTop: scale(8), gap: scale(6) }}>
          <Text style={{ fontSize: scale(13), color: '#6B7280', fontWeight: '500' }}>{record.timestamp}</Text>
          <Text style={{ fontSize: scale(13), color: '#047857', fontWeight: '600' }}>Dr. {record.doctorName}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{
      backgroundColor: 'rgba(37, 99, 235, 0.08)',
      borderRadius: scale(18),
      padding: scale(20),
      marginBottom: scale(16),
      borderWidth: scale(2),
      borderColor: 'rgba(37, 99, 235, 0.35)',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(14), gap: scale(10) }}>
        <ToothNumberBadge toothNumber={record.toothNumber} />
        <Text style={{ fontSize: scale(15), fontWeight: '700', color: '#4B5563' }}>
          {getToothName(record.toothNumber).english}
        </Text>
      </View>

      <View style={{ gap: scale(8), marginBottom: scale(12) }}>
        <View style={{ flexDirection: 'row' }}>
          <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>Treatment:</Text>
          {['Extraction', 'Filling', 'Pulpectomy'].includes(record.treatment || '') ? (
            <View style={{
              backgroundColor: record.treatment === 'Extraction' ? 'rgba(156, 163, 175, 0.15)'
                : record.treatment === 'Filling' ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(139, 92, 246, 0.15)',
              paddingHorizontal: scale(10),
              paddingVertical: scale(4),
              borderRadius: scale(8),
            }}>
              <Text style={{
                fontSize: scale(14),
                color: record.treatment === 'Extraction' ? '#4B5563'
                  : record.treatment === 'Filling' ? '#047857'
                  : '#7C3AED',
                fontWeight: '600'
              }}>
                {record.treatment}
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>{record.treatment}</Text>
          )}
        </View>

        {record.details && (
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>Details:</Text>
            <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>{record.details}</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row' }}>
          <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>Surfaces:</Text>
          <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>
            {record.treatment === 'Extraction' ? 'N/A' : (record.surfaces?.join(', ') || '-')}
          </Text>
        </View>
      </View>

      <View style={{ borderTopWidth: scale(1), borderTopColor: 'rgba(37, 99, 235, 0.2)', paddingTop: scale(12), gap: scale(6) }}>
        <Text style={{ fontSize: scale(13), color: '#6B7280', fontWeight: '500' }}>{record.timestamp}</Text>
        <Text style={{ fontSize: scale(13), color: '#2563EB', fontWeight: '600' }}>Dr. {record.doctorName}</Text>
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Treatment Record Container Component
// ═══════════════════════════════════════════════════════════════

export const TreatmentRecordContainer: React.FC<TreatmentRecordContainerProps> = ({
  treatmentRecordSlide,
  treatmentRecordPushDown,
  treatmentRecordExpandAnim,
  isTreatmentRecordExpanded,
  isPlanningRecordExpanded,
  isViewModeActive,
  referralTab,
  referrals,
  referralStatus,
  referralRecords,
  toothRecords,
  scalingRecords,
  setIsTreatmentRecordExpanded,
}) => {
  const hasActiveReferrals = Object.entries(referrals).some(([key, checked]) =>
    checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
  );

  const paddingTopValue = isTreatmentRecordExpanded ? 20 : (
    REFERRAL_HEADER_HEIGHT +
    ((
      (referralTab === 'department' && hasActiveReferrals) ||
      (referralTab === 'records' && referralRecords.length > 0)
    ) ? REFERRAL_CONTENT_MAX : REFERRAL_CONTENT_MIN) +
    CONTAINER_SPACING
  );

  const handleClose = () => {
    setIsTreatmentRecordExpanded(false);
    Animated.spring(treatmentRecordExpandAnim, {
      toValue: 0,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  const handleOpen = () => {
    console.log('Total Treatment Record clicked!');
    setIsTreatmentRecordExpanded(true);
    Animated.spring(treatmentRecordExpandAnim, {
      toValue: 1,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  // Collect all treatment records
  const getAllRecords = () => {
    const allRecords: Array<{
      type: 'treatment' | 'scaling';
      toothNumber?: number;
      treatment?: string;
      details?: string;
      surfaces?: string[];
      timestamp: string;
      timestampNum?: number;
      doctorName: string;
    }> = [];

    // Add tooth records (editing records only)
    Object.entries(toothRecords).forEach(([toothNum, records]) => {
      records.forEach((record) => {
        if (record.type === 'editing') {
          allRecords.push({
            type: 'treatment',
            toothNumber: parseInt(toothNum),
            treatment: record.treatment,
            details: record.details,
            surfaces: record.surfaces,
            timestamp: record.timestamp,
            timestampNum: record.timestampNum,
            doctorName: record.doctorName,
          });
        }
      });
    });

    // Add scaling records
    scalingRecords.forEach((record) => {
      allRecords.push({
        type: 'scaling',
        timestamp: record.timestamp,
        timestampNum: record.timestampNum,
        doctorName: record.doctorName,
      });
    });

    // Sort by newest first
    allRecords.sort((a, b) => {
      let timeA = 0;
      let timeB = 0;

      if (a.timestampNum && !isNaN(a.timestampNum)) {
        timeA = a.timestampNum;
      } else {
        const dateA = new Date(a.timestamp);
        timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
      }

      if (b.timestampNum && !isNaN(b.timestampNum)) {
        timeB = b.timestampNum;
      } else {
        const dateB = new Date(b.timestamp);
        timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
      }

      return timeB - timeA;
    });

    return allRecords;
  };

  return (
    <Animated.View
      style={[
        styles.treatmentRecordContainer,
        {
          transform: [
            { translateX: treatmentRecordSlide },
            { translateY: treatmentRecordPushDown }
          ],
          paddingTop: paddingTopValue,
          paddingHorizontal: isTreatmentRecordExpanded ? 0 : 20,
          zIndex: isTreatmentRecordExpanded ? 10005 : 10002,
          elevation: isTreatmentRecordExpanded ? 10005 : 10002,
          opacity: isPlanningRecordExpanded ? 0 : 1
        }
      ]}
      pointerEvents={isViewModeActive ? 'auto' : 'none'}
    >
      {isTreatmentRecordExpanded ? (
        <View style={{ width: SCREEN_WIDTH * 0.85, height: SCREEN_HEIGHT * 0.75 }}>
          <BlurView intensity={80} tint="light" style={[styles.additionalContent, { width: '100%', height: '100%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(16) }}>
              <Text style={styles.additionalTitle}>Total Treatment Record</Text>
              <TouchableOpacity onPress={handleClose} style={{ width: scale(36), height: scale(36), borderRadius: scale(18), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: scale(22), fontWeight: '700', color: '#9CA3AF' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, width: '100%', marginTop: scale(16), paddingHorizontal: scale(16) }} showsVerticalScrollIndicator={false}>
              {(() => {
                const allRecords = getAllRecords();

                if (allRecords.length === 0) {
                  return (
                    <Text style={{ color: '#666', textAlign: 'center', paddingVertical: scale(20) }}>
                      No treatment records yet
                    </Text>
                  );
                }

                return allRecords.map((record, index) => (
                  <TreatmentRecordCard key={index} record={record} />
                ));
              })()}
            </ScrollView>
          </BlurView>
        </View>
      ) : (
        <View style={styles.referralTouchable}>
          <TouchableOpacity activeOpacity={0.8} onPress={handleOpen}>
            <BlurView intensity={80} tint="light" style={styles.additionalContent}>
              <Text style={styles.additionalTitle}>Total Treatment Record</Text>
            </BlurView>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};

export default TreatmentRecordContainer;
