import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { scale } from '../../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { Patient } from './constants';
import { styles } from './styles';
import { DentalSummary, Referral, ToothNote } from '../../types';
import { ExpandedPatientHeader } from '../../components/ExpandedPatientHeader';
import {
  updateReferralStatus,
  getScalingRecords,
  createScalingRecord,
} from '../../lib/database';

interface ExpandedDentalSectionProps {
  patient: Patient;
  expandAnim: Animated.Value;
  isPermanentPatient: boolean;
  isPermanentCardExpanded: boolean;
  activeDentalTab: 'treatment' | 'referrals' | 'notes';
  onDentalTabChange: (tab: 'treatment' | 'referrals' | 'notes') => void;
  dentalSummary?: DentalSummary;
  loadingDentalData?: boolean;
  onToothEditPress?: (permanentPatientId: string, tooth: string) => void;
  patientReferrals?: Referral[];
  onLoadReferrals?: () => void;
  onUpdateReferralStatus?: (referralId: string, newStatus: 'not_given' | 'given') => void;
  patientToothNotes?: ToothNote[];
  onLoadToothNotes?: () => void;
  lastScalingDates?: { [key: string]: string | null };
  currentDoctorName?: string;
  onUpdateScalingDate?: (patientId: string, timestamp: string) => void;
  patientConsents?: { [key: string]: boolean };
  onToggleConsent?: (patient: Patient) => void;
  onOpenDentalChartScreen?: (permanentPatientId: string) => void;
  onPatientNamePress?: (patientId: string, fileNumber: string) => void;
  onTogglePermanentExpansion: (patient: Patient) => void;
}

