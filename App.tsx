import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
import { AuthProvider, useAuth } from './AuthContext';
import { startAutoArchive, stopAutoArchive, testArchiveNow, archiveEventEmitter } from './autoArchiveService';

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
}

type TimelineEvent = {
  id: string;
  patient_id: string;
  event_type: string;
  event_details: string;
  timestamp: string;
  doctor_name?: string;
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
  
  // ✅ Navigation Stack: تتبع المستوى الحالي
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
  
  // ✅ حفظ clinicId للرجوع إلى Clinic Details
  const [savedClinicId, setSavedClinicId] = useState<string | null>(null);
  const [savedClinicName, setSavedClinicName] = useState<string>('');
  
  // ✅ حفظ أرقام badges لكل عيادة (في App.tsx لمنع الحذف عند unmount)
  const [clinicBadges, setClinicBadges] = useState<{[clinicId: string]: {waiting: number, doctors: number, treatments: number}}>({});
  
  // ✅ دالة ترجمة أسماء المراكز للعربي
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

  // Animation states for cards
  const [animKey, setAnimKey] = useState(0);

  // Menu states
  const [showMenuForPatient, setShowMenuForPatient] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showViewNoteModal, setShowViewNoteModal] = useState(false);
  const [currentNote, setCurrentNote] = useState('');
  const [notePatientId, setNotePatientId] = useState<string | null>(null);

  // Form state for new patient
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientQueueNumber, setNewPatientQueueNumber] = useState('');
  const [newPatientCondition, setNewPatientCondition] = useState('Condition');
  const [newPatientTreatment, setNewPatientTreatment] = useState('Treatment');
  const [isElderly, setIsElderly] = useState(false);
  const [newPatientNote, setNewPatientNote] = useState('');

  // Load patients from Supabase
  const loadPatients = async () => {
    try {
      // ✅ استخدام selectedClinicId أولاً (للـ Coordinator/General Manager)، ثم userClinicId (للـ Doctor/Team Leader)
      const clinicId = selectedClinicId || userClinicId;
      
      // ❌ إذا لم يكن هناك clinic_id محدد، لا تجلب أي شيء
      if (clinicId === null) {
        console.log('No clinic selected - skipping load');
        setPatients([]);
        return;
      }
      
      let query = supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId) // ✅ تصفية حسب clinic_id
        .is('archive_date', null) // ✅ فقط المرضى غير المؤرشفين
        .order('queue_number', { ascending: true });
      
      const { data, error} = await query;

      console.log('Load patients - data:', data);
      console.log('Load patients - error:', error);

      if (error) throw error;

      const formattedPatients: Patient[] = (data || []).map((p: any) => ({
        id: p.id,
        queue_number: p.queue_number,
        name: p.name,
        age: p.age || 0,
        clinic_id: p.clinic_id,
        clinic: p.clinic || (p.clinic_id ? `Clinic ${p.clinic_id}` : 'Clinic'),
        condition: p.condition || 'Condition',
        treatment: p.treatment || 'Treatment',
        timestamp: new Date(p.created_at),
        note: p.note || undefined,
        status: p.status === 'complete' || p.status === 'completed' ? 'complete' : (p.status === 'na' ? 'na' : (p.is_elderly ? 'elderly' : 'normal')),
        isElderly: p.is_elderly || false,
        // Timeline fields
        registered_at: p.registered_at ? new Date(p.registered_at) : undefined,
        clinic_entry_at: p.clinic_entry_at ? new Date(p.clinic_entry_at) : undefined,
        completed_at: p.completed_at ? new Date(p.completed_at) : undefined,
        doctor_name: p.doctor_name || undefined,
      }));

      console.log('Formatted patients:', formattedPatients);
      setPatients(formattedPatients);
    } catch (error: any) {
      console.error('Error loading patients:', error);
      Alert.alert('خطأ في تحميل المرضى', error.message);
    }
  };

  // Setup auto archive on app start
  useEffect(() => {
    // Start auto archive service (checks every minute for 23:59)
    startAutoArchive();
    
    // ✅ الاستماع لحدث الأرشفة التلقائية
    const handleArchiveCompleted = (date: string) => {
      console.log('[App] Archive completed, reloading patients for date:', date);
      // ✅ إعادة تحميل المرضى لتنظيف Timeline
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
  useEffect(() => {
    setDisplayedPatients(patients);
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
            console.log('User not found in doctors table (might be pending doctor)');
            return;
          }
          
          if (data?.clinic_id) {
            setUserClinicId(data.clinic_id);
          }
        } catch (error) {
          console.error('Error:', error);
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
            .select('id, treatment, completed_at, updated_at')
            .eq('doctor_id', user.id);
          
          if (error) {
            console.error('Error fetching my total treatments:', error);
            return;
          }
          
          // Filter by today's date range
          const filteredPatients = patients?.filter((patient: any) => {
            const completedDate = patient.completed_at ? new Date(patient.completed_at) : new Date(patient.updated_at);
            const patientTime = completedDate.getTime();
            return patientTime >= fromTime && patientTime <= toTime;
          }) || [];
          
          // ✅ استثناء كلمة "Treatment" من العدد
          const validPatients = filteredPatients.filter((p: any) => p.treatment !== 'Treatment');
          setMyTotalTreatments(validPatients.length);
        } catch (error) {
          console.error('Error:', error);
        }
      }
    };
    
    fetchMyTotalTreatments();
  }, [user, patients]); // Re-fetch when user or patients change
  
  // ✅ Polling: التحقق من myTotalTreatments كل 5 ثواني
  React.useEffect(() => {
    if (!user) return;
    
    console.log('[App] Starting polling for myTotalTreatments (every 5 seconds)...');
    
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
        
        // ✅ استثناء كلمة "Treatment" من العدد
        const validPatients = filteredPatients.filter((p: any) => p.treatment !== 'Treatment');
        const newCount = validPatients.length;
        if (newCount !== myTotalTreatments) {
          console.log('[App] ✅ myTotalTreatments changed:', myTotalTreatments, '→', newCount);
          setMyTotalTreatments(newCount);
        }
      } catch (error) {
        console.error('[App] Error polling myTotalTreatments:', error);
      }
    };
    
    const pollInterval = setInterval(fetchMyTotalTreatmentsPoll, 5000);
    
    return () => {
      console.log('[App] Stopping myTotalTreatments polling...');
      clearInterval(pollInterval);
    };
  }, [user, myTotalTreatments]);

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

  // Load patients when user clinic is set OR when selected clinic changes
  useEffect(() => {
    if (user) {
      loadPatients(); // ✅ ستتحقق loadPatients من clinicId داخلياً
    }
  }, [user, userClinicId, selectedClinicId]); // ✅ إضافة selectedClinicId

  // Auto-calculate next queue number when modal opens
  useEffect(() => {
    const fetchMaxQueueNumber = async () => {
      if (showAddModal) {
        // ✅ استخدام selectedClinicId أولاً (للـ Coordinator/General Manager)، ثم userClinicId (للـ Doctor/Team Leader)
        const clinicId = selectedClinicId || userClinicId;
        console.log('[Auto-increment] clinicId:', clinicId, '(selectedClinicId:', selectedClinicId, ', userClinicId:', userClinicId, ')');
        
        if (clinicId === null) {
          console.log('[Auto-increment] No clinic selected, setting to 1');
          setNewPatientQueueNumber('1');
          return;
        }
        
        try {
          // Get max queue number for this clinic (فقط المرضى غير المؤرشفين)
          const { data: patientsData, error: patientsError } = await supabase
            .from('patients')
            .select('queue_number')
            .eq('clinic_id', clinicId)
            .is('archive_date', null) // ✅ فقط المرضى غير المؤرشفين
            .order('queue_number', { ascending: false })
            .limit(1);
          
          if (patientsError) throw patientsError;
          
          console.log('[Auto-increment] patients data:', patientsData);
          
          if (patientsData && patientsData.length > 0) {
            const nextNumber = patientsData[0].queue_number + 1;
            console.log('[Auto-increment] Next number:', nextNumber);
            setNewPatientQueueNumber(nextNumber.toString());
          } else {
            console.log('[Auto-increment] No patients, setting to 1');
            setNewPatientQueueNumber('1');
          }
        } catch (error) {
          console.error('[Auto-increment] Error:', error);
          setNewPatientQueueNumber('1');
        }
      }
    };
    
    fetchMaxQueueNumber();
  }, [showAddModal, selectedClinicId, userClinicId]); // ✅ إضافة selectedClinicId

  const totalPatients = displayedPatients.length;
  const waitingPatients = displayedPatients.filter(p => p.status !== 'complete' && p.status !== 'na').length;
  
  // Treatment statistics (only count Done patients)
  const treatmentStats = TREATMENTS.slice(1).reduce((acc, treatment) => {
    const treatmentName = typeof treatment === 'string' ? treatment : treatment.name;
    acc[treatmentName] = displayedPatients.filter(p => p.treatment === treatmentName && p.status === 'complete').length;
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

  const handleAddPatient = async () => {
    if (!newPatientName.trim()) {
      Alert.alert('خطأ', 'الرجاء إدخال اسم المريض');
      return;
    }

    try {
      // Convert Arabic numerals to English
      const arabicToEnglish = (str: string) => {
        const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return str.split('').map(char => {
          const index = arabicNumerals.indexOf(char);
          return index !== -1 ? index.toString() : char;
        }).join('');
      };

      const englishQueueNumber = arabicToEnglish(newPatientQueueNumber);
      const queueNumber = parseInt(englishQueueNumber);
      
      if (isNaN(queueNumber) || queueNumber < 1) {
        Alert.alert('خطأ', 'الرجاء إدخال رقم صحيح');
        return;
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
            clinic_id: selectedClinicId || userClinicId, // ✅ استخدام selectedClinicId أولاً
            clinic: 'Clinic',
            condition: newPatientCondition,
            treatment: newPatientTreatment,
            registered_at: now.toISOString(),
          },
        ])
        .select();

      if (error) throw error;

      await loadPatients();
      setShowAddModal(false);
      setNewPatientName('');
      setNewPatientQueueNumber('');
      setNewPatientCondition('Condition');
      setNewPatientTreatment('Treatment');
      setIsElderly(false);
      setNewPatientNote('');
      setShowConditionDropdown(false);
      setShowTreatmentDropdown(false);
      Alert.alert('نجح', 'تمت إضافة المريض بنجاح');
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    }
  };

  // ✅ دالة الأرشفة - نقل جميع المرضى للأرشيف
  const handleArchive = async () => {
    try {
      const clinicId = selectedClinicId || userClinicId;
      
      if (clinicId === null) {
        Alert.alert('خطأ', 'الرجاء اختيار مركز أولاً');
        return;
      }

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      console.log('[Archive] Archiving patients for clinic:', clinicId, 'date:', today);
      
      // ✅ تحديث archive_date لجميع المرضى في المركز الحالي
      const { data, error } = await supabase
        .from('patients')
        .update({ 
          archive_date: today,
          status: 'complete' // تغيير الحالة إلى complete
        })
        .eq('clinic_id', clinicId) // ✅ عزل حسب المركز
        .is('archive_date', null); // فقط المرضى غير المؤرشفين
      
      if (error) throw error;
      
      console.log('[Archive] Archived patients:', data);
      
      // ✅ إعادة تحميل المرضى (سيكون فارغاً)
      await loadPatients();
      
      Alert.alert('نجح', `تمت أرشفة جميع مرضى ${selectedClinicName} بنجاح`);
    } catch (error: any) {
      console.error('[Archive] Error:', error);
      Alert.alert('خطأ', error.message || 'فشلت الأرشفة');
    }
  };

  const handleMenuAction = async (patientId: string, action: string) => {
    setShowMenuForPatient(null);

    switch (action) {
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
          Alert.alert('خطأ', error.message);
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
          Alert.alert('خطأ', error.message);
        }
        break;
      case 'complete':
        try {
          const patient = patients.find(p => p.id === patientId);
          const newStatus = patient?.status === 'complete' ? 'normal' : 'complete';
          
          const updateData: any = { status: newStatus };
          
          // If marking as complete, record completion time, doctor name, and doctor ID
          if (newStatus === 'complete') {
            updateData.completed_at = new Date().toISOString();
            updateData.doctor_id = user?.id; // Save doctor ID
            // Get doctor name from user profile (as written in doctor file)
            updateData.doctor_name = user?.name || user?.email || 'Unknown';
          }
          
          await supabase
            .from('patients')
            .update(updateData)
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('خطأ', error.message);
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
          Alert.alert('خطأ', error.message);
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
        await loadPatients();
      } catch (error: any) {
        Alert.alert('خطأ', error.message);
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
      setCurrentNote(patient.note);
      setShowViewNoteModal(true);
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
        console.error('Update error:', error);
        Alert.alert('خطأ', error.message || 'Failed to update');
        return;
      }

      await loadPatients();
      setShowClinicDropdown(false);
      setShowConditionDropdown(false);
      setShowTreatmentDropdown(false);
      setEditingPatientId(null);
      setEditingField(null);
    } catch (error: any) {
      console.error('Catch error:', error);
      Alert.alert('خطأ', error.message || 'An error occurred');
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
        Alert.alert('خطأ', error.message);
      }
    }
    setShowViewNoteModal(false);
    setCurrentNote('');
    setNotePatientId(null);
  };

  // Load timeline
  const loadTimeline = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('patient_id', patientId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setTimeline(data || []);
    } catch (error: any) {
      console.error('Error loading timeline:', error.message);
    }
  };

  // Load timeline for expandable card
  const loadCardTimeline = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('patient_id', patientId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setCardTimelines(prev => ({ ...prev, [patientId]: data || [] }));
      // Default to Timeline tab
      setShowTimelineTab(prev => ({ ...prev, [patientId]: true }));
    } catch (error: any) {
      console.error('Error loading card timeline:', error.message);
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

  // Open timeline
  const openTimeline = (patient: Patient) => {
    setSelectedPatient(patient);
    loadTimeline(patient.id);
    setShowTimelineModal(true);
  };

  // Mark treatment done
  const markTreatmentDone = async () => {
    if (!selectedPatient || !treatmentNote.trim()) {
      Alert.alert('خطأ', 'الرجاء إدخال تفاصيل العلاج');
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
      Alert.alert('نجح', 'تم حفظ العلاج بنجاح');
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
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

  // ✅ Show My Statistics for viewing doctor (MUST be before DoctorsScreen)
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
      <ComingSoonScreen
        onBack={() => setShowPatientFile(false)}
        title="Patient File"
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

  // ✅ Show Dental Departments Screen
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
          // ✅ مسح savedClinicId عند الرجوع للـ Profile
          setSavedClinicId(null);
          setSavedClinicName('');
        }}
        onOpenTimeline={(clinicId, clinicName) => {
          console.log('[Departments] Opening timeline for:', clinicId, clinicName);
          setSelectedClinicId(clinicId);
          setSelectedClinicName(clinicName);
          setShowDentalDepartments(false);
          setShowClinicDetails(false);
          setNavigationStack(['profile', 'departments', 'clinicDetails', 'timeline']);
        }}
      />
    );
  }

  // ✅ Show Doctors Screen - View Stats
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

  // ✅ Show Doctors Screen - List
  if (showDoctorsScreen && showClinicDetails && !showDoctorProfile && !showDentalDepartments && currentDoctorsScreen === 'list') {
    return (
      <DoctorsScreen
        onBack={() => {
          setShowDoctorsScreen(false);
          setCurrentDoctorsScreen('list');
        }}
        clinicId={savedClinicId!}
        onOpenDoctorProfile={(doctor) => {
          console.log('Doctor selected:', doctor);
          
          Alert.alert(
            'Debug - Before Update',
            `showDoctorsScreen: ${showDoctorsScreen}\n` +
            `showClinicDetails: ${showClinicDetails}\n` +
            `currentDoctorsScreen: ${currentDoctorsScreen}\n` +
            `Doctor: ${doctor.name}`
          );
          
          // Open MyStatisticsScreen for selected doctor
          setViewingDoctorData({
            id: doctor.id,
            name: doctor.name,
            clinic_id: doctor.clinicId,
            role: doctor.role,
          });
          setCurrentDoctorsScreen('viewStats');
          
          setTimeout(() => {
            Alert.alert(
              'Debug - After Update',
              `currentDoctorsScreen: viewStats\n` +
              `viewingDoctorData: ${doctor.name}`
            );
          }, 100);
        }}
      />
    );
  }

  // ✅ Show Clinic Details Screen
  if (showClinicDetails && !showDoctorProfile && !showDentalDepartments && selectedClinicId === null && !showDoctorsScreen) {
    return (
      <ClinicDetailsScreen
        clinicName={savedClinicName}
        clinicId={savedClinicId}
        onBack={() => {
          setShowClinicDetails(false);
          setShowDentalDepartments(true);
          // ✅ مسح savedClinicId عند الرجوع
          setSavedClinicId(null);
          setSavedClinicName('');
          setNavigationStack(['profile', 'departments']);
        }}
        onDoctorsPress={() => {
          console.log('[ClinicDetails] Doctors pressed, clinicId:', savedClinicId);
          Alert.alert(
            'Opening Doctors',
            `showDoctorsScreen: ${showDoctorsScreen}\n` +
            `showClinicDetails: ${showClinicDetails}\n` +
            `currentDoctorsScreen: ${currentDoctorsScreen}`
          );
          setShowDoctorsScreen(true);
          setCurrentDoctorsScreen('list');
        }}
        onTimelinePress={() => {
          console.log('[ClinicDetails] Timeline pressed, clinicId:', savedClinicId);
          // ✅ فتح Timeline باستخدام savedClinicId
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
          // Pending doctors can't go back - this is their only screen
        }}
      />
    );
  }

  // ✅ Show Doctor Profile when viewing another doctor
  if (showDoctorProfile && viewingDoctorData !== null && !showDentalDepartments && !showClinicDetails) {
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
          console.log('[DoctorProfile] Opening timeline for clinic:', clinicId, clinicName);
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

  // Show Timeline (Main Screen) - Only if clinic is selected
  if (selectedClinicId !== null && !showDoctorProfile && !showDentalDepartments && !showClinicDetails) {
    // Main Timeline Screen (will be rendered below)
  } else if (!showDentalDepartments && !showClinicDetails && !showDoctorProfile) {
    // Default: Show Doctor Profile (My Profile)
    return (
      <DoctorProfileScreen
        onBack={() => {}} // No back button
        onOpenTimeline={(clinicId, clinicName) => {
          // ✅ استخدام clinicId المُمرر من DoctorProfileScreen (المركز المختار)
          console.log('[Timeline] Opening timeline for clinic:', clinicId, clinicName);
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
      {/* Gradient Mesh Background - Pink/Purple Tint */}
      <LinearGradient 
        colors={['#FFF0F5', '#F5E5FF', '#E8D5FF']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
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
              transform: [{ translateY: headerTranslateY }],
            }
          ]}
        >
          {/* زر رجوع للمدير العام والمنسق، زر ملف شخصي للطبيب */}
          {(user?.role === 'super_admin' || user?.role === 'coordinator') ? (
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => {
                // ✅ Navigation Stack: Timeline → Clinic Details → Departments → Profile
                console.log('[Back] Current stack:', navigationStack);
                
                // Timeline → Clinic Details
                if (selectedClinicId !== null) {
                  // ✅ حفظ clinicId قبل الرجوع
                  setSavedClinicId(selectedClinicId);
                  setSavedClinicName(selectedClinicName);
                  setSelectedClinicId(null);
                  setSelectedClinicName('');
                  setShowClinicDetails(true);  // ✅ إظهار ClinicDetails
                  setShowDentalDepartments(false);
                  setNavigationStack(['profile', 'departments', 'clinicDetails']);
                }
                // Clinic Details → Departments
                else if (showClinicDetails) {
                  setShowClinicDetails(false);
                  setShowDentalDepartments(true);
                  // ✅ مسح savedClinicId عند الرجوع إلى Departments
                  setSavedClinicId(null);
                  setSavedClinicName('');
                  setNavigationStack(['profile', 'departments']);
                }
                // Departments → Profile
                else if (showDentalDepartments) {
                  setShowDentalDepartments(false);
                  setShowDoctorProfile(true);
                  setNavigationStack(['profile']);
                }
              }}
            >
              <View style={styles.profileButtonGlass}>
                <View style={styles.profileButtonInnerGlow} />
                <Ionicons name="arrow-back" size={24} color="#FFFFFF" style={{ zIndex: 10 }} />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => setShowDoctorProfile(true)}
            >
              <View style={styles.profileButtonGlass}>
                <View style={styles.profileButtonInnerGlow} />
                <Ionicons name="person" size={24} color="#FFFFFF" style={{ zIndex: 10 }} />
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
              transform: [{ translateY: headerTranslateY }],
            }
          ]}
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
              transform: [{ translateY: headerTranslateY }],
              marginTop: queueMarginTop,
            }
          ]}
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
                color="#FFFFFF" 
                style={{ 
                  textShadowColor: 'rgba(0, 0, 0, 0.3)', 
                  textShadowOffset: { width: 0, height: 2 }, 
                  textShadowRadius: 5,
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
        {expandedCardId === 'header' && (
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
          {filteredPatients.map((patient, index) => (
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
              animKey={animKey}
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
        <Modal visible={showAddModal} animationType="fade" transparent onRequestClose={() => setShowAddModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <LinearGradient
                  colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalContent}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Add New Patient</Text>
                    <TouchableOpacity onPress={() => setShowAddModal(false)}>
                      <Ionicons name="close" size={28} color="#4A5568" />
                    </TouchableOpacity>
                  </View>
              
                  <Text style={styles.inputLabel}>Patient Name:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Patient Name"
                    value={newPatientName}
                    onChangeText={setNewPatientName}
                    returnKeyType="done"
                  />

                  <Text style={styles.inputLabel}>Queue Number:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Queue Number"
                    value={newPatientQueueNumber}
                    onChangeText={setNewPatientQueueNumber}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />

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
                        {TREATMENTS.map((treatment, index) => (
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

                  <TouchableOpacity style={styles.addButton} onPress={handleAddPatient}>
                    <LinearGradient 
                      colors={['#A855F7', '#D4B8E8']} 
                      start={{ x: 0, y: 0 }} 
                      end={{ x: 1, y: 1 }} 
                      style={styles.addButtonGradient}
                    >
                      <Text style={styles.addButtonText}>Add Patient</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </LinearGradient>
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
              <LinearGradient
                colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.menuModal}
              >
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
              </LinearGradient>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Note Modal */}
        <Modal visible={showNoteModal} animationType="slide" transparent onRequestClose={() => setShowNoteModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <LinearGradient
                  colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalContent}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Patient Note</Text>
                    <TouchableOpacity onPress={() => setShowNoteModal(false)}>
                      <Ionicons name="close" size={28} color="#4A5568" />
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
                    <LinearGradient 
                      colors={['#A855F7', '#D4B8E8']} 
                      start={{ x: 0, y: 0 }} 
                      end={{ x: 1, y: 1 }} 
                      style={styles.addButtonGradient}
                    >
                      <Text style={styles.addButtonText}>Save Note</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </LinearGradient>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* View Note Modal */}
        <Modal visible={showViewNoteModal} animationType="fade" transparent onRequestClose={() => setShowViewNoteModal(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowViewNoteModal(false)}
          >
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalContent}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Patient Note</Text>
                <TouchableOpacity onPress={() => setShowViewNoteModal(false)}>
                  <Ionicons name="close" size={28} color="#4A5568" />
                </TouchableOpacity>
              </View>

              <Text style={styles.noteText}>{currentNote}</Text>

              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteNote}>
                <Text style={styles.deleteButtonText}>Delete Note</Text>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        </Modal>

        {/* Clinic Dropdown Modal */}
        <Modal visible={showClinicDropdown} animationType="fade" transparent onRequestClose={() => setShowClinicDropdown(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowClinicDropdown(false)}
          >
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.beautifulModal}
            >
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
            </LinearGradient>
          </TouchableOpacity>
        </Modal>

        {/* Condition Dropdown Modal */}
        <Modal visible={showConditionDropdown} animationType="fade" transparent onRequestClose={() => setShowConditionDropdown(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowConditionDropdown(false)}
          >
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.beautifulModal}
            >
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
            </LinearGradient>
          </TouchableOpacity>
        </Modal>

        {/* Treatment Dropdown Modal */}
        <Modal visible={showTreatmentDropdown} animationType="fade" transparent onRequestClose={() => setShowTreatmentDropdown(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowTreatmentDropdown(false)}
          >
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.beautifulModal}
            >
              <Text style={styles.modalHeaderTitle}>Select Treatment</Text>
              <View style={styles.modalDivider} />
              <ScrollView style={styles.modalScrollView}>
                {TREATMENTS.map((treatment) => (
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
            </LinearGradient>
          </TouchableOpacity>
        </Modal>

        {/* Timeline Modal */}
        {showTimelineModal && selectedPatient && (
          <Modal visible={showTimelineModal} animationType="slide">
            <SafeAreaView style={styles.timelineContainer}>
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
                        <Text style={styles.eventDoctor}>By: {event.doctor_name}</Text>
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
      </View>
    </SafeAreaView>
    </View>
  );
}

// Animated wrapper for PatientCard
function AnimatedPatientCard({ index, animKey, ...props }: { index: number; animKey: number; patient: Patient; showTimeline: boolean; onMenuPress: () => void; onNotePress: () => void; onCardPress: () => void; onEditField: (patientId: string, field: 'clinic' | 'condition' | 'treatment') => void; expandedCardId: string | null; onViewDetails: (patientId: string) => void; cardTimelines: { [key: string]: TimelineEvent[] }; showTimelineTab: { [key: string]: boolean }; onToggleTab: (patientId: string) => void; }) {
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    slideAnim.setValue(0);
    Animated.spring(slideAnim, {
      toValue: 1,
      delay: index * 100,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [animKey]);

  const isFromRight = index % 2 === 0;

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
        ],
        opacity: slideAnim,
      }}
    >
      <PatientCard {...props} />
    </Animated.View>
  );
}

function PatientCard({ patient, showTimeline, onMenuPress, onNotePress, onCardPress, onEditField, expandedCardId, onViewDetails, cardTimelines, showTimelineTab, onToggleTab }: { 
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
}) {
  // ✨ تأثير زجاجي: نفس الألوان لكن شفافة (0.75 = واضح جداً)
  // ✨ إذا كان DONE: نفس تدرج الكرت الصلب (بدون شفافية)
  const gradientColors: [string, string] = patient.status === 'complete' 
    ? ['#B8D4F1', '#D4B8E8'] 
    : ['rgba(184, 212, 241, 0.75)', 'rgba(212, 184, 232, 0.75)'];
  const clinicColor = CLINICS.find(c => c.name === patient.clinic)?.color || '#E5E7EB';
  const conditionColor = CONDITIONS.find(c => c.name === patient.condition)?.color || '#E5E7EB';
  const treatmentColor = TREATMENTS.find(t => t.name === patient.treatment)?.color || '#E5E7EB';
  
  // Check if this card is expanded
  const isExpanded = expandedCardId === patient.id;
  const patientTimeline = cardTimelines[patient.id] || [];
  const showingTimeline = showTimelineTab[patient.id] !== false; // default true

  // Determine card background color based on status
  let cardBgColor = 'transparent'; // ✨ شفاف ليظهر التصميم الزجاجي
  if (patient.status === 'na') cardBgColor = 'rgba(209, 213, 219, 0.3)'; // رمادي شفاف
  if (patient.status === 'elderly') cardBgColor = 'rgba(254, 215, 170, 0.3)'; // برتقالي شفاف
  // complete cards use gradient, not background color

  const textColor = '#4A5568';

  return (
    <View style={[styles.patientCardWrapper, shadows.card]}>
      {/* Patient Card Content */}
      {patient.status === 'complete' ? (
        <LinearGradient 
          colors={gradientColors} 
          start={{ x: 0, y: 0 }} 
          end={{ x: 1, y: 1 }} 
          style={styles.patientCardContent}
        >
          {/* Header Row: Menu (left) - Status Badges - Name */}
          <View style={styles.cardHeader}>
            <View style={styles.leftSection}>
              <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
                <Text style={[styles.menuIcon, { color: '#FFFFFF' }]}>⋮</Text>
              </TouchableOpacity>
              
              <View style={[styles.statusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}>
                <Text style={styles.statusBadgeText}>DONE</Text>
              </View>
               {patient.isElderly && (
                 <View style={[styles.statusBadge, { backgroundColor: 'rgba(251, 191, 36, 0.75)' }]}>
                   <Text style={styles.statusBadgeText}>ELDR</Text>
                 </View>
               )}
              {patient.note && (
                <TouchableOpacity 
                  style={[styles.statusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}
                  onPress={onNotePress}
                >
                  <Text style={styles.statusBadgeText}>NOTE</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <Text style={[styles.patientName, { color: '#FFFFFF' }]}>{patient.name}</Text>
          </View>
        
          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]} />
          
          {/* Tags Row */}
          <View style={styles.tagsRow}>
            <TouchableOpacity 
              style={[styles.tag, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}
              onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'clinic'); }}
            >
              <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tag, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}
              onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'condition'); }}
            >
              <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tag, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}
              onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'treatment'); }}
            >
              <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
            </TouchableOpacity>
          </View>
          
          {showTimeline && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person-outline" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: '#FFFFFF', marginLeft: 6 }}>
                    Doctor: {patient.doctor_name}
                  </Text>
                </View>
              )}
            </View>
          )}
        </LinearGradient>
      ) : (
        <LinearGradient 
          colors={['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']} 
          start={{ x: 0, y: 0 }} 
          end={{ x: 1, y: 1 }} 
          style={styles.patientCardContent}
        >
          {/* Header Row: Menu (left) - Status Badges - Name */}
          <View style={styles.cardHeader}>
            <View style={styles.leftSection}>
              <TouchableOpacity style={styles.menuButton} onPress={(e) => { e.stopPropagation(); onMenuPress(); }}>
                <Text style={[styles.menuIcon, { color: textColor }]}>⋮</Text>
              </TouchableOpacity>
              
               {patient.isElderly && (
                 <View style={[styles.statusBadge, { backgroundColor: 'rgba(251, 191, 36, 0.75)' }]}>
                   <Text style={styles.statusBadgeText}>ELDR</Text>
                 </View>
               )}
               {patient.status === 'na' && (
                 <View style={[styles.statusBadge, { backgroundColor: 'rgba(75, 85, 99, 0.75)' }]}>
                   <Text style={styles.statusBadgeText}>N/A</Text>
                 </View>
               )}
              {patient.note && (
                <TouchableOpacity 
                  style={[styles.statusBadge, { backgroundColor: 'rgba(59, 130, 246, 0.5)' }]}
                  onPress={(e) => { e.stopPropagation(); onNotePress(); }}
                >
                  <Text style={styles.statusBadgeText}>NOTE</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <Text style={[styles.patientName, { color: textColor }]}>{patient.name}</Text>
          </View>
        
          {/* Divider */}
          <View style={styles.divider} />
          
          {/* Tags Row */}
          <View style={styles.tagsRow}>
            <TouchableOpacity 
              style={[styles.tag, { backgroundColor: 'rgba(184, 212, 241, 0.75)' }]}
              onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'clinic'); }}
            >
              <Text style={[styles.tagText, patient.clinic && patient.clinic !== 'Clinic' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tag, { backgroundColor: 'rgba(200, 198, 236, 0.75)' }]}
              onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'condition'); }}
            >
              <Text style={[styles.tagText, patient.condition && patient.condition !== 'Condition' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tag, { backgroundColor: 'rgba(212, 184, 232, 0.75)' }]}
              onPress={(e) => { e.stopPropagation(); onEditField(patient.id, 'treatment'); }}
            >
              <Text style={[styles.tagText, patient.treatment && patient.treatment !== 'Treatment' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
            </TouchableOpacity>
          </View>
          
          {showTimeline && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
              {patient.registered_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="add-circle-outline" size={14} color="#9CA3AF" />
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>
                    Registered: {patient.registered_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.clinic_entry_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="enter-outline" size={14} color="#9CA3AF" />
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>
                    Entered Clinic: {patient.clinic_entry_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.completed_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#9CA3AF" />
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>
                    Completed: {patient.completed_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
              {patient.doctor_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="person-outline" size={14} color="#9CA3AF" />
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>
                    Doctor: {patient.doctor_name}
                  </Text>
                </View>
              )}
            </View>
          )}
        </LinearGradient>
      )}
      
      {/* Queue Number Section - Right Side Integrated */}
      <LinearGradient 
        colors={gradientColors} 
        start={{ x: 0, y: 0 }} 
        end={{ x: 1, y: 1 }} 
        style={styles.queueNumberSection}
      >
        <Text style={styles.queueNumberText}>{patient.queue_number === 0 ? '-' : patient.queue_number}</Text>
      </LinearGradient>

    </View>
  );
}



