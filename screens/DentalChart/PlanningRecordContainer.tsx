import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { styles, SCREEN_WIDTH, SCREEN_HEIGHT } from './styles';
import { ToothNumberBadge } from './DentalChartComponents';
import { getToothName } from './dentalHelpers';
import {
  REFERRAL_HEADER_HEIGHT,
  REFERRAL_CONTENT_MIN,
  REFERRAL_CONTENT_MAX,
  CONTAINER_SPACING,
  TREATMENT_PLANNING_SPACING,
} from './constants';
import type { ReferralsState, ReferralStatusState } from './DepartmentModal';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PlanningRecordGlobal {
  toothNumber: number;
  action: 'diagnosed' | 'canceled';
  condition: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  isChange?: boolean;
  previousCondition?: string;
}

export interface ReferralRecord {
  departmentKey: string;
  departmentName: string;
  teeth: number[];
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

export interface PlanningRecordContainerProps {
  // Animation values
  planningRecordSlide: Animated.Value;
  planningRecordPushDown: Animated.Value;
  planningRecordExpandAnim: Animated.Value;

  // State
  isPlanningRecordExpanded: boolean;
  isTreatmentRecordExpanded: boolean;
  isViewModeActive: boolean;
  referralTab: 'department' | 'records';
  referrals: ReferralsState;
  referralStatus: ReferralStatusState;
  referralRecords: ReferralRecord[];
  allPlanningRecordsGlobal: PlanningRecordGlobal[];

  // Setters
  setIsPlanningRecordExpanded: (expanded: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════
// Planning Record Card Sub-component
// ═══════════════════════════════════════════════════════════════

interface PlanningRecordCardProps {
  group: {
    toothNumber: number;
    doctorName: string;
    action: 'diagnosed' | 'canceled';
    records: PlanningRecordGlobal[];
  };
  groupIndex: number;
}

const PlanningRecordCard: React.FC<PlanningRecordCardProps> = ({ group, groupIndex }) => {
  const allSurfaces: string[] = [];
  const allConditions: string[] = [];
  const changedSurfaces: string[] = [];

  group.records.forEach(rec => {
    if (rec.condition && !allConditions.includes(rec.condition)) {
      allConditions.push(rec.condition);
    }
    if (rec.surfaces) {
      rec.surfaces.forEach(surf => {
        if (!allSurfaces.includes(surf)) {
          allSurfaces.push(surf);
        }
      });
    }
    if (rec.isChange && rec.surfaces) {
      rec.surfaces.forEach(surf => {
        if (!changedSurfaces.includes(surf)) {
          changedSurfaces.push(surf);
        }
      });
    }
  });

  const firstRecord = group.records[0];
  const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

  return (
    <View style={{
      backgroundColor: 'rgba(37, 99, 235, 0.08)',
      borderRadius: 18,
      padding: 20,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: 'rgba(37, 99, 235, 0.35)',
    }}>
      {/* Tooth Info Header */}
      <View style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <ToothNumberBadge toothNumber={group.toothNumber} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#4B5563' }}>
            {getToothName(group.toothNumber).english}
          </Text>
        </View>

        <View style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 8,
          backgroundColor: group.action === 'diagnosed' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(156, 163, 175, 0.15)',
          alignSelf: 'flex-start',
        }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: group.action === 'diagnosed' ? '#D97706' : '#6B7280' }}>
            {group.action === 'diagnosed' ? 'Diagnosed' : 'Canceled'}
          </Text>
        </View>
      </View>

      {/* Change indicator */}
      {firstRecord.isChange && (
        <View style={{
          backgroundColor: 'rgba(251, 146, 60, 0.1)',
          borderWidth: 2,
          borderColor: 'rgba(251, 146, 60, 0.3)',
          padding: 16,
          borderRadius: 12,
          marginBottom: 12
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 18, marginRight: 8 }}>🔄</Text>
            <Text style={{ fontSize: 15, color: '#EA580C', fontWeight: '700' }}>Condition Changed</Text>
          </View>

          <View style={{ gap: 6, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '600', marginRight: 6 }}>−</Text>
              <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '500', textDecorationLine: 'line-through' }}>
                {firstRecord.previousCondition}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#059669', fontWeight: '600', marginRight: 6 }}>+</Text>
              <Text style={{ fontSize: 14, color: '#059669', fontWeight: '600' }}>{firstRecord.condition}</Text>
            </View>
          </View>

