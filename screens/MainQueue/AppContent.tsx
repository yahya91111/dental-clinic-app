// AppContent - Main application content component
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  FlatList,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { shadows } from '../../theme';
import LoginScreen from '../../LoginScreen';
import DoctorProfileScreen from '../../DoctorProfileScreen';
import ArchiveScreen from '../../ArchiveScreen';
import MyStatisticsScreen from '../../MyStatisticsScreen';
import DentalDepartmentsScreen from '../../DentalDepartmentsScreen';
import ClinicDetailsScreen from '../../ClinicDetailsScreen';
import DoctorsScreen from '../../DoctorsScreen';
import ComingSoonScreen from '../../ComingSoonScreen';
import MyPracticeScreen from '../../MyPracticeScreen';
import MyTimelineScreen from '../../MyTimelineScreen';
import PatientProfileScreen from '../../PatientProfileScreen';
import ToothDetailsModal from '../../components/ToothDetailsModal';
import { ExpandedPatientHeader } from '../../components/ExpandedPatientHeader';
import { AuthProvider, useAuth } from '../../AuthContext';
import { startAutoArchive, stopAutoArchive, testArchiveNow, archiveEventEmitter } from '../../autoArchiveService';
import {
  getAllToothNotes,
  getReferrals,
} from '../../lib/database';
import { DentalSummary, Referral, ToothNote } from '../../types';
import { supabase, TREATMENTS, Patient, TimelineEvent } from './constants';
import { styles } from './styles';
import { AppModals } from './AppModals';
import { MainQueueScreen } from './MainQueueScreen';
import { usePatientData } from './usePatientData';

import { usePatientHandlers } from './usePatientHandlers';

