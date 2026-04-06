import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
} from 'react-native';
import { scale } from '../../lib/scale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { shadows } from '../../theme';
import { Patient, TimelineEvent } from './constants';
import { Referral, ToothNote, DentalSummary } from '../../types';
import { styles } from './styles';
import { AnimatedPatientCard } from './PatientCard';
import { AppModals } from './AppModals';

export interface MainQueueScreenProps {
  // Animated blob values
  timelineBlob1Anim: Animated.Value;
  timelineBlob2Anim: Animated.Value;
  timelineBlob3Anim: Animated.Value;
  timelineBlob4Anim: Animated.Value;
  timelineBlob5Anim: Animated.Value;
  timelineBlob6Anim: Animated.Value;

  // Header animation values
  headerTranslateY: Animated.Value;
  queueMarginTop: Animated.Value;
  headerElementsOpacity: Animated.Value;
  headerElementsTranslate: Animated.Value;

  // Header collapse
  isHeaderCollapsed: boolean;
  toggleHeaderCollapse: () => void;

  // Clinic info
  selectedClinicName: string;
  selectedClinicId: string | null;

  // User
  user: { role?: string; name?: string; email?: string } | null;

  // Stats
  totalPatients: number;
  waitingPatients: number;
  treatmentStats: { [key: string]: number };
  showTreatmentStats: boolean;
  setShowTreatmentStats: (val: boolean) => void;

  // Filters/display
  showTimeline: boolean;
  setShowTimeline: (val: boolean) => void;
  showNAPatients: boolean;
  setShowNAPatients: (val: boolean) => void;
  filterWaitingOnly: boolean;
  setFilterWaitingOnly: (val: boolean) => void;

  // Expanded card
  expandedCardId: string | null;
  setExpandedCardId: (val: string | null) => void;
  expandedPermanentCardId: string | null;

  // Patients
  filteredPatients: Patient[];
  patients: Patient[];
  animKey: number;

  // Navigation handlers
  setSavedClinicId: (val: string | null) => void;
  setSavedClinicName: (val: string) => void;
  setSelectedClinicId: (val: string | null) => void;
  setSelectedClinicName: (val: string) => void;
  showClinicDetails: boolean;
  setShowClinicDetails: (val: boolean) => void;
  showDentalDepartments: boolean;
  setShowDentalDepartments: (val: boolean) => void;
  setShowDoctorProfile: (val: boolean) => void;
  setNavigationStack: (val: string[]) => void;

  // Card actions
  setShowMenuForPatient: (val: string | null) => void;
  handleViewNote: (patientId: string) => void;
  openTimeline: (patient: Patient) => void;
  setEditingPatientId: (val: string | null) => void;
  setEditingField: (val: 'clinic' | 'condition' | 'treatment' | null) => void;
  setShowClinicDropdown: (val: boolean) => void;
  setShowConditionDropdown: (val: boolean) => void;
  setShowTreatmentDropdown: (val: boolean) => void;
  handleViewDetails: (patientId: string) => void;
  cardTimelines: { [key: string]: TimelineEvent[] };
  showTimelineTab: { [key: string]: boolean };
  handleToggleTab: (patientId: string) => void;
  setSelectedPatientForProfile: (val: { id: string; fileNumber: string } | null) => void;
  setShowPatientFile: (val: boolean) => void;
  togglePermanentCardExpansion: (patient: Patient) => void;
  activeDentalTab: { [key: string]: 'treatment' | 'referrals' | 'notes' };
  setActiveDentalTab: React.Dispatch<React.SetStateAction<{ [key: string]: 'treatment' | 'referrals' | 'notes' }>>;
  dentalSummaries: { [key: string]: DentalSummary };
  loadingDentalData: { [key: string]: boolean };
  patientReferrals: { [key: string]: Referral[] };
  setPatientReferrals: React.Dispatch<React.SetStateAction<{ [key: string]: Referral[] }>>;
  patientToothNotes: { [key: string]: ToothNote[] };
  setPatientToothNotes: React.Dispatch<React.SetStateAction<{ [key: string]: ToothNote[] }>>;
  lastScalingDates: { [key: string]: string | null };
  setLastScalingDates: React.Dispatch<React.SetStateAction<{ [key: string]: string | null }>>;
  patientConsents: { [key: string]: boolean };
  togglePatientConsent: (patient: Patient) => void;