export const ExpandedDentalSection = ({
  patient,
  expandAnim,
  isPermanentPatient,
  isPermanentCardExpanded,
  activeDentalTab,
  onDentalTabChange,
  dentalSummary,
  loadingDentalData,
  onToothEditPress,
  patientReferrals,
  onLoadReferrals,
  onUpdateReferralStatus,
  patientToothNotes,
  onLoadToothNotes,
  lastScalingDates,
  currentDoctorName,
  onUpdateScalingDate,
  patientConsents,
  onToggleConsent,
  onOpenDentalChartScreen,
  onPatientNamePress,
  onTogglePermanentExpansion,
}: ExpandedDentalSectionProps) => {
  if (!isPermanentPatient || !isPermanentCardExpanded) {
    return null;
  }

  return (
    <>
      {/* Expanded Patient Header */}
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

      {/* Expanded Dental Info - Inside Card */}
      <Animated.View
        style={{
          maxHeight: expandAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [scale(0), scale(800)],
          }),
          opacity: expandAnim,
          overflow: 'hidden',
        }}
      >
        <View style={{ paddingTop: scale(10), marginTop: scale(6), borderBottomLeftRadius: scale(16), borderBottomRightRadius: scale(16), overflow: 'hidden' }}>
          {/* White Divider Line */}
          <View style={{
            height: scale(2),
            backgroundColor: '#FFFFFF',
            marginBottom: scale(14),
          }} />

          {/* Segmented Control - Enhanced Design */}
          <View
            style={{
              backgroundColor: 'rgba(219, 234, 254, 0.95)',
              borderRadius: scale(12),
              padding: scale(4),
              marginBottom: scale(14),
              flexDirection: 'row',
              borderWidth: scale(2),
              borderColor: '#FFFFFF',
            }}
          >
            <TouchableOpacity
              onPress={() => onDentalTabChange('treatment')}
              activeOpacity={0.7}
              style={{
                flex: 1,
                paddingVertical: scale(12),
                borderRadius: scale(9),
                backgroundColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                shadowOffset: { width: scale(0), height: scale(2) },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: activeDentalTab === 'treatment' ? 3 : 0,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                <Ionicons
                  name="medkit"
                  size={scale(14)}
                  color={activeDentalTab === 'treatment' ? '#FFFFFF' : '#64748B'}
                />
                <Text style={{
                  fontSize: scale(13),
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
                paddingVertical: scale(12),
                borderRadius: scale(9),
                backgroundColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                shadowOffset: { width: scale(0), height: scale(2) },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: activeDentalTab === 'referrals' ? 3 : 0,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                <Ionicons
                  name="people"
                  size={scale(14)}
                  color={activeDentalTab === 'referrals' ? '#FFFFFF' : '#64748B'}
                />
                <Text style={{
                  fontSize: scale(13),
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
                paddingVertical: scale(12),
                borderRadius: scale(9),
                backgroundColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                shadowOffset: { width: scale(0), height: scale(2) },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: activeDentalTab === 'notes' ? 3 : 0,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                <Ionicons
                  name="document-text"
                  size={scale(14)}
                  color={activeDentalTab === 'notes' ? '#FFFFFF' : '#64748B'}
                />
                <Text style={{
                  fontSize: scale(13),
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
                          borderRadius: scale(10),
                          padding: scale(14),
                          marginBottom: scale(10),
                          borderWidth: scale(2),
                          borderColor: '#FFFFFF',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                          <Text style={{
                            fontSize: scale(15),
                            fontWeight: '700',
                            color: '#1E3A8A',
                          }}>Caries</Text>
                          <View style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.25)',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(4),
                            borderRadius: scale(12),
                          }}>
                            <Text style={{
                              fontSize: scale(11),
                              fontWeight: '700',
                              color: '#1E3A8A',
                            }}>{dentalSummary.caries_count}</Text>
                          </View>
                        </View>
                        {/* Divider */}
                        <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />
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
                                  paddingHorizontal: scale(10),
                                  paddingVertical: scale(5),
                                  borderRadius: scale(6),
                                  margin: scale(2),
                                  borderWidth: scale(1),
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}
                              >
                                <Text style={{
                                  fontSize: scale(12),
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
                          borderRadius: scale(10),
                          padding: scale(14),
                          marginBottom: scale(10),
                          borderWidth: scale(2),
                          borderColor: '#FFFFFF',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                          <Text style={{
                            fontSize: scale(15),
                            fontWeight: '700',
                            color: '#1E3A8A',
                          }}>Pulpectomy</Text>
                          <View style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.25)',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(4),
                            borderRadius: scale(12),
                          }}>
                            <Text style={{
                              fontSize: scale(11),
                              fontWeight: '700',
                              color: '#1E3A8A',
                            }}>{dentalSummary.rct_needed_count}</Text>
                          </View>
                        </View>
                        {/* Divider */}
                        <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />
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
                                  paddingHorizontal: scale(10),
                                  paddingVertical: scale(5),
                                  borderRadius: scale(6),
                                  margin: scale(2),
                                  borderWidth: scale(1),
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}
                              >
                                <Text style={{
                                  fontSize: scale(12),
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
                          borderRadius: scale(10),
                          padding: scale(14),
                          marginBottom: scale(10),
                          borderWidth: scale(2),
                          borderColor: '#FFFFFF',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                          <Text style={{
                            fontSize: scale(15),
                            fontWeight: '700',
                            color: '#1E3A8A',
                          }}>Extraction</Text>
                          <View style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.25)',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(4),
                            borderRadius: scale(12),
                          }}>
                            <Text style={{
                              fontSize: scale(11),
                              fontWeight: '700',
                              color: '#1E3A8A',
                            }}>{dentalSummary.extraction_needed_count}</Text>
                          </View>
                        </View>
                        {/* Divider */}
                        <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />
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
                                  paddingHorizontal: scale(10),
                                  paddingVertical: scale(5),
                                  borderRadius: scale(6),
                                  margin: scale(2),
                                  borderWidth: scale(1),
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}
                              >
                                <Text style={{
                                  fontSize: scale(12),
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
                          borderRadius: scale(10),
                          padding: scale(14),
                          marginBottom: scale(10),
                          borderWidth: scale(2),
                          borderColor: '#FFFFFF',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                          <Text style={{
                            fontSize: scale(15),
                            fontWeight: '700',
                            color: '#1E3A8A',
                          }}>Broken Tooth/Filling</Text>
                          <View style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.25)',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(4),
                            borderRadius: scale(12),
                          }}>
                            <Text style={{
                              fontSize: scale(11),
                              fontWeight: '700',
                              color: '#1E3A8A',
                            }}>{dentalSummary.broken_teeth_count}</Text>
                          </View>
                        </View>
                        {/* Divider */}
                        <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />
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
                                  paddingHorizontal: scale(10),
                                  paddingVertical: scale(5),
                                  borderRadius: scale(6),
                                  margin: scale(2),
                                  borderWidth: scale(1),
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}
                              >
                                <Text style={{
                                  fontSize: scale(12),
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
                          borderRadius: scale(10),
                          padding: scale(14),
                          marginBottom: scale(10),
                          borderWidth: scale(2),
                          borderColor: '#FFFFFF',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                          <Text style={{
                            fontSize: scale(15),
                            fontWeight: '700',
                            color: '#1E3A8A',
                          }}>Need Permanent Filling</Text>
                          <View style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.25)',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(4),
                            borderRadius: scale(12),
                          }}>
                            <Text style={{
                              fontSize: scale(11),
                              fontWeight: '700',
                              color: '#1E3A8A',
                            }}>{dentalSummary.filling_done_count}</Text>
                          </View>
                        </View>
                        {/* Divider */}
                        <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />
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
                                  paddingHorizontal: scale(10),
                                  paddingVertical: scale(5),
                                  borderRadius: scale(6),
                                  margin: scale(2),
                                  borderWidth: scale(1),
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}
                              >
                                <Text style={{
                                  fontSize: scale(12),
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
                    <View style={{ gap: scale(12) }}>
                      {/* SECTION 1: Need Referral - Orange Cards */}
                      {(() => {
                        const notGivenReferrals = patientReferrals.filter(r => r.status === 'not_given');
                        if (notGivenReferrals.length === 0) return null;

                        return (
                          <>
                            {/* Section Header */}
                            <View style={{ marginBottom: scale(8), paddingBottom: scale(6), borderBottomWidth: scale(2), borderBottomColor: 'rgba(254, 215, 170, 0.6)' }}>
                              <Text style={{ fontSize: scale(15), fontWeight: '700', color: '#EA580C' }}>
                                Need Referral ({notGivenReferrals.length})
                              </Text>
                            </View>

                            {/* Individual Referral Cards */}
                            {notGivenReferrals.map((referral) => (
                              <View key={referral.id} style={{
                                backgroundColor: 'rgba(254, 215, 170, 0.4)',
                                borderRadius: scale(10),
                                padding: scale(14),
                                marginBottom: scale(10),
                                borderWidth: scale(2),
                                borderColor: '#FFFFFF',
                              }}>
                                {/* Referral Type */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                                  <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#EA580C' }}>
                                    {referral.referral_type}
                                  </Text>
                                  <TouchableOpacity
                                    style={{
                                      backgroundColor: 'rgba(251, 146, 60, 0.3)',
                                      paddingHorizontal: scale(10),
                                      paddingVertical: scale(4),
                                      borderRadius: scale(12),
                                      borderWidth: scale(1),
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
                                    <Text style={{ fontSize: scale(11), fontWeight: '700', color: '#92400E' }}>Not Given</Text>
                                  </TouchableOpacity>
                                </View>

                                {/* Divider */}
                                <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />

                                {/* Tooth Number */}
                                <View style={{ marginBottom: scale(8) }}>
                                  <Text style={{ fontSize: scale(11), color: '#64748B', marginBottom: scale(4) }}>Tooth Number</Text>
                                  <View style={{
                                    backgroundColor: 'rgba(234, 88, 12, 0.5)',
                                    paddingHorizontal: scale(10),
                                    paddingVertical: scale(5),
                                    borderRadius: scale(6),
                                    alignSelf: 'flex-start',
                                    borderWidth: scale(1),
                                    borderColor: 'rgba(234, 88, 12, 0.7)',
                                  }}>
                                    <Text style={{ fontSize: scale(12), fontWeight: '700', color: '#FFFFFF' }}>
                                      {referral.tooth_number || 'General'}
                                    </Text>
                                  </View>
                                </View>

                                {/* Notes if exists */}
                                {referral.notes && (
                                  <View style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                    padding: scale(8),
                                    borderRadius: scale(6),
                                    marginBottom: scale(8),
                                  }}>
                                    <Text style={{ fontSize: scale(11), color: '#475569', fontStyle: 'italic' }}>
                                      "{referral.notes}"
                                    </Text>
                                  </View>
                                )}

                                {/* Date and Doctor */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: scale(8), borderTopWidth: scale(1), borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                  <Text style={{ fontSize: scale(10), color: '#64748B', fontWeight: '600' }}>
                                    {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </Text>
                                  <Text style={{ fontSize: scale(10), color: '#64748B', fontWeight: '600' }}>
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
                            <View style={{ marginBottom: scale(8), marginTop: scale(12), paddingBottom: scale(6), borderBottomWidth: scale(2), borderBottomColor: 'rgba(167, 243, 208, 0.6)' }}>
                              <Text style={{ fontSize: scale(15), fontWeight: '700', color: '#059669' }}>
                                Referrals Records ({givenReferrals.length})
                              </Text>
                            </View>

                            {/* Individual Referral Cards */}
                            {givenReferrals.map((referral) => (
                              <View key={referral.id} style={{
                                backgroundColor: 'rgba(167, 243, 208, 0.4)',
                                borderRadius: scale(10),
                                padding: scale(14),
                                marginBottom: scale(10),
                                borderWidth: scale(2),
                                borderColor: '#FFFFFF',
                              }}>
                                {/* Referral Type */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                                  <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#059669' }}>
                                    {referral.referral_type}
                                  </Text>
                                  <View style={{
                                    backgroundColor: 'rgba(52, 211, 153, 0.3)',
                                    paddingHorizontal: scale(10),
                                    paddingVertical: scale(4),
                                    borderRadius: scale(12),
                                    borderWidth: scale(1),
                                    borderColor: 'rgba(52, 211, 153, 0.5)',
                                  }}>
                                    <Text style={{ fontSize: scale(11), fontWeight: '700', color: '#065F46' }}>Given ✔</Text>
                                  </View>
                                </View>

                                {/* Divider */}
                                <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />

                                {/* Tooth Number */}
                                <View style={{ marginBottom: scale(8) }}>
                                  <Text style={{ fontSize: scale(11), color: '#64748B', marginBottom: scale(4) }}>Tooth Number</Text>
                                  <View style={{
                                    backgroundColor: 'rgba(5, 150, 105, 0.5)',
                                    paddingHorizontal: scale(10),
                                    paddingVertical: scale(5),
                                    borderRadius: scale(6),
                                    alignSelf: 'flex-start',
                                    borderWidth: scale(1),
                                    borderColor: 'rgba(5, 150, 105, 0.7)',
                                  }}>
                                    <Text style={{ fontSize: scale(12), fontWeight: '700', color: '#FFFFFF' }}>{referral.tooth_number}</Text>
                                  </View>
                                </View>

                                {/* Notes if exists */}
                                {referral.notes && (
                                  <View style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                    padding: scale(8),
                                    borderRadius: scale(6),
                                    marginBottom: scale(8),
                                  }}>
                                    <Text style={{ fontSize: scale(11), color: '#475569', fontStyle: 'italic' }}>
                                      "{referral.notes}"
                                    </Text>
                                  </View>
                                )}

                                {/* Date and Doctor */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: scale(8), borderTopWidth: scale(1), borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                  <Text style={{ fontSize: scale(10), color: '#64748B', fontWeight: '600' }}>
                                    {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </Text>
                                  <Text style={{ fontSize: scale(10), color: '#64748B', fontWeight: '600' }}>
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
                          borderRadius: scale(10),
                          padding: scale(14),
                          marginBottom: scale(10),
                          borderWidth: scale(2),
                          borderColor: '#FFFFFF',
                        }}
                      >
                        {/* Header: Tooth Number + Badge */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                          <View style={{
                            backgroundColor: 'rgba(147, 197, 253, 0.3)',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(5),
                            borderRadius: scale(6),
                            borderWidth: scale(1),
                            borderColor: 'rgba(147, 197, 253, 0.6)',
                          }}>
                            <Text style={{ fontSize: scale(12), fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                              {note.tooth_number}
                            </Text>
                          </View>
                          <View style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.25)',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(4),
                            borderRadius: scale(12),
                          }}>
                            <Text style={{ fontSize: scale(11), fontWeight: '700', color: '#1E3A8A' }}>
                              Note
                            </Text>
                          </View>
                        </View>

                        {/* Divider */}
                        <View style={{ height: scale(1), backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: scale(10) }} />

                        {/* Note Content */}
                        <View style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                          padding: scale(10),
                          borderRadius: scale(8),
                          marginBottom: scale(8),
                        }}>
                          <Text style={{ fontSize: scale(13), color: '#1E293B', lineHeight: scale(18), fontStyle: 'italic' }}>
                            "{note.note}"
                          </Text>
                        </View>

                        {/* Footer: Doctor & Date */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: scale(8), borderTopWidth: scale(1), borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                          <Text style={{ fontSize: scale(10), color: '#64748B', fontWeight: '600' }}>
                            Dr. {note.doctor_name}
                          </Text>
                          <Text style={{ fontSize: scale(10), color: '#64748B', fontWeight: '600' }}>
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
    </>
  );
};
