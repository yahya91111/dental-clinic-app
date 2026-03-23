// v1.0.6 - Fixed setToothEditingPatientId
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
import { shadows } from './theme';
import LoginScreen from './LoginScreen';
import DoctorProfileScreen from './DoctorProfileScreen';
import ArchiveScreen from './ArchiveScreen';
import MyStatisticsScreen from './MyStatisticsScreen';
import DentalDepartmentsScreen from './DentalDepartmentsScreen';
import ClinicDetailsScreen from './ClinicDetailsScreen';
import DoctorsScreen from './DoctorsScreen';
import ComingSoonScreen from './ComingSoonScreen';
import MyPracticeScreen from './MyPracticeScreen';
import MyTimelineScreen from './MyTimelineScreen';
import PatientProfileScreen from './PatientProfileScreen';
import ToothDetailsModal from './components/ToothDetailsModal';
import { ExpandedPatientHeader } from './components/ExpandedPatientHeader';
import { AuthProvider, useAuth } from './AuthContext';
import { startAutoArchive, stopAutoArchive, testArchiveNow, archiveEventEmitter } from './autoArchiveService';
import {
  searchPermanentPatientsByFileNumber,
  searchPermanentPatients,
  getCompleteDentalChart,
  saveToothSurfaceCondition,
  createEditingRecord,
  createToothNote,
  createReferral,
  getEditingRecords,
  getPlanningRecords,
  getAllToothNotes,
  getReferrals,
  updateReferralStatus,
  getScalingRecords,
  createScalingRecord,
  updatePermanentPatientConsent,
  getPermanentPatientById,
  createPermanentPatient
} from './lib/database';
import { ToothData, ToothNumber, ToothCondition, DentalSummary, ToothSurface, Referral, ToothNote } from './types';
import { getToothQuadrant, getToothPositionNumber, getToothName, treatmentOptions, detailsOptions } from './toothHelpers';
import { supabase, CLINICS, CONDITIONS, TREATMENTS, CONDITION_COLORS, TREATMENT_COLORS, REFERRAL_OPTIONS, Patient, TimelineEvent, getArabicClinicName, arabicToEnglish } from './screens/MainQueue/constants';
import { styles } from './screens/MainQueue/styles';
import { CircularBadge, AnimatedPatientCard, PatientCard } from './screens/MainQueue/PatientCard';
import { generateDentalSummary, calculateDentalChartTreatments, calculateGivenReferrals, checkScalingDoneToday, getTreatmentFromBadge } from './screens/MainQueue/dentalHelpers';
import { AppModals } from './screens/MainQueue/AppModals';
import { MainQueueScreen } from './screens/MainQueue/MainQueueScreen';
import { usePatientData } from './screens/MainQueue/usePatientData';


export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </AuthProvider>
  );
}