  // Tooth modal
  setToothModalPatientId: (val: string) => void;
  setSelectedTooth: (val: string) => void;
  setShowToothModal: (val: boolean) => void;

  // Referral/note loading
  getReferrals: (permanentPatientId: string) => Promise<any>;
  getAllToothNotes: (permanentPatientId: string) => Promise<any>;
  onUpdateReferralStatus: (patientPermanentId: string, referralId: string, newStatus: string) => void;

  // FAB
  showAddModal: boolean;
  setShowAddModal: (val: boolean) => void;

  // Bottom nav
  setShowAppointments: (val: boolean) => void;
  setShowArchiveScreen: (val: boolean) => void;

  // AppModals props
  isPatientEditMode: boolean;
  setIsPatientEditMode: (val: boolean) => void;
  isModalExpanded: boolean;
  setIsModalExpanded: (val: boolean) => void;
  patientMode: 'search' | 'walk-in' | 'new-profile';
  setPatientMode: (val: 'search' | 'walk-in' | 'new-profile') => void;
  newPatientName: string;
  setNewPatientName: (val: string) => void;
  newPatientFileNumber: string;
  setNewPatientFileNumber: (val: string) => void;
  newPatientQueueNumber: string;
  setNewPatientQueueNumber: (val: string) => void;
  newPatientCondition: string;
  setNewPatientCondition: (val: string) => void;
  newPatientTreatment: string;
  setNewPatientTreatment: (val: string) => void;
  isElderly: boolean;
  setIsElderly: (val: boolean) => void;
  newPatientNote: string;
  setNewPatientNote: (val: string) => void;
  permanentPatientSearchResults: any[];
  setPermanentPatientSearchResults: (val: any[]) => void;
  selectedPermanentPatientId: string | null;
  setSelectedPermanentPatientId: (val: string | null) => void;
  showPatientSuggestions: boolean;
  setShowPatientSuggestions: (val: boolean) => void;
  showFileNumberSuggestions: boolean;
  setShowFileNumberSuggestions: (val: boolean) => void;
  fileNumberSearchResults: any[];
  setFileNumberSearchResults: (val: any[]) => void;
  modalEditingPatientId: string | null;
  setModalEditingPatientId: (val: string | null) => void;
  handleAddPatient: () => void;
  handleFileNumberSearch: (text: string) => void;
  handlePatientNameSearch: (text: string) => void;
  showMenuForPatient: string | null;
  handleMenuAction: (action: string, patientId: string) => void;
  showNoteModal: boolean;
  setShowNoteModal: (val: boolean) => void;
  currentNote: string;
  setCurrentNote: (val: string) => void;
  handleSaveNote: () => void;
  showViewNoteModal: boolean;
  setShowViewNoteModal: (val: boolean) => void;
  viewNoteContent: string;
  setViewNoteContent: (val: string) => void;
  notePatientId: string | null;
  handleDeleteNote: () => void;
  showConvertModal: boolean;
  setShowConvertModal: (val: boolean) => void;
  convertFileNumber: string;
  setConvertFileNumber: (val: string) => void;
  convertToPermanentPatient: () => void;
  showTreatmentDoneModal: boolean;
  setShowTreatmentDoneModal: (val: boolean) => void;
  clinicDoctors: any[];
  doctorSearchQuery: string;
  setDoctorSearchQuery: (val: string) => void;
  handleTreatmentDoneByDoctor: (doctorId: string) => void;
  showClinicDropdown: boolean;
  showConditionDropdown: boolean;
  showTreatmentDropdown: boolean;
  editingPatientId: string | null;
  handleUpdateField: (patientId: string, field: 'clinic' | 'condition' | 'treatment', value: string) => void;
  showTimelineModal: boolean;
  setShowTimelineModal: (val: boolean) => void;
  selectedPatient: Patient | null;
  timeline: TimelineEvent[];
  treatmentNote: string;
  setTreatmentNote: (val: string) => void;
  markTreatmentDone: () => void;
  showToothModal: boolean;
  toothModalPatientId: string;
  selectedTooth: string;
  currentDoctorName: string;
  setDentalSummaries: React.Dispatch<React.SetStateAction<{ [key: string]: DentalSummary }>>;
}

