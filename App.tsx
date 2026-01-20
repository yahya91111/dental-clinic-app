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
import { createClient } from '@supabase/supabase-js';
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
  createScalingRecord
} from './lib/database';
import { ToothData, ToothNumber, ToothCondition, DentalSummary, ToothSurface, Referral, ToothNote } from './types';
import { getToothQuadrant, getToothPositionNumber, getToothName, treatmentOptions, detailsOptions } from './toothHelpers';

// Supabase setup
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Color definitions from Nov 8 design
const CLINICS = [
  { name: 'Clinic', id: 0, color: '#E5E7EB' },
  { name: 'Clinic 1', id: 1, color: '#C8F5E0' },
  { name: 'Clinic 2', id: 2, color: '#C4D9F5' },
  { name: 'Clinic 3', id: 3, color: '#E8D4F5' },
  { name: 'Clinic 4', id: 4, color: '#FFD9C4' },
  { name: 'Clinic 5', id: 5, color: '#FFC4E0' },
];

const CONDITIONS = [
  { name: 'Condition', color: '#E5E7EB' },
  { name: 'Checkup', color: '#6EE7B7' },
  { name: 'Pain', color: '#6EE7B7' },
  { name: 'Broken Tooth', color: '#6EE7B7' },
  { name: 'Follow-up', color: '#6EE7B7' },
  { name: 'Others', color: '#6EE7B7' },
];
const TREATMENTS = [
  { name: 'Treatment', color: '#E5E7EB' },
  { name: 'Examination', color: '#A7F3D0' },
  { name: 'Scaling', color: '#A7F3D0' },
  { name: 'Filling', color: '#A7F3D0' },
  { name: 'Extraction', color: '#A7F3D0' },
  { name: 'Pulpectomy', color: '#A7F3D0' },
  { name: 'Medication', color: '#A7F3D0' },
  { name: 'Suture Removal', color: '#A7F3D0' },
  { name: 'Cementation', color: '#A7F3D0' },
  { name: 'Referral', color: '#A7F3D0' },
];

const CONDITION_COLORS: { [key: string]: string } = {
  'Checkup': '#6EE7B7',
  'Pain': '#6EE7B7',
  'Broken Tooth': '#6EE7B7',
  'Follow-up': '#6EE7B7',
  'Others': '#6EE7B7',
};

const TREATMENT_COLORS: { [key: string]: string } = {
  'Scaling': '#A7F3D0',
  'Filling': '#A7F3D0',
  'Pulpectomy': '#A7F3D0',
  'Extraction': '#A7F3D0',
  'Medication': '#A7F3D0',
  'Referral': '#A7F3D0',
  'Suture Removal': '#A7F3D0',
  'Cementation': '#A7F3D0',
};

interface Patient {
  id: string;
  queue_number: number;
  name: string;
  age: number;
  clinic_id?: string; // UUID
  clinic?: string;
  condition?: string;
  treatment?: string;
  timestamp: Date;
  note?: string;
  status?: 'normal' | 'na' | 'elderly' | 'complete';
  isElderly?: boolean;
  // Timeline fields
  registered_at?: Date;      // وقت التسجيل
  clinic_entry_at?: Date;    // وقت دخول العيادة
  completed_at?: Date;       // وقت الانتهاء
  doctor_name?: string;      // اسم الطبيب
  assigned_by_doctor_name?: string; // اسم الطبيب الذي قام بالتعيين
  // Permanent patient linking fields
  permanent_patient_id?: string;   // Foreign key to permanent_patients
  file_number?: string;            // File number for display
  patient_type?: 'walk-in' | 'permanent'; // Patient type
}

type TimelineEvent = {
  id: string;
  patient_id: string;
  event_type: string;
  event_details: string;
  timestamp: string;
  doctor_name?: string;
  assigned_by_doctor_name?: string;
};