function AppContent() {
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

  // Search permanent patient by file number
  const handleFileNumberSearch = async (fileNumber: string) => {
    if (fileNumber.length === 4 && user?.clinicId) {
      try {
        const { data, error } = await searchPermanentPatientsByFileNumber(
          fileNumber,
          user.clinicId.toString()
        );

        if (error) {
          console.error('Error searching permanent patient:', error);
          setPermanentPatientSearchResults([]);
          return;
        }

        if (data && data.length > 0) {
          console.log('ðŸ” Search results:', data);
          console.log('ðŸ“ First patient name:', data[0].name);
          console.log('ðŸ“ First patient name type:', typeof data[0].name);

          setPermanentPatientSearchResults(data);
          setShowPatientSuggestions(true);

          // Auto-fill name if only one result
          if (data.length === 1) {
            setNewPatientName(data[0].name);
            setSelectedPermanentPatientId(data[0].id);
          }
        } else {
          setPermanentPatientSearchResults([]);
          setShowPatientSuggestions(false);
        }
      } catch (error) {
        console.error('Search error:', error);
        setPermanentPatientSearchResults([]);
      }
    } else {
      // Clear search if file number is incomplete
      setPermanentPatientSearchResults([]);
      setShowPatientSuggestions(false);
      setSelectedPermanentPatientId(null);
    }
  };

  const handlePatientNameSearch = async (name: string) => {
    // Only search if name has at least 3 characters
    if (name.length >= 3 && user?.clinicId) {
      try {
        const { data, error } = await searchPermanentPatients(
          name,
          user.clinicId.toString()
        );

        if (error) {
          console.error('Error searching by name:', error);
          setFileNumberSearchResults([]);
          return;
        }

        if (data && data.length > 0) {
          // Filter to only show patients with matching names
          const matchingPatients = data.filter(patient =>
            patient.name.toLowerCase().includes(name.toLowerCase())
          );

          if (matchingPatients.length > 0) {
            setFileNumberSearchResults(matchingPatients);
            setShowFileNumberSuggestions(true);

            // Auto-fill file number if only one result
            if (matchingPatients.length === 1) {
              const englishFileNumber = arabicToEnglish(matchingPatients[0].file_number || '');
              setNewPatientFileNumber(englishFileNumber);
              setSelectedPermanentPatientId(matchingPatients[0].id);
            }
          } else {
            // âœ… No results found - clear file number and hide suggestions
            setFileNumberSearchResults([]);
            setShowFileNumberSuggestions(false);
            setNewPatientFileNumber(''); // âœ… Clear file number when no match
            setSelectedPermanentPatientId(null);
          }
        } else {
          // âœ… No data - clear file number
          setFileNumberSearchResults([]);
          setShowFileNumberSuggestions(false);
          setNewPatientFileNumber('');
          setSelectedPermanentPatientId(null);
        }
      } catch (error) {
        console.error('Name search error:', error);
        setFileNumberSearchResults([]);
        setNewPatientFileNumber(''); // âœ… Clear on error
        setSelectedPermanentPatientId(null);
      }
    } else {
      // âœ… Clear search if name is too short
      setFileNumberSearchResults([]);
      setShowFileNumberSuggestions(false);
      // âœ… Clear file number when name becomes too short (user is deleting)
      if (name.length < 3) {
        setNewPatientFileNumber('');
        setSelectedPermanentPatientId(null);
      }
    }
  };


  const handleAddPatient = async () => {
    if (!newPatientName.trim()) {
      Alert.alert('Error', 'Please enter patient name');
      return;
    }

    // Validate file number for new-profile mode
    if (patientMode === 'new-profile' && !newPatientFileNumber.trim()) {
      Alert.alert('Error', 'Please enter file number for new profile');
      return;
    }

    try {

      const englishQueueNumber = arabicToEnglish(newPatientQueueNumber);
      const queueNumber = parseInt(englishQueueNumber);

      if (isNaN(queueNumber) || queueNumber < 1) {
        Alert.alert('Error', 'Please enter valid number');
        return;
      }

      // Convert file number Arabic numerals to English
      const englishFileNumber = newPatientFileNumber.trim()
        ? arabicToEnglish(newPatientFileNumber.trim())
        : null;

      // ========== EDIT MODE: Update existing patient ==========
      if (isPatientEditMode && modalEditingPatientId) {
        let permanentPatientId = selectedPermanentPatientId;

        // If in 'new-profile' mode while editing, create/find permanent patient
        if (patientMode === 'new-profile' && englishFileNumber) {
          console.log('Converting to permanent patient:', {
            fileNumber: englishFileNumber,
            patientName: newPatientName
          });

          // âœ… Ø§Ø¨Ø­Ø« Ø¹Ù† permanent patient Ø¨Ù†ÙØ³ Ø±Ù‚Ù… Ø§Ù„Ù…Ù„Ù (Ù‚Ø¯ ÙŠÙƒÙˆÙ† Ù‡Ù†Ø§Ùƒ Ø¹Ø¯Ø© Ù…Ø±Ø¶Ù‰ Ø¨Ù†ÙØ³ Ø§Ù„Ù…Ù„Ù)
          const searchResult = await searchPermanentPatientsByFileNumber(
            englishFileNumber,
            userClinicId || selectedClinicId
          );

          if (searchResult.data && searchResult.data.length > 0) {
            // ÙˆÙØ¬Ø¯ Ù…Ù„Ù Ø£Ùˆ Ø¹Ø¯Ø© Ù…Ù„ÙØ§Øª Ø¨Ù†ÙØ³ Ø§Ù„Ø±Ù‚Ù… - Ø§Ø¨Ø­Ø« Ø¹Ù† ØªØ·Ø§Ø¨Ù‚ ØªØ§Ù… Ù…Ø¹ Ø§Ù„Ø§Ø³Ù…
            const exactMatch = searchResult.data.find(p =>
              p.name.toLowerCase().trim() === newPatientName.toLowerCase().trim()
            );

            if (exactMatch) {
              // âŒ DUPLICATE - same file number + same name already exists
              console.log('âŒ Duplicate found in Edit Mode - cannot convert to permanent');
              Alert.alert(
                'Duplicate Patient',
                `Patient "${newPatientName}" is already registered with file number ${englishFileNumber}.\n\nCannot convert this patient to permanent. Please use a different name or file number.`,
                [{ text: 'OK' }]
              );
              return; // âœ… Stop execution - prevent duplicate
            } else {
              // âœ… Ø±Ù‚Ù… Ø§Ù„Ù…Ù„Ù Ù…ÙˆØ¬ÙˆØ¯ Ù„ÙƒÙ† Ø§Ù„Ø§Ø³Ù… Ù…Ø®ØªÙ„Ù = Ù…Ø±ÙŠØ¶ Ø¬Ø¯ÙŠØ¯ ÙÙŠ Ù…Ù„Ù Ø¹Ø§Ø¦Ù„ÙŠ Ù…Ø´ØªØ±Ùƒ
              console.log('âœ… File number exists, different name - creating new permanent patient (family file)');
              const createResult = await createPermanentPatient(
                englishFileNumber,
                newPatientName,
                userClinicId || selectedClinicId || ''
              );

              if (createResult.error || !createResult.data) {
                console.error('Failed to create permanent patient:', createResult.error);
                Alert.alert('Ø®Ø·Ø£', 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ù…Ù„Ù Ø§Ù„Ù…Ø±ÙŠØ¶ Ø§Ù„Ø¯Ø§Ø¦Ù…');
                return;
              }

              permanentPatientId = createResult.data.id;
              console.log('âœ… Created new permanent patient in family file:', createResult.data);
            }
          } else {
            // Create new permanent patient - first time using this file number
            console.log('Creating new permanent patient - new file number');
            const createResult = await createPermanentPatient(
              englishFileNumber,
              newPatientName,
              userClinicId || selectedClinicId || ''
            );

            if (createResult.error || !createResult.data) {
              console.error('Failed to create permanent patient:', createResult.error);
              Alert.alert('Ø®Ø·Ø£', 'ÙØ´Ù„ Ø¥Ù†Ø´Ø§Ø¡ Ù…Ù„Ù Ø§Ù„Ù…Ø±ÙŠØ¶ Ø§Ù„Ø¯Ø§Ø¦Ù…');
              return;
            }

            console.log('Created permanent patient:', createResult.data);
            permanentPatientId = createResult.data.id;
          }
        }

        // Update patient record
        const updateData: any = {
          name: newPatientName,
          queue_number: queueNumber,
          is_elderly: isElderly,
          status: isElderly ? 'elderly' : 'normal',
          note: newPatientNote.trim() || null,
          condition: newPatientCondition,
        };

        // If converting to permanent, update these fields
        if (patientMode === 'new-profile' && permanentPatientId) {
          updateData.file_number = englishFileNumber;
          updateData.permanent_patient_id = permanentPatientId;
          updateData.patient_type = 'permanent';
          console.log('Updating patient with permanent data:', {
            file_number: englishFileNumber,
            permanent_patient_id: permanentPatientId,
            patient_type: 'permanent'
          });
        }

        console.log('Final updateData before database update:', updateData);

        const { error } = await supabase
          .from('patients')
          .update(updateData)
          .eq('id', modalEditingPatientId);

        if (error) {
          console.error('Database update error:', error);
          throw error;
        }

        console.log('Database update successful');

        // If converted to permanent, load dental data
        if (patientMode === 'new-profile' && permanentPatientId) {
          console.log('Loading dental data for converted patient...');
          await loadDentalData(permanentPatientId, modalEditingPatientId, true);
        }

        // Update local state immediately
        setPatients(prev => prev.map(p =>
          p.id === modalEditingPatientId
            ? {
                ...p,
                ...updateData,
              }
            : p
        ));

        // Trigger animation refresh
        setAnimKey(prev => prev + 1);

        await loadPatients();
        setShowAddModal(false);

        // Reset all form fields
        setNewPatientName('');
        setNewPatientFileNumber('');
        setNewPatientQueueNumber('');
        setNewPatientCondition('Condition');
        setNewPatientTreatment('Treatment');
        setIsElderly(false);
        setNewPatientNote('');
        setShowConditionDropdown(false);
        setShowTreatmentDropdown(false);
        setPermanentPatientSearchResults([]);
        setFileNumberSearchResults([]);
        setSelectedPermanentPatientId(null);
        setShowPatientSuggestions(false);
        setShowFileNumberSuggestions(false);
        setIsModalExpanded(false);
        setPatientMode('search');

        // Reset edit mode
        setIsPatientEditMode(false);
        setModalEditingPatientId(null);

        Alert.alert('Success', patientMode === 'new-profile' && permanentPatientId
          ? 'Patient converted to permanent successfully'
          : 'Patient updated successfully');
        return;
      }

      // ========== ADD MODE: Create new patient ==========
      let permanentPatientId = selectedPermanentPatientId;

      // If in 'new-profile' mode, check for duplicates first
      if (patientMode === 'new-profile' && englishFileNumber) {
        console.log('Creating permanent patient:', {
          fileNumber: englishFileNumber,
          patientName: newPatientName
        });

        // âœ… Search for existing permanent patient with same file number
        const searchResult = await searchPermanentPatientsByFileNumber(
          englishFileNumber,
          userClinicId || selectedClinicId
        );

        if (searchResult.data && searchResult.data.length > 0) {
          // Found file(s) with same number - check for exact name match
          const exactMatch = searchResult.data.find(p =>
            p.name.toLowerCase().trim() === newPatientName.toLowerCase().trim()
          );

          if (exactMatch) {
            // âŒ DUPLICATE - same file number + same name
            Alert.alert(
              'Duplicate Patient',
              `Patient "${newPatientName}" is already registered with file number ${englishFileNumber}.\n\nPlease use a different name or file number.`,
              [{ text: 'OK' }]
            );
            return; // âœ… Stop execution
          } else {
            // âœ… Same file number, different name - create new (family file)
            console.log('âœ… File number exists, different name - creating new permanent patient (family file)');
            const createResult = await createPermanentPatient(
              englishFileNumber,
              newPatientName,
              userClinicId || selectedClinicId || ''
            );

            if (createResult.error || !createResult.data) {
              console.error('Failed to create permanent patient:', createResult.error);
              Alert.alert('Error', 'Failed to create permanent patient profile');
              return;
            }

            permanentPatientId = createResult.data.id;
            console.log('âœ… Created new permanent patient in family file:', createResult.data);
          }
        } else {
          // âœ… New file number - create new permanent patient
          console.log('Creating new permanent patient - new file number');
          const createResult = await createPermanentPatient(
            englishFileNumber,
            newPatientName,
            userClinicId || selectedClinicId || ''
          );

          if (createResult.error || !createResult.data) {
            console.error('Failed to create permanent patient:', createResult.error);
            Alert.alert('Error', 'Failed to create permanent patient profile');
            return;
          }

          console.log('Created permanent patient:', createResult.data);
          permanentPatientId = createResult.data.id;
        }
      }

      const now = new Date();

      const { data, error } = await supabase
        .from('patients')
        .insert([
          {
            name: newPatientName,
            queue_number: queueNumber,
            status: isElderly ? 'elderly' : 'normal',
            is_elderly: isElderly,
            note: newPatientNote.trim() || null,
            clinic: 'Clinic',
            clinic_id: selectedClinicId || userClinicId,
            condition: newPatientCondition,
            treatment: newPatientTreatment,
            // Permanent patient linking (Migration completed )
            file_number: englishFileNumber,
            permanent_patient_id: permanentPatientId || null,
            patient_type: permanentPatientId ? 'permanent' : 'walk-in',
            // Timeline fields
            registered_at: now.toISOString(),
          },
        ])
        .select();

      if (error) throw error;

      await loadPatients();
      setShowAddModal(false);
      setNewPatientName('');
      setNewPatientFileNumber('');
      setNewPatientQueueNumber('');
      setNewPatientCondition('Condition');
      setNewPatientTreatment('Treatment');
      setIsElderly(false);
      setNewPatientNote('');
      setShowConditionDropdown(false);
      setShowTreatmentDropdown(false);
      // Clear search states
      setPermanentPatientSearchResults([]);
      setFileNumberSearchResults([]);
      setSelectedPermanentPatientId(null);
      setShowPatientSuggestions(false);
      setShowFileNumberSuggestions(false);
      setIsModalExpanded(false);
      setPatientMode('search');
      Alert.alert('Success', 'Patient added successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Unknown error occurred');
    }
  };

  // Ø¯Ø§Ù„Ø© Ø§Ù„Ø£Ø±Ø´ÙØ© - Ù†Ù‚Ù„ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ø±Ø¶Ù‰ Ù„Ù„Ø£Ø±Ø´ÙŠÙ
  const handleArchive = async () => {
    try {
      const clinicId = selectedClinicId || userClinicId;
      
      if (clinicId === null) {
        Alert.alert('Error', 'Please select a clinic first');
        return;
      }

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // ØªØ­Ø¯ÙŠØ« archive_date Ù„Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ø±Ø¶Ù‰ ÙÙŠ Ø§Ù„Ù…Ø±ÙƒØ² Ø§Ù„Ø­Ø§Ù„ÙŠ
      const { data, error } = await supabase
        .from('patients')
        .update({ 
          archive_date: today,
          status: 'complete' // ØªØºÙŠÙŠØ± Ø§Ù„Ø­Ø§Ù„Ø© Ø¥Ù„Ù‰ complete
        })
        .eq('clinic_id', clinicId) // Ø¹Ø²Ù„ Ø­Ø³Ø¨ Ø§Ù„Ù…Ø±ÙƒØ²
        .is('archive_date', null); // ÙÙ‚Ø· Ø§Ù„Ù…Ø±Ø¶Ù‰ ØºÙŠØ± Ø§Ù„Ù…Ø¤Ø±Ø´ÙÙŠÙ†

      if (error) throw error;

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø±Ø¶Ù‰ (Ø³ÙŠÙƒÙˆÙ† ÙØ§Ø±ØºØ§Ù‹)
      await loadPatients();
      
      Alert.alert('Success', `All patients archived for clinic ${selectedClinicName} successfully`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Archive failed');
    }
  };

  const handleMenuAction = async (patientId: string, action: string) => {
    setShowMenuForPatient(null);

    switch (action) {
      case 'edit':
        const editPatient = patients.find(p => p.id === patientId);
        if (editPatient) {
          console.log('Editing patient:', editPatient);
          console.log('Queue number:', editPatient.queue_number, 'Type:', typeof editPatient.queue_number);

          // Load patient data into modal fields
          setNewPatientName(editPatient.name);
          setNewPatientFileNumber(editPatient.file_number || '');
          const queueNumberString = editPatient.queue_number?.toString() || '';
          console.log('Setting queue number to:', queueNumberString);
          setNewPatientQueueNumber(queueNumberString);
          setNewPatientCondition(editPatient.condition || 'Condition');
          setIsElderly(editPatient.isElderly || false);
          setNewPatientNote(editPatient.note || '');

          // Set edit mode
          setIsPatientEditMode(true);
          setModalEditingPatientId(patientId);

          console.log('Edit mode set. Queue number should be:', queueNumberString);

          // Determine patient mode based on file_number
          if (!editPatient.file_number) {
            setPatientMode('walk-in');
          } else {
            setPatientMode('search');
            setSelectedPermanentPatientId(editPatient.permanent_patient_id || null);
          }

          // Open modal
          setShowAddModal(true);
          setIsModalExpanded(false);
        }
        break;
      case 'note':
        const patient = patients.find(p => p.id === patientId);
        setNotePatientId(patientId);
        setCurrentNote(patient?.note || '');
        setShowNoteModal(true);
        break;
      case 'na':
        try {
          const patient = patients.find(p => p.id === patientId);
          const newStatus = patient?.status === 'na' ? 'normal' : 'na';
          await supabase
            .from('patients')
            .update({ status: newStatus })
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'elderly':
        try {
          const patient = patients.find(p => p.id === patientId);
          const newElderly = !patient?.isElderly;
          await supabase
            .from('patients')
            .update({ is_elderly: newElderly })
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'special_needs':
        try {
          const patient = patients.find(p => p.id === patientId);
          const newSpecialNeeds = !patient?.isSpecialNeeds;
          await supabase
            .from('patients')
            .update({ is_special_needs: newSpecialNeeds })
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'complete':
        // Check if patient is already completed
        const targetPatient = patients.find(p => p.id === patientId);

        if (targetPatient?.status === 'complete') {
          // Undo treatment done - revert to normal status
          try {
            await supabase
              .from('patients')
              .update({
                status: 'normal',
                completed_at: null,
                doctor_name: null,
                assigned_by_doctor_name: null
              })
              .eq('id', patientId);

            await loadPatients();
            Alert.alert('Done', 'Treatment unmarked as complete');
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        } else {
          // Open treatment done modal
          setTreatmentDonePatientId(patientId);
          loadClinicDoctors();
          setShowTreatmentDoneModal(true);
        }
        break;
      case 'delete':
        try {
          await supabase
            .from('patients')
            .delete()
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'new_profile':
        setConvertPatientId(patientId);
        setConvertFileNumber('');
        setShowConvertModal(true);
        break;
    }
  };

  const handleSaveNote = async () => {
    if (notePatientId) {
      try {
        await supabase
          .from('patients')
          .update({ note: currentNote })
          .eq('id', notePatientId);

        // Update patients array locally immediately
        setPatients(prev => prev.map(p =>
          p.id === notePatientId ? { ...p, note: currentNote } : p
        ));

        await loadPatients();
      } catch (error: any) {
        Alert.alert('Error', error.message);
      }
    }
    setShowNoteModal(false);
    setCurrentNote('');
    setNotePatientId(null);
  };

  const handleViewNote = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    if (patient?.note) {
      setNotePatientId(patientId);
      setViewNoteContent(patient.note);  // Use separate state for viewing
      setShowViewNoteModal(true);
    }
  };

  // Load doctors from same clinic
  const loadClinicDoctors = async () => {
    try {
      let clinicId = selectedClinicId || userClinicId;

      // If clinicId is not available, fetch it directly from doctors table
      if (clinicId === null && user?.id) {
        const { data: userData, error: userError } = await supabase
          .from('doctors')
          .select('clinic_id')
          .eq('id', user.id)
          .single();

        if (userError || !userData?.clinic_id) {
          Alert.alert('Error', 'Cannot find clinic ID');
          return;
        }

        clinicId = userData.clinic_id;
      }

      if (clinicId === null) {
        Alert.alert('Error', 'Cannot find clinic ID');
        return;
      }

      const { data, error } = await supabase
        .from('doctors')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .neq('id', user?.id || ''); // Exclude current user

      if (error) {
        Alert.alert('Error', 'Failed to load doctors: ' + error.message);
        return;
      }

      if (data && data.length > 0) {
        setClinicDoctors(data);
      } else {
        setClinicDoctors([]);
        // Only show alert if query succeeded but no doctors found
        if (data) {
          Alert.alert('Warning', 'No other doctors in clinic ' + clinicId);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load doctors');
    }
  };

  /**
   * Check if there are any given referrals
   * Returns 1 if at least one referral is given, 0 otherwise
   */
  /**
   * Check if scaling was done today
   * Returns 1 if scaling done today, 0 otherwise
   */

  /**
   * Get treatment from badge (for treatments like Medication, Cementation, Suture Removal)
   * These are counted from the patient's treatment field
   */
  // Handle treatment done by selected doctor
  const handleTreatmentDoneByDoctor = async (doctorId: string | null, doctorName: string | null) => {
    if (!treatmentDonePatientId) return;

    try {
      // Find the patient in the list
      const patient = patients.find(p => p.id === treatmentDonePatientId);

      if (!patient) {
        Alert.alert('Error', 'Patient not found');
        return;
      }

      const finalDoctorId = doctorId || user?.id;
      const finalDoctorName = doctorName || user?.name || user?.email || 'Unknown';
      const assignedByDoctorName = (doctorId && doctorName) ? (user?.name || user?.email || 'Unknown') : null;
      const today = new Date().toISOString().split('T')[0];
      const completedAt = new Date().toISOString();

      // Check if this is a permanent patient
      if (patient.permanent_patient_id) {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PERMANENT PATIENT - Create separate records for each treatment
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        const treatmentsToInsert: any[] = [];

        // 1. Calculate treatments from Dental Chart (editing_records)
        const dentalChartTreatments = await calculateDentalChartTreatments(patient.permanent_patient_id);

        for (const [treatment, count] of Object.entries(dentalChartTreatments)) {
          for (let i = 0; i < count; i++) {
            treatmentsToInsert.push({
              permanent_patient_id: patient.permanent_patient_id,
              name: patient.name,
              file_number: patient.file_number,
              treatment: treatment,
              condition: patient.condition || 'Permanent Patient', // âœ… Ø§Ø³ØªØ®Ø¯Ø§Ù… condition Ø§Ù„Ø£ØµÙ„ÙŠ
              clinic: patient.clinic || 'Clinic',
              status: 'complete',
              completed_at: completedAt,
              archive_date: null, // Will be archived at 12:59 AM
              doctor_id: finalDoctorId,
              doctor_name: finalDoctorName,
              assigned_by_doctor_name: assignedByDoctorName,
              clinic_id: patient.clinic_id,
              queue_number: -1, // Special marker: statistics record (hidden from timeline)
              patient_type: 'permanent',
            });
          }
        }

        // 2. Check for Referrals (only count once if at least one is given)
        const referralCount = await calculateGivenReferrals(patient.permanent_patient_id);
        if (referralCount > 0) {
          treatmentsToInsert.push({
            permanent_patient_id: patient.permanent_patient_id,
            name: patient.name,
            file_number: patient.file_number,
            treatment: 'Referral',
            condition: patient.condition || 'Permanent Patient', // âœ… Ø§Ø³ØªØ®Ø¯Ø§Ù… condition Ø§Ù„Ø£ØµÙ„ÙŠ
            clinic: patient.clinic || 'Clinic',
            status: 'complete',
            completed_at: completedAt,
            archive_date: null, // Will be archived at 12:59 AM
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
            clinic_id: patient.clinic_id,
            queue_number: -1, // Special marker: statistics record (hidden from timeline)
            patient_type: 'permanent',
          });
        }

        // 3. Check for Scaling (only if done today)
        const scalingCount = await checkScalingDoneToday(lastScalingDates[patient.id]);
        if (scalingCount > 0) {
          treatmentsToInsert.push({
            permanent_patient_id: patient.permanent_patient_id,
            name: patient.name,
            file_number: patient.file_number,
            treatment: 'Scaling',
            condition: patient.condition || 'Permanent Patient', // âœ… Ø§Ø³ØªØ®Ø¯Ø§Ù… condition Ø§Ù„Ø£ØµÙ„ÙŠ
            clinic: patient.clinic || 'Clinic',
            status: 'complete',
            completed_at: completedAt,
            archive_date: null, // Will be archived at 12:59 AM
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
            clinic_id: patient.clinic_id,
            queue_number: -1, // Special marker: statistics record (hidden from timeline)
            patient_type: 'permanent',
          });
        }

        // 4. Check for treatments from badge (Medication, Cementation, Suture Removal)
        const badgeTreatment = getTreatmentFromBadge(patient);
        if (badgeTreatment) {
          treatmentsToInsert.push({
            permanent_patient_id: patient.permanent_patient_id,
            name: patient.name,
            file_number: patient.file_number,
            treatment: badgeTreatment,
            condition: patient.condition || 'Permanent Patient', // âœ… Ø§Ø³ØªØ®Ø¯Ø§Ù… condition Ø§Ù„Ø£ØµÙ„ÙŠ
            clinic: patient.clinic || 'Clinic',
            status: 'complete',
            completed_at: completedAt,
            archive_date: null, // Will be archived at 12:59 AM
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
            clinic_id: patient.clinic_id,
            queue_number: -1, // Special marker: statistics record (hidden from timeline)
            patient_type: 'permanent',
          });
        }

        // Get existing statistics records for this permanent patient today
        const { data: existingStats, error: fetchStatsError } = await supabase
          .from('patients')
          .select('id, treatment')
          .eq('permanent_patient_id', patient.permanent_patient_id)
          .eq('queue_number', -1) // Statistics records only
          .is('archive_date', null); // Only today's records (not archived)

        if (fetchStatsError) throw fetchStatsError;

        // Count existing treatments
        const existingTreatmentCounts: { [key: string]: number } = {};
        (existingStats || []).forEach((stat: any) => {
          const treatment = stat.treatment;
          existingTreatmentCounts[treatment] = (existingTreatmentCounts[treatment] || 0) + 1;
        });

        // Count desired treatments
        const desiredTreatmentCounts: { [key: string]: number } = {};
        treatmentsToInsert.forEach(t => {
          const treatment = t.treatment;
          desiredTreatmentCounts[treatment] = (desiredTreatmentCounts[treatment] || 0) + 1;
        });

        // Calculate what to add and what to remove
        const treatmentsToAdd: any[] = [];
        const treatmentIdsToDelete: string[] = [];

        // Check what to add (if desired > existing)
        for (const [treatment, desiredCount] of Object.entries(desiredTreatmentCounts)) {
          const existingCount = existingTreatmentCounts[treatment] || 0;
          const toAdd = desiredCount - existingCount;

          if (toAdd > 0) {
            // Add the missing treatments
            for (let i = 0; i < toAdd; i++) {
              const treatmentData = treatmentsToInsert.find(t => t.treatment === treatment);
              if (treatmentData) {
                treatmentsToAdd.push(treatmentData);
              }
            }
          }
        }

        // Check what to remove (if existing > desired)
        for (const [treatment, existingCount] of Object.entries(existingTreatmentCounts)) {
          const desiredCount = desiredTreatmentCounts[treatment] || 0;
          const toRemove = existingCount - desiredCount;

          if (toRemove > 0) {
            // Find records to delete
            const recordsToDelete = (existingStats || [])
              .filter((stat: any) => stat.treatment === treatment)
              .slice(0, toRemove)
              .map((stat: any) => stat.id);

            treatmentIdsToDelete.push(...recordsToDelete);
          }
        }

        // Delete excess treatments
        if (treatmentIdsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('patients')
            .delete()
            .in('id', treatmentIdsToDelete);

          if (deleteError) throw deleteError;
        }

        // Insert new treatments
        if (treatmentsToAdd.length > 0) {
          const { error: insertError } = await supabase
            .from('patients')
            .insert(treatmentsToAdd);

          if (insertError) throw insertError;
        }

        // Update the original timeline patient record to complete
        // Keep it visible in timeline until auto-archive at 12:59 AM
        const { error: updateError } = await supabase
          .from('patients')
          .update({
            status: 'complete',
            completed_at: completedAt,
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
          })
          .eq('id', treatmentDonePatientId);

        if (updateError) throw updateError;

      } else {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // REGULAR PATIENT - Update existing record
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        const updateData: any = {
          status: 'complete',
          completed_at: completedAt,
          doctor_id: finalDoctorId,
          doctor_name: finalDoctorName,
          assigned_by_doctor_name: assignedByDoctorName,
        };

        await supabase
          .from('patients')
          .update(updateData)
          .eq('id', treatmentDonePatientId);
      }

      await loadPatients();
      setShowTreatmentDoneModal(false);
      setTreatmentDonePatientId(null);
      setDoctorSearchQuery('');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleUpdateField = async (patientId: string, field: 'clinic' | 'condition' | 'treatment', value: string) => {
    try {
      const updateData: any = {};
      if (field === 'clinic') {
        updateData.clinic = value; // Update clinic name only
        // Record clinic entry time
        updateData.clinic_entry_at = new Date().toISOString();
      } else {
        updateData[field] = value;
      }

      const { error } = await supabase
        .from('patients')
        .update(updateData)
        .eq('id', patientId);

      if (error) {
        Alert.alert('Error', error.message || 'Failed to update');
        return;
      }

      await loadPatients();
      setShowClinicDropdown(false);
      setShowConditionDropdown(false);
      setShowTreatmentDropdown(false);
      setEditingPatientId(null);
      setEditingField(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred');
    }
  };

  const handleDeleteNote = async () => {
    if (notePatientId) {
      try {
        await supabase
          .from('patients')
          .update({ note: null })
          .eq('id', notePatientId);
        await loadPatients();
      } catch (error: any) {
        Alert.alert('Error', error.message);
      }
    }
    setShowViewNoteModal(false);
    setCurrentNote('');
    setViewNoteContent('');
    setNotePatientId(null);
  };

  // Load timeline for expandable card
  const loadCardTimeline = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('timeline_events')
        .select('id, patient_id, event_type, event_details, timestamp, doctor_name, assigned_by_doctor_name')
        .eq('patient_id', patientId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setCardTimelines(prev => ({ ...prev, [patientId]: data || [] }));
      // Default to Timeline tab
      setShowTimelineTab(prev => ({ ...prev, [patientId]: true }));
    } catch (error: any) {
      // Error handled silently
    }
  };

  // Handle View Details button
  const handleViewDetails = (patientId: string) => {
    if (expandedCardId === patientId) {
      // Collapse
      setExpandedCardId(null);
    } else {
      // Expand and load timeline
      setExpandedCardId(patientId);
      loadCardTimeline(patientId);
    }
  };

  // Handle toggle between Timeline and NA Patients
  const handleToggleTab = (patientId: string) => {
    setShowTimelineTab(prev => ({ ...prev, [patientId]: !prev[patientId] }));
  };

  // Load dental data for permanent patient
  const loadDentalData = async (permanentPatientId: string, patientId: string, forceReload: boolean = false) => {
    // Check if already loaded (skip check if forceReload is true)
    if (!forceReload && dentalSummaries[patientId]) {
      return;
    }

    setLoadingDentalData(prev => ({ ...prev, [patientId]: true }));

    try {
      const { data, error } = await getCompleteDentalChart(permanentPatientId);

      if (error) {
        console.error('Error loading dental data:', error);
        return;
      }

      if (data && data.teeth) {
        const summary = generateDentalSummary(data.teeth);
        setDentalSummaries(prev => ({ ...prev, [patientId]: summary }));
      }

      // Fetch scaling records to get last scaling date
      const scalingResult = await getScalingRecords(permanentPatientId);
      if (scalingResult.data && scalingResult.data.length > 0) {
        const lastScalingDate = scalingResult.data[0].timestamp; // Already sorted descending
        setLastScalingDates(prev => ({ ...prev, [patientId]: lastScalingDate }));
      } else {
        setLastScalingDates(prev => ({ ...prev, [patientId]: null }));
      }

      // Also reload referrals and tooth notes
      const referralsResult = await getReferrals(permanentPatientId);
      if (referralsResult.data) {
        setPatientReferrals(prev => ({ ...prev, [permanentPatientId]: referralsResult.data || [] }));
      }

      // Add small delay to ensure database is updated
      await new Promise(resolve => setTimeout(resolve, 150));
      const notesResult = await getAllToothNotes(permanentPatientId);
      if (notesResult.data) {
        setPatientToothNotes(prev => ({ ...prev, [permanentPatientId]: notesResult.data || [] }));
        console.log(`âœ… Loaded ${notesResult.data.length} notes in loadDentalData for patient ${permanentPatientId}`);
      }
    } catch (error) {
      console.error('Error loading dental data:', error);
    } finally {
      setLoadingDentalData(prev => ({ ...prev, [patientId]: false }));
    }
  };

  // Load scaling data and consent for all permanent patients in the list
  React.useEffect(() => {
    const loadScalingData = async () => {
      for (const patient of displayedPatients) {
        if (patient.permanent_patient_id) {
          try {
            // Load scaling data
            if (!lastScalingDates[patient.id]) {
              const scalingResult = await getScalingRecords(patient.permanent_patient_id);
              if (scalingResult.data && scalingResult.data.length > 0) {
                const lastScalingDate = scalingResult.data[0].timestamp;
                setLastScalingDates(prev => ({ ...prev, [patient.id]: lastScalingDate }));
              }
            }

            // Load consent data
            if (patientConsents[patient.id] === undefined) {
              const patientDataResult = await getPermanentPatientById(patient.permanent_patient_id);
              if (patientDataResult.data) {
                setPatientConsents(prev => ({ ...prev, [patient.id]: patientDataResult.data?.consent || false }));
              }
            }
          } catch (error) {
            console.error('Error loading patient data:', error);
          }
        }
      }
    };

    loadScalingData();
  }, [displayedPatients.map(p => p.id).join(',')]);

  // Toggle permanent patient card expansion
  const togglePermanentCardExpansion = async (patient: Patient) => {
    const isExpanding = expandedPermanentCardId !== patient.id;

    setExpandedPermanentCardId(prev => prev === patient.id ? null : patient.id);

    // Auto-collapse header when expanding card
    if (isExpanding && !isHeaderCollapsed) {
      toggleHeaderCollapse();
    }
    // Auto-expand header when closing card
    else if (!isExpanding && isHeaderCollapsed) {
      toggleHeaderCollapse();
    }

    // Load dental data when expanding - always force reload to get fresh data
    if (isExpanding && patient.permanent_patient_id) {
      await loadDentalData(patient.permanent_patient_id, patient.id, true); // â† forceReload = true
    }
  };

  // Toggle patient consent
  const togglePatientConsent = async (patient: Patient) => {
    if (!patient.permanent_patient_id) {
      Alert.alert('Error', 'Patient ID not found');
      return;
    }

    try {
      const currentConsent = patientConsents[patient.id] || false;
      const newConsent = !currentConsent;

      // Optimistically update UI
      setPatientConsents(prev => ({ ...prev, [patient.id]: newConsent }));

      // Update database
      const { error } = await updatePermanentPatientConsent(patient.permanent_patient_id, newConsent);

      if (error) {
        // Revert on error
        setPatientConsents(prev => ({ ...prev, [patient.id]: currentConsent }));
        Alert.alert('Error', 'Failed to update consent status');
      }
    } catch (err) {
      console.error('Error updating consent:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  // Convert regular patient to permanent patient
  const convertToPermanentPatient = async () => {
    if (!convertPatientId || !convertFileNumber.trim()) {
      Alert.alert('Error', 'Please enter a file number');
      return;
    }

    try {
      const patient = patients.find(p => p.id === convertPatientId);
      if (!patient) {
        Alert.alert('Error', 'Patient not found');
        return;
      }

      console.log('Converting patient:', patient.name, 'File Number:', convertFileNumber);

      // Search for existing permanent patient or create new one
      const searchResult = await searchPermanentPatientsByFileNumber(convertFileNumber.trim(), userClinicId || selectedClinicId);

      let permanentPatientId: string;

      if (searchResult.data && searchResult.data.length > 0) {
        // Existing permanent patient found - take the first one
        console.log('Found existing permanent patient:', searchResult.data[0]);
        permanentPatientId = searchResult.data[0].id;
      } else {
        // Create new permanent patient
        console.log('Creating new permanent patient');
        const createResult = await createPermanentPatient(
          convertFileNumber.trim(),
          patient.name || 'Patient',
          userClinicId || selectedClinicId || ''
        );

        if (createResult.error || !createResult.data) {
          console.error('Failed to create permanent patient:', createResult.error);
          Alert.alert('Error', 'Failed to create permanent patient profile');
          return;
        }

        console.log('Created permanent patient:', createResult.data);
        permanentPatientId = createResult.data.id;
      }

      // Update the patient record to link with permanent patient
      console.log('Updating patient record in database...');
      const { error } = await supabase
        .from('patients')
        .update({
          permanent_patient_id: permanentPatientId,
          file_number: convertFileNumber.trim(),
          patient_type: 'permanent'
        })
        .eq('id', convertPatientId);

      if (error) {
        console.error('Database update error:', error);
        Alert.alert('Error', 'Failed to convert patient');
        return;
      }

      console.log('Database updated successfully');

      // Update patients array immediately for instant UI update
      setPatients(prev => {
        const updated = prev.map(p =>
          p.id === convertPatientId
            ? {
                ...p,
                permanent_patient_id: permanentPatientId,
                file_number: convertFileNumber.trim(),
                patient_type: 'permanent' as const
              }
            : p
        );
        console.log('Updated local state, patient now:', updated.find(p => p.id === convertPatientId));
        return updated;
      });

      // Close modal FIRST
      setShowConvertModal(false);
      setConvertPatientId(null);
      setConvertFileNumber('');

      // Load dental data for the newly converted permanent patient
      console.log('Loading dental data for converted patient...');
      await loadDentalData(permanentPatientId, convertPatientId, true);

      // Trigger animation refresh
      console.log('Triggering animation refresh');
      setAnimKey(prev => prev + 1);

      // Reload patients to ensure consistency
      console.log('Reloading all patients...');
      await loadPatients();

      Alert.alert('Success', 'Patient converted to permanent profile successfully');
    } catch (err) {
      console.error('Error converting patient:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  // Open timeline
  const openTimeline = (patient: Patient) => {
    setSelectedPatient(patient);
    loadTimeline(patient.id);
    setShowTimelineModal(true);
  };

  // Mark treatment done
  const markTreatmentDone = async () => {
    if (!selectedPatient || !treatmentNote.trim()) {
      Alert.alert('Error', 'Please enter treatment details');
      return;
    }

    try {
      await supabase.from('timeline_events').insert([
        {
          patient_id: selectedPatient.id,
          event_type: 'treatment',
          event_details: treatmentNote,
          doctor_name: user?.name || 'Unknown',
        },
      ]);

      await supabase
        .from('patients')
        .update({ status: 'completed' })
        .eq('id', selectedPatient.id);

      await loadPatients();
      setShowTimelineModal(false);
      setTreatmentNote('');
      Alert.alert('Success', 'Treatment saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

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

// AnimatedPatientCard and PatientCard removed - now imported from ./screens/MainQueue/PatientCard
// END OF FILE - styles also imported from ./screens/MainQueue/styles