export const MainQueueScreen: React.FC<MainQueueScreenProps> = (props) => {
  const {
    timelineBlob1Anim,
    timelineBlob2Anim,
    timelineBlob3Anim,
    timelineBlob4Anim,
    timelineBlob5Anim,
    timelineBlob6Anim,
    headerTranslateY,
    queueMarginTop,
    headerElementsOpacity,
    headerElementsTranslate,
    isHeaderCollapsed,
    toggleHeaderCollapse,
    selectedClinicName,
    selectedClinicId,
    user,
    totalPatients,
    waitingPatients,
    treatmentStats,
    showTreatmentStats,
    setShowTreatmentStats,
    showTimeline,
    setShowTimeline,
    showNAPatients,
    setShowNAPatients,
    filterWaitingOnly,
    setFilterWaitingOnly,
    expandedCardId,
    setExpandedCardId,
    expandedPermanentCardId,
    filteredPatients,
    patients,
    animKey,
    setSavedClinicId,
    setSavedClinicName,
    setSelectedClinicId,
    setSelectedClinicName,
    showClinicDetails,
    setShowClinicDetails,
    showDentalDepartments,
    setShowDentalDepartments,
    setShowDoctorProfile,
    setNavigationStack,
    setShowMenuForPatient,
    handleViewNote,
    openTimeline,
    setEditingPatientId,
    setEditingField,
    setShowClinicDropdown,
    setShowConditionDropdown,
    setShowTreatmentDropdown,
    handleViewDetails,
    cardTimelines,
    showTimelineTab,
    handleToggleTab,
    setSelectedPatientForProfile,
    setShowPatientFile,
    togglePermanentCardExpansion,
    activeDentalTab,
    setActiveDentalTab,
    dentalSummaries,
    loadingDentalData,
    patientReferrals,
    setPatientReferrals,
    patientToothNotes,
    setPatientToothNotes,
    lastScalingDates,
    setLastScalingDates,
    patientConsents,
    togglePatientConsent,
    setToothModalPatientId,
    setSelectedTooth,
    setShowToothModal,
    getReferrals,
    getAllToothNotes,
    showAddModal,
    setShowAddModal,
    setShowAppointments,
    setShowArchiveScreen,
    showToothModal,
    toothModalPatientId,
    selectedTooth,
    currentDoctorName,
    setDentalSummaries,
    setModalEditingPatientId,
    setViewNoteContent,
  } = props;

  // Main Timeline Screen - Only shown when clinic is selected
  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
      {/* Gradient Mesh Background */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Animated Blobs */}
        <Animated.View
          style={[
            styles.timelineBlob,
            {
              top: '3%',
              left: '5%',
              width: 180,
              height: 180,
              backgroundColor: 'rgba(91, 159, 237, 0.15)',
              transform: [
                {
                  translateX: timelineBlob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(30)],
                  }),
                },
                {
                  translateY: timelineBlob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(40)],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.timelineBlob,
            {
              top: '65%',
              right: '3%',
              width: 220,
              height: 220,
              backgroundColor: 'rgba(168, 85, 247, 0.12)',
              transform: [
                {
                  translateX: timelineBlob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-25)],
                  }),
                },
                {
                  translateY: timelineBlob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(35)],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.timelineBlob,
            {
              bottom: '5%',
              left: '55%',
              marginLeft: -100,
              width: 200,
              height: 200,
              backgroundColor: 'rgba(236, 72, 153, 0.1)',
              transform: [
                {
                  translateX: timelineBlob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(20)],
                  }),
                },
                {
                  translateY: timelineBlob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-30)],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.timelineBlob,
            {
              top: '35%',
              left: '75%',
              width: 160,
              height: 160,
              backgroundColor: 'rgba(251, 191, 36, 0.12)',
              transform: [
                {
                  translateX: timelineBlob4Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-20)],
                  }),
                },
                {
                  translateY: timelineBlob4Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(25)],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.timelineBlob,
            {
              top: '20%',
              right: '25%',
              width: 170,
              height: 170,
              backgroundColor: 'rgba(34, 197, 94, 0.11)',
              transform: [
                {
                  translateX: timelineBlob5Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(28)],
                  }),
                },
                {
                  translateY: timelineBlob5Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-32)],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.timelineBlob,
            {
              bottom: '30%',
              left: '15%',
              width: 150,
              height: 150,
              backgroundColor: 'rgba(239, 68, 68, 0.10)',
              transform: [
                {
                  translateX: timelineBlob6Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-18)],
                  }),
                },
                {
                  translateY: timelineBlob6Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(22)],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            {
              transform: [
                { translateY: headerTranslateY },
                { translateY: headerElementsTranslate },
              ],
              opacity: headerElementsOpacity,
              zIndex: expandedPermanentCardId ? 1 : 10,
            }
          ]}
          pointerEvents={expandedPermanentCardId ? 'none' : 'auto'}
        >
          {/* زر رجوع للمدير العام والمنسق، زر ملف شخصي للطبيب */}
          {(user?.role === 'super_admin' || user?.role === 'coordinator') ? (
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => {
                // Navigation Stack: Timeline → Clinic Details → Departments → Profile

                // Timeline → Clinic Details
                if (selectedClinicId !== null) {
                  // حفظ clinicId قبل الرجوع
                  setSavedClinicId(selectedClinicId);
                  setSavedClinicName(selectedClinicName);
                  setSelectedClinicId(null);
                  setSelectedClinicName('');
                  setShowClinicDetails(true);  // إظهار ClinicDetails
                  setShowDentalDepartments(false);
                  setNavigationStack(['profile', 'departments', 'clinicDetails']);
                }
                // Clinic Details → Departments
                else if (showClinicDetails) {
                  setShowClinicDetails(false);
                  setShowDentalDepartments(true);
                  // مسح savedClinicId عند الرجوع إلى Departments
                  setSavedClinicId(null);
                  setSavedClinicName('');
                  setNavigationStack(['profile', 'departments']);
                }
                // Departments → Profile
                else if (showDentalDepartments) {
                  // مسح selectedClinicId أولاً لمنع فتح Timeline
                  setSelectedClinicId(null);
                  setSelectedClinicName('');
                  setSavedClinicId(null);
                  setSavedClinicName('');
                  // ثم إغلاق Departments وفتح Profile
                  setShowDentalDepartments(false);
                  setShowDoctorProfile(true);
                  setNavigationStack(['profile']);
                }
              }}
            >
              <View style={styles.profileButtonGlass}>
                <View style={styles.profileButtonInnerGlow} />
                <Ionicons name="arrow-back" size={scale(24)} color="#7DD3C0" style={{ zIndex: 10 }} />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => {
                // زر رجوع للطبيب/Team Leader
                setSelectedClinicId(null);
                setSelectedClinicName('');
              }}
            >
              <View style={styles.profileButtonGlass}>
                <View style={styles.profileButtonInnerGlow} />
                <Ionicons name="arrow-back" size={scale(24)} color="#7DD3C0" style={{ zIndex: 10 }} />
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Dental Clinic</Text>
            {selectedClinicName && (
              <Text style={styles.headerSubtitle}>{selectedClinicName}</Text>
            )}
          </View>

          <View style={{ width: scale(44) }} />
        </Animated.View>

        {/* Statistics */}
        <Animated.View
          style={[
            styles.statsContainer,
            {
              transform: [
                { translateY: headerTranslateY },
                { translateY: headerElementsTranslate },
              ],
              opacity: headerElementsOpacity,
              zIndex: expandedPermanentCardId ? 1 : 10,
            }
          ]}
          pointerEvents={expandedPermanentCardId ? 'none' : 'auto'}
        >
          {showTreatmentStats ? (
            <TouchableOpacity
              style={[styles.statCardExpanded, shadows.neumorphic]}
              onPress={() => setShowTreatmentStats(false)}
            >
              <View style={styles.expandedHeader}>
                <MaterialCommunityIcons name="chart-bar" size={scale(32)} color="#9CA3AF" />
                <Text style={styles.expandedTitle}>Statistics</Text>
              </View>
              <View style={styles.treatmentStatsList}>
                {Object.entries(treatmentStats)
                  .filter(([_, count]) => count > 0)
                  .sort(([_, a], [__, b]) => b - a)
                  .map(([treatment, count]) => (
                    <View key={treatment} style={styles.treatmentStatRow}>
                      <Text style={styles.treatmentStatCount}>{count}</Text>
                      <Text style={styles.treatmentStatName}>{treatment}</Text>
                    </View>
                  ))}
              </View>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.statCard, shadows.neumorphic]}
                onPress={() => setShowTreatmentStats(true)}
              >
                <MaterialCommunityIcons name="tooth-outline" size={scale(48)} color="#9CA3AF" style={{ marginBottom: scale(8) }} />
                <Text style={styles.statLabel}>Total Patients</Text>
                <Text style={styles.statValue}>{totalPatients}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statCard, shadows.neumorphic, filterWaitingOnly && styles.statCardActive]}
                onPress={() => setFilterWaitingOnly(!filterWaitingOnly)}
              >
                <Ionicons name="person-outline" size={scale(48)} color={filterWaitingOnly ? '#7DD3C0' : '#9CA3AF'} style={{ marginBottom: scale(8) }} />
                <Text style={[styles.statLabel, filterWaitingOnly && styles.statLabelActive]}>Waiting</Text>
                <Text style={[styles.statValue, filterWaitingOnly && styles.statValueActive]}>{waitingPatients}</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* Queue Header */}
        <Animated.View
          style={[
            styles.queueHeader,
            {
              transform: [
                { translateY: headerTranslateY },
                { translateY: headerElementsTranslate },
              ],
              marginTop: queueMarginTop,
              opacity: headerElementsOpacity,
              zIndex: expandedPermanentCardId ? 1 : 10,
            }
          ]}
          pointerEvents={expandedPermanentCardId ? 'none' : 'auto'}
        >
          <View style={styles.queueTitleContainer}>
            <Text style={styles.queueTitle}>Queue</Text>
            {/* Minimize/Maximize Button */}
            <TouchableOpacity
              style={styles.minimizeButton}
              onPress={toggleHeaderCollapse}
              activeOpacity={0.7}
            >
              <View style={styles.minimizeButtonInnerGlow} />
              <Ionicons
                name={isHeaderCollapsed ? 'chevron-down' : 'chevron-up'}
                size={scale(24)}
                color="#7DD3C0"
                style={{
                  zIndex: 10
                }}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.viewDetailsHeaderButton, shadows.card]}
            onPress={() => setExpandedCardId(expandedCardId ? null : 'header')}
          >
            <Text style={styles.viewDetailsHeaderText}>
              {expandedCardId === 'header' ? '▲ Hide Details' : '▼ View Details'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Expandable Options */}
        {!expandedPermanentCardId && expandedCardId === 'header' && (
          <Animated.View
            style={[
              styles.headerExpandableSection,
              {
                transform: [{ translateY: headerTranslateY }],
              }
            ]}
          >
            <TouchableOpacity
              style={[styles.headerOptionButton, showTimeline && styles.headerOptionButtonActive]}
              onPress={() => {
                setShowTimeline(!showTimeline);
                setExpandedCardId(null);
              }}
            >
              <Ionicons name="time-outline" size={scale(20)} color={showTimeline ? '#7DD3C0' : '#6B7280'} />
              <Text style={[styles.headerOptionText, showTimeline && styles.headerOptionTextActive]}>
                {showTimeline ? 'Hide Timeline' : 'Show Timeline'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerOptionButton, showNAPatients && styles.headerOptionButtonActive]}
              onPress={() => {
                setShowNAPatients(!showNAPatients);
                setExpandedCardId(null);
              }}
            >
              <Ionicons name="eye-outline" size={scale(20)} color={showNAPatients ? '#7DD3C0' : '#6B7280'} />
              <Text style={[styles.headerOptionText, showNAPatients && styles.headerOptionTextActive]}>
                {showNAPatients ? 'Hide NA Patient' : 'Show NA Patient'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Content Wrapper - Animated with marginTop */}
        <Animated.View
          style={{
            flex: 1,
            marginTop: headerTranslateY,
          }}
        >
          {/* Patient List */}
          <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, expandedPermanentCardId && { paddingTop: scale(80) }]}>
          {filteredPatients
            .filter(p => !expandedPermanentCardId || p.id === expandedPermanentCardId)
            .map((patient, index) => (
            <AnimatedPatientCard
              key={`${patient.id}-${animKey}`}
              index={index}
              patient={patient}
              showTimeline={showTimeline}
              onMenuPress={() => setShowMenuForPatient(patient.id)}
              onNotePress={() => handleViewNote(patient.id)}
              onCardPress={() => openTimeline(patient)}
              onEditField={(patientId, field) => {
                setEditingPatientId(patientId);
                setEditingField(field);
                if (field === 'clinic') setShowClinicDropdown(true);
                else if (field === 'condition') setShowConditionDropdown(true);
                else if (field === 'treatment') setShowTreatmentDropdown(true);
              }}
              expandedCardId={expandedCardId}
              onViewDetails={handleViewDetails}
              cardTimelines={cardTimelines}
              showTimelineTab={showTimelineTab}
              onToggleTab={handleToggleTab}
              onPatientNamePress={(patientId, fileNumber) => {
                setSelectedPatientForProfile({
                  id: patientId,
                  fileNumber: fileNumber
                });
                setShowPatientFile(true);
              }}
              expandedPermanentCardId={expandedPermanentCardId}
              onTogglePermanentExpansion={togglePermanentCardExpansion}
              activeDentalTab={activeDentalTab[patient.id] || 'treatment'}
              onDentalTabChange={(tab) => setActiveDentalTab(prev => ({ ...prev, [patient.id]: tab }))}
              dentalSummary={dentalSummaries[patient.id]}
              loadingDentalData={loadingDentalData[patient.id]}
              animKey={animKey}
              onToothEditPress={(permanentPatientId, tooth) => {
                setToothModalPatientId(permanentPatientId);
                setSelectedTooth(tooth);
                setShowToothModal(true);
              }}
              patientReferrals={patient.permanent_patient_id ? patientReferrals[patient.permanent_patient_id] : undefined}
              onLoadReferrals={async () => {
                if (patient.permanent_patient_id) {
                  const result = await getReferrals(patient.permanent_patient_id);
                  if (result.data) {
                    setPatientReferrals(prev => ({ ...prev, [patient.permanent_patient_id!]: result.data || [] }));
                  }
                }
              }}
              patientToothNotes={patient.permanent_patient_id ? patientToothNotes[patient.permanent_patient_id] : undefined}
              onLoadToothNotes={async () => {
                if (patient.permanent_patient_id) {
                  const result = await getAllToothNotes(patient.permanent_patient_id);
                  if (result.data) {
                    setPatientToothNotes(prev => ({ ...prev, [patient.permanent_patient_id!]: result.data || [] }));
                  }
                }
              }}
              onUpdateReferralStatus={(referralId, newStatus) => {
                if (patient.permanent_patient_id) {
                  setPatientReferrals(prev => ({
                    ...prev,
                    [patient.permanent_patient_id!]: prev[patient.permanent_patient_id!]?.map(r =>
                      r.id === referralId ? { ...r, status: newStatus } : r
                    ) || []
                  }));
                }
              }}
              lastScalingDates={lastScalingDates}
              currentDoctorName={user?.name || user?.email || 'Doctor'}
              onUpdateScalingDate={(patientId, timestamp) => {
                setLastScalingDates(prev => ({
                  ...prev,
                  [patientId]: timestamp
                }));
              }}
              patientConsents={patientConsents}
              onToggleConsent={togglePatientConsent}
              onOpenDentalChartScreen={(permanentPatientId) => {
                // Navigate to dental chart for this patient
                const patient = patients.find(p => p.permanent_patient_id === permanentPatientId);
                if (patient) {
                  setSelectedPatientForProfile({ id: permanentPatientId, fileNumber: patient.file_number || '' });
                  setShowPatientFile(true);
                }
              }}
            />
          ))}
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
          <View style={styles.fabGlass}>
            <View style={styles.fabInnerGlow} />
            <Text style={styles.fabIcon}>+</Text>
          </View>
        </TouchableOpacity>
        </Animated.View>

        {/* Bottom Navigation - Glass Effect Updated v2.0 - Fixed outside animation */}
        <View style={[styles.bottomNav, shadows.medium]}>
          <TouchableOpacity style={styles.navItem}>
            <Ionicons name="home-sharp" size={scale(26)} color="#7DD3C0" />
            <Text style={[styles.navLabel, styles.navLabelActive]}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setShowPatientFile(true)}
          >
            <Ionicons name="person-circle" size={scale(28)} color="#9CA3AF" />
            <Text style={styles.navLabel}>Patient File</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setShowAppointments(true)}
          >
            <Ionicons name="calendar-sharp" size={scale(26)} color="#9CA3AF" />
            <Text style={styles.navLabel}>Appointments</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setShowArchiveScreen(true)}
          >
            <Ionicons name="archive-sharp" size={scale(26)} color="#9CA3AF" />
            <Text style={styles.navLabel}>Archive</Text>
          </TouchableOpacity>
        </View>

        <AppModals
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
          isPatientEditMode={props.isPatientEditMode}
          setIsPatientEditMode={props.setIsPatientEditMode}
          isModalExpanded={props.isModalExpanded}
          setIsModalExpanded={props.setIsModalExpanded}
          patientMode={props.patientMode}
          setPatientMode={props.setPatientMode}
          newPatientName={props.newPatientName}
          setNewPatientName={props.setNewPatientName}
          newPatientFileNumber={props.newPatientFileNumber}
          setNewPatientFileNumber={props.setNewPatientFileNumber}
          newPatientQueueNumber={props.newPatientQueueNumber}
          setNewPatientQueueNumber={props.setNewPatientQueueNumber}
          newPatientCondition={props.newPatientCondition}
          setNewPatientCondition={props.setNewPatientCondition}
          newPatientTreatment={props.newPatientTreatment}
          setNewPatientTreatment={props.setNewPatientTreatment}
          isElderly={props.isElderly}
          setIsElderly={props.setIsElderly}
          newPatientNote={props.newPatientNote}
          setNewPatientNote={props.setNewPatientNote}
          permanentPatientSearchResults={props.permanentPatientSearchResults}
          setPermanentPatientSearchResults={props.setPermanentPatientSearchResults}
          selectedPermanentPatientId={props.selectedPermanentPatientId}
          setSelectedPermanentPatientId={props.setSelectedPermanentPatientId}
          showPatientSuggestions={props.showPatientSuggestions}
          setShowPatientSuggestions={props.setShowPatientSuggestions}
          showFileNumberSuggestions={props.showFileNumberSuggestions}
          setShowFileNumberSuggestions={props.setShowFileNumberSuggestions}
          fileNumberSearchResults={props.fileNumberSearchResults}
          setFileNumberSearchResults={props.setFileNumberSearchResults}
          modalEditingPatientId={props.modalEditingPatientId}
          handleAddPatient={props.handleAddPatient}
          handleFileNumberSearch={props.handleFileNumberSearch}
          handlePatientNameSearch={props.handlePatientNameSearch}
          patients={patients}
          showMenuForPatient={props.showMenuForPatient}
          setShowMenuForPatient={setShowMenuForPatient}
          handleMenuAction={props.handleMenuAction}
          showNoteModal={props.showNoteModal}
          setShowNoteModal={props.setShowNoteModal}
          currentNote={props.currentNote}
          setCurrentNote={props.setCurrentNote}
          handleSaveNote={props.handleSaveNote}
          showViewNoteModal={props.showViewNoteModal}
          setShowViewNoteModal={props.setShowViewNoteModal}
          viewNoteContent={props.viewNoteContent}
          notePatientId={props.notePatientId}
          handleDeleteNote={props.handleDeleteNote}
          showConvertModal={props.showConvertModal}
          setShowConvertModal={props.setShowConvertModal}
          convertFileNumber={props.convertFileNumber}
          setConvertFileNumber={props.setConvertFileNumber}
          convertToPermanentPatient={props.convertToPermanentPatient}
          showTreatmentDoneModal={props.showTreatmentDoneModal}
          setShowTreatmentDoneModal={props.setShowTreatmentDoneModal}
          clinicDoctors={props.clinicDoctors}
          doctorSearchQuery={props.doctorSearchQuery}
          setDoctorSearchQuery={props.setDoctorSearchQuery}
          handleTreatmentDoneByDoctor={props.handleTreatmentDoneByDoctor}
          showClinicDropdown={props.showClinicDropdown}
          setShowClinicDropdown={setShowClinicDropdown}
          showConditionDropdown={props.showConditionDropdown}
          setShowConditionDropdown={setShowConditionDropdown}
          showTreatmentDropdown={props.showTreatmentDropdown}
          setShowTreatmentDropdown={setShowTreatmentDropdown}
          editingPatientId={props.editingPatientId}
          handleUpdateField={props.handleUpdateField}
          showTimelineModal={props.showTimelineModal}
          setShowTimelineModal={props.setShowTimelineModal}
          selectedPatient={props.selectedPatient}
          timeline={props.timeline}
          treatmentNote={props.treatmentNote}
          setTreatmentNote={props.setTreatmentNote}
          markTreatmentDone={props.markTreatmentDone}
          showToothModal={showToothModal}
          setShowToothModal={setShowToothModal}
          toothModalPatientId={toothModalPatientId}
          selectedTooth={selectedTooth}
          currentDoctorName={currentDoctorName}
          setDentalSummaries={setDentalSummaries}
          setPatientReferrals={setPatientReferrals}
          setPatientToothNotes={setPatientToothNotes}
          setModalEditingPatientId={setModalEditingPatientId}
          setViewNoteContent={setViewNoteContent}
        />

      </View>
    </SafeAreaView>
    </View>
  );
};
