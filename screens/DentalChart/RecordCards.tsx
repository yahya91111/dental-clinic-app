import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { ToothNumberBadge } from './DentalChartComponents';
import { getToothName } from './dentalHelpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PlanningRecord {
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

export interface RecordGroup {
  toothNumber: number;
  doctorName: string;
  action: 'diagnosed' | 'canceled';
  records: PlanningRecord[];
}

export interface TreatmentRecord {
  type: 'treatment' | 'scaling';
  toothNumber?: number;
  treatment?: string;
  details?: string;
  surfaces?: string[];
  timestamp: string;
  timestampNum?: number;
  doctorName: string;
}

export interface ReferralRecord {
  id?: string;
  departmentKey: string;
  departmentName: string;
  teeth: number[];
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

// ═══════════════════════════════════════════════════════════════
// Planning Record Card
// ═══════════════════════════════════════════════════════════════

interface PlanningRecordCardProps {
  group: RecordGroup;
  groupIndex: number;
}

export const PlanningRecordCard: React.FC<PlanningRecordCardProps> = ({ group, groupIndex }) => {
  // Collect all surfaces and conditions from records in the group
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
    // If record is a change, add its surfaces to separate list
    if (rec.isChange && rec.surfaces) {
      rec.surfaces.forEach(surf => {
        if (!changedSurfaces.includes(surf)) {
          changedSurfaces.push(surf);
        }
      });
    }
  });

  const firstRecord = group.records[0];
  const toothName = getToothName(group.toothNumber);

  // Check for Root Canal Treated
  const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

  return (
    <View style={styles.planningCard}>
      {/* Tooth Info Header */}
      <View style={styles.planningHeader}>
        {/* Row 1: Tooth Badge + Name */}
        <View style={styles.toothInfoRow}>
          <ToothNumberBadge toothNumber={group.toothNumber} />
          <Text style={styles.toothName}>
            {toothName.english}
          </Text>
        </View>

        {/* Row 2: Diagnosed/Canceled Badge */}
        <View
          style={[
            styles.actionBadge,
            {
              backgroundColor: group.action === 'diagnosed'
                ? 'rgba(245, 158, 11, 0.15)'
                : 'rgba(156, 163, 175, 0.15)',
            }
          ]}
        >
          <Text style={[
            styles.actionText,
            { color: group.action === 'diagnosed' ? '#D97706' : '#6B7280' }
          ]}>
            {group.action === 'diagnosed' ? 'Diagnosed' : 'Canceled'}
          </Text>
        </View>
      </View>

      {/* Change message if record is a change */}
      {firstRecord.isChange && (
        <View style={styles.changeContainer}>
          <View style={styles.changeHeader}>
            <Text style={styles.changeEmoji}>🔄</Text>
            <Text style={styles.changeTitle}>Condition Changed</Text>
          </View>

          <View style={styles.changeDetails}>
            <View style={styles.changeRow}>
              <Text style={styles.removedSymbol}>−</Text>
              <Text style={styles.removedText}>
                {firstRecord.previousCondition}
              </Text>
            </View>
            <View style={styles.changeRow}>
              <Text style={styles.addedSymbol}>+</Text>
              <Text style={styles.addedText}>
                {firstRecord.condition}
              </Text>
            </View>
          </View>

          {changedSurfaces.length > 0 && (
            <View style={styles.surfacesRow}>
              <Text style={styles.surfacesLabel}>Surfaces:</Text>
              <Text style={styles.surfacesValue}>
                {changedSurfaces.join(', ')}
              </Text>
            </View>
          )}

          <View style={styles.modifiedByContainer}>
            <Text style={styles.modifiedByText}>
              Modified by: Dr. {group.doctorName}
            </Text>
          </View>
        </View>
      )}

      {/* Planning Details - only show if not a change */}
      {!firstRecord.isChange && allConditions.length > 0 && (
        <View style={styles.detailsContainer}>
          {hasRootCanalTreated ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status:</Text>
              <Text style={styles.detailValue}>Root Canal Treated</Text>
            </View>
          ) : (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Condition:</Text>
                <Text style={styles.detailValue}>
                  {allConditions.join(', ')}
                </Text>
              </View>
              {allSurfaces.length > 0 && !allSurfaces.every(s => s === 'Root Canal Treated') && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Surfaces:</Text>
                  <Text style={styles.detailValue}>
                    {allSurfaces.filter(s => s !== 'Root Canal Treated').join(', ')}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Footer with doctor and timestamp */}
      <View style={styles.cardFooter}>
        <Text style={styles.doctorName}>Dr. {group.doctorName}</Text>
        <Text style={styles.timestamp}>{firstRecord.timestamp}</Text>
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Treatment Record Card
// ═══════════════════════════════════════════════════════════════

interface TreatmentRecordCardProps {
  record: TreatmentRecord;
  index: number;
}

export const TreatmentRecordCard: React.FC<TreatmentRecordCardProps> = ({ record, index }) => {
  const isScaling = record.type === 'scaling';

  return (
    <View
      style={[
        styles.treatmentCard,
        {
          backgroundColor: isScaling
            ? 'rgba(124, 58, 237, 0.08)'
            : 'rgba(59, 130, 246, 0.08)',
          borderColor: isScaling
            ? 'rgba(124, 58, 237, 0.25)'
            : 'rgba(59, 130, 246, 0.25)',
        }
      ]}
    >
      {isScaling ? (
        // Scaling Record
        <>
          <View style={styles.treatmentHeader}>
            <Text style={styles.scalingTitle}>Oral Hygiene (Scaling)</Text>
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.doctorName}>Dr. {record.doctorName}</Text>
            <Text style={styles.timestamp}>{record.timestamp}</Text>
          </View>
        </>
      ) : (
        // Treatment Record
        <>
          <View style={styles.treatmentHeader}>
            {record.toothNumber && (
              <View style={styles.toothInfoRow}>
                <ToothNumberBadge toothNumber={record.toothNumber} />
                <Text style={styles.toothName}>
                  {getToothName(record.toothNumber).english}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.detailsContainer}>
            {record.treatment && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Treatment:</Text>
                <Text style={styles.detailValue}>{record.treatment}</Text>
              </View>
            )}
            {record.details && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Details:</Text>
                <Text style={styles.detailValue}>{record.details}</Text>
              </View>
            )}
            {record.surfaces && record.surfaces.length > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Surfaces:</Text>
                <Text style={styles.detailValue}>
                  {record.surfaces.join(', ')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.doctorName}>Dr. {record.doctorName}</Text>
            <Text style={styles.timestamp}>{record.timestamp}</Text>
          </View>
        </>
      )}
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Referral Record Card
// ═══════════════════════════════════════════════════════════════

interface ReferralRecordCardProps {
  record: ReferralRecord;
  index: number;
}

export const ReferralRecordCard: React.FC<ReferralRecordCardProps> = ({ record, index }) => {
  return (
    <View style={styles.referralRecordCard}>
      <View style={styles.referralHeader}>
        <Text style={styles.departmentName}>{record.departmentName}</Text>
        <View style={styles.givenBadge}>
          <Text style={styles.givenText}>Given</Text>
        </View>
      </View>

      {record.teeth.length > 0 && (
        <View style={styles.teethContainer}>
          {record.teeth.map((toothNumber, idx) => (
            <ToothNumberBadge
              key={`${record.id || record.departmentKey}-${toothNumber}-${idx}`}
              toothNumber={toothNumber}
            />
          ))}
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.doctorName}>{record.doctorName}</Text>
        <Text style={styles.timestamp}>{record.timestamp}</Text>
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // Planning Record Card
  planningCard: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    overflow: 'hidden',
  },
  planningHeader: {
    marginBottom: 14,
  },
  toothInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  toothName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4B5563',
    letterSpacing: 0.2,
  },
  actionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Change Container
  changeContainer: {
    backgroundColor: 'rgba(251, 146, 60, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(251, 146, 60, 0.3)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  changeEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  changeTitle: {
    fontSize: 15,
    color: '#EA580C',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  changeDetails: {
    gap: 6,
    marginBottom: 10,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  removedSymbol: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: '600',
    marginRight: 6,
  },
  removedText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '500',
    textDecorationLine: 'line-through',
  },
  addedSymbol: {
    fontSize: 16,
    color: '#059669',
    fontWeight: '600',
    marginRight: 6,
  },
  addedText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
  surfacesRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  surfacesLabel: {
    fontSize: 13,
    color: '#EA580C',
    fontWeight: '600',
    minWidth: 70,
  },
  surfacesValue: {
    fontSize: 13,
    color: '#9A3412',
    fontWeight: '500',
    flex: 1,
  },
  modifiedByContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(251, 146, 60, 0.2)',
    paddingTop: 8,
    marginTop: 4,
  },
  modifiedByText: {
    fontSize: 13,
    color: '#9A3412',
    fontWeight: '600',
  },

  // Details Container
  detailsContainer: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
    minWidth: 90,
  },
  detailValue: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },

  // Card Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  doctorName: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Treatment Record Card
  treatmentCard: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    overflow: 'hidden',
  },
  treatmentHeader: {
    marginBottom: 12,
  },
  scalingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7C3AED',
  },

  // Referral Record Card
  referralRecordCard: {
    backgroundColor: 'rgba(224, 242, 254, 0.95)',
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.5)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  referralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  departmentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0284C7',
  },
  givenBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  givenText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
  teethContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
});
