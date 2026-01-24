import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { ToothNumberBadge } from './DentalChartComponents';
import { getReferralName } from './dentalHelpers';
import { supabase } from '../../lib/supabase';
import type { ReferralsState, ReferralStatusState } from './DepartmentModal';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ReferralRecord {
  departmentKey: string;
  departmentName: string;
  teeth: number[];
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

export interface ReferralContainerProps {
  // Animation values
  referralContainerSlide: Animated.Value;

  // State
  referrals: ReferralsState;
  referralStatus: ReferralStatusState;
  referralTab: 'department' | 'records';
  referralRecords: ReferralRecord[];
  selectedReferralFor: Record<number | string, string[]>;
  openReferralMenu: string | null;
  isReferralExpanded: boolean;
  isTreatmentRecordExpanded: boolean;
  isPlanningRecordExpanded: boolean;
  isViewModeActive: boolean;
  permanentPatientId?: string;

  // Setters
  setReferralTab: (tab: 'department' | 'records') => void;
  setReferrals: React.Dispatch<React.SetStateAction<ReferralsState>>;
  setReferralStatus: React.Dispatch<React.SetStateAction<ReferralStatusState>>;
  setSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
  setOpenReferralMenu: (key: string | null) => void;
  setDepartmentModalMode: (mode: 'new' | 'edit') => void;
  setSavedReferralsState: (state: ReferralsState | null) => void;
  setSavedSelectedReferralFor: (state: Record<number | string, string[]> | null) => void;
  setTempReferrals: React.Dispatch<React.SetStateAction<ReferralsState>>;
  setTempSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  setShowDepartmentModal: (show: boolean) => void;
  setExpandedDepartment: (dept: string | null) => void;

  // Functions
  loadPatientDentalData: () => void;
}

// ═══════════════════════════════════════════════════════════════
// Referral Card Sub-component
// ═══════════════════════════════════════════════════════════════

interface ReferralCardProps {
  referralKey: string;
  referredTeeth: number[];
  referralStatus: ReferralStatusState;
  openReferralMenu: string | null;
  permanentPatientId?: string;
  setOpenReferralMenu: (key: string | null) => void;
  setReferrals: React.Dispatch<React.SetStateAction<ReferralsState>>;
  setReferralStatus: React.Dispatch<React.SetStateAction<ReferralStatusState>>;
  setSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
  setDepartmentModalMode: (mode: 'new' | 'edit') => void;
  setExpandedDepartment: (dept: string | null) => void;
  setShowDepartmentModal: (show: boolean) => void;
  loadPatientDentalData: () => void;
}

const ReferralCard: React.FC<ReferralCardProps> = ({
  referralKey,
  referredTeeth,
  referralStatus,
  openReferralMenu,
  permanentPatientId,
  setOpenReferralMenu,
  setReferrals,
  setReferralStatus,
  setSelectedReferralFor,
  setDepartmentModalMode,
  setExpandedDepartment,
  setShowDepartmentModal,
  loadPatientDentalData,
}) => {
  const handleGivenPress = async (e: any) => {
    e.stopPropagation();
    const currentStatus = referralStatus[referralKey as keyof typeof referralStatus];

    if (currentStatus === 'not_given') {
      if (permanentPatientId) {
        const referralTypeMap: Record<string, string> = {
          'endodontics': 'Endodontics',
          'oralSurgery': 'Oral Surgery',
          'orthodontics': 'Orthodontics',
          'prosthodontics': 'Prosthodontics',
          'periodontics': 'Periodontics',
          'pediatricDentistry': 'Pediatric Dentistry',
        };

        const referralName = referralTypeMap[referralKey] || referralKey;

        const { error } = await supabase
          .from('referrals')
          .update({
            status: 'given',
            given_at: new Date().toISOString()
          })
          .eq('permanent_patient_id', permanentPatientId)
          .eq('referral_type', referralName)
          .eq('status', 'not_given');

        if (error) {
          console.error('Error updating referral status:', error);
        } else {
          loadPatientDentalData();
        }
      }

      setReferrals(prev => ({ ...prev, [referralKey]: false }));
      setSelectedReferralFor(prev => {
        const newReferrals = { ...prev };
        Object.keys(newReferrals).forEach(toothNumber => {
          const referralKeys = newReferrals[toothNumber];
          if (referralKeys?.includes(referralKey)) {
            const updatedKeys = referralKeys.filter(k => k !== referralKey);
            if (updatedKeys.length === 0) {
              delete newReferrals[toothNumber];
            } else {
              newReferrals[toothNumber] = updatedKeys;
            }
          }
        });
        return newReferrals;
      });
    }

    setReferralStatus(prev => ({
      ...prev,
      [referralKey]: currentStatus === 'given' ? 'not_given' : 'given'
    }));
  };

  const handleDelete = async () => {
    setOpenReferralMenu(null);

    Alert.alert(
      'Delete Referral',
      'Are you sure you want to delete this referral?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (permanentPatientId) {
              const referralTypeMap: Record<string, string> = {
                'endodontics': 'Endodontics',
                'oralSurgery': 'Oral Surgery',
                'orthodontics': 'Orthodontics',
                'prosthodontics': 'Prosthodontics',
                'periodontics': 'Periodontics',
                'oralMedicine': 'Oral Medicine',
              };

              const referralName = referralTypeMap[referralKey] || referralKey;

              const { error } = await supabase
                .from('referrals')
                .delete()
                .eq('permanent_patient_id', permanentPatientId)
                .eq('referral_type', referralName)
                .eq('status', 'not_given');

              if (error) {
                console.error('Error deleting referral:', error);
                Alert.alert('Error', 'Failed to delete referral');
              } else {
                setReferrals(prev => ({ ...prev, [referralKey]: false }));
                setSelectedReferralFor(prev => {
                  const newReferrals = { ...prev };
                  Object.keys(newReferrals).forEach(toothNumber => {
                    const referralKeys = newReferrals[toothNumber];
                    if (referralKeys?.includes(referralKey)) {
                      const updatedKeys = referralKeys.filter(k => k !== referralKey);
                      if (updatedKeys.length === 0) {
                        delete newReferrals[toothNumber];
                      } else {
                        newReferrals[toothNumber] = updatedKeys;
                      }
                    }
                  });
                  return newReferrals;
                });
                loadPatientDentalData();
              }
            }
          }
        }
      ]
    );
  };

  return (
    <View
      style={{
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
        elevation: openReferralMenu === referralKey ? 1000 : 3,
        zIndex: openReferralMenu === referralKey ? 1000 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: referredTeeth.length > 0 ? 8 : 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
          {getReferralName(referralKey)}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Three-dot menu button */}
          <TouchableOpacity
            onPress={() => setOpenReferralMenu(openReferralMenu === referralKey ? null : referralKey)}
            style={{
              padding: 6,
              borderRadius: 6,
              backgroundColor: 'rgba(148, 163, 184, 0.1)',
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#64748B" />
          </TouchableOpacity>

          {/* Not Given / Given button */}
          <TouchableOpacity
            onPress={handleGivenPress}
            style={{
              backgroundColor: referralStatus[referralKey as keyof typeof referralStatus] === 'given'
                ? 'rgba(34, 197, 94, 0.15)'
                : 'rgba(156, 163, 175, 0.2)',
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: referralStatus[referralKey as keyof typeof referralStatus] === 'given'
                ? 'rgba(34, 197, 94, 0.3)'
                : 'rgba(156, 163, 175, 0.4)',
            }}
          >
            <Text style={{
              fontSize: 13,
              fontWeight: '600',
              color: referralStatus[referralKey as keyof typeof referralStatus] === 'given'
                ? '#16A34A'
                : '#6B7280',
            }}>
              {referralStatus[referralKey as keyof typeof referralStatus] === 'given' ? 'Given' : 'Not Given'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Teeth badges */}
      {referredTeeth.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {referredTeeth.map(toothNumber => (
            <ToothNumberBadge key={`${referralKey}-${toothNumber}`} toothNumber={toothNumber} />
          ))}
        </View>
      )}

      {/* Three-dot Menu */}
      {openReferralMenu === referralKey && (
        <View style={{
          position: 'absolute',
          top: 40,
          right: 10,
          backgroundColor: 'rgba(224, 242, 254, 0.95)',
          borderRadius: 12,
          padding: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 1001,
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.2)',
          minWidth: 140,
          zIndex: 1001,
        }}>
          {/* Edit Button */}
          <TouchableOpacity
            onPress={() => {
              setOpenReferralMenu(null);
              setDepartmentModalMode('edit');
              setExpandedDepartment(referralKey);
              setShowDepartmentModal(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
            }}
          >
            <Ionicons name="create-outline" size={18} color="#3B82F6" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#3B82F6', marginLeft: 10 }}>Edit</Text>
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: 'rgba(148, 163, 184, 0.15)', marginVertical: 4 }} />

          {/* Delete Button */}
          <TouchableOpacity
            onPress={handleDelete}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444', marginLeft: 10 }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
// Referral Container Component
// ═══════════════════════════════════════════════════════════════

export const ReferralContainer: React.FC<ReferralContainerProps> = ({
  referralContainerSlide,
  referrals,
  referralStatus,
  referralTab,
  referralRecords,
  selectedReferralFor,
  openReferralMenu,
  isReferralExpanded,
  isTreatmentRecordExpanded,
  isPlanningRecordExpanded,
  isViewModeActive,
  permanentPatientId,
  setReferralTab,
  setReferrals,
  setReferralStatus,
  setSelectedReferralFor,
  setOpenReferralMenu,
  setDepartmentModalMode,
  setSavedReferralsState,
  setSavedSelectedReferralFor,
  setTempReferrals,
  setTempSelectedReferralFor,
  setShowDepartmentModal,
  setExpandedDepartment,
  loadPatientDentalData,
}) => {
  const hasActiveReferrals = Object.entries(referrals).some(([key, checked]) =>
    checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
  );

  const contentHeight = (
    (referralTab === 'department' && hasActiveReferrals) ||
    (referralTab === 'records' && referralRecords.length > 0)
  ) ? 320 : 70;

  return (
    <Animated.View
      style={[
        styles.referralContainer,
        {
          transform: [{ translateX: referralContainerSlide }],
          opacity: (isTreatmentRecordExpanded || isPlanningRecordExpanded) ? 0 : 1,
          zIndex: isReferralExpanded ? 10010 : 10003,
          elevation: isReferralExpanded ? 10010 : 10003,
        }
      ]}
      pointerEvents={isViewModeActive ? 'auto' : 'none'}
    >
      <View
        style={styles.referralTouchable}
        pointerEvents={isViewModeActive ? 'auto' : 'none'}
      >
        <BlurView
          intensity={80}
          tint="light"
          style={styles.referralContent}
        >
          <View style={styles.referralHeader}>
            <Text style={styles.referralTitle}>
              Need Referral For {Object.values(referrals).filter(val => val === true).length > 0 && `(${Object.values(referrals).filter(val => val === true).length})`}
            </Text>
          </View>

          {/* Tab Buttons */}
          <View style={{
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 8,
          }}>
            <TouchableOpacity
              onPress={() => setReferralTab('department')}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: referralTab === 'department' ? '#0284C7' : 'rgba(186, 230, 253, 0.3)',
                borderWidth: 1.5,
                borderColor: referralTab === 'department' ? '#0284C7' : 'rgba(186, 230, 253, 0.6)',
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '700',
                color: referralTab === 'department' ? '#FFFFFF' : '#0284C7',
              }}>
                Department
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setReferralTab('records')}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 8,
                borderRadius: 10,
                backgroundColor: referralTab === 'records' ? '#0284C7' : 'rgba(186, 230, 253, 0.3)',
                borderWidth: 1.5,
                borderColor: referralTab === 'records' ? '#0284C7' : 'rgba(186, 230, 253, 0.6)',
                alignItems: 'center',
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: referralTab === 'records' ? '#FFFFFF' : '#0284C7',
                }}
              >
                Referral Records
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content Container */}
          <View style={{
            height: contentHeight,
            paddingHorizontal: 16,
            paddingBottom: 8
          }}>
            {/* Department Tab Content */}
            {referralTab === 'department' && (
              <>
                {/* Select Department */}
                <TouchableOpacity
                  onPress={() => {
                    setDepartmentModalMode('new');
                    setSavedReferralsState(referrals);
                    setSavedSelectedReferralFor(selectedReferralFor);
                    setTempReferrals({
                      endodontics: false,
                      oralSurgery: false,
                      orthodontics: false,
                      periodontics: false,
                      prosthodontics: false,
                      oralMedicine: false,
                    });
                    setTempSelectedReferralFor({});
                    setShowDepartmentModal(true);
                  }}
                  style={{
                    marginTop: 4,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    borderWidth: 1.5,
                    borderColor: 'rgba(186, 230, 253, 0.6)',
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                    Select Department
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#7DD3FC" />
                </TouchableOpacity>

                {/* Selected Departments Display */}
                {Object.entries(referrals).some(([_, checked]) => checked) && (
                  <View>
                    <ScrollView
                      style={{ marginTop: 10, maxHeight: 242 }}
                      contentContainerStyle={{ paddingBottom: 100 }}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                      scrollEnabled={true}
                      onScrollBeginDrag={() => {
                        if (openReferralMenu !== null) {
                          setOpenReferralMenu(null);
                        }
                      }}
                    >
                      {Object.entries(referrals).map(([key, checked]) => {
                        if (!checked) return null;
                        if (referralStatus[key as keyof typeof referralStatus] === 'given') return null;

                        const referredTeeth = Object.entries(selectedReferralFor)
                          .filter(([_, referralKeys]) => referralKeys?.includes(key))
                          .map(([toothNumber, _]) => Number(toothNumber));

                        return (
                          <ReferralCard
                            key={key}
                            referralKey={key}
                            referredTeeth={referredTeeth}
                            referralStatus={referralStatus}
                            openReferralMenu={openReferralMenu}
                            permanentPatientId={permanentPatientId}
                            setOpenReferralMenu={setOpenReferralMenu}
                            setReferrals={setReferrals}
                            setReferralStatus={setReferralStatus}
                            setSelectedReferralFor={setSelectedReferralFor}
                            setDepartmentModalMode={setDepartmentModalMode}
                            setExpandedDepartment={setExpandedDepartment}
                            setShowDepartmentModal={setShowDepartmentModal}
                            loadPatientDentalData={loadPatientDentalData}
                          />
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            {/* Referral Records Tab Content */}
            {referralTab === 'records' && (
              <ScrollView
                style={{ marginTop: 4, maxHeight: 290 }}
                showsVerticalScrollIndicator={true}
              >
                {referralRecords.length === 0 ? (
                  <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 20 }}>
                    No referral records yet
                  </Text>
                ) : (
                  referralRecords
                    .sort((a, b) => b.timestampNum - a.timestampNum)
                    .map((record, index) => (
                      <View
                        key={index}
                        style={{
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
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                            {record.departmentName}
                          </Text>
                          <View
                            style={{
                              backgroundColor: 'rgba(34, 197, 94, 0.15)',
                              paddingVertical: 4,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: 'rgba(34, 197, 94, 0.3)',
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>
                              Given
                            </Text>
                          </View>
                        </View>

                        {record.teeth.length > 0 && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {record.teeth.map((toothNumber, idx) => (
                              <ToothNumberBadge key={`${index}-${toothNumber}-${idx}`} toothNumber={toothNumber} />
                            ))}
                          </View>
                        )}

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ fontSize: 12, color: '#64748B' }}>
                            {record.doctorName}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#64748B' }}>
                            {record.timestamp}
                          </Text>
                        </View>
                      </View>
                    ))
                )}
              </ScrollView>
            )}
          </View>
        </BlurView>
      </View>
    </Animated.View>
  );
};

export default ReferralContainer;