          {changedSurfaces.length > 0 && (
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: '#EA580C', fontWeight: '600', minWidth: 70 }}>Surfaces:</Text>
              <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '500', flex: 1 }}>{changedSurfaces.join(', ')}</Text>
            </View>
          )}

          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(251, 146, 60, 0.2)', paddingTop: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '600' }}>Modified by: Dr. {group.doctorName}</Text>
          </View>
        </View>
      )}

      {/* Planning Details */}
      <View style={{ gap: 8, marginBottom: 12 }}>
        {!firstRecord.isChange && allConditions.length > 0 && (
          hasRootCanalTreated ? (
            <>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>Condition:</Text>
                <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>Root Canal Treated</Text>
              </View>
              {allSurfaces.filter(s => s !== 'Root Canal Treated').length > 0 && (
                <View style={{ flexDirection: 'row' }}>
                  <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>Surfaces:</Text>
                  <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                    {allSurfaces.filter(s => s !== 'Root Canal Treated').join(', ')}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>Condition:</Text>
              <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>{allConditions.join(', ')}</Text>
            </View>
          )
        )}

        {!firstRecord.isChange && allSurfaces.length > 0 && !allConditions.includes('Extraction') && !hasRootCanalTreated && (
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>Surfaces:</Text>
            <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>{allSurfaces.join(', ')}</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(37, 99, 235, 0.2)', paddingTop: 12, gap: 6 }}>
        <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>{firstRecord.timestamp}</Text>
        <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>Dr. {group.doctorName}</Text>
      </View>

      <Text style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
        Group #{groupIndex + 1} - {group.records.length} record(s)
      </Text>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Planning Record Container Component
// ═══════════════════════════════════════════════════════════════

export const PlanningRecordContainer: React.FC<PlanningRecordContainerProps> = ({
  planningRecordSlide,
  planningRecordPushDown,
  planningRecordExpandAnim,
  isPlanningRecordExpanded,
  isTreatmentRecordExpanded,
  isViewModeActive,
  referralTab,
  referrals,
  referralStatus,
  referralRecords,
  allPlanningRecordsGlobal,
  setIsPlanningRecordExpanded,
}) => {
  const hasActiveReferrals = Object.entries(referrals).some(([key, checked]) =>
    checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
  );

  const paddingTopValue = isPlanningRecordExpanded ? 20 : (
    REFERRAL_HEADER_HEIGHT +
    ((
      (referralTab === 'department' && hasActiveReferrals) ||
      (referralTab === 'records' && referralRecords.length > 0)
    ) ? REFERRAL_CONTENT_MAX : REFERRAL_CONTENT_MIN) +
    CONTAINER_SPACING +
    TREATMENT_PLANNING_SPACING
  );

  const handleClose = () => {
    setIsPlanningRecordExpanded(false);
    Animated.spring(planningRecordExpandAnim, {
      toValue: 0,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  const handleOpen = () => {
    console.log('Total Planning Record clicked!');
    setIsPlanningRecordExpanded(true);
    Animated.spring(planningRecordExpandAnim, {
      toValue: 1,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  // Process and group planning records
  const getGroupedRecords = () => {
    const sortedRecords = [...allPlanningRecordsGlobal].sort((a, b) => b.timestampNum - a.timestampNum);

    if (sortedRecords.length === 0) return [];

    // Filter out replaced records
    const visibleRecords = sortedRecords.filter((record) => {
      if (record.isChange) return true;

      const hasBeenReplaced = sortedRecords.some(r => {
        if (r.toothNumber !== record.toothNumber) return false;
        if (r.timestampNum <= record.timestampNum) return false;
        if (r.isChange !== true) return false;
        if (r.previousCondition?.toLowerCase() !== record.condition?.toLowerCase()) return false;

        if (record.condition === 'Extraction') return true;

        return r.surfaces.some(newSurf => {
          const newSurfName = newSurf.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
          return record.surfaces.some(oldSurf => {
            const oldSurfName = oldSurf.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
            return newSurfName === oldSurfName;
          });
        });
      });

      return !hasBeenReplaced;
    });

    // Group records
    type RecordGroup = {
      toothNumber: number;
      doctorName: string;
      action: 'diagnosed' | 'canceled';
      records: typeof visibleRecords;
    };

    const groupedRecords: RecordGroup[] = [];

    visibleRecords.forEach((record) => {
      const lastGroup = groupedRecords[groupedRecords.length - 1];
      const shouldStartNewGroup = !lastGroup ||
        lastGroup.toothNumber !== record.toothNumber ||
        lastGroup.action !== record.action;

      if (shouldStartNewGroup) {
        groupedRecords.push({
          toothNumber: record.toothNumber,
          doctorName: record.doctorName,
          action: record.action,
          records: [record]
        });
      } else {
        lastGroup.records.push(record);
      }
    });

    return groupedRecords;
  };

  return (
    <Animated.View
      style={[
        styles.planningRecordContainer,
        {
          transform: [
            { translateX: planningRecordSlide },
            { translateY: planningRecordPushDown }
          ],
          paddingTop: paddingTopValue,
          paddingHorizontal: isPlanningRecordExpanded ? 0 : 20,
          zIndex: isPlanningRecordExpanded ? 10006 : 10001,
          elevation: isPlanningRecordExpanded ? 10006 : 10001,
          opacity: isTreatmentRecordExpanded ? 0 : 1
        }
      ]}
      pointerEvents={isViewModeActive ? 'auto' : 'none'}
    >
      {isPlanningRecordExpanded ? (
        <View style={{ width: SCREEN_WIDTH * 0.85, height: SCREEN_HEIGHT * 0.75 }}>
          <BlurView intensity={80} tint="light" style={[styles.additionalContent, { width: '100%', height: '100%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={styles.additionalTitle}>Total Planning Record</Text>
              <TouchableOpacity onPress={handleClose} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: '#9CA3AF' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, width: '100%', marginTop: 16, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
              {(() => {
                const groupedRecords = getGroupedRecords();

                if (groupedRecords.length === 0) {
                  return (
                    <Text style={{ color: '#666', textAlign: 'center', paddingVertical: 20 }}>
                      No planning records yet
                    </Text>
                  );
                }

                return groupedRecords.map((group, groupIndex) => (
                  <PlanningRecordCard key={groupIndex} group={group} groupIndex={groupIndex} />
                ));
              })()}
            </ScrollView>
          </BlurView>
        </View>
      ) : (
        <View style={styles.referralTouchable}>
          <TouchableOpacity activeOpacity={0.8} onPress={handleOpen}>
            <BlurView intensity={80} tint="light" style={styles.additionalContent}>
              <Text style={styles.additionalTitle}>Total Planning Record</Text>
            </BlurView>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};

export default PlanningRecordContainer;