export function AppContent() {
  const { user, isLoading, logout } = useAuth();
  
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTreatmentStats, setShowTreatmentStats] = useState(false);
  const [filterWaitingOnly, setFilterWaitingOnly] = useState(false);
  const [showNAPatients, setShowNAPatients] = useState(false);
  
  // Navigation states
  const [showDoctorProfile, setShowDoctorProfile] = useState(false);
  const [showArchiveScreen, setShowArchiveScreen] = useState(false);
  const [showMyStatistics, setShowMyStatistics] = useState(false);
  const [showPatientFile, setShowPatientFile] = useState(false);
  const [selectedPatientForProfile, setSelectedPatientForProfile] = useState<{id: string, fileNumber: string} | null>(null);
  const [showAppointments, setShowAppointments] = useState(false);
  const [showMyTimeline, setShowMyTimeline] = useState(false);

  // Viewing doctor data (when viewing another doctor's profile/stats)
  const [viewingDoctorData, setViewingDoctorData] = useState<{id: string, name: string, clinic_id: string | null, role: string} | null>(null);
  const [currentDoctorsScreen, setCurrentDoctorsScreen] = useState<'list' | 'viewStats'>('list');
  
  const [showDentalDepartments, setShowDentalDepartments] = useState(false);
  const [showClinicDetails, setShowClinicDetails] = useState(false);
  const [showDoctorsScreen, setShowDoctorsScreen] = useState(false);
  
  // Navigation Stack: ØªØªØ¨Ø¹ Ø§Ù„Ù…Ø³ØªÙˆÙ‰ Ø§Ù„Ø­Ø§Ù„ÙŠ
  // Level 1: Doctor Profile
  // Level 2: Dental Departments
  // Level 3: Clinic Details
  // Level 4: Timeline
  const [navigationStack, setNavigationStack] = useState<string[]>(['profile']);
  const [showClinicDropdown, setShowClinicDropdown] = useState(false);
  const [showConditionDropdown, setShowConditionDropdown] = useState(false);
  const [showTreatmentDropdown, setShowTreatmentDropdown] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'clinic' | 'condition' | 'treatment' | null>(null);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [selectedClinicName, setSelectedClinicName] = useState<string>('');
  
  // Ø­ÙØ¸ clinicId Ù„Ù„Ø±Ø¬ÙˆØ¹ Ø¥Ù„Ù‰ Clinic Details
  const [savedClinicId, setSavedClinicId] = useState<string | null>(null);
  const [savedClinicName, setSavedClinicName] = useState<string>('');
  
  // Ø­ÙØ¸ Ø£Ø±Ù‚Ø§Ù… badges Ù„ÙƒÙ„ Ø¹ÙŠØ§Ø¯Ø© (ÙÙŠ App.tsx Ù„Ù…Ù†Ø¹ Ø§Ù„Ø­Ø°Ù Ø¹Ù†Ø¯ unmount)
  const [clinicBadges, setClinicBadges] = useState<{[clinicId: string]: {waiting: number, doctors: number, treatments: number}}>({});
  
  // Timeline modal states
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [treatmentNote, setTreatmentNote] = useState('');
  
  // Expandable card states
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [cardTimelines, setCardTimelines] = useState<{ [key: string]: TimelineEvent[] }>({});
  const [showTimelineTab, setShowTimelineTab] = useState<{ [key: string]: boolean }>({});

  // Permanent patient card expansion (for dental info)
  const [expandedPermanentCardId, setExpandedPermanentCardId] = useState<string | null>(null);
  const [activeDentalTab, setActiveDentalTab] = useState<{ [key: string]: 'treatment' | 'referrals' | 'notes' }>({});
  const [dentalSummaries, setDentalSummaries] = useState<{ [key: string]: DentalSummary }>({});
  const [loadingDentalData, setLoadingDentalData] = useState<{ [key: string]: boolean }>({});
  const [patientReferrals, setPatientReferrals] = useState<{ [key: string]: Referral[] }>({});
  const [patientToothNotes, setPatientToothNotes] = useState<{ [key: string]: ToothNote[] }>({});
  const [lastScalingDates, setLastScalingDates] = useState<{ [key: string]: string | null }>({});
  const [patientConsents, setPatientConsents] = useState<{ [key: string]: boolean }>({});

  // Convert to Permanent Patient states
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertPatientId, setConvertPatientId] = useState<string | null>(null);
  const [convertFileNumber, setConvertFileNumber] = useState('');

  // Tooth Details Modal states (using shared ToothDetailsModal component)
  const [showToothModal, setShowToothModal] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<string>('');
  const [toothModalPatientId, setToothModalPatientId] = useState<string>('');

  // Load timeline
  const loadTimeline = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('timeline_events')
        .select('id, patient_id, event_type, event_details, timestamp, doctor_name, assigned_by_doctor_name')
        .eq('patient_id', patientId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setTimeline(data || []);
    } catch (error: any) {
      // Error handled silently
    }
  };

  // Patient data hook (patients, realtime, animations, etc.)
  const {
    patients, setPatients, displayedPatients, userClinicId,
    myTotalTreatments, setMyTotalTreatments, loadPatients,
    animKey, setAnimKey,
    timelineBlob1Anim, timelineBlob2Anim, timelineBlob3Anim,
    timelineBlob4Anim, timelineBlob5Anim, timelineBlob6Anim
  } = usePatientData({ user, selectedClinicId, selectedPatient, loadTimeline });


  // Header collapse via tap
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const headerTranslateY = React.useState(new Animated.Value(0))[0];
  const queueMarginTop = React.useState(new Animated.Value(0))[0];
  const HEADER_COLLAPSE_HEIGHT = 300; // Height to collapse (Header + Statistics + Queue)

  // Animation for hiding header elements when permanent card expands
  const headerElementsOpacity = React.useState(new Animated.Value(1))[0];
  const headerElementsTranslate = React.useState(new Animated.Value(0))[0];
  
  const toggleHeaderCollapse = () => {
    const translateValue = isHeaderCollapsed ? 0 : -HEADER_COLLAPSE_HEIGHT;
    const marginValue = isHeaderCollapsed ? 0 : 10;
    
    Animated.parallel([
      Animated.spring(headerTranslateY, {
        toValue: translateValue,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(queueMarginTop, {
        toValue: marginValue,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }),
    ]).start();

    setIsHeaderCollapsed(!isHeaderCollapsed);
  };

  // Animate header elements when permanent card expands/collapses
  React.useEffect(() => {
    const isExpanded = expandedPermanentCardId !== null;

    Animated.parallel([
      Animated.spring(headerElementsOpacity, {
        toValue: isExpanded ? 0 : 1,
        useNativeDriver: false,
        tension: 40,
        friction: 8,
      }),
      Animated.spring(headerElementsTranslate, {
        toValue: isExpanded ? 0 : 0,
        useNativeDriver: false,
        tension: 40,
        friction: 8,
      }),
    ]).start();
  }, [expandedPermanentCardId]);

  // Menu states
  const [showMenuForPatient, setShowMenuForPatient] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showViewNoteModal, setShowViewNoteModal] = useState(false);
  const [currentNote, setCurrentNote] = useState('');
  const [viewNoteContent, setViewNoteContent] = useState('');  // Separate state for viewing note
  const [notePatientId, setNotePatientId] = useState<string | null>(null);

  // Treatment Done Modal states
  const [showTreatmentDoneModal, setShowTreatmentDoneModal] = useState(false);
  const [treatmentDonePatientId, setTreatmentDonePatientId] = useState<string | null>(null);
  const [clinicDoctors, setClinicDoctors] = useState<{id: string, name: string}[]>([]);
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');

  // Form state for new patient
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientFileNumber, setNewPatientFileNumber] = useState(''); // New: File number (4 digits)
  const [newPatientQueueNumber, setNewPatientQueueNumber] = useState('');
  const [newPatientCondition, setNewPatientCondition] = useState('Condition');
  const [newPatientTreatment, setNewPatientTreatment] = useState('Treatment');
  const [isElderly, setIsElderly] = useState(false);
  const [newPatientNote, setNewPatientNote] = useState('');

  // Permanent patient search state
  const [permanentPatientSearchResults, setPermanentPatientSearchResults] = useState<any[]>([]);
  const [selectedPermanentPatientId, setSelectedPermanentPatientId] = useState<string | null>(null);
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);
  const [showFileNumberSuggestions, setShowFileNumberSuggestions] = useState(false);
  const [fileNumberSearchResults, setFileNumberSearchResults] = useState<any[]>([]);

  // Modal expansion state
  const [isModalExpanded, setIsModalExpanded] = useState(false);

  // Patient mode: 'search' (default with search), 'walk-in' (no file number, no search), 'new-profile' (new file, no search)
  const [patientMode, setPatientMode] = useState<'search' | 'walk-in' | 'new-profile'>('search');

  // Patient edit mode state (for modal)
  const [isPatientEditMode, setIsPatientEditMode] = useState(false);
  const [modalEditingPatientId, setModalEditingPatientId] = useState<string | null>(null);

  // Patient handler functions (extracted to custom hook)
  const {
    handleFileNumberSearch,
    handlePatientNameSearch,
    handleAddPatient,
    handleArchive,
    handleMenuAction,
    handleSaveNote,
    handleViewNote,
    loadClinicDoctors,
    handleTreatmentDoneByDoctor,
    handleUpdateField,
    handleDeleteNote,
    loadCardTimeline,
    handleViewDetails,
    handleToggleTab,
    loadDentalData,
    togglePermanentCardExpansion,
    togglePatientConsent,
    convertToPermanentPatient,
    openTimeline,
    markTreatmentDone,
  } = usePatientHandlers({
    user,
    patients,
    setPatients,
    displayedPatients,
    loadPatients,
    selectedClinicId,
    userClinicId,
    selectedClinicName,
    setShowAddModal,
    newPatientName,
    setNewPatientName,
    newPatientFileNumber,
    setNewPatientFileNumber,
    newPatientQueueNumber,
    setNewPatientQueueNumber,
    newPatientCondition,
    setNewPatientCondition,
    newPatientTreatment,
    setNewPatientTreatment,
    isElderly,
    setIsElderly,
    newPatientNote,
    setNewPatientNote,
    patientMode,
    setPatientMode,
    isPatientEditMode,
    setIsPatientEditMode,
    modalEditingPatientId,
    setModalEditingPatientId,
    permanentPatientSearchResults,
    setPermanentPatientSearchResults,
    selectedPermanentPatientId,
    setSelectedPermanentPatientId,
    showPatientSuggestions,
    setShowPatientSuggestions,
    showFileNumberSuggestions,
    setShowFileNumberSuggestions,
    fileNumberSearchResults,
    setFileNumberSearchResults,
    setIsModalExpanded,
    setShowClinicDropdown,
    setShowConditionDropdown,
    setShowTreatmentDropdown,
    setEditingPatientId,
    setEditingField,
    setShowMenuForPatient,
    setShowNoteModal,
    setShowViewNoteModal,
    currentNote,
    setCurrentNote,
    setViewNoteContent,
    notePatientId,
    setNotePatientId,
    setShowTreatmentDoneModal,
    treatmentDonePatientId,
    setTreatmentDonePatientId,
    setClinicDoctors,
    setDoctorSearchQuery,
    animKey,
    setAnimKey,
    expandedCardId,
    setExpandedCardId,
    setCardTimelines,
    setShowTimelineTab,
    expandedPermanentCardId,
    setExpandedPermanentCardId,
    dentalSummaries,
    setDentalSummaries,
    setLoadingDentalData,
    setPatientReferrals,
    setPatientToothNotes,
    lastScalingDates,
    setLastScalingDates,
    patientConsents,
    setPatientConsents,
    isHeaderCollapsed,
    toggleHeaderCollapse,
    convertPatientId,
    setConvertPatientId,
    convertFileNumber,
    setConvertFileNumber,
    setShowConvertModal,
    selectedPatient,
    setSelectedPatient,
    setShowTimelineModal,
    treatmentNote,
    setTreatmentNote,
    loadTimeline,
  });

  // Auto-calculate next queue number when modal opens
  useEffect(() => {
    const fetchMaxQueueNumber = async () => {
      // Skip if in edit mode - keep the existing queue number
      if (isPatientEditMode) {
        console.log('Edit mode - keeping existing queue number');
        return;
      }

      if (showAddModal) {
        // Ø§Ø³ØªØ®Ø¯Ø§Ù… selectedClinicId Ø£ÙˆÙ„Ø§Ù‹ (Ù„Ù„Ù€ Coordinator/General Manager)ØŒ Ø«Ù… userClinicId (Ù„Ù„Ù€ Doctor/Team Leader)
        const clinicId = selectedClinicId || userClinicId;

        if (clinicId === null) {
          setNewPatientQueueNumber('1');
          return;
        }

        try {
          // Get max queue number for this clinic (ÙÙ‚Ø· Ø§Ù„Ù…Ø±Ø¶Ù‰ ØºÙŠØ± Ø§Ù„Ù…Ø¤Ø±Ø´ÙÙŠÙ†)
          const { data: patientsData, error: patientsError } = await supabase
            .from('patients')
            .select('queue_number')
            .eq('clinic_id', clinicId)
            .is('archive_date', null) // ÙÙ‚Ø· Ø§Ù„Ù…Ø±Ø¶Ù‰ ØºÙŠØ± Ø§Ù„Ù…Ø¤Ø±Ø´ÙÙŠÙ†
            .order('queue_number', { ascending: false })
            .limit(1);

          if (patientsError) throw patientsError;

          if (patientsData && patientsData.length > 0) {
            const nextNumber = patientsData[0].queue_number + 1;
            console.log('Auto-setting next queue number:', nextNumber);
            setNewPatientQueueNumber(nextNumber.toString());
          } else {
            setNewPatientQueueNumber('1');
          }
        } catch (error) {
          setNewPatientQueueNumber('1');
        }
      }
    };

    fetchMaxQueueNumber();
  }, [showAddModal, selectedClinicId, userClinicId, isPatientEditMode]); // Ø¥Ø¶Ø§ÙØ© isPatientEditMode

  // Total patients = number of registered patients (actual cards in timeline)
  const totalPatients = displayedPatients.length;

  // Waiting patients only from displayed patients (timeline cards)
  const waitingPatients = displayedPatients.filter(p =>
    p.status !== 'complete' &&
    p.status !== 'na' &&
    (p.clinic === 'Clinic' || !p.clinic)
  ).length;

  // Treatment statistics: count only from statistics records (queue_number = -1) for permanent patients
  // and from regular patients (queue_number >= 1 && !permanent_patient_id)
  const treatmentStats = TREATMENTS.slice(1).reduce((acc, treatment) => {
    const treatmentName = typeof treatment === 'string' ? treatment : treatment.name;
    acc[treatmentName] = patients.filter(p =>
      p.treatment === treatmentName &&
      p.status === 'complete' &&
      (p.queue_number === -1 || !p.permanent_patient_id) // Statistics records OR regular patients
    ).length;
    return acc;
  }, {} as { [key: string]: number });
  
  // Filter patients based on filters
  let filteredPatients = displayedPatients;
  
  // Sort by queue number for gap detection
  filteredPatients = filteredPatients.sort((a, b) => a.queue_number - b.queue_number);
  
  // Add missing queue number cards ("ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯") - BEFORE any filters
  // Start from first real patient number, not from 1
  if (filteredPatients.length > 0) {
    const minQueueNumber = Math.min(...filteredPatients.map(p => p.queue_number));
    const maxQueueNumber = Math.max(...filteredPatients.map(p => p.queue_number));
    const existingNumbers = new Set(filteredPatients.map(p => p.queue_number));
    const missingPatients: Patient[] = [];
    
    // Fill gaps only BETWEEN real patients, not before first patient
    for (let i = minQueueNumber; i <= maxQueueNumber; i++) {
      if (!existingNumbers.has(i)) {
        missingPatients.push({
          id: `missing-${i}`,
          queue_number: i,
          name: 'ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯',
          age: 0,
          timestamp: new Date(),
          status: 'na',
          clinic: 'Clinic',
          condition: 'Condition',
          treatment: 'Treatment',
        });
      }
    }
    
    filteredPatients = [...filteredPatients, ...missingPatients]
      .sort((a, b) => a.queue_number - b.queue_number);
  }
  
  // Apply filters independently
  // 1. Waiting filter: hide Done patients only
  if (filterWaitingOnly) {
    filteredPatients = filteredPatients.filter(p => p.status !== 'complete');
  }
  
  // 2. NA filter: hide NA patients (including "ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯") when disabled
  if (!showNAPatients) {
    filteredPatients = filteredPatients.filter(p => p.status !== 'na');
  }

  // Show login if not authenticated
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Show My Timeline screen
  if (showMyTimeline && user.clinicId === null && user.virtualCenterId) {
    return (
      <MyTimelineScreen
        virtualCenterId={user.virtualCenterId}
        doctorName={user.name}
        onBack={() => setShowMyTimeline(false)}
      />
    );
  }

  // Show My Practice screen if user has no clinic assigned yet (clinic_id is null)
  if (user.clinicId === null && user.virtualCenterId) {
    return (
      <MyPracticeScreen
        doctorId={user.id}
        doctorName={user.name}
        virtualCenterId={user.virtualCenterId}
        onNavigateToTimeline={() => {
          setShowMyTimeline(true);
        }}
        onNavigateToStatistics={() => {
          setShowMyStatistics(true);
        }}
        onNavigateToSchedule={() => {
          setShowAppointments(true);
        }}
        onLogout={logout}
      />
    );
  }

  // Show Archive
  if (showArchiveScreen) {
    return (
      <ArchiveScreen
        onBack={() => setShowArchiveScreen(false)}
        selectedClinicId={selectedClinicId}
        userClinicId={userClinicId}
      />
    );
  }

  // Show My Statistics for viewing doctor (MUST be before DoctorsScreen)
  if (showMyStatistics && viewingDoctorData && showDoctorsScreen) {
    return (
      <MyStatisticsScreen
        onBack={() => {
          setShowMyStatistics(false);
          setViewingDoctorData(null);
        }}
        userClinicId={userClinicId}
        onTotalChange={(total) => setMyTotalTreatments(total)}
        doctorId={viewingDoctorData.id}
        doctorName={viewingDoctorData.name}
        clinicName={savedClinicName}
      />
    );
  }

  // Show My Statistics (for current user)
  if (showMyStatistics && !viewingDoctorData) {
    return (
      <MyStatisticsScreen
        onBack={() => setShowMyStatistics(false)}
        userClinicId={userClinicId}
        onTotalChange={(total) => setMyTotalTreatments(total)}
      />
    );
  }

  // Show Patient File
  if (showPatientFile) {
    return (
      <PatientProfileScreen
        onBack={async () => {
          // Reload dental data always (whether card is expanded or not)
          if (selectedPatientForProfile?.id) {
            // Find the timeline patient with this permanent_patient_id
            const timelinePatient = patients.find(p => p.permanent_patient_id === selectedPatientForProfile.id);
            if (timelinePatient) {
              // Force reload to get updated data
              await loadDentalData(selectedPatientForProfile.id, timelinePatient.id, true);
            }
          }
          setShowPatientFile(false);
          setSelectedPatientForProfile(null);
        }}
        onNavigateHome={async () => {
          // Reload dental data always (whether card is expanded or not)
          if (selectedPatientForProfile?.id) {
            const timelinePatient = patients.find(p => p.permanent_patient_id === selectedPatientForProfile.id);
            if (timelinePatient) {
              // Force reload to get updated data
              await loadDentalData(selectedPatientForProfile.id, timelinePatient.id, true);
            }
          }
          setShowPatientFile(false);
          setSelectedPatientForProfile(null);
        }}
        onNavigateAppointments={() => {
          setShowPatientFile(false);
          setSelectedPatientForProfile(null);
          setShowAppointments(true);
        }}
        onNavigateArchive={() => {
          setShowPatientFile(false);
          setSelectedPatientForProfile(null);
          setShowArchiveScreen(true);
        }}
        initialPatientId={selectedPatientForProfile?.id}
        initialFileNumber={selectedPatientForProfile?.fileNumber}
        initialOpenDentalChart={selectedPatientForProfile !== null}
        clinicId={selectedClinicId || userClinicId}
      />
    );
  }

  // Show Appointments
  if (showAppointments) {
    return (
      <ComingSoonScreen
        onBack={() => setShowAppointments(false)}
        title="Appointments"
      />
    );
  }

  // Show Dental Departments Screen
  if (showDentalDepartments && !showDoctorProfile && !showClinicDetails && selectedClinicId === null) {
    return (
      <DentalDepartmentsScreen
        clinicBadges={clinicBadges}
        onBadgesUpdate={setClinicBadges}
        savedClinicId={savedClinicId}
        savedClinicName={savedClinicName}
        onBack={() => {
          setShowDentalDepartments(false);
          setShowDoctorProfile(true);
          setNavigationStack(['profile']);
          // Ù…Ø³Ø­ savedClinicId Ø¹Ù†Ø¯ Ø§Ù„Ø±Ø¬ÙˆØ¹ Ù„Ù„Ù€ Profile
          setSavedClinicId(null);
          setSavedClinicName('');
        }}
        onOpenTimeline={(clinicId, clinicName) => {
          setSelectedClinicId(clinicId);
          setSelectedClinicName(clinicName);
          setShowDentalDepartments(false);
          setShowClinicDetails(false);
          setNavigationStack(['profile', 'departments', 'clinicDetails', 'timeline']);
        }}
      />
    );
  }

  // Show Doctor Profile when viewing another doctor (MUST be before Doctors Screen - View Stats)
  if (showDoctorProfile && viewingDoctorData !== null && !showDentalDepartments) {
    return (
      <DoctorProfileScreen
        doctorData={viewingDoctorData}
        onBack={() => {
          setShowDoctorProfile(false);
          setShowClinicDetails(true);
          setShowDoctorsScreen(true);
          setViewingDoctorData(null);
        }}
        onOpenTimeline={(clinicId, clinicName) => {
          setSelectedClinicId(clinicId);
          setSelectedClinicName(clinicName || 'Clinic');
          setShowDoctorProfile(false);
          setViewingDoctorData(null);
          setNavigationStack(['profile', 'departments', 'clinicDetails', 'timeline']);
        }}
        onOpenMyStatistics={() => {
          // Not applicable for viewing other doctors
        }}
        onOpenClinicSelection={() => {
          // Not applicable for viewing other doctors
        }}
        currentWaitingCount={0}
        currentTotalTreatments={0}
        myTotalTreatments={0}
      />
    );
  }

  // Show Doctors Screen - View Stats
  if (showDoctorsScreen && showClinicDetails && !showDoctorProfile && !showDentalDepartments && currentDoctorsScreen === 'viewStats' && viewingDoctorData) {
    return (
      <MyStatisticsScreen
        onBack={() => {
          setCurrentDoctorsScreen('list');
          setViewingDoctorData(null);
        }}
        userClinicId={userClinicId}
        onTotalChange={(total) => setMyTotalTreatments(total)}
        doctorId={viewingDoctorData.id}
        doctorName={viewingDoctorData.name}
        clinicName={savedClinicName}
      />
    );
  }

  // Show Doctors Screen - List
  if (showDoctorsScreen && showClinicDetails && !showDoctorProfile && !showDentalDepartments && currentDoctorsScreen === 'list') {
    return (
      <DoctorsScreen
        onBack={() => {
          setShowDoctorsScreen(false);
          setCurrentDoctorsScreen('list');
        }}
        clinicId={savedClinicId!}
        onOpenDoctorProfile={(doctor) => {
          // ÙØªØ­ DoctorProfileScreen Ù„Ù„Ø·Ø¨ÙŠØ¨ Ø§Ù„Ù…Ø®ØªØ§Ø±
          setViewingDoctorData({
            id: doctor.id,
            name: doctor.name,
            clinic_id: doctor.clinicId,
            role: doctor.role,
          });
          setShowDoctorProfile(true);
          setShowDoctorsScreen(false);
          setShowClinicDetails(false);
        }}
      />
    );
  }

  // Show Clinic Details Screen
  if (showClinicDetails && !showDoctorProfile && !showDentalDepartments && selectedClinicId === null && !showDoctorsScreen) {
    return (
      <ClinicDetailsScreen
        clinicName={savedClinicName}
        clinicId={savedClinicId}
        onBack={() => {
          setShowClinicDetails(false);
          setShowDentalDepartments(true);
          // Ù…Ø³Ø­ savedClinicId Ø¹Ù†Ø¯ Ø§Ù„Ø±Ø¬ÙˆØ¹
          setSavedClinicId(null);
          setSavedClinicName('');
          setNavigationStack(['profile', 'departments']);
        }}
        onDoctorsPress={() => {
          setShowDoctorsScreen(true);
          setCurrentDoctorsScreen('list');
        }}
        onTimelinePress={() => {
          // ÙØªØ­ Timeline Ø¨Ø§Ø³ØªØ®Ø¯Ø§Ù… savedClinicId
          if (savedClinicId !== null) {
            setSelectedClinicId(savedClinicId);
            setSelectedClinicName(savedClinicName);
            setShowClinicDetails(false);
            setNavigationStack(['profile', 'departments', 'clinicDetails', 'timeline']);
          }
        }}
      />
    );
  }

  // IMPORTANT: Check if user is a pending doctor (virtual practice)
  // Pending doctors have clinic_id = null and virtual_center_id
  if (user?.clinicId === null && user?.virtualCenterId) {
    // Show MyTimelineScreen for pending doctors (virtual practice)
    return (
      <MyTimelineScreen
        clinicId={user.virtualCenterId}
        clinicName={user.virtualCenterName || 'My Practice'}
        onBack={() => {
          setShowMyTimeline(false);
        }}
      />
    );
  }

  // Show Doctor Profile (My Profile) when showDoctorProfile = true
  if (showDoctorProfile && viewingDoctorData === null && !showDentalDepartments && !showClinicDetails && selectedClinicId === null) {
    return (
      <DoctorProfileScreen
        onBack={() => {}} // No back button
        onOpenTimeline={(clinicId, clinicName) => {
          setSelectedClinicId(clinicId);
          setSelectedClinicName(clinicName || 'Clinic');
          setShowDoctorProfile(false);
          setNavigationStack(['profile', 'timeline']);
        }}
        onOpenMyStatistics={() => {
          setShowMyStatistics(true);
        }}
        onOpenClinicSelection={() => {
          setShowDentalDepartments(true);
          setShowDoctorProfile(false);
          setNavigationStack(['profile', 'departments']);
        }}
        currentWaitingCount={0}
        currentTotalTreatments={0}
        myTotalTreatments={myTotalTreatments}
      />
    );
  }


  // Show Timeline (Main Screen) - Only if clinic is selected
  if (selectedClinicId !== null && !showDoctorProfile && !showDentalDepartments && !showClinicDetails) {
    // Main Timeline Screen (will be rendered below)
  } else if (!showDentalDepartments && !showClinicDetails && !showDoctorProfile) {
    // Default: Show Doctor Profile (My Profile)
    return (
      <DoctorProfileScreen
        onBack={() => {}} // No back button
        onOpenTimeline={(clinicId, clinicName) => {
          // Ø§Ø³ØªØ®Ø¯Ø§Ù… clinicId Ø§Ù„Ù…ÙÙ…Ø±Ø± Ù…Ù† DoctorProfileScreen (Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ù…Ø®ØªØ§Ø±)
          setSelectedClinicId(clinicId);
          setSelectedClinicName(clinicName || 'Clinic');
          setShowDoctorProfile(false);
          setShowDentalDepartments(false);
          setShowClinicDetails(false);
          setNavigationStack(['profile', 'departments', 'clinicDetails', 'timeline']);
        }}
        onOpenMyStatistics={() => {
          setShowMyStatistics(true);
        }}
        onOpenClinicSelection={() => {
          setShowDentalDepartments(true);
          setShowDoctorProfile(false);
          setNavigationStack(['profile', 'departments']);
        }}
        currentWaitingCount={selectedClinicId !== null ? waitingPatients : 0}
        currentTotalTreatments={selectedClinicId !== null ? Object.values(treatmentStats).reduce((a, b) => a + b, 0) : 0}
        myTotalTreatments={myTotalTreatments}
      />
    );
  }

  // Main Timeline Screen - Only shown when clinic is selected
  return (
    <MainQueueScreen
      timelineBlob1Anim={timelineBlob1Anim}
      timelineBlob2Anim={timelineBlob2Anim}
      timelineBlob3Anim={timelineBlob3Anim}
      timelineBlob4Anim={timelineBlob4Anim}
      timelineBlob5Anim={timelineBlob5Anim}
      timelineBlob6Anim={timelineBlob6Anim}
      headerTranslateY={headerTranslateY}
      queueMarginTop={queueMarginTop}
      headerElementsOpacity={headerElementsOpacity}
      headerElementsTranslate={headerElementsTranslate}
      isHeaderCollapsed={isHeaderCollapsed}
      toggleHeaderCollapse={toggleHeaderCollapse}
      selectedClinicName={selectedClinicName}
      selectedClinicId={selectedClinicId}
      user={user}
      totalPatients={totalPatients}
      waitingPatients={waitingPatients}
      treatmentStats={treatmentStats}
      showTreatmentStats={showTreatmentStats}
      setShowTreatmentStats={setShowTreatmentStats}
      showTimeline={showTimeline}
      setShowTimeline={setShowTimeline}
      showNAPatients={showNAPatients}
      setShowNAPatients={setShowNAPatients}
      filterWaitingOnly={filterWaitingOnly}
      setFilterWaitingOnly={setFilterWaitingOnly}
      expandedCardId={expandedCardId}
      setExpandedCardId={setExpandedCardId}
      expandedPermanentCardId={expandedPermanentCardId}
      filteredPatients={filteredPatients}
      patients={patients}
      animKey={animKey}
      setSavedClinicId={setSavedClinicId}
      setSavedClinicName={setSavedClinicName}
      setSelectedClinicId={setSelectedClinicId}
      setSelectedClinicName={setSelectedClinicName}
      showClinicDetails={showClinicDetails}
      setShowClinicDetails={setShowClinicDetails}
      showDentalDepartments={showDentalDepartments}
      setShowDentalDepartments={setShowDentalDepartments}
      setShowDoctorProfile={setShowDoctorProfile}
      setNavigationStack={setNavigationStack}
      setShowMenuForPatient={setShowMenuForPatient}
      handleViewNote={handleViewNote}
      openTimeline={openTimeline}
      setEditingPatientId={setEditingPatientId}
      setEditingField={setEditingField}
      setShowClinicDropdown={setShowClinicDropdown}
      setShowConditionDropdown={setShowConditionDropdown}
      setShowTreatmentDropdown={setShowTreatmentDropdown}
      handleViewDetails={handleViewDetails}
      cardTimelines={cardTimelines}
      showTimelineTab={showTimelineTab}
      handleToggleTab={handleToggleTab}
      setSelectedPatientForProfile={setSelectedPatientForProfile}
      setShowPatientFile={setShowPatientFile}
      togglePermanentCardExpansion={togglePermanentCardExpansion}
      activeDentalTab={activeDentalTab}
      setActiveDentalTab={setActiveDentalTab}
      dentalSummaries={dentalSummaries}
      loadingDentalData={loadingDentalData}
      patientReferrals={patientReferrals}
      setPatientReferrals={setPatientReferrals}
      patientToothNotes={patientToothNotes}
      setPatientToothNotes={setPatientToothNotes}
      lastScalingDates={lastScalingDates}
      setLastScalingDates={setLastScalingDates}
      patientConsents={patientConsents}
      togglePatientConsent={togglePatientConsent}
      setToothModalPatientId={setToothModalPatientId}
      setSelectedTooth={setSelectedTooth}
      setShowToothModal={setShowToothModal}
      getReferrals={getReferrals}
      getAllToothNotes={getAllToothNotes}
      onUpdateReferralStatus={(patientPermanentId, referralId, newStatus) => {
        setPatientReferrals(prev => ({
          ...prev,
          [patientPermanentId]: prev[patientPermanentId]?.map(r =>
            r.id === referralId ? { ...r, status: newStatus } : r
          ) || []
        }));
      }}
      showAddModal={showAddModal}
      setShowAddModal={setShowAddModal}
      setShowAppointments={setShowAppointments}
      setShowArchiveScreen={setShowArchiveScreen}
      isPatientEditMode={isPatientEditMode}
      setIsPatientEditMode={setIsPatientEditMode}
      isModalExpanded={isModalExpanded}
      setIsModalExpanded={setIsModalExpanded}
      patientMode={patientMode}
      setPatientMode={setPatientMode}
      newPatientName={newPatientName}
      setNewPatientName={setNewPatientName}
      newPatientFileNumber={newPatientFileNumber}
      setNewPatientFileNumber={setNewPatientFileNumber}
      newPatientQueueNumber={newPatientQueueNumber}
      setNewPatientQueueNumber={setNewPatientQueueNumber}
      newPatientCondition={newPatientCondition}
      setNewPatientCondition={setNewPatientCondition}
      newPatientTreatment={newPatientTreatment}
      setNewPatientTreatment={setNewPatientTreatment}
      isElderly={isElderly}
      setIsElderly={setIsElderly}
      newPatientNote={newPatientNote}
      setNewPatientNote={setNewPatientNote}
      permanentPatientSearchResults={permanentPatientSearchResults}
      setPermanentPatientSearchResults={setPermanentPatientSearchResults}
      selectedPermanentPatientId={selectedPermanentPatientId}
      setSelectedPermanentPatientId={setSelectedPermanentPatientId}
      showPatientSuggestions={showPatientSuggestions}
      setShowPatientSuggestions={setShowPatientSuggestions}
      showFileNumberSuggestions={showFileNumberSuggestions}
      setShowFileNumberSuggestions={setShowFileNumberSuggestions}
      fileNumberSearchResults={fileNumberSearchResults}
      setFileNumberSearchResults={setFileNumberSearchResults}
      modalEditingPatientId={modalEditingPatientId}
      setModalEditingPatientId={setModalEditingPatientId}
      handleAddPatient={handleAddPatient}
      handleFileNumberSearch={handleFileNumberSearch}
      handlePatientNameSearch={handlePatientNameSearch}
      showMenuForPatient={showMenuForPatient}
      handleMenuAction={handleMenuAction}
      showNoteModal={showNoteModal}
      setShowNoteModal={setShowNoteModal}
      currentNote={currentNote}
      setCurrentNote={setCurrentNote}
      handleSaveNote={handleSaveNote}
      showViewNoteModal={showViewNoteModal}
      setShowViewNoteModal={setShowViewNoteModal}
      viewNoteContent={viewNoteContent}
      setViewNoteContent={setViewNoteContent}
      notePatientId={notePatientId}
      handleDeleteNote={handleDeleteNote}
      showConvertModal={showConvertModal}
      setShowConvertModal={setShowConvertModal}
      convertFileNumber={convertFileNumber}
      setConvertFileNumber={setConvertFileNumber}
      convertToPermanentPatient={convertToPermanentPatient}
      showTreatmentDoneModal={showTreatmentDoneModal}
      setShowTreatmentDoneModal={setShowTreatmentDoneModal}
      clinicDoctors={clinicDoctors}
      doctorSearchQuery={doctorSearchQuery}
      setDoctorSearchQuery={setDoctorSearchQuery}
      handleTreatmentDoneByDoctor={handleTreatmentDoneByDoctor}
      showClinicDropdown={showClinicDropdown}
      showConditionDropdown={showConditionDropdown}
      showTreatmentDropdown={showTreatmentDropdown}
      editingPatientId={editingPatientId}
      handleUpdateField={handleUpdateField}
      showTimelineModal={showTimelineModal}
      setShowTimelineModal={setShowTimelineModal}
      selectedPatient={selectedPatient}
      timeline={timeline}
      treatmentNote={treatmentNote}
      setTreatmentNote={setTreatmentNote}
      markTreatmentDone={markTreatmentDone}
      showToothModal={showToothModal}
      toothModalPatientId={toothModalPatientId}
      selectedTooth={selectedTooth}
      currentDoctorName={user?.name || user?.email || 'Unknown'}
      setDentalSummaries={setDentalSummaries}
    />
  );
}