const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  gradient: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#1F2937', letterSpacing: -0.5 }, // ✅ تكبير العنوان
  headerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 }, // ✅ رمادي كما كان
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  // ✅ زر البروفايل - مطابق تماماً لـ FAB
  profileButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  profileButtonGlass: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(125, 211, 192, 0.45)', // ✨ نفس لون FAB
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)', // ✨ نفس حدود FAB
    shadowColor: '#7DD3C0', // ✨ نفس ظل FAB
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 12,
  },
  profileButtonInnerGlow: {
    position: 'absolute',
    width: 36, // ✨ متناسب مع حجم الزر
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)', // ✨ نفس inner glow FAB
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  // ✅ زر الأرشفة الاحترافي
  archiveButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  archiveButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    // ✅ تأثير الإضاءة الداخلية (Inner Glow)
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  statsContainer: { flexDirection: 'row', paddingHorizontal: 24, gap: 16, marginBottom: 24 },
  statCard: { 
    flex: 1, 
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // ✨ زجاجي شفاف
    borderRadius: 20, 
    padding: 20, 
    alignItems: 'center', 
    minHeight: 150, 
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)', // ✅ حواف بيضاء
    shadowColor: '#5B9FED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  statCardActive: { 
    backgroundColor: 'rgba(125, 211, 192, 0.3)', // ✨ زجاجي فيروزي عند التفعيل
    borderWidth: 2.5, 
    borderColor: 'rgba(125, 211, 192, 0.9)', // ✅ حواف فيروزية
    shadowColor: '#7DD3C0',
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  statCardExpanded: { 
    flex: 1, 
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // ✨ زجاجي شفاف
    borderRadius: 20, 
    padding: 20, 
    minHeight: 200,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)', // ✅ حواف بيضاء
    shadowColor: '#5B9FED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
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
    backgroundColor: 'rgba(125, 211, 192, 0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 12,
  },
  minimizeButtonInnerGlow: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  // Header View Details button
  viewDetailsHeaderButton: { 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  viewDetailsHeaderText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // ✨ زجاجي شفاف
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)', // ✨ حدود بيضاء لامعة
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerOptionButtonActive: {
    backgroundColor: 'rgba(125, 211, 192, 0.3)', // ✨ زجاجي فيروزي عند التفعيل
    borderWidth: 2.5,
    borderColor: 'rgba(125, 211, 192, 0.9)', // ✨ حدود فيروزية لامعة
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
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
    marginBottom: 16, 
    borderRadius: 18, 
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.35)', // ✨ زجاجي شفاف
    borderWidth: 2.5, // ✅ حواف أعرض
    borderColor: 'rgba(255, 255, 255, 0.7)', // ✅ حواف بيضاء أوضح
    shadowColor: '#5B9FED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  queueNumberSection: { 
    width: 50, 
    justifyContent: 'center', 
    alignItems: 'center', 
    position: 'relative',
    // ✨ نفس الشكل الأصلي - فقط اللون زجاجي
  },
  patientCardContent: { flex: 1, padding: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  leftSection: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, minWidth: 50, maxWidth: 70, alignItems: 'center', justifyContent: 'center' },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  queueNumberText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  patientName: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#2D3748', 
    letterSpacing: 0.3,
    fontFamily: 'Cairo-Bold', // ✅ خط Cairo Bold
    marginLeft: 70, // مسافة من اليسار
    marginRight: 20, // ✅ إبعاد الاسم 20px عن الحافة اليمنى
  },
  divider: { height: 3, backgroundColor: 'rgba(255, 255, 255, 0.4)', marginBottom: 6 }, // ✅ أبيض شفاف أعرض (3px)
  tagsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  tag: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '600', color: '#4A5568', textAlign: 'center' },
  menuButton: { padding: 4 },
  menuIcon: { fontSize: 24, fontWeight: '700' },
  timelineContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  timelineText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  fab: { position: 'absolute', bottom: 15, right: 24, width: 68, height: 68, borderRadius: 34 },
  fabGlass: { 
    width: '100%', 
    height: '100%', 
    borderRadius: 34, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: 'rgba(125, 211, 192, 0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 12,
  },
  fabInnerGlow: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  fabIcon: { 
    fontSize: 42, 
    color: '#FFFFFF', 
    fontWeight: '400',
    lineHeight: 42,
    textAlign: 'center',
    textAlignVertical: 'center',
    marginTop: -2,
    textShadowColor: 'rgba(0, 0, 0, 0.3)', 
    textShadowOffset: { width: 0, height: 2 }, 
    textShadowRadius: 5, 
    zIndex: 10 
  },
  bottomNav: { flexDirection: 'row', paddingVertical: 10, paddingBottom: 20, backgroundColor: 'transparent', borderTopWidth: 1.5, borderTopColor: 'rgba(255, 255, 255, 0.5)' },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  navLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontWeight: '500' },
  navLabelActive: { color: '#7DD3C0', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { borderRadius: 20, padding: 24, maxHeight: '90%', width: '90%', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
  dropdownModal: { backgroundColor: '#FFFFFF', borderRadius: 20, width: '85%', maxHeight: '70%', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 24, fontWeight: '700', color: '#1F2937' },
  inputLabel: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 8 },
  textInput: { backgroundColor: 'rgba(255, 255, 255, 0.3)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)', borderRadius: 12, padding: 16, fontSize: 16, color: '#1F2937', fontWeight: '500', marginBottom: 12, justifyContent: 'center' },
  textArea: { minHeight: 100, paddingTop: 16 },
  pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pickerOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  pickerOptionSelected: { backgroundColor: '#7DD3C0', borderColor: '#7DD3C0' },
  pickerOptionText: { fontSize: 14, color: '#4A5568', fontWeight: '500' },
  pickerOptionTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.7)', backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  checkboxChecked: { backgroundColor: '#7DD3C0', borderColor: '#7DD3C0', borderWidth: 2 },
  checkboxLabel: { fontSize: 16, color: '#374151', fontWeight: '600' },
  addButton: { marginTop: 32, marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  addButtonGradient: { paddingVertical: 16, alignItems: 'center' },
  addButtonText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  menuModal: { 
    borderRadius: 20, 
    padding: 12, 
    width: '75%', 
    maxWidth: 300,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  menuItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 16, 
    paddingHorizontal: 18, 
    gap: 14,
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  menuItemText: { 
    fontSize: 16, 
    color: '#374151', 
    fontWeight: '600' 
  },
  menuItemDanger: { 
    backgroundColor: 'rgba(254, 226, 226, 0.5)',
  },
  noteText: { fontSize: 16, color: '#4A5568', lineHeight: 24, marginBottom: 24 },
  deleteButton: { backgroundColor: '#ef4444', borderRadius: 12, padding: 16, alignItems: 'center' },
  deleteButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  timelineContainer: { flex: 1, backgroundColor: '#E8F5F0' },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  timelineTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  timelineContent: { flex: 1, paddingHorizontal: 20 },
  timelineEvent: { padding: 16, marginBottom: 12, backgroundColor: '#FFFFFF', borderRadius: 16 },
  eventType: { fontSize: 16, fontWeight: '700', color: '#667eea', marginBottom: 8 },
  eventDetails: { fontSize: 14, color: '#1F2937', marginBottom: 8 },
  eventDoctor: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  eventTime: { fontSize: 12, color: '#9CA3AF' },
  treatmentSection: { padding: 20, margin: 20, marginBottom: 10, backgroundColor: '#FFFFFF', borderRadius: 16 },
  treatmentInput: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E2E8F0' },
  dropdownButtonText: { fontSize: 16, color: '#1F2937', fontWeight: '500' },
  dropdownList: { backgroundColor: 'rgba(255, 255, 255, 0.4)', borderRadius: 12, marginBottom: 12, maxHeight: 200, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.6)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  beautifulDropdownText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
    marginLeft: 12,
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
});