// Circular Badge Component - Professional design matching menu button style
const CircularBadge = ({
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
  
  // Navigation Stack: تتبع المستوى الحالي
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
  
  // حفظ clinicId للرجوع إلى Clinic Details
  const [savedClinicId, setSavedClinicId] = useState<string | null>(null);
  const [savedClinicName, setSavedClinicName] = useState<string>('');
  
  // حفظ أرقام badges لكل عيادة (في App.tsx لمنع الحذف عند unmount)
  const [clinicBadges, setClinicBadges] = useState<{[clinicId: string]: {waiting: number, doctors: number, treatments: number}}>({});
  
  // دالة ترجمة أسماء المراكز للعربي
  const getArabicClinicName = (englishName: string): string => {
    const clinicNames: { [key: string]: string } = {
      'Mushrif Health Center': 'مركز مشرف الصحي',
      'Hittin Health Center': 'مركز حطين الصحي',
      'Bayan Health Center': 'مركز بيان الصحي',
      'Al-Zahra Health Center': 'مركز الزهرة الصحي',
      'Al-Noor Health Center': 'مركز النور الصحي',
    };
    return clinicNames[englishName] || englishName;
  };
  
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

  // Tooth Details Modal states (using shared ToothDetailsModal component)
  const [showToothModal, setShowToothModal] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<string>('');
  const [toothModalPatientId, setToothModalPatientId] = useState<string>('');

  // Referral options
  const referralOptions = [
    { key: 'endodontics', label: 'Endodontics' },
    { key: 'oralSurgery', label: 'Oral Surgery' },
    { key: 'orthodontics', label: 'Orthodontics' },
    { key: 'periodontics', label: 'Periodontics' },
    { key: 'prosthodontics', label: 'Prosthodontics' },
    { key: 'oralMedicine', label: 'Oral Medicine' },
  ];


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
      // استخدام selectedClinicId أولاً (للـ Coordinator/General Manager)، ثم userClinicId (للـ Doctor/Team Leader)
      const clinicId = selectedClinicId || userClinicId;
      
      //  إذا لم يكن هناك clinic_id محدد، لا تجلب أي شيء
      if (clinicId === null) {
        setPatients([]);
        return;
      }
      
      let query = supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId) // تصفية حسب clinic_id
        .is('archive_date', null) // فقط المرضى غير المؤرشفين
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
    
    // الاستماع لحدث الأرشفة التلقائية
    const handleArchiveCompleted = (date: string) => {
      // إعادة تحميل المرضى لتنظيف Timeline
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
  
  // Realtime: التحقق من myTotalTreatments
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

        // استثناء كلمة "Treatment" من العدد
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
      if (showAddModal) {
        // استخدام selectedClinicId أولاً (للـ Coordinator/General Manager)، ثم userClinicId (للـ Doctor/Team Leader)
        const clinicId = selectedClinicId || userClinicId;

        if (clinicId === null) {
          setNewPatientQueueNumber('1');
          return;
        }
        
        try {
          // Get max queue number for this clinic (فقط المرضى غير المؤرشفين)
          const { data: patientsData, error: patientsError } = await supabase
            .from('patients')
            .select('queue_number')
            .eq('clinic_id', clinicId)
            .is('archive_date', null) // فقط المرضى غير المؤرشفين
            .order('queue_number', { ascending: false })
            .limit(1);
          
          if (patientsError) throw patientsError;

          if (patientsData && patientsData.length > 0) {
            const nextNumber = patientsData[0].queue_number + 1;
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
  }, [showAddModal, selectedClinicId, userClinicId]); // إضافة selectedClinicId

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
  
  // Add missing queue number cards ("غير موجود") - BEFORE any filters
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
          name: 'غير موجود',
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
  
  // 2. NA filter: hide NA patients (including "غير موجود") when disabled
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
            setFileNumberSearchResults([]);
            setShowFileNumberSuggestions(false);
          }
        } else {
          setFileNumberSearchResults([]);
          setShowFileNumberSuggestions(false);
        }
      } catch (error) {
        console.error('Name search error:', error);
        setFileNumberSearchResults([]);
      }
    } else {
      // Clear search if name is too short
      setFileNumberSearchResults([]);
      setShowFileNumberSuggestions(false);
      if (name.length < 3) {
        setSelectedPermanentPatientId(null);
      }
    }
  };

  // Convert Arabic numerals to English (utility function)
  const arabicToEnglish = (str: string) => {
    if (!str) return '';

    const arabicNumerals = ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669'];

    // Remove null bytes and other problematic characters first
    const cleanStr = str.replace(/\x00/g, '').replace(/\u0000/g, '').trim();

    return cleanStr.split('').map(char => {
      const index = arabicNumerals.indexOf(char);
      return index !== -1 ? index.toString() : char;
    }).join('');
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
        const { error } = await supabase
          .from('patients')
          .update({
            name: newPatientName,
            queue_number: queueNumber,
            is_elderly: isElderly,
            status: isElderly ? 'elderly' : 'normal',
            note: newPatientNote.trim() || null,
            condition: newPatientCondition,
            // Note: We don't update file_number, permanent_patient_id, or patient_type
            // as these are core identifiers that shouldn't change after creation
          })
          .eq('id', modalEditingPatientId);

        if (error) throw error;

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

        Alert.alert('Success', 'Patient updated successfully');
        return;
      }

      // ========== ADD MODE: Create new patient ==========
      let permanentPatientId = selectedPermanentPatientId;

      // If in 'new-profile' mode, create a new permanent patient record
      if (patientMode === 'new-profile' && englishFileNumber) {
        const { encryptPatientName, encryptFileNumber } = await import('./lib/encryption');
        const { data: newPermanentPatient, error: permanentError } = await supabase
          .from('permanent_patients')
          .insert([
            {
              file_number_encrypted: encryptFileNumber(englishFileNumber),
              name_encrypted: encryptPatientName(newPatientName),
              clinic_id: selectedClinicId || userClinicId,
            },
          ])
          .select()
          .single();

        if (permanentError) throw permanentError;
        permanentPatientId = newPermanentPatient.id;
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

  // دالة الأرشفة - نقل جميع المرضى للأرشيف
  const handleArchive = async () => {
    try {
      const clinicId = selectedClinicId || userClinicId;
      
      if (clinicId === null) {
        Alert.alert('Error', 'Please select a clinic first');
        return;
      }

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // تحديث archive_date لجميع المرضى في المركز الحالي
      const { data, error } = await supabase
        .from('patients')
        .update({ 
          archive_date: today,
          status: 'complete' // تغيير الحالة إلى complete
        })
        .eq('clinic_id', clinicId) // عزل حسب المركز
        .is('archive_date', null); // فقط المرضى غير المؤرشفين

      if (error) throw error;

      // إعادة تحميل المرضى (سيكون فارغاً)
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
          // Load patient data into modal fields
          setNewPatientName(editPatient.name);
          setNewPatientFileNumber(editPatient.file_number || '');
          setNewPatientQueueNumber(editPatient.queue_number || '');
          setNewPatientCondition(editPatient.condition || 'Condition');
          setIsElderly(editPatient.isElderly || false);
          setNewPatientNote(editPatient.note || '');

          // Set edit mode
          setIsPatientEditMode(true);
          setModalEditingPatientId(patientId);

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

  // ═══════════════════════════════════════════════════════════════
  // Statistics Calculation for Permanent Patients
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate treatments from Dental Chart (editing_records)
   * Returns count for each treatment type (Filling, Extraction, Pulpectomy)
   */
  const calculateDentalChartTreatments = async (permanentPatientId: string): Promise<{ [key: string]: number }> => {
    try {
      const { data, error } = await getEditingRecords(permanentPatientId);

      if (error || !data) {
        return {};
      }

      const treatments: { [key: string]: number } = {};

      // Count each treatment from editing records
      data.forEach((record) => {
        const treatment = record.treatment;

        // Only count Filling, Extraction, Pulpectomy, Scaling
        if (['Filling', 'Extraction', 'Pulpectomy', 'Scaling'].includes(treatment)) {
          treatments[treatment] = (treatments[treatment] || 0) + 1;
        }
      });

      return treatments;
    } catch (error) {
      console.error('Error calculating dental chart treatments:', error);
      return {};
    }
  };

  /**
   * Check if there are any given referrals
   * Returns 1 if at least one referral is given, 0 otherwise
   */
  const calculateGivenReferrals = async (permanentPatientId: string): Promise<number> => {
    try {
      const { data, error } = await getReferrals(permanentPatientId);

      if (error || !data) {
        return 0;
      }

      // Check if at least one referral has status 'given'
      const hasGivenReferral = data.some(referral => referral.status === 'given');

      return hasGivenReferral ? 1 : 0;
    } catch (error) {
      console.error('Error calculating given referrals:', error);
      return 0;
    }
  };

  /**
   * Check if scaling was done today
   * Returns 1 if scaling done today, 0 otherwise
   */
  const checkScalingDoneToday = async (permanentPatientId: string, patientId: string): Promise<number> => {
    try {
      // Check if scaling was done today using lastScalingDates state
      const lastScalingDate = lastScalingDates[patientId];

      if (!lastScalingDate) {
        return 0;
      }

      const scalingDate = new Date(lastScalingDate);
      const today = new Date();

      const isSameDay = scalingDate.getDate() === today.getDate() &&
                       scalingDate.getMonth() === today.getMonth() &&
                       scalingDate.getFullYear() === today.getFullYear();

      return isSameDay ? 1 : 0;
    } catch (error) {
      console.error('Error checking scaling done today:', error);
      return 0;
    }
  };

  /**
   * Get treatment from badge (for treatments like Medication, Cementation, Suture Removal)
   * These are counted from the patient's treatment field
   */
  const getTreatmentFromBadge = (patient: Patient): string | null => {
    // Only count these treatments from badge
    const directTreatments = ['Medication', 'Cementation', 'Suture Removal'];

    if (patient.treatment && directTreatments.includes(patient.treatment)) {
      return patient.treatment;
    }

    return null;
  };

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
        // ═══════════════════════════════════════════════════════════════
        // PERMANENT PATIENT - Create separate records for each treatment
        // ═══════════════════════════════════════════════════════════════

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
              condition: 'Permanent Patient',
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
            condition: 'Permanent Patient',
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
        const scalingCount = await checkScalingDoneToday(patient.permanent_patient_id, patient.id);
        if (scalingCount > 0) {
          treatmentsToInsert.push({
            permanent_patient_id: patient.permanent_patient_id,
            name: patient.name,
            file_number: patient.file_number,
            treatment: 'Scaling',
            condition: 'Permanent Patient',
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
            condition: 'Permanent Patient',
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
        // ═══════════════════════════════════════════════════════════════
        // REGULAR PATIENT - Update existing record
        // ═══════════════════════════════════════════════════════════════

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

  // Helper function to generate dental summary from tooth data
  const generateDentalSummary = (teethData: ToothData[]): DentalSummary => {
    const summary: DentalSummary = {
      caries_count: 0,
      caries_teeth: [],
      rct_needed_count: 0,
      rct_needed_teeth: [],
      extraction_needed_count: 0,
      extraction_needed_teeth: [],
      filling_done_count: 0,
      filling_done_teeth: [],
      broken_teeth_count: 0,
      broken_teeth: [],
      total_issues: 0,
    };

    teethData.forEach((tooth) => {
      const { tooth_number, surfaces } = tooth;
      let hasCaries = false;
      let needsRCT = false;
      let needsExtraction = false;
      let hasFilling = false;
      let isBroken = false;

      // Check all surfaces for conditions
      Object.values(surfaces).forEach((condition) => {
        if (condition === 'caries') hasCaries = true;
        if (condition === 'pulpectomy') needsRCT = true;
        if (condition === 'extraction') needsExtraction = true;
        if (condition === 'filling_replacement') hasFilling = true; // Temporary filling needs permanent filling (GI is permanent)
        if (condition === 'broken') isBroken = true;
      });

      // Add to summary
      if (hasCaries) {
        summary.caries_count++;
        summary.caries_teeth.push(tooth_number);
      }
      if (needsRCT) {
        summary.rct_needed_count++;
        summary.rct_needed_teeth.push(tooth_number);
      }
      if (needsExtraction) {
        summary.extraction_needed_count++;
        summary.extraction_needed_teeth.push(tooth_number);
      }
      if (hasFilling) {
        summary.filling_done_count++;
        summary.filling_done_teeth.push(tooth_number);
      }
      if (isBroken) {
        summary.broken_teeth_count++;
        summary.broken_teeth.push(tooth_number);
      }
    });

    summary.total_issues =
      summary.caries_count +
      summary.rct_needed_count +
      summary.extraction_needed_count +
      summary.broken_teeth_count;

    return summary;
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
        console.log(`✅ Loaded ${notesResult.data.length} notes in loadDentalData for patient ${permanentPatientId}`);
      }
    } catch (error) {
      console.error('Error loading dental data:', error);
    } finally {
      setLoadingDentalData(prev => ({ ...prev, [patientId]: false }));
    }
  };

  // Load scaling data for all permanent patients in the list
  React.useEffect(() => {
    const loadScalingData = async () => {
      for (const patient of displayedPatients) {
        if (patient.permanent_patient_id && !lastScalingDates[patient.id]) {
          try {
            const scalingResult = await getScalingRecords(patient.permanent_patient_id);
            if (scalingResult.data && scalingResult.data.length > 0) {
              const lastScalingDate = scalingResult.data[0].timestamp;
              setLastScalingDates(prev => ({ ...prev, [patient.id]: lastScalingDate }));
            }
          } catch (error) {
            console.error('Error loading scaling data:', error);
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

    // Load dental data when expanding
    if (isExpanding && patient.permanent_patient_id) {
      await loadDentalData(patient.permanent_patient_id, patient.id);
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
          // مسح savedClinicId عند الرجوع للـ Profile
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
          // فتح DoctorProfileScreen للطبيب المختار
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
          // مسح savedClinicId عند الرجوع
          setSavedClinicId(null);
          setSavedClinicName('');
          setNavigationStack(['profile', 'departments']);
        }}
        onDoctorsPress={() => {
          setShowDoctorsScreen(true);
          setCurrentDoctorsScreen('list');
        }}
        onTimelinePress={() => {
          // فتح Timeline باستخدام savedClinicId
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
          // استخدام clinicId المُمرر من DoctorProfileScreen (المركز المختار)
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
                <Ionicons name="arrow-back" size={24} color="#7DD3C0" style={{ zIndex: 10 }} />
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
                if (patient.permanent_patient_id && !patientReferrals[patient.permanent_patient_id]) {
                  const result = await getReferrals(patient.permanent_patient_id);
                  if (result.data) {
                    setPatientReferrals(prev => ({ ...prev, [patient.permanent_patient_id!]: result.data || [] }));
                  }
                }
              }}
              patientToothNotes={patient.permanent_patient_id ? patientToothNotes[patient.permanent_patient_id] : undefined}
              onLoadToothNotes={async () => {
                if (patient.permanent_patient_id && !patientToothNotes[patient.permanent_patient_id]) {
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
                        // إغلاق Modal
                        setShowAddModal(false);
                        setIsModalExpanded(false);
                        setPatientMode('search');

                        // Reset edit mode
                        setIsPatientEditMode(false);
                        setModalEditingPatientId(null);

                        // تنظيف جميع الحقول
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
                        style={styles.textInput}
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
                            // تغيير موقع الزر حسب اتجاه الكتابة (عربي/إنجليزي)
                            (() => {
                              // اكتشاف اللغة: تحقق من أول حرف في النص
                              const firstChar = newPatientName.trim()[0];
                              // نطاق الأحرف العربية: \u0600-\u06FF
                              const isArabic = firstChar && /[\u0600-\u06FF]/.test(firstChar);
                              return isArabic ? { left: 12, right: undefined } : { right: 12, left: undefined };
                            })()
                          ]}
                          onPress={() => {
                            setNewPatientName('');
                            setShowFileNumberSuggestions(false);
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

                                // ملء الاسم الكامل وFile Number تلقائياً
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
                              // Keep only numbers (0-9 and ٠-٩)
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
                                setNewPatientFileNumber('');
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

        {/* ═══════════════════ TOOTH DETAILS MODAL (Shared Component) ═══════════════════ */}
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
                  console.log(`✅ Reloaded ${notesResult.data.length} notes for patient ${toothModalPatientId}`);
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

// Animated wrapper for PatientCard
function AnimatedPatientCard({ index, animKey, ...props }: { index: number; animKey: number; patient: Patient; showTimeline: boolean; onMenuPress: () => void; onNotePress: () => void; onCardPress: () => void; onEditField: (patientId: string, field: 'clinic' | 'condition' | 'treatment') => void; expandedCardId: string | null; onViewDetails: (patientId: string) => void; cardTimelines: { [key: string]: TimelineEvent[] }; showTimelineTab: { [key: string]: boolean }; onToggleTab: (patientId: string) => void; onPatientNamePress?: (patientId: string, fileNumber: string) => void; expandedPermanentCardId: string | null; onTogglePermanentExpansion: (patient: Patient) => void; activeDentalTab: 'treatment' | 'referrals' | 'notes'; onDentalTabChange: (tab: 'treatment' | 'referrals' | 'notes') => void; dentalSummary?: DentalSummary; loadingDentalData?: boolean; onToothEditPress: (permanentPatientId: string, tooth: string) => void; patientReferrals?: Referral[]; onLoadReferrals?: () => void; onUpdateReferralStatus?: (referralId: string, newStatus: 'not_given' | 'given') => void; patientToothNotes?: ToothNote[]; onLoadToothNotes?: () => void; lastScalingDates?: { [key: string]: string | null }; }) {
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

function PatientCard({ patient, showTimeline, onMenuPress, onNotePress, onCardPress, onEditField, expandedCardId, onViewDetails, cardTimelines, showTimelineTab, onToggleTab, onPatientNamePress, expandedPermanentCardId, onTogglePermanentExpansion, activeDentalTab, onDentalTabChange, dentalSummary, loadingDentalData, expandAnim, onToothEditPress, patientReferrals, onLoadReferrals, onUpdateReferralStatus, patientToothNotes, onLoadToothNotes, lastScalingDates, currentDoctorName, onUpdateScalingDate }: {
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
}) {
  // تأثير زجاجي: نفس الألوان لكن شفافة (0.75 = واضح جداً)
  // إذا كان DONE: نفس تدرج الكرت الصلب (بدون شفافية)
  // المريض الدائم: لون أخضر فاتح
  const isPermanentPatient = patient.patient_type === 'permanent' || patient.permanent_patient_id != null;

  const gradientColors: [string, string] = isPermanentPatient
    ? (patient.status === 'complete'
        ? ['#BFDBFE', '#DBEAFE']  // أزرق فاتح للمريض الدائم المكتمل
        : ['rgba(191, 219, 254, 0.75)', 'rgba(219, 234, 254, 0.75)'])  // أزرق شفاف للمريض الدائم العادي
    : (patient.status === 'complete'
        ? ['#B8D4F1', '#D4B8E8']  // أزرق/بنفسجي للمريض العادي المكتمل
        : ['rgba(184, 212, 241, 0.75)', 'rgba(212, 184, 232, 0.75)']);  // أزرق/بنفسجي شفاف للمريض العادي

  // Queue Number colors - ألوان أكثر حيوية ووضوحاً
  const queueNumberColors: [string, string] = isPermanentPatient
    ? ['#60A5FA', '#93C5FD']  // أزرق حيوي للمريض الدائم
    : gradientColors;  // نفس لون الكرت للمريض العادي
  const clinicColor = CLINICS.find(c => c.name === patient.clinic)?.color || '#E5E7EB';
  const conditionColor = CONDITIONS.find(c => c.name === patient.condition)?.color || '#E5E7EB';
  const treatmentColor = TREATMENTS.find(t => t.name === patient.treatment)?.color || '#E5E7EB';
  
  // Check if this card is expanded
  const isExpanded = expandedCardId === patient.id;
  const patientTimeline = cardTimelines[patient.id] || [];
  const showingTimeline = showTimelineTab[patient.id] !== false; // default true

  // Check if permanent patient card is expanded (for dental info)
  const isPermanentCardExpanded = expandedPermanentCardId === patient.id;

  // Determine card background color based on status
  let cardBgColor = 'transparent'; // شفاف ليظهر التصميم الزجاجي
  if (patient.status === 'na') cardBgColor = 'rgba(209, 213, 219, 0.3)'; // رمادي شفاف
  if (patient.status === 'elderly') cardBgColor = 'rgba(254, 215, 170, 0.3)'; // برتقالي شفاف
  // complete cards use gradient, not background color

  const textColor = '#4A5568';

  return (
    <View style={[
      styles.patientCardWrapper,
      shadows.card
    ]}>
      {/* Patient Card Content */}
      {patient.status === 'complete' ? (
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
                outputRange: [60, 10], // من 60 إلى 10 عند التوسع
              }),
            }}
          >
          {/* Header Row: Menu (left) - Status Badges - Name */}
          {!isPermanentCardExpanded ? (
            // Normal Collapsed Header
            <View style={styles.cardHeader}>
              <View style={styles.leftSection}>
                <>
                  <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
                    <Text style={[styles.menuIcon, { color: '#FFFFFF' }]}>⋮</Text>
                  </TouchableOpacity>

                  {/* Done Badge - Green Circle */}
                  <CircularBadge letter="D" backgroundColor="#10B981" />

                  {/* Elderly Badge - Orange Circle */}
                  {patient.isElderly && (
                    <CircularBadge letter="E" backgroundColor="#F97316" />
                  )}

                  {/* Special Needs Badge - Purple Circle */}
                  {patient.isSpecialNeeds && (
                    <CircularBadge letter="S" backgroundColor="#8B5CF6" />
                  )}

                  {/* Note Badge - Blue Circle with tap action */}
                  {patient.note && (
                    <CircularBadge letter="N" backgroundColor="#3B82F6" onPress={onNotePress} />
                  )}
                </>

                {/* Expand/Collapse Button - Only for Permanent Patients */}
                {isPermanentPatient && (
                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onTogglePermanentExpansion(patient);
                    }}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                )}
              </View>

              {isPermanentPatient ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
                      onPatientNamePress(patient.permanent_patient_id, patient.file_number);
                    }
                  }}
                >
                  <Text style={[styles.patientName, { color: '#FFFFFF', fontSize: 20 }]}>{patient.name}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.patientName, { color: '#FFFFFF' }]}>{patient.name}</Text>
              )}
            </View>
          ) : (
            // Professional Expanded Header - Enhanced Design (RTL)
            <View style={{ marginBottom: 16 }}>
              {/* Collapse Button - Top Left */}
              <View style={{ position: 'absolute', top: -8, left: -8, zIndex: 10 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    elevation: 4,
                  }}
                  onPress={(e) => {
                    e.stopPropagation();
                    onTogglePermanentExpansion(patient);
                  }}
                >
                  <Ionicons name="chevron-up" size={20} color="#1E3A8A" />
                </TouchableOpacity>
              </View>

              {/* Professional Patient Profile Header */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={(e) => {
                  e.stopPropagation();
                  if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
                    onPatientNamePress(patient.permanent_patient_id, patient.file_number);
                  }
                }}
                style={{
                  backgroundColor: 'rgba(219, 234, 254, 0.95)',
                  borderRadius: 16,
                  padding: 0,
                  marginBottom: 2,
                  borderWidth: 2,
                  borderColor: '#FFFFFF',
                  shadowColor: '#3B82F6',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 5,
                  overflow: 'hidden',
                }}
              >
                {/* Header Title with Gradient Background */}
                <View style={{
                  backgroundColor: '#3B82F6',
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                }}>
                  <Text style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    textAlign: 'center',
                  }}>
                    Patient Details
                  </Text>
                </View>

                {/* Content Area */}
                <View style={{ padding: 18 }}>
                  {/* Name Row */}
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#1E40AF',
                        marginRight: 8,
                      }} />
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: '#1E40AF',
                      }}>
                        Name:
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 18,
                      fontWeight: '800',
                      color: '#1E40AF',
                    }}>
                      {patient.name}
                    </Text>
                  </View>

                  {/* Divider Line */}
                  <View style={{
                    height: 1,
                    backgroundColor: '#FFFFFF',
                    marginBottom: 12,
                  }} />

                  {/* Profile Number Row */}
                  {patient.file_number && (
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#1E40AF',
                          marginRight: 8,
                        }} />
                        <Text style={{
                          fontSize: 16,
                          fontWeight: '700',
                          color: '#1E40AF',
                        }}>
                          Profile Number:
                        </Text>
                      </View>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: '#1E40AF',
                      }}>
                        {patient.file_number}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {/* Oral Hygiene Container - Only when Expanded */}
              <View style={{
                backgroundColor: 'transparent',
                borderRadius: 14,
                padding: 14,
                marginTop: 10,
                borderWidth: 2,
                borderColor: '#FFFFFF',
              }}>
                {/* Header - Left aligned */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="water" size={18} color="#10b981" />
                    <Text style={{
                      fontSize: 15,
                      fontWeight: '700',
                      color: '#10b981',
                      marginLeft: 6,
                    }}>
                      Oral Hygiene
                    </Text>
                  </View>
                </View>

                {/* Content */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                  {/* Last Scaling Date */}
                  <View style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    flex: 1,
                    marginLeft: 10,
                  }}>
                    {(() => {
                      if (!lastScalingDates?.[patient.id]) {
                        return (
                          <Text style={{
                            fontSize: 12,
                            color: '#64748b',
                            textAlign: 'right',
                            fontStyle: 'italic',
                          }}>
                            No scaling record
                          </Text>
                        );
                      }

                      // Check if scaling is within last 6 months
                      const lastScalingDate = new Date(lastScalingDates[patient.id]);

                      // Validate date
                      if (isNaN(lastScalingDate.getTime())) {
                        return (
                          <Text style={{
                            fontSize: 12,
                            color: '#64748b',
                            textAlign: 'right',
                            fontStyle: 'italic',
                          }}>
                            No scaling record
                          </Text>
                        );
                      }

                      const today = new Date();
                      const monthsDiff = (today.getTime() - lastScalingDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

                      if (monthsDiff > 6) {
                        return (
                          <Text style={{
                            fontSize: 12,
                            color: '#f59e0b',
                            textAlign: 'right',
                            fontWeight: '600',
                          }}>
                            ⚠️ No recent scaling
                          </Text>
                        );
                      }

                      return (
                        <View>
                          <Text style={{
                            fontSize: 10,
                            color: '#059669',
                            marginBottom: 2,
                            textAlign: 'right',
                            fontWeight: '600',
                          }}>
                            Last Scaling
                          </Text>
                          <Text style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: '#10b981',
                            textAlign: 'right',
                          }}>
                            {lastScalingDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Mark Scaling Done Button */}
                  <TouchableOpacity
                    style={{
                      backgroundColor: (() => {
                        // Check if scaling was done today
                        if (!lastScalingDates?.[patient.id]) return '#10b981';
                        const lastScalingDate = new Date(lastScalingDates[patient.id]);
                        const today = new Date();
                        const isSameDay = lastScalingDate.getDate() === today.getDate() &&
                                         lastScalingDate.getMonth() === today.getMonth() &&
                                         lastScalingDate.getFullYear() === today.getFullYear();
                        return isSameDay ? '#059669' : '#10b981';
                      })(),
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 10,
                      flexDirection: 'row-reverse',
                      alignItems: 'center',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 3,
                      elevation: 3,
                    }}
                    onPress={async (e) => {
                      e.stopPropagation();

                      if (!patient.permanent_patient_id) {
                        Alert.alert('Error', 'Patient ID not found');
                        return;
                      }

                      try {
                        const { data, error } = await createScalingRecord(
                          patient.permanent_patient_id,
                          currentDoctorName || 'Doctor'
                        );

                        if (error) {
                          Alert.alert('Error', 'Failed to save scaling record');
                          return;
                        }

                        // Refresh scaling dates
                        const { data: scalingRecords } = await getScalingRecords(patient.permanent_patient_id);
                        if (scalingRecords && scalingRecords.length > 0) {
                          const mostRecent = scalingRecords.sort(
                            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                          )[0];
                          onUpdateScalingDate?.(patient.id, mostRecent.timestamp);
                        }

                        Alert.alert('Success', 'Scaling record saved successfully');
                      } catch (err) {
                        console.error('Error saving scaling record:', err);
                        Alert.alert('Error', 'An unexpected error occurred');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    {(() => {
                      // Show checkmark icon only if scaling was done today
                      if (!lastScalingDates?.[patient.id]) return null;
                      const lastScalingDate = new Date(lastScalingDates[patient.id]);
                      const today = new Date();
                      const isSameDay = lastScalingDate.getDate() === today.getDate() &&
                                       lastScalingDate.getMonth() === today.getMonth() &&
                                       lastScalingDate.getFullYear() === today.getFullYear();
                      return isSameDay ? <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" /> : null;
                    })()}
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      marginRight: (() => {
                        if (!lastScalingDates?.[patient.id]) return 0;
                        const lastScalingDate = new Date(lastScalingDates[patient.id]);
                        const today = new Date();
                        const isSameDay = lastScalingDate.getDate() === today.getDate() &&
                                         lastScalingDate.getMonth() === today.getMonth() &&
                                         lastScalingDate.getFullYear() === today.getFullYear();
                        return isSameDay ? 6 : 0;
                      })(),
                    }}>
                      Scaling Done
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Divider - Only show when NOT expanded */}
          {!isPermanentCardExpanded && (
            <View style={[styles.divider, { backgroundColor: 'rgba(255, 255, 255, 0.4)' }]} />
          )}

          {/* Tags Row - Hide when expanded for permanent patients */}
          {!isPermanentCardExpanded && (
            <View style={styles.tagsRow}>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(147, 197, 253, 0.3)' : 'rgba(255, 255, 255, 0.3)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'clinic'); }}
              >
                <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(191, 219, 254, 0.3)' : 'rgba(255, 255, 255, 0.3)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'condition'); }}
              >
                <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(219, 234, 254, 0.3)' : 'rgba(255, 255, 255, 0.3)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'treatment'); }}
              >
                <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {showTimeline && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.4)' }}>
              {patient.registered_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="add-circle-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Registered: {patient.registered_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.clinic_entry_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="enter-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Entered Clinic: {patient.clinic_entry_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.completed_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Completed: {patient.completed_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.doctor_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="person-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Done by Dr. {patient.doctor_name}
                  </Text>
                </View>
              )}
              {patient.assigned_by_doctor_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="people-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6, fontStyle: 'italic' }}>
                    Assigned by Dr. {patient.assigned_by_doctor_name}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Expanded Dental Info - Inside Card */}
          {isPermanentPatient && isPermanentCardExpanded && (
            <Animated.View
              style={{
                maxHeight: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 580], // ارتفاع الكرت الموسع
                }),
                opacity: expandAnim,
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingTop: 10, marginTop: 6, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' }}>
                {/* White Divider Line */}
                <View style={{
                  height: 2,
                  backgroundColor: '#FFFFFF',
                  marginBottom: 14,
                }} />

                {/* Segmented Control - Enhanced Design */}
                <View
                  style={{
                    backgroundColor: 'rgba(219, 234, 254, 0.95)',
                    borderRadius: 12,
                    padding: 4,
                    marginBottom: 14,
                    flexDirection: 'row',
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => onDentalTabChange('treatment')}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'treatment' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="medkit"
                        size={14}
                        color={activeDentalTab === 'treatment' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
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
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'referrals' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="people"
                        size={14}
                        color={activeDentalTab === 'referrals' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
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
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'notes' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="document-text"
                        size={14}
                        color={activeDentalTab === 'notes' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
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
                          contentContainerStyle={{ paddingBottom: 80 }}
                        >
                          <View style={styles.treatmentContainer}>
                          {/* Caries Section - Modern Card Design */}
                          {dentalSummary.caries_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Caries</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.caries_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Pulpectomy</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.rct_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Extraction</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.extraction_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Broken Tooth/Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.broken_teeth_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Need Permanent Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.filling_done_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                          contentContainerStyle={{ paddingBottom: 80 }}
                        >
                          <View style={{ gap: 12 }}>
                            {/* SECTION 1: Need Referral - Orange Cards */}
                            {(() => {
                              const notGivenReferrals = patientReferrals.filter(r => r.status === 'not_given');
                              if (notGivenReferrals.length === 0) return null;

                              return (
                                <>
                                  {/* Section Header */}
                                  <View style={{ marginBottom: 8, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(254, 215, 170, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#EA580C' }}>
                                      Need Referral ({notGivenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {notGivenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(254, 215, 170, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#EA580C' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <TouchableOpacity
                                          style={{
                                            backgroundColor: 'rgba(251, 146, 60, 0.3)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 12,
                                            borderWidth: 1,
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
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>Not Given</Text>
                                        </TouchableOpacity>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(234, 88, 12, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(234, 88, 12, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                                            {referral.tooth_number || 'General'}
                                          </Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
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
                                  <View style={{ marginBottom: 8, marginTop: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(167, 243, 208, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669' }}>
                                      Referrals Records ({givenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {givenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(167, 243, 208, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#059669' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <View style={{
                                          backgroundColor: 'rgba(52, 211, 153, 0.3)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 4,
                                          borderRadius: 12,
                                          borderWidth: 1,
                                          borderColor: 'rgba(52, 211, 153, 0.5)',
                                        }}>
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>Given ✓</Text>
                                        </View>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(5, 150, 105, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(5, 150, 105, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{referral.tooth_number}</Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              {/* Header: Tooth Number + Badge */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <View style={{
                                  backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                                    {note.tooth_number}
                                  </Text>
                                </View>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E3A8A' }}>
                                    Note
                                  </Text>
                                </View>
                              </View>

                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                              {/* Note Content */}
                              <View style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                padding: 10,
                                borderRadius: 8,
                                marginBottom: 8,
                              }}>
                                <Text style={{ fontSize: 13, color: '#1E293B', lineHeight: 18, fontStyle: 'italic' }}>
                                  "{note.note}"
                                </Text>
                              </View>

                              {/* Footer: Doctor & Date */}
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                  Dr. {note.doctor_name}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
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
          )}

          </Animated.View>
        </LinearGradient>
      ) : (
        <LinearGradient
            colors={isPermanentPatient
              ? ['rgba(191, 219, 254, 0.25)', 'rgba(219, 234, 254, 0.25)']  // أزرق فاتح للمريض الدائم
              : ['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']}  // أزرق/بنفسجي للووك-ان
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.patientCardContent}
          >
            <Animated.View
              style={{
                flex: 1,
                paddingRight: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [60, 10], // من 60 إلى 10 عند التوسع
                }),
              }}
            >
            {/* Header Row: Menu (left) - Status Badges - Name */}
            {!isPermanentCardExpanded ? (
              // Normal Collapsed Header
              <View style={styles.cardHeader}>
                <View style={styles.leftSection}>
                  <>
                    <TouchableOpacity style={styles.menuButton} onPress={(e) => { e.stopPropagation(); onMenuPress(); }}>
                      <Text style={[styles.menuIcon, { color: isPermanentPatient ? '#1E3A8A' : textColor }]}>⋮</Text>
                    </TouchableOpacity>

                    {/* Elderly Badge - Orange Circle */}
                    {patient.isElderly && (
                      <CircularBadge letter="E" backgroundColor="#F97316" />
                    )}

                    {/* Special Needs Badge - Purple Circle */}
                    {patient.isSpecialNeeds && (
                      <CircularBadge letter="S" backgroundColor="#8B5CF6" />
                    )}

                    {/* N/A Badge - Gray Circle */}
                    {patient.status === 'na' && (
                      <CircularBadge letter="X" backgroundColor="#6B7280" />
                    )}

                    {/* Note Badge - Blue Circle with tap action */}
                    {patient.note && (
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); onNotePress(); }}>
                        <CircularBadge letter="N" backgroundColor="#3B82F6" />
                      </TouchableOpacity>
                    )}
                  </>

                  {/* Expand/Collapse Button - Only for Permanent Patients */}
                  {isPermanentPatient && (
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        onTogglePermanentExpansion(patient);
                      }}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color="#1E3A8A"
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {isPermanentPatient ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
                        onPatientNamePress(patient.permanent_patient_id, patient.file_number);
                      }
                    }}
                  >
                    <Text style={[styles.patientName, { color: '#1E3A8A' }]}>{patient.name}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.patientName, { color: textColor }]}>{patient.name}</Text>
                )}
              </View>
            ) : (
              // Professional Expanded Header - Enhanced Design (RTL)
              <View style={{ marginBottom: 16 }}>
                {/* Collapse Button - Top Left */}
                <View style={{ position: 'absolute', top: -8, left: -8, zIndex: 10 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      elevation: 4,
                    }}
                    onPress={(e) => {
                      e.stopPropagation();
                      onTogglePermanentExpansion(patient);
                    }}
                  >
                    <Ionicons name="chevron-up" size={20} color="#1E3A8A" />
                  </TouchableOpacity>
                </View>

                {/* Professional Patient Profile Header */}
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
                      onPatientNamePress(patient.permanent_patient_id, patient.file_number);
                    }
                  }}
                  style={{
                    backgroundColor: 'rgba(219, 234, 254, 0.95)',
                    borderRadius: 16,
                    padding: 0,
                    marginBottom: 2,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    shadowColor: '#3B82F6',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.15,
                    shadowRadius: 8,
                    elevation: 5,
                    overflow: 'hidden',
                  }}
                >
                  {/* Header Title with Gradient Background */}
                  <View style={{
                    backgroundColor: '#3B82F6',
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                  }}>
                    <Text style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textAlign: 'center',
                    }}>
                      Patient Details
                    </Text>
                  </View>

                  {/* Content Area */}
                  <View style={{ padding: 18 }}>
                    {/* Name Row */}
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#1E40AF',
                          marginRight: 8,
                        }} />
                        <Text style={{
                          fontSize: 16,
                          fontWeight: '700',
                          color: '#1E40AF',
                        }}>
                          Name:
                        </Text>
                      </View>
                      <Text style={{
                        fontSize: 18,
                        fontWeight: '800',
                        color: '#1E40AF',
                      }}>
                        {patient.name}
                      </Text>
                    </View>

                    {/* Divider Line */}
                    <View style={{
                      height: 1,
                      backgroundColor: '#FFFFFF',
                      marginBottom: 12,
                    }} />

                    {/* Profile Number Row */}
                    {patient.file_number && (
                      <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: '#1E40AF',
                            marginRight: 8,
                          }} />
                          <Text style={{
                            fontSize: 16,
                            fontWeight: '700',
                            color: '#1E40AF',
                          }}>
                            Profile Number:
                          </Text>
                        </View>
                        <Text style={{
                          fontSize: 16,
                          fontWeight: '700',
                          color: '#1E40AF',
                        }}>
                          {patient.file_number}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Oral Hygiene Container - Only when Expanded */}
                <View style={{
                  backgroundColor: 'transparent',
                  borderRadius: 14,
                  padding: 14,
                  marginTop: 10,
                  borderWidth: 2,
                  borderColor: '#FFFFFF',
                }}>
                  {/* Header - Left aligned */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="water" size={18} color="#10b981" />
                      <Text style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: '#10b981',
                        marginLeft: 6,
                      }}>
                        Oral Hygiene
                      </Text>
                    </View>
                  </View>

                  {/* Content */}
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* Last Scaling Date */}
                    <View style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      flex: 1,
                      marginLeft: 10,
                    }}>
                      {(() => {
                        if (!lastScalingDates?.[patient.id]) {
                          return (
                            <Text style={{
                              fontSize: 12,
                              color: '#64748b',
                              textAlign: 'right',
                              fontStyle: 'italic',
                            }}>
                              No scaling record
                            </Text>
                          );
                        }

                        // Check if scaling is within last 6 months
                        const lastScalingDate = new Date(lastScalingDates[patient.id]);

                        // Validate date
                        if (isNaN(lastScalingDate.getTime())) {
                          return (
                            <Text style={{
                              fontSize: 12,
                              color: '#64748b',
                              textAlign: 'right',
                              fontStyle: 'italic',
                            }}>
                              No scaling record
                            </Text>
                          );
                        }

                        const today = new Date();
                        const monthsDiff = (today.getTime() - lastScalingDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

                        if (monthsDiff > 6) {
                          return (
                            <Text style={{
                              fontSize: 12,
                              color: '#f59e0b',
                              textAlign: 'right',
                              fontWeight: '600',
                            }}>
                              ⚠️ No recent scaling
                            </Text>
                          );
                        }

                        return (
                          <View>
                            <Text style={{
                              fontSize: 10,
                              color: '#059669',
                              marginBottom: 2,
                              textAlign: 'right',
                              fontWeight: '600',
                            }}>
                              Last Scaling
                            </Text>
                            <Text style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: '#10b981',
                              textAlign: 'right',
                            }}>
                              {lastScalingDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>

                    {/* Mark Scaling Done Button */}
                    <TouchableOpacity
                      style={{
                        backgroundColor: (() => {
                          // Check if scaling was done today
                          if (!lastScalingDates?.[patient.id]) return '#10b981';
                          const lastScalingDate = new Date(lastScalingDates[patient.id]);
                          const today = new Date();
                          const isSameDay = lastScalingDate.getDate() === today.getDate() &&
                                           lastScalingDate.getMonth() === today.getMonth() &&
                                           lastScalingDate.getFullYear() === today.getFullYear();
                          return isSameDay ? '#059669' : '#10b981';
                        })(),
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 10,
                        flexDirection: 'row-reverse',
                        alignItems: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3,
                        elevation: 3,
                      }}
                      onPress={async (e) => {
                        e.stopPropagation();

                        if (!patient.permanent_patient_id) {
                          Alert.alert('Error', 'Patient ID not found');
                          return;
                        }

                        try {
                          const { data, error } = await createScalingRecord(
                            patient.permanent_patient_id,
                            currentDoctorName || 'Doctor'
                          );

                          if (error) {
                            Alert.alert('Error', 'Failed to save scaling record');
                            return;
                          }

                          // Refresh scaling dates
                          const { data: scalingRecords } = await getScalingRecords(patient.permanent_patient_id);
                          if (scalingRecords && scalingRecords.length > 0) {
                            const mostRecent = scalingRecords.sort(
                              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                            )[0];
                            onUpdateScalingDate?.(patient.id, mostRecent.timestamp);
                          }

                          Alert.alert('Success', 'Scaling record saved successfully');
                        } catch (err) {
                          console.error('Error saving scaling record:', err);
                          Alert.alert('Error', 'An unexpected error occurred');
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      {(() => {
                        // Show checkmark icon only if scaling was done today
                        if (!lastScalingDates?.[patient.id]) return null;
                        const lastScalingDate = new Date(lastScalingDates[patient.id]);
                        const today = new Date();
                        const isSameDay = lastScalingDate.getDate() === today.getDate() &&
                                         lastScalingDate.getMonth() === today.getMonth() &&
                                         lastScalingDate.getFullYear() === today.getFullYear();
                        return isSameDay ? <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" /> : null;
                      })()}
                      <Text style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: '#FFFFFF',
                        marginRight: (() => {
                          if (!lastScalingDates?.[patient.id]) return 0;
                          const lastScalingDate = new Date(lastScalingDates[patient.id]);
                          const today = new Date();
                          const isSameDay = lastScalingDate.getDate() === today.getDate() &&
                                           lastScalingDate.getMonth() === today.getMonth() &&
                                           lastScalingDate.getFullYear() === today.getFullYear();
                          return isSameDay ? 6 : 0;
                        })(),
                      }}>
                        Scaling Done
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

          {/* Divider - Only show when NOT expanded */}
          {!isPermanentCardExpanded && (
            <View style={styles.divider} />
          )}

          {/* Tags Row - Hide when expanded for permanent patients */}
          {!isPermanentCardExpanded && (
            <View style={styles.tagsRow}>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(147, 197, 253, 0.75)' : 'rgba(184, 212, 241, 0.75)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'clinic'); }}
              >
                <Text style={[styles.tagText, patient.clinic && patient.clinic !== 'Clinic' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(191, 219, 254, 0.75)' : 'rgba(200, 198, 236, 0.75)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'condition'); }}
              >
                <Text style={[styles.tagText, patient.condition && patient.condition !== 'Condition' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tag, { backgroundColor: isPermanentPatient ? 'rgba(219, 234, 254, 0.75)' : 'rgba(212, 184, 232, 0.75)' }]}
                onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'treatment'); }}
              >
                <Text style={[styles.tagText, patient.treatment && patient.treatment !== 'Treatment' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {showTimeline && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.4)' }}>
              {patient.registered_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="add-circle-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Registered: {patient.registered_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.clinic_entry_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="enter-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Entered Clinic: {patient.clinic_entry_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.completed_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Completed: {patient.completed_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.doctor_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person-outline" size={14} color={isPermanentPatient ? '#2563EB' : '#9CA3AF'} />
                  <Text style={{ fontSize: 11, color: isPermanentPatient ? '#2563EB' : '#9CA3AF', marginLeft: 6 }}>
                    Doctor: {patient.doctor_name}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Expanded Dental Info - Inside Card (Non-Complete) */}
          {isPermanentPatient && isPermanentCardExpanded && (
            <Animated.View
              style={{
                maxHeight: expandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 580], // ارتفاع الكرت الموسع
                }),
                opacity: expandAnim,
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingTop: 10, marginTop: 6, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' }}>
                {/* White Divider Line */}
                <View style={{
                  height: 2,
                  backgroundColor: '#FFFFFF',
                  marginBottom: 14,
                }} />

                {/* Segmented Control - Enhanced Design */}
                <View
                  style={{
                    backgroundColor: 'rgba(219, 234, 254, 0.95)',
                    borderRadius: 12,
                    padding: 4,
                    marginBottom: 14,
                    flexDirection: 'row',
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => onDentalTabChange('treatment')}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'treatment' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'treatment' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="medkit"
                        size={14}
                        color={activeDentalTab === 'treatment' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
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
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'referrals' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'referrals' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="people"
                        size={14}
                        color={activeDentalTab === 'referrals' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
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
                      paddingVertical: 12,
                      borderRadius: 9,
                      backgroundColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: activeDentalTab === 'notes' ? '#3B82F6' : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 4,
                      elevation: activeDentalTab === 'notes' ? 3 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons
                        name="document-text"
                        size={14}
                        color={activeDentalTab === 'notes' ? '#FFFFFF' : '#64748B'}
                      />
                      <Text style={{
                        fontSize: 13,
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
                          contentContainerStyle={{ paddingBottom: 80 }}
                        >
                          <View style={styles.treatmentContainer}>
                          {/* Caries Section - Modern Card Design */}
                          {dentalSummary.caries_count > 0 && (
                            <View
                              style={{
                                backgroundColor: 'rgba(191, 219, 254, 0.3)',
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Caries</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.caries_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Pulpectomy</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.rct_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Extraction</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.extraction_needed_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Broken Tooth/Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.broken_teeth_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{
                                  fontSize: 15,
                                  fontWeight: '700',
                                  color: '#1E3A8A',
                                }}>Need Permanent Filling</Text>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: '700',
                                    color: '#1E3A8A',
                                  }}>{dentalSummary.filling_done_count}</Text>
                                </View>
                              </View>
                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />
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
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 6,
                                        margin: 2,
                                        borderWidth: 1,
                                        borderColor: 'rgba(147, 197, 253, 0.6)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 12,
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
                          contentContainerStyle={{ paddingBottom: 80 }}
                        >
                          <View style={{ gap: 12 }}>
                            {/* SECTION 1: Need Referral - Orange Cards */}
                            {(() => {
                              const notGivenReferrals = patientReferrals.filter(r => r.status === 'not_given');
                              if (notGivenReferrals.length === 0) return null;

                              return (
                                <>
                                  {/* Section Header */}
                                  <View style={{ marginBottom: 8, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(254, 215, 170, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#EA580C' }}>
                                      Need Referral ({notGivenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {notGivenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(254, 215, 170, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#EA580C' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <TouchableOpacity
                                          style={{
                                            backgroundColor: 'rgba(251, 146, 60, 0.3)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 12,
                                            borderWidth: 1,
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
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>Not Given</Text>
                                        </TouchableOpacity>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(234, 88, 12, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(234, 88, 12, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                                            {referral.tooth_number || 'General'}
                                          </Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
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
                                  <View style={{ marginBottom: 8, marginTop: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(167, 243, 208, 0.6)' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669' }}>
                                      Referrals Records ({givenReferrals.length})
                                    </Text>
                                  </View>

                                  {/* Individual Referral Cards */}
                                  {givenReferrals.map((referral) => (
                                    <View key={referral.id} style={{
                                      backgroundColor: 'rgba(167, 243, 208, 0.4)',
                                      borderRadius: 10,
                                      padding: 14,
                                      marginBottom: 10,
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}>
                                      {/* Referral Type */}
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#059669' }}>
                                          {referral.referral_type}
                                        </Text>
                                        <View style={{
                                          backgroundColor: 'rgba(52, 211, 153, 0.3)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 4,
                                          borderRadius: 12,
                                          borderWidth: 1,
                                          borderColor: 'rgba(52, 211, 153, 0.5)',
                                        }}>
                                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>Given ✓</Text>
                                        </View>
                                      </View>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                                      {/* Tooth Number */}
                                      <View style={{ marginBottom: 8 }}>
                                        <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Tooth Number</Text>
                                        <View style={{
                                          backgroundColor: 'rgba(5, 150, 105, 0.5)',
                                          paddingHorizontal: 10,
                                          paddingVertical: 5,
                                          borderRadius: 6,
                                          alignSelf: 'flex-start',
                                          borderWidth: 1,
                                          borderColor: 'rgba(5, 150, 105, 0.7)',
                                        }}>
                                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{referral.tooth_number}</Text>
                                        </View>
                                      </View>

                                      {/* Notes if exists */}
                                      {referral.notes && (
                                        <View style={{
                                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                          padding: 8,
                                          borderRadius: 6,
                                          marginBottom: 8,
                                        }}>
                                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                                            "{referral.notes}"
                                          </Text>
                                        </View>
                                      )}

                                      {/* Date and Doctor */}
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                          {new Date(referral.timestamp).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
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
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              {/* Header: Tooth Number + Badge */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <View style={{
                                  backgroundColor: 'rgba(147, 197, 253, 0.3)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: 'rgba(147, 197, 253, 0.6)',
                                }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                                    {note.tooth_number}
                                  </Text>
                                </View>
                                <View style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E3A8A' }}>
                                    Note
                                  </Text>
                                </View>
                              </View>

                              {/* Divider */}
                              <View style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginBottom: 10 }} />

                              {/* Note Content */}
                              <View style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                padding: 10,
                                borderRadius: 8,
                                marginBottom: 8,
                              }}>
                                <Text style={{ fontSize: 13, color: '#1E293B', lineHeight: 18, fontStyle: 'italic' }}>
                                  "{note.note}"
                                </Text>
                              </View>

                              {/* Footer: Doctor & Date */}
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
                                  Dr. {note.doctor_name}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>
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
          )}

          </Animated.View>
        </LinearGradient>
      )}

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



const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  gradient: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#1F2937', letterSpacing: -0.5 }, // تكبير العنوان
  headerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 }, // رمادي كما كان
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  // زر البروفايل - مطابق تماماً لـ FAB
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  profileButtonGlass: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  profileButtonInnerGlow: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent', // إزالة Inner Glow
  },
  // زر الأرشفة الاحترافي
  archiveButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  statsContainer: { flexDirection: 'row', paddingHorizontal: 24, gap: 16, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // زجاجي شفاف
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    minHeight: 150,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)', // حواف بيضاء
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#5B9FED',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 12,
    elevation: Platform.OS === 'android' ? 0 : 5,
  },
  statCardActive: {
    backgroundColor: 'rgba(125, 211, 192, 0.3)', // زجاجي فيروزي عند التفعيل
    borderWidth: 2.5,
    borderColor: 'rgba(125, 211, 192, 0.9)', // حواف فيروزية
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#7DD3C0',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 0 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.4,
    shadowRadius: Platform.OS === 'android' ? 0 : 16,
    elevation: Platform.OS === 'android' ? 0 : 0,
  },
  statCardExpanded: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // زجاجي شفاف
    borderRadius: 20,
    padding: 20,
    minHeight: 200,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)', // حواف بيضاء
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#5B9FED',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 12,
    elevation: Platform.OS === 'android' ? 0 : 5,
  },
  expandedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  expandedTitle: { fontSize: 18, fontWeight: '700', color: '#4A5568' },
  treatmentStatsList: { gap: 4 },
  treatmentStatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
  treatmentStatCount: { fontSize: 24, fontWeight: '700', color: '#7DD3C0', minWidth: 40 },
  treatmentStatName: { fontSize: 16, fontWeight: '500', color: '#4A5568' },
  statLabel: { fontSize: 14, color: '#6B7280', fontWeight: '400', marginBottom: 4 },
  statLabelActive: { color: '#7DD3C0', fontWeight: '600' },
  statValue: { fontSize: 52, fontWeight: '600', color: '#4A5568' },
  statValueActive: { color: '#7DD3C0' },
  queueHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    marginBottom: 12,
  },
  queueTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueTitle: { fontSize: 32, fontWeight: '700', color: '#4A5568' },
  minimizeButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  minimizeButtonInnerGlow: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent', // إزالة Inner Glow
  },
  // Header View Details button
  viewDetailsHeaderButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  viewDetailsHeaderText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  // Expandable section in header
  headerExpandableSection: {
    alignSelf: 'flex-end',
    marginRight: 24,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 16,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 2 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.1,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  headerOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // زجاجي شفاف
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)', // حدود بيضاء لامعة
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 2 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.1,
    shadowRadius: Platform.OS === 'android' ? 0 : 4,
    elevation: Platform.OS === 'android' ? 0 : 3,
  },
  headerOptionButtonActive: {
    backgroundColor: 'rgba(125, 211, 192, 0.3)', // زجاجي فيروزي عند التفعيل
    borderWidth: 2.5,
    borderColor: 'rgba(125, 211, 192, 0.9)', // حدود فيروزية لامعة
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#7DD3C0',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 3 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.3,
    shadowRadius: Platform.OS === 'android' ? 0 : 6,
    elevation: Platform.OS === 'android' ? 0 : 5,
  },
  headerOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  headerOptionTextActive: {
    color: '#7DD3C0',
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 0, paddingBottom: 120 },
  patientCardWrapper: {
    flexDirection: 'row',
    position: 'relative', // للسماح بـ absolute positioning للـ Queue Number
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.35)', // زجاجي شفاف
    borderWidth: 2.5, // حواف أعرض
    borderColor: 'rgba(255, 255, 255, 0.7)', // حواف بيضاء (افتراضي)
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#5B9FED',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 2 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.1,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 3,
  },
  queueNumberSection: {
    flex: 1,
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    // نفس الشكل الأصلي - فقط اللون زجاجي
  },
  patientCardContent: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 0, // لا فراغ من اليمين ليتصل مع القيو نمبر
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  leftSection: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Old badge styles - replaced with CircularBadge component
  // statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, minWidth: 50, maxWidth: 70, alignItems: 'center', justifyContent: 'center' },
  // statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  queueNumberText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  patientName: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#2D3748', 
    letterSpacing: 0.3,
    fontFamily: 'Cairo-Bold', // خط Cairo Bold
    marginLeft: 70, // مسافة من اليسار
    marginRight: 20, // إبعاد الاسم 20px عن الحافة اليمنى
  },
  divider: { height: 3, backgroundColor: 'rgba(255, 255, 255, 0.4)', marginBottom: 6 }, // أبيض شفاف أعرض (3px)
  tagsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  tag: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Glass effect شفاف أكثر
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 2 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.1,
    shadowRadius: Platform.OS === 'android' ? 0 : 4,
    elevation: Platform.OS === 'android' ? 0 : 2,
  },
  tagText: { fontSize: 12, fontWeight: '600', color: '#4A5568', textAlign: 'center' },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  menuIcon: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { marginTop: -3 } : { lineHeight: 32 }),
  },
  timelineContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  timelineText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  fab: { position: 'absolute', bottom: 15, right: 24, width: 68, height: 68, borderRadius: 34 },
  fabGlass: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  fabInnerGlow: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'transparent', // إزالة Inner Glow
  },
  fabIcon: {
    fontSize: 42,
    color: '#7DD3C0', // فيروزي لتطابق التصميم
    fontWeight: '400',
    lineHeight: 42,
    textAlign: 'center',
    textAlignVertical: 'center',
    marginTop: -2,
    zIndex: 10
  },
  bottomNav: { flexDirection: 'row', paddingVertical: 10, paddingBottom: 20, backgroundColor: 'transparent', borderTopWidth: 1.5, borderTopColor: 'rgba(255, 255, 255, 0.5)' },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  navLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontWeight: '500' },
  navLabelActive: { color: '#7DD3C0', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 50,
  },
  modalContent: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Frosted glass effect
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    padding: 20,
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 20 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.4,
    shadowRadius: Platform.OS === 'android' ? 0 : 30,
    elevation: Platform.OS === 'android' ? 0 : 15,
    overflow: 'hidden',
  },
  modalGlassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
  },
  dropdownModal: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Glass effect
    borderRadius: 20,
    width: '85%',
    maxHeight: '70%',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF', // أبيض مثل Edit Modal
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF', // أبيض مثل Edit Modal
    marginBottom: 8,
    marginTop: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)', // Glass effect أعتم للوضوح
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '600',
    marginBottom: 12,
    justifyContent: 'center',
  },
  inputContainer: {
    position: 'relative',
    marginBottom: 0,
  },
  clearButton: {
    position: 'absolute',
    right: 12,
    top: 16,
    padding: 4,
    zIndex: 10,
  },
  clearButtonTextArea: {
    top: 12,
  },
  // Suggestions/Auto-complete styles
  suggestionsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(125, 211, 192, 0.6)',
    marginBottom: 16,
    marginTop: -8,
    maxHeight: 250,
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  suggestionsHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  suggestionsList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 231, 235, 0.5)',
  },
  suggestionItemSelected: {
    backgroundColor: 'rgba(125, 211, 192, 0.2)',
  },
  suggestionItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
    flex: 1,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(125, 211, 192, 0.3)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(125, 211, 192, 0.6)',
    marginVertical: 16,
  },
  expandButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modeButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    minHeight: 48,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(125, 211, 192, 0.4)',
    borderColor: 'rgba(125, 211, 192, 0.8)',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
    flexShrink: 1,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  textArea: { minHeight: 100, paddingTop: 16 },
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pickerOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.7)', // أعتم للوضوح
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  pickerOptionSelected: { backgroundColor: '#7DD3C0', borderColor: '#7DD3C0' },
  pickerOptionText: { fontSize: 14, color: '#4A5568', fontWeight: '500' },
  pickerOptionTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: '#7DD3C0', borderColor: '#7DD3C0', borderWidth: 2 },
  checkboxLabel: {
    fontSize: 16,
    color: '#FFFFFF', // أبيض مثل Edit Modal
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  addButton: {
    marginTop: 32,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(125, 211, 192, 0.3)', // Glass effect فيروزي
    borderWidth: 2,
    borderColor: 'rgba(125, 211, 192, 0.6)',
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#7DD3C0',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.3,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 6,
  },
  addButtonGradient: { paddingVertical: 16, alignItems: 'center' },
  addButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  menuModal: {
    borderRadius: 24,
    padding: 12,
    width: '75%',
    maxWidth: 300,
    alignSelf: 'center', // لتوسيط النافذة
    backgroundColor: 'rgba(255, 255, 255, 0.5)', // Glass effect أقل شفافية
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 15,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFFFFF', // أبيض مثل Edit Modal
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  menuItemDanger: { 
    backgroundColor: 'rgba(254, 226, 226, 0.5)',
  },
  noteText: {
    fontSize: 16,
    color: '#FFFFFF', // أبيض مثل Edit Modal
    lineHeight: 24,
    marginBottom: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  deleteButton: { backgroundColor: '#ef4444', borderRadius: 12, padding: 16, alignItems: 'center' },
  deleteButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  timelineScreenContainer: { flex: 1, backgroundColor: '#E8F5F0' },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  timelineTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  timelineContent: { flex: 1, paddingHorizontal: 20 },
  timelineEvent: { padding: 16, marginBottom: 12, backgroundColor: '#FFFFFF', borderRadius: 16 },
  eventType: { fontSize: 16, fontWeight: '700', color: '#667eea', marginBottom: 8 },
  eventDetails: { fontSize: 14, color: '#1F2937', marginBottom: 8 },
  eventDoctor: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  eventAssignedBy: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 4 },
  eventTime: { fontSize: 12, color: '#9CA3AF' },
  treatmentSection: { padding: 20, margin: 20, marginBottom: 10, backgroundColor: '#FFFFFF', borderRadius: 16 },
  treatmentInput: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E2E8F0' },
  dropdownButtonText: { fontSize: 16, color: '#1F2937', fontWeight: '500' },
  dropdownList: { backgroundColor: 'rgba(255, 255, 255, 0.4)', borderRadius: 12, marginBottom: 12, maxHeight: 200, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.6)', shadowColor: Platform.OS === 'android' ? 'transparent' : '#000', shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 2 }, shadowOpacity: Platform.OS === 'android' ? 0 : 0.1, shadowRadius: Platform.OS === 'android' ? 0 : 4, elevation: Platform.OS === 'android' ? 0 : 3 },
  dropdownItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 50,
    backgroundColor: 'transparent',
  },
  dropdownItemSelected: { backgroundColor: 'rgba(125, 211, 192, 0.2)' },
  dropdownItemText: { fontSize: 16, color: '#374151', fontWeight: '500' },
  dropdownItemTextSelected: { color: '#7DD3C0', fontWeight: '600' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  pickerModalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 34 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#2D3748' },
  pickerDoneButton: { fontSize: 16, fontWeight: '600', color: '#7DD3C0' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F7FAFC' },
  pickerItemSelected: { backgroundColor: '#F0FDF9' },
  pickerItemText: { fontSize: 16, color: '#4A5568' },
  pickerItemTextSelected: { color: '#7DD3C0', fontWeight: '600' },
  beautifulModal: {
    borderRadius: 24,
    width: '85%',
    maxHeight: '60%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)', // Glass effect أقل شفافية
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 15,
    overflow: 'hidden',
  },
  modalHeaderTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF', // أبيض مثل Edit Modal
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  modalScrollView: {
    maxHeight: 400,
  },
  beautifulDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glass effect
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  beautifulDropdownText: {
    fontSize: 16,
    color: '#FFFFFF', // أبيض مثل Edit Modal
    fontWeight: '600',
    marginLeft: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  // Expandable content styles
  viewDetailsButton: { 
    marginTop: 10, 
    paddingVertical: 8, 
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  viewDetailsText: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#4A5568',
  },
  expandableContent: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginTop: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  toggleButtonTextActive: {
    color: '#4A5568',
  },
  timelineEventsContainer: {
    gap: 12,
  },
  timelineEventItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineEventDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#7DD3C0',
    marginTop: 4,
  },
  timelineEventContent: {
    flex: 1,
    gap: 4,
  },
  timelineEventType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D3748',
    textTransform: 'capitalize',
  },
  timelineEventDetails: {
    fontSize: 13,
    color: '#4A5568',
    lineHeight: 18,
  },
  timelineEventDoctor: {
    fontSize: 12,
    color: '#7DD3C0',
    fontWeight: '600',
  },
  timelineEventTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  timelineBlob: {
    position: 'absolute',
    borderRadius: 100,
  },
  noEventsText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  naPatientsContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  naPatientsText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  // Name input with د. prefix
  nameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  doctorPrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3748',
    marginLeft: 8,
  },
  nameInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#2D3748',
  },
  // Treatment Done Modal Styles
  treatmentDoneByMeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  treatmentDoneByMeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  orText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginHorizontal: 16,
    opacity: 0.7,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  doctorsListContainer: {
    maxHeight: 300,
  },
  doctorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  noDoctorsText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
  },
  // Expanded Dental Section Styles (Permanent Patients)
  dentalTabsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dentalTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'transparent',
    marginHorizontal: 3,
  },
  dentalTabActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderBottomWidth: 3,
    borderBottomColor: '#3B82F6',
  },
  dentalTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  dentalTabTextActive: {
    color: '#3B82F6',
    fontWeight: '800',
  },
  dentalTabContent: {
    maxHeight: 800,
    backgroundColor: 'transparent',
    borderRadius: 14,
    padding: 16,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  dentalTabContentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2563EB',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  treatmentContainer: {
    gap: 12,
  },
  dentalSectionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
  },
  dentalTreatmentSection: {
    gap: 8,
  },
  dentalTreatmentHeader: {
    marginBottom: 4,
  },
  dentalTreatmentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  teethGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toothChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    minWidth: 50,
    alignItems: 'center',
  },
  toothChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Tooth Edit Modal Styles
  toothModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  toothModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  toothModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  toothModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  toothModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  toothModalCloseButton: {
    padding: 4,
  },
  toothModalContent: {
    padding: 20,
  },
  toothModalSection: {
    marginBottom: 24,
  },
  toothModalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  toothModalButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toothModalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  toothModalButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  toothModalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  toothModalButtonTextActive: {
    color: '#2563EB',
  },
  toothModalNoteInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  toothModalSubmitButton: {
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
  },
  toothModalSubmitButtonActive: {
    backgroundColor: '#2563EB',
  },
  toothModalSubmitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // New Modal Styles from DentalChartScreen
  newModalContainer: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    overflow: 'hidden',
    elevation: 8,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
    } : {}),
  },
  newModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  toothNumberBox: {
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    elevation: 2,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {}),
  },
  modalToothNumberText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E3A8A',
  },
  modalToothNameText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  editButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  editButtonActive: {
    backgroundColor: '#60A5FA',
    borderColor: '#3B82F6',
    borderWidth: 2,
    elevation: 3,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    } : {}),
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 16,
  },
  mainSectionsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    elevation: 3,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    } : {}),
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sectionLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginVertical: 8,
  },
  dropdownInput: {
    width: 170,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.5)',
  },
  dropdownInputActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    elevation: 2,
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 5,
  },
  dropdownModalContent: {
    backgroundColor: 'rgba(240, 249, 255, 0.98)',
    borderRadius: 24,
    padding: 22,
    width: '100%',
    maxHeight: '92%',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    elevation: 5,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    } : {}),
  },
  dropdownModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 18,
    textAlign: 'center',
  },
  dropdownModalList: {
    maxHeight: 800,
  },
  dropdownModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.4)',
    marginBottom: 12,
    elevation: 1,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    } : {}),
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#94A3B8',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  radioButtonSelected: {
    borderColor: '#60A5FA',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#60A5FA',
  },
  newNoteContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  noteInput: {
    fontSize: 14,
    color: '#1E293B',
    minHeight: 70,
    textAlignVertical: 'top',
    fontWeight: '500',
  },
  submitButtonContainer: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(248, 250, 252, 0.7)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(203, 213, 225, 0.6)',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(226, 232, 240, 0.7)',
    gap: 10,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  submitButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
    borderWidth: 2,
    elevation: 6,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
    } : {}),
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },

  // Tab Buttons Styles
  tabButtons: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderRadius: 16,
    marginHorizontal: 4,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.6)',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    gap: 6,
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.6)',
    elevation: 1,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    } : {}),
  },
  tabBtnActive: {
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#2563EB',
    elevation: 4,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    } : {}),
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },

  // Records Section Styles
  recordsMainContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    elevation: 3,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    } : {}),
    padding: 16,
    gap: 12,
  },
  recordsTypeButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    justifyContent: 'center',
  },
  recordsTypeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.6)',
  },
  recordsTypeBtnActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
    borderWidth: 2,
    elevation: 3,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    } : {}),
  },
  recordsTypeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.2,
  },
  recordsTypeBtnTextActive: {
    color: '#FFFFFF',
  },
  recordCard: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.35)',
  },
  recordText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  recordSubText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },

  // Notes Section Styles
  notesSection: {
    gap: 14,
  },
  newNoteContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  noteInput: {
    fontSize: 14,
    color: '#1E293B',
    minHeight: 70,
    textAlignVertical: 'top',
    fontWeight: '500',
  },
  noteCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    elevation: 2,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {}),
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteDoctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  noteTimestamp: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
});
