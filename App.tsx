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
  
  // User's clinic ID for filtering
  const [userClinicId, setUserClinicId] = useState<number | null>(null);
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [displayedPatients, setDisplayedPatients] = useState<Patient[]>([]);
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
  
  // My Statistics data
  const [myTotalTreatments, setMyTotalTreatments] = useState(0);
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


  // Dragon Design: Animated Blobs for Timeline
  const timelineBlob1Anim = React.useState(new Animated.Value(0))[0];
  const timelineBlob2Anim = React.useState(new Animated.Value(0))[0];
  const timelineBlob3Anim = React.useState(new Animated.Value(0))[0];
  const timelineBlob4Anim = React.useState(new Animated.Value(0))[0];
  const timelineBlob5Anim = React.useState(new Animated.Value(0))[0];
  const timelineBlob6Anim = React.useState(new Animated.Value(0))[0];
  

  
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

  // Animation states for cards
  const [animKey, setAnimKey] = useState(0);

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

  // Ref to prevent multiple Realtime subscriptions
  const realtimeChannelRef = useRef<any>(null);
  const timelineChannelRef = useRef<any>(null);
  const myTreatmentsChannelRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Load patients from Supabase with useCallback
  const loadPatients = useCallback(async (silent = false) => {
    try {
      // Ø§Ø³ØªØ®Ø¯Ø§Ù… selectedClinicId Ø£ÙˆÙ„Ø§Ù‹ (Ù„Ù„Ù€ Coordinator/General Manager)ØŒ Ø«Ù… userClinicId (Ù„Ù„Ù€ Doctor/Team Leader)
      const clinicId = selectedClinicId || userClinicId;
      
      //  Ø¥Ø°Ø§ Ù„Ù… ÙŠÙƒÙ† Ù‡Ù†Ø§Ùƒ clinic_id Ù…Ø­Ø¯Ø¯ØŒ Ù„Ø§ ØªØ¬Ù„Ø¨ Ø£ÙŠ Ø´ÙŠØ¡
      if (clinicId === null) {
        setPatients([]);
        return;
      }
      
      let query = supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId) // ØªØµÙÙŠØ© Ø­Ø³Ø¨ clinic_id
        .is('archive_date', null) // ÙÙ‚Ø· Ø§Ù„Ù…Ø±Ø¶Ù‰ ØºÙŠØ± Ø§Ù„Ù…Ø¤Ø±Ø´ÙÙŠÙ†
        .order('queue_number', { ascending: true });
      
      const { data, error} = await query;

      if (error) throw error;

      // Format all patients (including statistics records with queue_number = -1)
      const formattedPatients: Patient[] = (data || [])
        .map((p: any) => ({
          id: p.id,
          queue_number: p.queue_number,
          name: p.name,
          age: p.age || 0,
          clinic_id: p.clinic_id,
          clinic: p.clinic || 'Clinic',
          condition: p.condition || 'Condition',
          treatment: p.treatment || 'Treatment',
          timestamp: new Date(p.created_at),
          note: p.note || undefined,
          status: p.status === 'complete' || p.status === 'completed' ? 'complete' : (p.status === 'na' ? 'na' : (p.is_elderly ? 'elderly' : 'normal')),
          isElderly: p.is_elderly || false,
          isSpecialNeeds: p.is_special_needs || false,
          // Permanent patient fields
          permanent_patient_id: p.permanent_patient_id || undefined,
          file_number: p.file_number || undefined,
          patient_type: p.patient_type || 'walk-in',
          // Timeline fields
          registered_at: p.registered_at ? new Date(p.registered_at) : undefined,
          clinic_entry_at: p.clinic_entry_at ? new Date(p.clinic_entry_at) : undefined,
          completed_at: p.completed_at ? new Date(p.completed_at) : undefined,
          doctor_name: p.doctor_name || undefined,
          assigned_by_doctor_name: p.assigned_by_doctor_name || undefined,
        }));

      setPatients(formattedPatients);
    } catch (error: any) {
      if (!silent) Alert.alert('Error loading patients', error.message);
    }
  }, [selectedClinicId, userClinicId]);

  // Setup auto archive on app start
  useEffect(() => {
    // Start auto archive service (checks every minute for 23:59)
    startAutoArchive();
    
    // Ø§Ù„Ø§Ø³ØªÙ…Ø§Ø¹ Ù„Ø­Ø¯Ø« Ø§Ù„Ø£Ø±Ø´ÙØ© Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠØ©
    const handleArchiveCompleted = (date: string) => {
      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ø±Ø¶Ù‰ Ù„ØªÙ†Ø¸ÙŠÙ Timeline
      loadPatients();
    };
    
    archiveEventEmitter.on('archive-completed', handleArchiveCompleted);
    
    // Cleanup on unmount
    return () => {
      stopAutoArchive();
      archiveEventEmitter.off('archive-completed', handleArchiveCompleted);
    };
  }, [selectedClinicId]);

  // Show all patients (no filtering by clinic)
  // Exclude statistics records (queue_number = -1) from display
  useEffect(() => {
    setDisplayedPatients(patients.filter(p => p.queue_number !== -1));
  }, [patients]);

  // Fetch user's clinic_id from profile
  useEffect(() => {
    const fetchUserClinic = async () => {
      if (user) {
        try {
          // Try to fetch from doctors table first (approved doctors)
          const { data, error } = await supabase
            .from('doctors')
            .select('clinic_id')
            .eq('id', user.id)
            .single();
          
          if (error) {
            // If not found in doctors, this might be a pending doctor
            // Pending doctors don't have clinic_id, so we just skip
            return;
          }
          
          if (data?.clinic_id) {
            setUserClinicId(data.clinic_id);
          }
        } catch (error) {
          // Error handled silently
        }
      }
    };
    
    fetchUserClinic();
  }, [user]);
  
  // Fetch My Total Treatments automatically on app start
  useEffect(() => {
    const fetchMyTotalTreatments = async () => {
      if (user) {
        try {
          // Get today's date range (same as MyStatisticsScreen default)
          const dateFrom = new Date();
          dateFrom.setHours(0, 0, 0, 0);
          const dateTo = new Date();
          dateTo.setHours(23, 59, 59, 999);
          
          const fromTime = dateFrom.getTime();
          const toTime = dateTo.getTime();
          
          // Get all patients for this doctor
          const { data: patients, error } = await supabase
            .from('patients')
            .select('id, treatment, completed_at, updated_at, queue_number, permanent_patient_id')
            .eq('doctor_id', user.id);

          if (error) {
            return;
          }

          // Filter by today's date range
          const filteredPatients = patients?.filter((patient: any) => {
            const completedDate = patient.completed_at ? new Date(patient.completed_at) : new Date(patient.updated_at);
            const patientTime = completedDate.getTime();
            return patientTime >= fromTime && patientTime <= toTime;
          }) || [];

          // Count only valid treatments (excluding "Treatment" and duplicate permanent patient records)
          const validPatients = filteredPatients.filter((p: any) => {
            // Exclude "Treatment"
            if (p.treatment === 'Treatment') return false;

            // For permanent patients: only count statistics records (queue_number = -1)
            const isPermanentPatient = p.permanent_patient_id != null;
            const isStatisticsRecord = p.queue_number === -1;

            if (isPermanentPatient && !isStatisticsRecord) {
              return false; // Skip original timeline card
            }

            return true;
          });
          setMyTotalTreatments(validPatients.length);
        } catch (error) {
          // Error handled silently
        }
      }
    };
    
    fetchMyTotalTreatments();
  }, [user, patients]); // Re-fetch when user or patients change
  
  // Realtime: Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† myTotalTreatments
  React.useEffect(() => {
    if (!user) return;

    const fetchMyTotalTreatmentsPoll = async () => {
      try {
        const now = new Date();
        const fromTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
        const toTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();

        const { data: patients, error } = await supabase
          .from('patients')
          .select('id, treatment, completed_at, updated_at')
          .eq('doctor_id', user.id);

        if (error) return;

        const filteredPatients = patients?.filter((patient: any) => {
          const completedDate = patient.completed_at ? new Date(patient.completed_at) : new Date(patient.updated_at);
          const patientTime = completedDate.getTime();
          return patientTime >= fromTime && patientTime <= toTime;
        }) || [];

        // Ø§Ø³ØªØ«Ù†Ø§Ø¡ ÙƒÙ„Ù…Ø© "Treatment" Ù…Ù† Ø§Ù„Ø¹Ø¯Ø¯
        const validPatients = filteredPatients.filter((p: any) => p.treatment !== 'Treatment');
        setMyTotalTreatments(validPatients.length);
      } catch (error) {
        // Error handled silently
      }
    };

    // Initial fetch
    fetchMyTotalTreatmentsPoll();

    // Cleanup previous subscription
    if (myTreatmentsChannelRef.current) {
      supabase.removeChannel(myTreatmentsChannelRef.current);
      myTreatmentsChannelRef.current = null;
    }

    // Setup Realtime for my treatments
    const myTreatmentsChannel = supabase
      .channel(`app-my-treatments-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `doctor_id=eq.${user.id}`
        },
        () => {
          fetchMyTotalTreatmentsPoll();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          reconnectTimeoutRef.current = setTimeout(() => {
            fetchMyTotalTreatmentsPoll();
          }, 3000);
        }
      });

    myTreatmentsChannelRef.current = myTreatmentsChannel;

    return () => {
      if (myTreatmentsChannelRef.current) {
        supabase.removeChannel(myTreatmentsChannelRef.current);
        myTreatmentsChannelRef.current = null;
      }
    };
  }, [user]);

  // Dragon Design: Animate blobs continuously for Timeline
  React.useEffect(() => {
    if (selectedClinicId !== null) {
      // Blob 1 - Circular motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob1Anim, {
            toValue: 1,
            duration: 8000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob1Anim, {
            toValue: 0,
            duration: 8000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 2 - Slower circular motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob2Anim, {
            toValue: 1,
            duration: 12000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob2Anim, {
            toValue: 0,
            duration: 12000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 3 - Fastest circular motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob3Anim, {
            toValue: 1,
            duration: 10000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob3Anim, {
            toValue: 0,
            duration: 10000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 4 - Medium speed
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob4Anim, {
            toValue: 1,
            duration: 9500,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob4Anim, {
            toValue: 0,
            duration: 9500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 5 - Slow motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob5Anim, {
            toValue: 1,
            duration: 14000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob5Anim, {
            toValue: 0,
            duration: 14000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 6 - Fast motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob6Anim, {
            toValue: 1,
            duration: 7000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob6Anim, {
            toValue: 0,
            duration: 7000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [selectedClinicId]);

  // Animation for patient cards on mount
  React.useEffect(() => {
    if (selectedClinicId !== null) {
      // Increment animKey to trigger patient cards animation
      setAnimKey(prev => prev + 1);
    }
  }, [selectedClinicId]);

  // Load patients when user clinic is set OR when selected clinic changes + Realtime
  useEffect(() => {
    if (!user) return;

    // Initial load
    loadPatients();

    // Cleanup previous subscriptions
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    if (timelineChannelRef.current) {
      supabase.removeChannel(timelineChannelRef.current);
      timelineChannelRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const clinicId = selectedClinicId || userClinicId;
    if (clinicId === null) return;

    // Setup Realtime subscription for patients table
    const patientsChannel = supabase
      .channel(`app-patients-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `clinic_id=eq.${clinicId}` // Filter by clinic
        },
        (payload) => {
          // Silent refresh on any change
          loadPatients(true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Successfully subscribed
        } else if (status === 'CHANNEL_ERROR') {
          // Retry connection after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            loadPatients(true);
          }, 3000);
        }
      });

    realtimeChannelRef.current = patientsChannel;

    // Setup Realtime subscription for timeline_events table
    const timelineChannel = supabase
      .channel(`app-timeline-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timeline_events'
        },
        (payload) => {
          // Reload timeline for the affected patient
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;

          if (newRecord?.patient_id && selectedPatient?.id === newRecord.patient_id) {
            loadTimeline(newRecord.patient_id);
          }
          if (oldRecord?.patient_id && selectedPatient?.id === oldRecord.patient_id) {
            loadTimeline(oldRecord.patient_id);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Successfully subscribed
        } else if (status === 'CHANNEL_ERROR') {
          // Retry connection
          reconnectTimeoutRef.current = setTimeout(() => {
            if (selectedPatient) {
              loadTimeline(selectedPatient.id);
            }
          }, 3000);
        }
      });

    timelineChannelRef.current = timelineChannel;

    // Cleanup on unmount
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      if (timelineChannelRef.current) {
        supabase.removeChannel(timelineChannelRef.current);
        timelineChannelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [user, userClinicId, selectedClinicId]) // Removed loadPatients from dependencies

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
                    outputRange: [0, 30],
                  }),
                },
                {
                  translateY: timelineBlob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 40],
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
                    outputRange: [0, -25],
                  }),
                },
                {
                  translateY: timelineBlob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 35],
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
                    outputRange: [0, 20],
                  }),
                },
                {
                  translateY: timelineBlob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -30],
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
                    outputRange: [0, -20],
                  }),
                },
                {
                  translateY: timelineBlob4Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 25],
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
                    outputRange: [0, 28],
                  }),
                },
                {
                  translateY: timelineBlob5Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -32],
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
                    outputRange: [0, -18],
                  }),
                },
                {
                  translateY: timelineBlob6Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 22],
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
          {/* Ø²Ø± Ø±Ø¬ÙˆØ¹ Ù„Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ø¹Ø§Ù… ÙˆØ§Ù„Ù…Ù†Ø³Ù‚ØŒ Ø²Ø± Ù…Ù„Ù Ø´Ø®ØµÙŠ Ù„Ù„Ø·Ø¨ÙŠØ¨ */}
          {(user?.role === 'super_admin' || user?.role === 'coordinator') ? (
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => {
                // Navigation Stack: Timeline â†’ Clinic Details â†’ Departments â†’ Profile

                // Timeline â†’ Clinic Details
                if (selectedClinicId !== null) {
                  // Ø­ÙØ¸ clinicId Ù‚Ø¨Ù„ Ø§Ù„Ø±Ø¬ÙˆØ¹
                  setSavedClinicId(selectedClinicId);
                  setSavedClinicName(selectedClinicName);
                  setSelectedClinicId(null);
                  setSelectedClinicName('');
                  setShowClinicDetails(true);  // Ø¥Ø¸Ù‡Ø§Ø± ClinicDetails
                  setShowDentalDepartments(false);
                  setNavigationStack(['profile', 'departments', 'clinicDetails']);
                }
                // Clinic Details â†’ Departments
                else if (showClinicDetails) {
                  setShowClinicDetails(false);
                  setShowDentalDepartments(true);
                  // Ù…Ø³Ø­ savedClinicId Ø¹Ù†Ø¯ Ø§Ù„Ø±Ø¬ÙˆØ¹ Ø¥Ù„Ù‰ Departments
                  setSavedClinicId(null);
                  setSavedClinicName('');
                  setNavigationStack(['profile', 'departments']);
                }
                // Departments â†’ Profile
                else if (showDentalDepartments) {
                  // Ù…Ø³Ø­ selectedClinicId Ø£ÙˆÙ„Ø§Ù‹ Ù„Ù…Ù†Ø¹ ÙØªØ­ Timeline
                  setSelectedClinicId(null);
                  setSelectedClinicName('');
                  setSavedClinicId(null);
                  setSavedClinicName('');
                  // Ø«Ù… Ø¥ØºÙ„Ø§Ù‚ Departments ÙˆÙØªØ­ Profile
                  setShowDentalDepartments(false);
                  setShowDoctorProfile(true);
                  setNavigationStack(['profile']);
                }
              }}
            >
              <View style={styles.profileButtonGlass}>
                <View style={styles.profileButtonInnerGlow} />
                <Ionicons name="arrow-back" size={24} color="#7DD3C0" style={{ zIndex: 10 }} />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => {
                // Ø²Ø± Ø±Ø¬ÙˆØ¹ Ù„Ù„Ø·Ø¨ÙŠØ¨/Team Leader
                setSelectedClinicId(null);
                setSelectedClinicName('');
              }}
            >
              <View style={styles.profileButtonGlass}>
                <View style={styles.profileButtonInnerGlow} />
                <Ionicons name="arrow-back" size={24} color="#7DD3C0" style={{ zIndex: 10 }} />
              </View>
            </TouchableOpacity>
          )}
          
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Dental Clinic</Text>
            {selectedClinicName && (
              <Text style={styles.headerSubtitle}>{selectedClinicName}</Text>
            )}
          </View>
          
          <View style={{ width: 44 }} />
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
                <MaterialCommunityIcons name="chart-bar" size={32} color="#9CA3AF" />
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
                <MaterialCommunityIcons name="tooth-outline" size={48} color="#9CA3AF" style={{ marginBottom: 8 }} />
                <Text style={styles.statLabel}>Total Patients</Text>
                <Text style={styles.statValue}>{totalPatients}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statCard, shadows.neumorphic, filterWaitingOnly && styles.statCardActive]}
                onPress={() => setFilterWaitingOnly(!filterWaitingOnly)}
              >
                <Ionicons name="person-outline" size={48} color={filterWaitingOnly ? '#7DD3C0' : '#9CA3AF'} style={{ marginBottom: 8 }} />
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
                size={24}
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
              {expandedCardId === 'header' ? 'â–² Hide Details' : 'â–¼ View Details'}
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
              <Ionicons name="time-outline" size={20} color={showTimeline ? '#7DD3C0' : '#6B7280'} />
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
              <Ionicons name="eye-outline" size={20} color={showNAPatients ? '#7DD3C0' : '#6B7280'} />
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
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
            <Ionicons name="home-sharp" size={26} color="#7DD3C0" />
            <Text style={[styles.navLabel, styles.navLabelActive]}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem}
            onPress={() => setShowPatientFile(true)}
          >
            <Ionicons name="person-circle" size={28} color="#9CA3AF" />
            <Text style={styles.navLabel}>Patient File</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem}
            onPress={() => setShowAppointments(true)}
          >
            <Ionicons name="calendar-sharp" size={26} color="#9CA3AF" />
            <Text style={styles.navLabel}>Appointments</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navItem}
            onPress={() => setShowArchiveScreen(true)}
          >
            <Ionicons name="archive-sharp" size={26} color="#9CA3AF" />
            <Text style={styles.navLabel}>Archive</Text>
          </TouchableOpacity>
        </View>

        {/* Add Patient Modal */}
        <Modal visible={showAddModal} animationType="fade" transparent onRequestClose={() => {
          setShowAddModal(false);
          setIsModalExpanded(false);
        }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={[styles.modalContent, { minWidth: '90%', maxHeight: '80%', borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 24 }]}>
                  {/* Glass Color Tint */}
                  <LinearGradient
                    colors={[
                      'rgba(168, 85, 247, 0.15)',
                      'rgba(91, 159, 237, 0.15)',
                      'rgba(125, 211, 192, 0.15)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modalGlassOverlay}
                  />

                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{isPatientEditMode ? 'Edit Patient' : 'Add New Patient'}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        // Ø¥ØºÙ„Ø§Ù‚ Modal
                        setShowAddModal(false);
                        setIsModalExpanded(false);
                        setPatientMode('search');

                        // Reset edit mode
                        setIsPatientEditMode(false);
                        setModalEditingPatientId(null);

                        // ØªÙ†Ø¸ÙŠÙ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ„
                        setNewPatientName('');
                        setNewPatientFileNumber('');
                        setNewPatientQueueNumber('');
                        setNewPatientCondition(CONDITIONS[0].name);
                        setSelectedPermanentPatientId(null);
                        setShowFileNumberSuggestions(false);
                        setShowPatientSuggestions(false);
                        setShowConditionDropdown(false);
                      }}
                      style={styles.modalCloseButton}
                    >
                      <Ionicons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  {/* Mode Selection Buttons */}
                  <View style={styles.modeButtonsContainer}>
                    <TouchableOpacity
                      style={[
                        styles.modeButton,
                        patientMode === 'walk-in' && styles.modeButtonActive
                      ]}
                      onPress={() => {
                        if (patientMode === 'walk-in') {
                          // Toggle off - return to search mode
                          setPatientMode('search');
                        } else {
                          // Toggle on - activate walk-in mode
                          setPatientMode('walk-in');
                          setNewPatientFileNumber('');
                          setSelectedPermanentPatientId(null);
                          setShowPatientSuggestions(false);
                          setShowFileNumberSuggestions(false);
                        }
                      }}
                    >
                      <Ionicons
                        name="walk"
                        size={18}
                        color={patientMode === 'walk-in' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)'}
                      />
                      <Text style={[
                        styles.modeButtonText,
                        patientMode === 'walk-in' && styles.modeButtonTextActive
                      ]}>Walk-in</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.modeButton,
                        patientMode === 'new-profile' && styles.modeButtonActive
                      ]}
                      onPress={() => {
                        if (patientMode === 'new-profile') {
                          // Toggle off - return to search mode
                          setPatientMode('search');
                        } else {
                          // Toggle on - activate new-profile mode
                          setPatientMode('new-profile');
                          setShowPatientSuggestions(false);
                          setShowFileNumberSuggestions(false);
                        }
                      }}
                    >
                      <Ionicons
                        name="person-add"
                        size={18}
                        color={patientMode === 'new-profile' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)'}
                      />
                      <Text style={[
                        styles.modeButtonText,
                        patientMode === 'new-profile' && styles.modeButtonTextActive
                      ]}>New Profile</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={Platform.OS === 'android'}
                    nestedScrollEnabled
                  >
                    <Text style={styles.inputLabel}>Patient Name:</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={[
                          styles.textInput,
                          // âœ… Dynamic text alignment and padding based on language
                          (() => {
                            const firstChar = newPatientName.trim()[0];
                            const isArabic = firstChar && /[\u0600-\u06FF]/.test(firstChar);
                            return {
                              textAlign: isArabic ? 'right' : 'left',
                              paddingRight: isArabic ? 16 : 45, // More space for X button on right
                              paddingLeft: isArabic ? 45 : 16,  // More space for X button on left
                            };
                          })()
                        ]}
                        placeholder="Patient Name"
                        value={newPatientName}
                        onChangeText={(text) => {
                          setNewPatientName(text);
                          // Only search if in 'search' mode
                          if (patientMode === 'search') {
                            handlePatientNameSearch(text);
                          }
                        }}
                        returnKeyType="done"
                      />
                      {newPatientName.length > 0 && (
                        <TouchableOpacity
                          style={[
                            styles.clearButton,
                            // âœ… X button always on opposite side of text
                            (() => {
                              const firstChar = newPatientName.trim()[0];
                              const isArabic = firstChar && /[\u0600-\u06FF]/.test(firstChar);
                              // Arabic text â†’ X on left, English text â†’ X on right
                              return isArabic ? { left: 12, right: undefined } : { right: 12, left: undefined };
                            })()
                          ]}
                          onPress={() => {
                            // âœ… Clear name AND file number
                            setNewPatientName('');
                            setNewPatientFileNumber('');
                            setShowFileNumberSuggestions(false);
                            setSelectedPermanentPatientId(null);
                          }}
                        >
                          <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* Patient Name Search Results - Show File Numbers */}
                    {showFileNumberSuggestions && fileNumberSearchResults.length > 0 && (
                      <View style={styles.suggestionsContainer}>
                        <Text style={styles.suggestionsHeader}>
                          Found {fileNumberSearchResults.length} file(s):
                        </Text>
                        <ScrollView
                          style={styles.suggestionsList}
                          nestedScrollEnabled={true}
                          showsVerticalScrollIndicator={true}
                          persistentScrollbar={true}
                          keyboardShouldPersistTaps="handled"
                          contentContainerStyle={{ paddingBottom: 8 }}
                        >
                          {fileNumberSearchResults.map((patient) => (
                            <TouchableOpacity
                              key={patient.id}
                              style={[
                                styles.suggestionItem,
                                selectedPermanentPatientId === patient.id && styles.suggestionItemSelected
                              ]}
                              onPress={() => {
                                // Convert Arabic numerals to English before setting
                                const englishFileNumber = arabicToEnglish(patient.file_number || '');

                                // Ù…Ù„Ø¡ Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„ ÙˆFile Number ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹
                                setNewPatientName(patient.name);
                                setNewPatientFileNumber(englishFileNumber);
                                setSelectedPermanentPatientId(patient.id);
                                setShowFileNumberSuggestions(false);
                              }}
                            >
                              <Text style={styles.suggestionItemText}>
                                {`File #${arabicToEnglish(patient.file_number || '')} - ${patient.name}`}
                              </Text>
                              {selectedPermanentPatientId === patient.id && (
                                <Ionicons name="checkmark-circle" size={20} color="#7DD3C0" />
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* File Number - Hidden in walk-in mode */}
                    {patientMode !== 'walk-in' && (
                      <>
                        <Text style={styles.inputLabel}>File Number (4 digits):</Text>
                        <View style={styles.inputContainer}>
                          <TextInput
                            style={styles.textInput}
                            placeholder="0000"
                            value={newPatientFileNumber}
                            onChangeText={(text) => {
                              // Allow English and Arabic numerals, max 4 digits
                              // Keep only numbers (0-9 and Ù -Ù©)
                              const numbersOnly = text.split('').filter(char =>
                                /[0-9\u0660-\u0669]/.test(char)
                              ).join('').slice(0, 4);

                              // Convert Arabic numerals to English
                              const englishNumbers = arabicToEnglish(numbersOnly);
                              setNewPatientFileNumber(englishNumbers);

                              // Only search if in 'search' mode
                              if (patientMode === 'search') {
                                handleFileNumberSearch(englishNumbers);
                              }
                            }}
                            keyboardType="numeric"
                            maxLength={4}
                            returnKeyType="done"
                          />
                          {newPatientFileNumber.length > 0 && (
                            <TouchableOpacity
                              style={styles.clearButton}
                              onPress={() => {
                                // âœ… Clear file number AND name
                                setNewPatientFileNumber('');
                                setNewPatientName('');
                                setShowPatientSuggestions(false);
                                setSelectedPermanentPatientId(null);
                              }}
                            >
                              <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </>
                    )}
                    {/* File Number Search Results */}
                    {showPatientSuggestions && permanentPatientSearchResults.length > 0 && (
                      <View style={styles.suggestionsContainer}>
                        <Text style={styles.suggestionsHeader}>
                          Found {permanentPatientSearchResults.length} patient(s):
                        </Text>
                        <ScrollView
                          style={styles.suggestionsList}
                          nestedScrollEnabled={true}
                          showsVerticalScrollIndicator={true}
                          persistentScrollbar={true}
                          keyboardShouldPersistTaps="handled"
                          contentContainerStyle={{ paddingBottom: 8 }}
                        >
                          {permanentPatientSearchResults.map((patient) => (
                            <TouchableOpacity
                              key={patient.id}
                              style={[
                                styles.suggestionItem,
                                selectedPermanentPatientId === patient.id && styles.suggestionItemSelected
                              ]}
                              onPress={() => {
                                setNewPatientName(patient.name);
                                setSelectedPermanentPatientId(patient.id);
                                setShowPatientSuggestions(false);
                              }}
                            >
                              <Text style={styles.suggestionItemText}>
                                {patient.name}
                              </Text>
                              {selectedPermanentPatientId === patient.id && (
                                <Ionicons name="checkmark-circle" size={20} color="#7DD3C0" />
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    <Text style={styles.inputLabel}>Queue Number:</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Queue Number"
                        value={newPatientQueueNumber}
                        onChangeText={setNewPatientQueueNumber}
                        keyboardType="numeric"
                        returnKeyType="done"
                      />
                      {newPatientQueueNumber.length > 0 && (
                        <TouchableOpacity
                          style={styles.clearButton}
                          onPress={() => setNewPatientQueueNumber('')}
                        >
                          <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Expand/Collapse Button */}
                    <TouchableOpacity
                      style={styles.expandButton}
                      onPress={() => setIsModalExpanded(!isModalExpanded)}
                    >
                      <Text style={styles.expandButtonText}>
                        {isModalExpanded ? 'Hide Additional Info' : 'Show Additional Info'}
                      </Text>
                      <Ionicons
                        name={isModalExpanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>

                    {/* Additional Fields - Shown when expanded */}
                    {isModalExpanded && (
                      <>
                        <Text style={styles.inputLabel}>Condition:</Text>
                    <TouchableOpacity
                      style={styles.textInput}
                      onPress={() => setShowConditionDropdown(!showConditionDropdown)}
                    >
                      <Text style={styles.dropdownButtonText}>{newPatientCondition}</Text>
                    </TouchableOpacity>
                    {showConditionDropdown && (
                      <View style={styles.dropdownList}>
                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                          {CONDITIONS.map((condition, index) => (
                            <TouchableOpacity
                              key={condition.name}
                              style={[
                                styles.dropdownItem,
                                newPatientCondition === condition.name && styles.dropdownItemSelected
                              ]}
                              onPress={() => {
                                setNewPatientCondition(condition.name);
                                setShowConditionDropdown(false);
                              }}
                            >
                              <Text style={[
                                styles.dropdownItemText,
                                newPatientCondition === condition.name && styles.dropdownItemTextSelected
                              ]}>{condition.name}</Text>
                              {newPatientCondition === condition.name && (
                                <Ionicons name="checkmark" size={20} color="#7DD3C0" />
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    <Text style={styles.inputLabel}>Treatment:</Text>
                    <TouchableOpacity
                      style={styles.textInput}
                      onPress={() => setShowTreatmentDropdown(!showTreatmentDropdown)}
                    >
                      <Text style={styles.dropdownButtonText}>{newPatientTreatment}</Text>
                    </TouchableOpacity>
                    {showTreatmentDropdown && (
                      <View style={styles.dropdownList}>
                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                          {TREATMENTS
                            .filter(treatment => {
                              // For permanent patients, exclude these treatments (they're counted from dental chart/referrals)
                              const isPermanent = selectedPermanentPatientId != null;
                              const excludedTreatments = ['Filling', 'Scaling', 'Pulpectomy', 'Extraction', 'Referral'];

                              if (isPermanent && excludedTreatments.includes(treatment.name)) {
                                return false; // Hide these options for permanent patients
                              }
                              return true;
                            })
                            .map((treatment, index) => (
                              <TouchableOpacity
                                key={treatment.name}
                                style={[
                                  styles.dropdownItem,
                                  newPatientTreatment === treatment.name && styles.dropdownItemSelected
                                ]}
                                onPress={() => {
                                  setNewPatientTreatment(treatment.name);
                                  setShowTreatmentDropdown(false);
                                }}
                              >
                                <Text style={[
                                  styles.dropdownItemText,
                                  newPatientTreatment === treatment.name && styles.dropdownItemTextSelected
                                ]}>{treatment.name}</Text>
                                {newPatientTreatment === treatment.name && (
                                <Ionicons name="checkmark" size={20} color="#7DD3C0" />
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => setIsElderly(!isElderly)}
                    >
                      <View style={[styles.checkbox, isElderly && styles.checkboxChecked]}>
                        {isElderly && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                      </View>
                      <Text style={styles.checkboxLabel}>Elderly</Text>
                    </TouchableOpacity>

                    <Text style={styles.inputLabel}>Notes (Optional):</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={[styles.textInput, styles.textArea]}
                        placeholder="Add notes..."
                        value={newPatientNote}
                        onChangeText={setNewPatientNote}
                        multiline
                        numberOfLines={3}
                        returnKeyType="done"
                        blurOnSubmit
                      />
                      {newPatientNote.length > 0 && (
                        <TouchableOpacity
                          style={[styles.clearButton, styles.clearButtonTextArea]}
                          onPress={() => setNewPatientNote('')}
                        >
                          <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                        </TouchableOpacity>
                      )}
                    </View>
                      </>
                    )}

                    <TouchableOpacity style={styles.addButton} onPress={handleAddPatient}>
                      <Text style={styles.addButtonText}>{isPatientEditMode ? 'Update Patient' : 'Add Patient'}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Menu Modal */}
        {showMenuForPatient && (
          <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowMenuForPatient(null)}>
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setShowMenuForPatient(null)}
            >
              <View style={styles.menuModal}>
                {/* Glass Color Tint */}
                <LinearGradient
                  colors={[
                    'rgba(168, 85, 247, 0.15)',
                    'rgba(91, 159, 237, 0.15)',
                    'rgba(125, 211, 192, 0.15)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalGlassOverlay}
                />

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(showMenuForPatient, 'edit')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="create-outline" size={22} color="#8B5CF6" />
                  </View>
                  <Text style={styles.menuItemText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(showMenuForPatient, 'note')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="document-text" size={22} color="#3B82F6" />
                  </View>
                  <Text style={styles.menuItemText}>Note</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(showMenuForPatient, 'na')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="person-remove" size={22} color="#6B7280" />
                  </View>
                  <Text style={styles.menuItemText}>Patient N/A</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(showMenuForPatient, 'elderly')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="man" size={22} color="#F97316" />
                  </View>
                  <Text style={styles.menuItemText}>Elderly</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(showMenuForPatient, 'special_needs')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="accessibility" size={22} color="#8B5CF6" />
                  </View>
                  <Text style={styles.menuItemText}>Special Needs</Text>
                </TouchableOpacity>
                {/* Show "New Profile" only for regular (walk-in) patients */}
                {(() => {
                  const patient = patients.find(p => p.id === showMenuForPatient);
                  if (patient && !patient.permanent_patient_id) {
                    return (
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleMenuAction(showMenuForPatient, 'new_profile')}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="person-add" size={22} color="#3B82F6" />
                        </View>
                        <Text style={styles.menuItemText}>New Profile</Text>
                      </TouchableOpacity>
                    );
                  }
                  return null;
                })()}
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(showMenuForPatient, 'complete')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                  </View>
                  <Text style={styles.menuItemText}>Treatment Done</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.menuItem, styles.menuItemDanger]}
                  onPress={() => handleMenuAction(showMenuForPatient, 'delete')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="trash-bin" size={22} color="#EF4444" />
                  </View>
                  <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Note Modal */}
        <Modal visible={showNoteModal} animationType="slide" transparent onRequestClose={() => setShowNoteModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalContent}>
                  {/* Glass Color Tint */}
                  <LinearGradient
                    colors={[
                      'rgba(168, 85, 247, 0.15)',
                      'rgba(91, 159, 237, 0.15)',
                      'rgba(125, 211, 192, 0.15)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modalGlassOverlay}
                  />

                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Patient Note</Text>
                    <TouchableOpacity
                      onPress={() => setShowNoteModal(false)}
                      style={styles.modalCloseButton}
                    >
                      <Ionicons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Enter note..."
                    value={currentNote}
                    onChangeText={setCurrentNote}
                    multiline
                    numberOfLines={5}
                    autoFocus
                  />

                  <TouchableOpacity style={styles.addButton} onPress={handleSaveNote}>
                    <Text style={styles.addButtonText}>Save Note</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* View Note Modal */}
        <Modal visible={showViewNoteModal} animationType="fade" transparent onRequestClose={() => {
          setShowViewNoteModal(false);
          setViewNoteContent('');
        }}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => {
              setShowViewNoteModal(false);
              setViewNoteContent('');
            }}
          >
            <View style={styles.modalContent}>
              {/* Glass Color Tint */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.15)',
                  'rgba(91, 159, 237, 0.15)',
                  'rgba(125, 211, 192, 0.15)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalGlassOverlay}
              />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Patient Note</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowViewNoteModal(false);
                    setViewNoteContent('');
                  }}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <Text style={styles.noteText}>{viewNoteContent}</Text>

              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteNote}>
                <Text style={styles.deleteButtonText}>Delete Note</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Convert to Permanent Patient Modal */}
        <Modal visible={showConvertModal} animationType="slide" transparent onRequestClose={() => setShowConvertModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalContent}>
                  {/* Glass Color Tint */}
                  <LinearGradient
                    colors={[
                      'rgba(168, 85, 247, 0.15)',
                      'rgba(91, 159, 237, 0.15)',
                      'rgba(125, 211, 192, 0.15)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modalGlassOverlay}
                  />

                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>New Profile</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowConvertModal(false);
                        setConvertFileNumber('');
                      }}
                      style={styles.modalCloseButton}
                    >
                      <Ionicons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <Text style={{
                    fontSize: 14,
                    color: '#6B7280',
                    marginBottom: 16,
                    textAlign: 'center',
                  }}>
                    Enter file number to convert this patient to a permanent profile
                  </Text>

                  <TextInput
                    style={styles.input}
                    placeholder="File Number"
                    value={convertFileNumber}
                    onChangeText={setConvertFileNumber}
                    keyboardType="default"
                    autoFocus
                  />

                  <TouchableOpacity
                    style={[styles.button, { marginTop: 16 }]}
                    onPress={convertToPermanentPatient}
                  >
                    <Text style={styles.buttonText}>Convert to Permanent</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Treatment Done Modal */}
        <Modal visible={showTreatmentDoneModal} animationType="slide" transparent onRequestClose={() => setShowTreatmentDoneModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalContent}>
                  {/* Glass Color Tint - Darker */}
                  <LinearGradient
                    colors={[
                      'rgba(168, 85, 247, 0.25)',
                      'rgba(91, 159, 237, 0.25)',
                      'rgba(125, 211, 192, 0.25)',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modalGlassOverlay}
                  />

                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Treatment Done</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowTreatmentDoneModal(false);
                        setDoctorSearchQuery('');
                      }}
                      style={styles.modalCloseButton}
                    >
                      <Ionicons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  {/* Done by Me Button */}
                  <TouchableOpacity
                    style={styles.treatmentDoneByMeButton}
                    onPress={() => handleTreatmentDoneByDoctor(null, null)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(34, 197, 94, 0.2)', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                      </View>
                      <Text style={styles.treatmentDoneByMeText}>Treatment Done by Me</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  <View style={styles.orDivider}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>OR</Text>
                    <View style={styles.orLine} />
                  </View>

                  {/* Search Bar */}
                  <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#9CA3AF" />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search doctor..."
                      placeholderTextColor="#9CA3AF"
                      value={doctorSearchQuery}
                      onChangeText={setDoctorSearchQuery}
                    />
                  </View>

                  {/* Doctors List */}
                  <ScrollView style={styles.doctorsListContainer} showsVerticalScrollIndicator={false}>
                    {clinicDoctors
                      .filter(doctor => doctor.name.toLowerCase().includes(doctorSearchQuery.toLowerCase()))
                      .map((doctor) => (
                        <TouchableOpacity
                          key={doctor.id}
                          style={styles.doctorItem}
                          onPress={() => handleTreatmentDoneByDoctor(doctor.id, doctor.name)}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(125, 211, 192, 0.2)', justifyContent: 'center', alignItems: 'center' }}>
                              <Ionicons name="person" size={24} color="#7DD3C0" />
                            </View>
                            <Text style={styles.doctorName}>{doctor.name}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                      ))}
                    {clinicDoctors.filter(doctor => doctor.name.toLowerCase().includes(doctorSearchQuery.toLowerCase())).length === 0 && (
                      <Text style={styles.noDoctorsText}>No doctors found</Text>
                    )}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Clinic Dropdown Modal */}
        <Modal visible={showClinicDropdown} animationType="fade" transparent onRequestClose={() => setShowClinicDropdown(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowClinicDropdown(false)}
          >
            <View style={styles.beautifulModal}>
              {/* Glass Color Tint */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.15)',
                  'rgba(91, 159, 237, 0.15)',
                  'rgba(125, 211, 192, 0.15)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalGlassOverlay}
              />

              <Text style={styles.modalHeaderTitle}>Select Clinic</Text>
              <View style={styles.modalDivider} />
              <ScrollView style={styles.modalScrollView}>
                {CLINICS.map((clinic) => (
                  <TouchableOpacity
                    key={clinic.id}
                    style={styles.beautifulDropdownItem}
                    onPress={() => editingPatientId && handleUpdateField(editingPatientId, 'clinic', clinic.name)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                    <Text style={styles.beautifulDropdownText}>{clinic.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Condition Dropdown Modal */}
        <Modal visible={showConditionDropdown} animationType="fade" transparent onRequestClose={() => setShowConditionDropdown(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowConditionDropdown(false)}
          >
            <View style={styles.beautifulModal}>
              {/* Glass Color Tint */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.15)',
                  'rgba(91, 159, 237, 0.15)',
                  'rgba(125, 211, 192, 0.15)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalGlassOverlay}
              />

              <Text style={styles.modalHeaderTitle}>Select Condition</Text>
              <View style={styles.modalDivider} />
              <ScrollView style={styles.modalScrollView}>
                {CONDITIONS.map((condition) => (
                  <TouchableOpacity
                    key={condition.name}
                    style={styles.beautifulDropdownItem}
                    onPress={() => editingPatientId && handleUpdateField(editingPatientId, 'condition', condition.name)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                    <Text style={styles.beautifulDropdownText}>{condition.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Treatment Dropdown Modal */}
        <Modal visible={showTreatmentDropdown} animationType="fade" transparent onRequestClose={() => setShowTreatmentDropdown(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowTreatmentDropdown(false)}
          >
            <View style={styles.beautifulModal}>
              {/* Glass Color Tint */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.15)',
                  'rgba(91, 159, 237, 0.15)',
                  'rgba(125, 211, 192, 0.15)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalGlassOverlay}
              />

              <Text style={styles.modalHeaderTitle}>Select Treatment</Text>
              <View style={styles.modalDivider} />
              <ScrollView style={styles.modalScrollView}>
                {TREATMENTS
                  .filter(treatment => {
                    // For permanent patients, exclude these treatments (they're counted from dental chart/referrals)
                    const editingPatient = patients.find(p => p.id === editingPatientId);
                    const isPermanent = editingPatient?.permanent_patient_id != null;
                    const excludedTreatments = ['Filling', 'Scaling', 'Pulpectomy', 'Extraction', 'Referral'];

                    if (isPermanent && excludedTreatments.includes(treatment.name)) {
                      return false; // Hide these options for permanent patients
                    }
                    return true;
                  })
                  .map((treatment) => (
                    <TouchableOpacity
                      key={treatment.name}
                      style={styles.beautifulDropdownItem}
                      onPress={() => editingPatientId && handleUpdateField(editingPatientId, 'treatment', treatment.name)}
                    >
                      <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                      <Text style={styles.beautifulDropdownText}>{treatment.name}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Timeline Modal */}
        {showTimelineModal && selectedPatient && (
          <Modal visible={showTimelineModal} animationType="slide">
            <SafeAreaView style={styles.timelineScreenContainer}>
              <LinearGradient colors={['#E8F5F0', '#F0E8F5']} style={styles.gradient}>
                <View style={styles.timelineHeader}>
                  <TouchableOpacity onPress={() => setShowTimelineModal(false)}>
                    <Ionicons name="arrow-back" size={28} color="#1F2937" />
                  </TouchableOpacity>
                  <Text style={styles.timelineTitle}>{selectedPatient.name}</Text>
                  <View style={{ width: 28 }} />
                </View>

                <ScrollView style={styles.timelineContent}>
                  {timeline.map((event) => (
                    <View key={event.id} style={[styles.timelineEvent, shadows.card]}>
                      <Text style={styles.eventType}>{event.event_type}</Text>
                      <Text style={styles.eventDetails}>{event.event_details}</Text>
                      {event.doctor_name && (
                        <Text style={styles.eventDoctor}>Done by Dr. {event.doctor_name}</Text>
                      )}
                      {event.assigned_by_doctor_name && (
                        <Text style={styles.eventAssignedBy}>Assigned by Dr. {event.assigned_by_doctor_name}</Text>
                      )}
                      <Text style={styles.eventTime}>
                        {new Date(event.timestamp).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={[styles.treatmentSection, shadows.card]}>
                  <TextInput
                    style={styles.treatmentInput}
                    placeholder="Treatment details..."
                    value={treatmentNote}
                    onChangeText={setTreatmentNote}
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={markTreatmentDone}
                  >
                    <LinearGradient 
                      colors={['#10B981', '#059669']} 
                      start={{ x: 0, y: 0 }} 
                      end={{ x: 1, y: 1 }} 
                      style={styles.addButtonGradient}
                    >
                      <Text style={styles.addButtonText}>Mark as Done</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </SafeAreaView>
          </Modal>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TOOTH DETAILS MODAL (Shared Component) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <ToothDetailsModal
          visible={showToothModal}
          onClose={() => setShowToothModal(false)}
          permanentPatientId={toothModalPatientId}
          toothNumber={selectedTooth}
          currentDoctorName={user?.name || user?.email || 'Unknown'}
          onToothDataUpdated={async () => {
            // Refresh dental chart data after save
            if (toothModalPatientId) {
              // Find timeline patient that matches this permanent patient
              const timelinePatient = patients.find(p => p.permanent_patient_id === toothModalPatientId);

              if (timelinePatient) {
                // 1. Reload dental summary
                const { data: dentalChart } = await getCompleteDentalChart(toothModalPatientId);
                if (dentalChart) {
                  const summary = generateDentalSummary(dentalChart.teeth);
                  // Use timeline patient id as key (NOT permanent patient id)
                  setDentalSummaries(prev => ({ ...prev, [timelinePatient.id]: summary }));
                }

                // 2. Reload referrals
                const referralsResult = await getReferrals(toothModalPatientId);
                if (referralsResult.data) {
                  setPatientReferrals(prev => ({ ...prev, [toothModalPatientId]: referralsResult.data || [] }));
                }

                // 3. Reload tooth notes
                // Add small delay to ensure database is updated
                await new Promise(resolve => setTimeout(resolve, 150));
                const notesResult = await getAllToothNotes(toothModalPatientId);
                if (notesResult.data) {
                  setPatientToothNotes(prev => ({ ...prev, [toothModalPatientId]: notesResult.data || [] }));
                  console.log(`âœ… Reloaded ${notesResult.data.length} notes for patient ${toothModalPatientId}`);
                }
              }
            }
          }}
        />

      </View>
    </SafeAreaView>
    </View>
  );
}

// AnimatedPatientCard and PatientCard removed - now imported from ./screens/MainQueue/PatientCard
// END OF FILE - styles also imported from ./screens/MainQueue/styles
