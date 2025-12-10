import React, { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Animated, Dimensions, InteractionManager } from 'react-native';
// Swipe gesture removed
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DentalDepartmentsScreen from './DentalDepartmentsScreen';
import DoctorsScreen from './DoctorsScreen';
import ComingSoonScreen from './ComingSoonScreen';
import { shadows } from './theme';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabaseClient';

// ✅ Simple Badge Component - Text Only (No Background)
const SimpleBadge: React.FC<{ number: number | string; label: string }> = ({ number, label }) => {
  return (
    <View style={styles.simpleBadge}>
      <Text style={styles.badgeNumber}>{number}</Text>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
};

type DoctorProfileScreenProps = {
  onBack: () => void;
  onOpenTimeline?: (clinicId: string, clinicName: string) => void;
  onOpenMyStatistics?: () => void;
  onOpenClinicSelection?: () => void;
  currentWaitingCount?: number;  // عدد المرضى من Timeline
  currentDoctorsCount?: number;  // عدد الأطباء من Timeline
  currentTotalTreatments?: number;  // عدد العلاجات من Timeline
  myTotalTreatments?: number;  // عدد المرضى الذين عالجتهم أنا (من صفحة احصائياتي)
};

export default function DoctorProfileScreen({ onBack, onOpenTimeline, onOpenMyStatistics, onOpenClinicSelection, currentWaitingCount, currentDoctorsCount, currentTotalTreatments, myTotalTreatments }: DoctorProfileScreenProps) {
  const { user, logout, updateUser } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<'profile' | 'departments' | 'doctors' | 'viewDoctor' | 'viewDoctorStats' | 'schedule' | 'requests'>('profile');
  const [previousScreen, setPreviousScreen] = useState<'profile' | 'departments' | 'doctors' | 'viewDoctor' | 'viewDoctorStats' | 'schedule' | 'requests'>('profile');
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [viewingDoctorData, setViewingDoctorData] = useState<any>(null);
  const [doctorStats, setDoctorStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [viewingDoctorTotalTreatments, setViewingDoctorTotalTreatments] = useState(0);
  const [statsCurrentPage, setStatsCurrentPage] = useState(0);
  const [statsDateFrom, setStatsDateFrom] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [statsDateTo, setStatsDateTo] = useState(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  });
  const [showStatsDateFromPicker, setShowStatsDateFromPicker] = useState(false);
  const [showStatsDateToPicker, setShowStatsDateToPicker] = useState(false);
  const [tempStatsDateFrom, setTempStatsDateFrom] = useState(statsDateFrom);
  const [tempStatsDateTo, setTempStatsDateTo] = useState(statsDateTo);
  const [showEditModal, setShowEditModal] = useState(false);
  const [managerName, setManagerName] = useState(user?.name || '');
  const [managerEmail, setManagerEmail] = useState(user?.email || '');
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Real-time data from database
  const [waitingPatientsCount, setWaitingPatientsCount] = useState(0);
  const [doctorsCount, setDoctorsCount] = useState(0);
  const [totalTreatments, setTotalTreatments] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [clinicsCount, setClinicsCount] = useState(0);  // ✅ عدد المراكز
  const [isDoctorsCountLoading, setIsDoctorsCountLoading] = useState(true);  // ✅ منع race condition
  
  // Animation values for 3D cards - recreate on screen change
  const [animKey, setAnimKey] = useState(0);
  const previousScreenRef = React.useRef(currentScreen);
  const fadeAnim1 = React.useRef(new Animated.Value(0)).current;
  const fadeAnim2 = React.useRef(new Animated.Value(0)).current;
  const fadeAnim3 = React.useRef(new Animated.Value(0)).current;
  const fadeAnim4 = React.useRef(new Animated.Value(0)).current;
  const fadeAnim5 = React.useRef(new Animated.Value(0)).current;
  const fadeAnim6 = React.useRef(new Animated.Value(0)).current;
  const slideAnim1 = React.useRef(new Animated.Value(50)).current;
  const slideAnim2 = React.useRef(new Animated.Value(-50)).current;
  const slideAnim3 = React.useRef(new Animated.Value(50)).current;
  const slideAnim4 = React.useRef(new Animated.Value(-50)).current;
  const slideAnim5 = React.useRef(new Animated.Value(50)).current;
  const slideAnim6 = React.useRef(new Animated.Value(-50)).current;

  // View Doctor Profile - Separate animation values
  const viewDoctorFadeAnim = useState(new Animated.Value(0))[0];
  const viewDoctorSlideAnim = useState(new Animated.Value(50))[0];

  // Dragon Design: Animated Blobs
  const blob1Anim = useState(new Animated.Value(0))[0];
  const blob2Anim = useState(new Animated.Value(0))[0];
  const blob3Anim = useState(new Animated.Value(0))[0];

  // Use values from Timeline (mirror Timeline data)
  React.useEffect(() => {
    // ✅ استخدام القيم الممررة من Timeline دائماً
    setWaitingPatientsCount(currentWaitingCount ?? 0);
    setTotalTreatments(currentTotalTreatments ?? 0);
    
    // ✅ Doctors Count: اجلب من قاعدة البيانات إذا لم يتم تمريره
    if (currentDoctorsCount !== undefined) {
      setDoctorsCount(currentDoctorsCount);
      setIsDoctorsCountLoading(false);  // ✅ تم التحميل
    } else {
      setIsDoctorsCountLoading(true);  // ✅ بدء التحميل
      const fetchDoctorsCount = async () => {
        if (!user) return;
        
        try {
          // ✅ للتيم ليدر والطبيب: جلب clinic_id أولاً
          if (user.role === 'team_leader' || user.role === 'doctor') {
            const { data: userData, error: userError } = await supabase
              .from('doctors')
              .select('clinic_id')
              .eq('email', user.email)
              .single();
            
            // ✅ إذا لم يتم العثور على clinic_id، لا تحديث العدد
            if (userError || !userData?.clinic_id) {
              console.log('[DoctorProfile] No clinic_id found for user, skipping doctors count');
              setDoctorsCount(0);
              return;
            }
            
            // ✅ جلب عدد الأطباء في المركز فقط
            const { count: doctorsCountResult, error: doctorsError } = await supabase
              .from('doctors')
              .select('*', { count: 'exact', head: true })
              .eq('clinic_id', userData.clinic_id);
            
            if (!doctorsError) {
              console.log('[DoctorProfile] Doctors count for clinic', userData.clinic_id, ':', doctorsCountResult);
              setDoctorsCount(doctorsCountResult || 0);
            }
          } else {
            // ✅ للمدير والمنسق: جلب جميع الأطباء
            const { count: doctorsCountResult, error: doctorsError } = await supabase
              .from('doctors')
              .select('*', { count: 'exact', head: true });
            
            if (!doctorsError) {
              console.log('[DoctorProfile] Total doctors count:', doctorsCountResult);
              setDoctorsCount(doctorsCountResult || 0);
            }
          }
        } catch (error) {
          console.error('Error fetching doctors count:', error);
        } finally {
          setIsDoctorsCountLoading(false);  // ✅ انتهى التحميل
        }
      };
      
      fetchDoctorsCount();
    }
    
    // ✅ Pending Requests Count
    setPendingRequestsCount(0);
    
    // ✅ Clinics Count: جلب عدد المراكز من قاعدة البيانات
    const fetchClinicsCount = async () => {
      if (!user) return;
      
      try {
        const { count, error } = await supabase
          .from('clinics')
          .select('*', { count: 'exact', head: true });
        
        if (!error) {
          setClinicsCount(count || 0);
        }
      } catch (error) {
        console.error('Error fetching clinics count:', error);
      }
    };
    
    fetchClinicsCount();
  }, [user, currentWaitingCount, currentDoctorsCount, currentTotalTreatments]);
  
  // ✅ Polling: التحقق من عدد الأطباء كل 5 ثواني
  React.useEffect(() => {
    if (!user) return;
    
    console.log('[DoctorProfile] Starting polling for doctors count (every 5 seconds)...');
    
    const fetchDoctorsCountPoll = async () => {
      // ✅ لا تحديث إذا كان التحميل الأولي لم ينتهي بعد
      if (isDoctorsCountLoading) {
        console.log('[DoctorProfile] Skipping poll - initial load not complete');
        return;
      }
      
      try {
        // ✅ للتيم ليدر والطبيب: جلب clinic_id أولاً
        if (user.role === 'team_leader' || user.role === 'doctor') {
          const { data: userData, error: userError } = await supabase
            .from('doctors')
            .select('clinic_id')
            .eq('email', user.email)
            .single();
          
          // ✅ إذا لم يتم العثور على clinic_id، لا تحديث
          if (userError || !userData?.clinic_id) {
            console.log('[DoctorProfile] Polling: No clinic_id found, skipping');
            return;
          }
          
          // ✅ جلب عدد الأطباء في المركز فقط
          const { count: doctorsCountResult, error: doctorsError } = await supabase
            .from('doctors')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', userData.clinic_id);
          
          if (!doctorsError && doctorsCountResult !== doctorsCount) {
            console.log('[DoctorProfile] ✅ Doctors count changed:', doctorsCount, '→', doctorsCountResult);
            setDoctorsCount(doctorsCountResult || 0);
          }
        } else {
          // ✅ للمدير والمنسق: جلب جميع الأطباء
          const { count: doctorsCountResult, error: doctorsError } = await supabase
            .from('doctors')
            .select('*', { count: 'exact', head: true });
          
          if (!doctorsError && doctorsCountResult !== doctorsCount) {
            console.log('[DoctorProfile] ✅ Doctors count changed:', doctorsCount, '→', doctorsCountResult);
            setDoctorsCount(doctorsCountResult || 0);
          }
        }
      } catch (error) {
        console.error('[DoctorProfile] Error polling doctors count:', error);
      }
    };
    
    // ✅ التحقق كل 5 ثواني
    const pollInterval = setInterval(fetchDoctorsCountPoll, 5000);
    
    // ✅ Cleanup: إيقاف Polling عند مغادرة الصفحة
    return () => {
      console.log('[DoctorProfile] Stopping polling...');
      clearInterval(pollInterval);
    };
  }, [user, doctorsCount, isDoctorsCountLoading]);
  
  // ✅ Polling: التحقق من عدد المراكز كل 5 ثواني
  React.useEffect(() => {
    if (!user) return;
    
    console.log('[DoctorProfile] Starting polling for clinics count (every 5 seconds)...');
    
    const fetchClinicsCountPoll = async () => {
      try {
        const { count, error } = await supabase
          .from('clinics')
          .select('*', { count: 'exact', head: true });
        
        if (!error && count !== clinicsCount) {
          console.log('[DoctorProfile] ✅ Clinics count changed:', clinicsCount, '→', count);
          setClinicsCount(count || 0);
        }
      } catch (error) {
        console.error('[DoctorProfile] Error polling clinics count:', error);
      }
    };
    
    // ✅ التحقق كل 5 ثواني
    const pollInterval = setInterval(fetchClinicsCountPoll, 5000);
    
    // ✅ Cleanup: إيقاف Polling عند مغادرة الصفحة
    return () => {
      console.log('[DoctorProfile] Stopping clinics polling...');
      clearInterval(pollInterval);
    };
  }, [user, clinicsCount]);
  
  // ✅ Polling: التحقق من عدد المرضى في الانتظار كل 5 ثواني
  React.useEffect(() => {
    if (!user) return;
    
    console.log('[DoctorProfile] Starting polling for waiting patients count (every 5 seconds)...');
    
    const fetchWaitingPatientsCountPoll = async () => {
      try {
        // ✅ جلب clinic_id من قاعدة البيانات
        const { data: userData, error: userError } = await supabase
          .from('doctors')
          .select('clinic_id')
          .eq('email', user.email)
          .single();
        
        if (userError || !userData?.clinic_id) return;
        
        // ✅ جلب عدد المرضى في الانتظار (status != 'complete' + اليوم فقط)
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        
        const { count, error } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', userData.clinic_id)
          .neq('status', 'complete')
          .is('archive_date', null)
          .gte('registered_at', startOfDay.toISOString())
          .lte('registered_at', endOfDay.toISOString());
        
        if (!error && count !== waitingPatientsCount) {
          console.log('[DoctorProfile] ✅ Waiting patients count changed:', waitingPatientsCount, '→', count);
          setWaitingPatientsCount(count || 0);
        }
      } catch (error) {
        console.error('[DoctorProfile] Error polling waiting patients count:', error);
      }
    };
    
    // ✅ Fetch أولي فوراً عند mount
    fetchWaitingPatientsCountPoll();
    
    // ✅ التحقق كل 5 ثواني
    const pollInterval = setInterval(fetchWaitingPatientsCountPoll, 5000);
    
    // ✅ Cleanup
    return () => {
      console.log('[DoctorProfile] Stopping waiting patients polling...');
      clearInterval(pollInterval);
    };
  }, [user, waitingPatientsCount]);
  
  // ✅ Polling: التحقق من عدد الطلبات المعلقة كل 5 ثواني
  React.useEffect(() => {
    if (!user) return;
    
    console.log('[DoctorProfile] Starting polling for pending requests count (every 5 seconds)...');
    
    const fetchPendingRequestsCountPoll = async () => {
      try {
        // ✅ حالياً: Pending Requests = 0 (يمكن تعديله لاحقاً إذا كان هناك جدول requests)
        // const { count, error } = await supabase
        //   .from('requests')
        //   .select('*', { count: 'exact', head: true })
        //   .eq('status', 'pending');
        // 
        // if (!error && count !== pendingRequestsCount) {
        //   console.log('[DoctorProfile] ✅ Pending requests count changed:', pendingRequestsCount, '→', count);
        //   setPendingRequestsCount(count || 0);
        // }
        
        // ✅ مؤقتاً: إبقاء 0
        if (pendingRequestsCount !== 0) {
          setPendingRequestsCount(0);
        }
      } catch (error) {
        console.error('[DoctorProfile] Error polling pending requests count:', error);
      }
    };
    
    // ✅ التحقق كل 5 ثواني
    const pollInterval = setInterval(fetchPendingRequestsCountPoll, 5000);
    
    // ✅ Cleanup
    return () => {
      console.log('[DoctorProfile] Stopping pending requests polling...');
      clearInterval(pollInterval);
    };
  }, [user, pendingRequestsCount]);
  
  // Dragon Design: Animate blobs continuously
  React.useEffect(() => {
    // Blob 1 - Circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob1Anim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(blob1Anim, {
          toValue: 0,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 2 - Slower circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob2Anim, {
          toValue: 1,
          duration: 12000,
          useNativeDriver: true,
        }),
        Animated.timing(blob2Anim, {
          toValue: 0,
          duration: 12000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 3 - Medium speed
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob3Anim, {
          toValue: 1,
          duration: 10000,
          useNativeDriver: true,
        }),
        Animated.timing(blob3Anim, {
          toValue: 0,
          duration: 10000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Animate cards on mount
  React.useEffect(() => {
    // Check if we just navigated TO profile screen
    const justNavigatedToProfile = previousScreenRef.current !== 'profile' && currentScreen === 'profile';
    previousScreenRef.current = currentScreen;
    
    if (justNavigatedToProfile) {
      setAnimKey(prev => prev + 1);
    }
    
    if ((currentScreen === 'profile' || justNavigatedToProfile) && (user?.role === 'doctor' || user?.role === 'team_leader' || user?.role === 'coordinator' || user?.role === 'super_admin')) {
      // Stop any ongoing animations first
      fadeAnim1.stopAnimation();
      slideAnim1.stopAnimation();
      fadeAnim2.stopAnimation();
      slideAnim2.stopAnimation();
      fadeAnim3.stopAnimation();
      slideAnim3.stopAnimation();
      fadeAnim4.stopAnimation();
      slideAnim4.stopAnimation();
      fadeAnim5.stopAnimation();
      slideAnim5.stopAnimation();
      fadeAnim6.stopAnimation();
      slideAnim6.stopAnimation();
      
      // Reset animations to initial values
      fadeAnim1.setValue(0);
      slideAnim1.setValue(50);
      fadeAnim2.setValue(0);
      slideAnim2.setValue(-50);
      fadeAnim3.setValue(0);
      slideAnim3.setValue(50);
      fadeAnim4.setValue(0);
      slideAnim4.setValue(-50);
      fadeAnim5.setValue(0);
      slideAnim5.setValue(50);
      fadeAnim6.setValue(0);
      slideAnim6.setValue(-50);
      
      // Start animations with a small delay to ensure reset is complete
      setTimeout(() => {
        Animated.stagger(100, [
        Animated.parallel([
          Animated.timing(fadeAnim1, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim1, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
        Animated.parallel([
          Animated.timing(fadeAnim2, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim2, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
        Animated.parallel([
          Animated.timing(fadeAnim3, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim3, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
        Animated.parallel([
          Animated.timing(fadeAnim4, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim4, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
        Animated.parallel([
          Animated.timing(fadeAnim5, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim5, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
        Animated.parallel([
          Animated.timing(fadeAnim6, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim6, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
      ]).start();
      }, 50); // Small delay to ensure reset is complete
    }
  }, [currentScreen, user?.role]);

  // Animate View Doctor Profile card using InteractionManager
  React.useEffect(() => {
    if (currentScreen === 'viewDoctor') {
      // Reset to initial values
      viewDoctorFadeAnim.setValue(0);
      viewDoctorSlideAnim.setValue(50);
      
      // Wait for all interactions to complete before starting animation
      const handle = InteractionManager.runAfterInteractions(() => {
        Animated.parallel([
          Animated.timing(viewDoctorFadeAnim, { 
            toValue: 1, 
            duration: 600, 
            useNativeDriver: true
          }),
          Animated.spring(viewDoctorSlideAnim, { 
            toValue: 0, 
            useNativeDriver: true, 
            friction: 8
          }),
        ]).start();
      });
      
      return () => {
        handle.cancel();
      };
    }
  }, [currentScreen]);

  // Fetch doctor statistics when viewing doctor profile
  React.useEffect(() => {
    if (currentScreen === 'viewDoctorStats' && viewingDoctorData) {
      loadDoctorStatistics(statsDateFrom, statsDateTo);
    }
  }, [currentScreen, viewingDoctorData]);

  // ✅ حساب Total Treatments للطبيب المختار (اليوم فقط)
  React.useEffect(() => {
    const fetchViewingDoctorTotalTreatments = async () => {
      if (!viewingDoctorData) {
        setViewingDoctorTotalTreatments(0);
        return;
      }

      try {
        const now = new Date();
        const fromTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
        const toTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();

        const { data: patients, error } = await supabase
          .from('patients')
          .select('id, treatment, completed_at, updated_at')
          .eq('doctor_id', viewingDoctorData.id);

        if (error) {
          console.error('Error fetching viewing doctor total treatments:', error);
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
        setViewingDoctorTotalTreatments(validPatients.length);
      } catch (error) {
        console.error('Error:', error);
      }
    };

    fetchViewingDoctorTotalTreatments();

    // ✅ Polling: التحديث كل 5 ثواني
    const pollInterval = setInterval(fetchViewingDoctorTotalTreatments, 5000);

    return () => clearInterval(pollInterval);
  }, [viewingDoctorData]);

  const loadDoctorStatistics = async (fromDate: Date, toDate: Date) => {
    if (!viewingDoctorData) return;
    
    setLoadingStats(true);
    try {
      // Get all patients treated by this doctor within date range
      const { data: patients, error } = await supabase
        .from('patients')
        .select('*')
        .eq('doctor_id', viewingDoctorData.id)
        .gte('completed_at', fromDate.toISOString())
        .lte('completed_at', toDate.toISOString());

      if (error) throw error;

      // Calculate statistics
      let totalPatients = 0;
      const treatmentCounts: { [key: string]: number } = {};
      
      patients?.forEach(patient => {
        if (patient.treatment && patient.treatment !== 'Treatment') {
          treatmentCounts[patient.treatment] = (treatmentCounts[patient.treatment] || 0) + 1;
          totalPatients++;
        }
      });

      setDoctorStats({
        totalPatients,
        treatmentCounts,
        patients: patients || []
      });
    } catch (error) {
      console.error('Error fetching doctor stats:', error);
      setDoctorStats({
        totalPatients: 0,
        treatmentCounts: {},
        patients: []
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const formatStatsDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Helper function for treatment colors
  const getTreatmentColor = (treatment: string) => {
    const colors: { [key: string]: string } = {
      'Scaling': '#10B981',
      'Filling': '#3B82F6',
      'Extraction': '#8B5CF6',
      'Pulpectomy': '#EF4444',
      'Medication': '#F59E0B',
      'Cementation': '#F59E0B',
      'Referral': '#6B7280',
      'Suture Removal': '#F59E0B'
    };
    return colors[treatment] || '#9CA3AF';
  };

  // Helper function for treatment gradient colors
  const getTreatmentGradient = (treatment: string): string[] => {
    const gradients: { [key: string]: string[] } = {
      'Filling': ['#3B82F6', '#60A5FA'],
      'Extraction': ['#EF4444', '#F87171'],
      'Scaling': ['#10B981', '#34D399'],
      'Pulpectomy': ['#8B5CF6', '#A78BFA'],
      'Medication': ['#F59E0B', '#FBBF24'],
      'Cementation': ['#EC4899', '#F472B6'],
      'Referral': ['#6B7280', '#9CA3AF'],
      'Suture Removal': ['#14B8A6', '#2DD4BF'],
    };
    return gradients[treatment] || ['#7DD3C0', '#5FBDAA'];
  };
  
  // Swipe gesture removed

  // Dental Departments screen
  if (currentScreen === 'departments') {
    return (
      <DentalDepartmentsScreen 
        onBack={() => {
          setSelectedClinicId(null);
          setCurrentScreen('profile');
        }}
        onOpenTimeline={(clinicId, clinicName) => {
          console.log('[DoctorProfileScreen] onOpenTimeline called for:', clinicId, clinicName);
          if (onOpenTimeline) {
            console.log('[DoctorProfileScreen] Calling parent onOpenTimeline');
            onOpenTimeline(clinicId, clinicName);
          } else {
            console.log('[DoctorProfileScreen] ERROR: onOpenTimeline is undefined!');
          }
        }}
      />
    );
  }

  // Doctors screen
  if (currentScreen === 'doctors') {
    return (
      <DoctorsScreen 
        onBack={() => {
          setSelectedClinicId(null);
          setCurrentScreen(previousScreen);
        }}
        clinicId={selectedClinicId || undefined}
        onOpenDoctorProfile={(doctor) => {
          setViewingDoctorData(doctor);
          setCurrentScreen('viewDoctor');
        }}
      />
    );
  }

  // Schedule screen
  if (currentScreen === 'schedule') {
    return (
      <ComingSoonScreen 
        onBack={() => setCurrentScreen('profile')}
        title="Schedule"
      />
    );
  }

  // Requests screen
  if (currentScreen === 'requests') {
    return (
      <ComingSoonScreen 
        onBack={() => setCurrentScreen('profile')}
        title="Requests"
      />
    );
  }

  // View doctor profile screen
  if (currentScreen === 'viewDoctor' && viewingDoctorData) {
    return (
      <View style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
          <View style={styles.gradient}>
            {/* Gradient Mesh Background */}
            <LinearGradient
              colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.meshGradient}
            />
            
            {/* Animated Blobs */}
            <Animated.View 
              style={[
                styles.blob,
                {
                  top: 100,
                  right: -50,
                  backgroundColor: 'rgba(167, 139, 250, 0.15)',
                  transform: [
                    { translateX: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
                    { translateY: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
                  ],
                },
              ]}
            />
            <Animated.View 
              style={[
                styles.blob,
                {
                  bottom: 150,
                  left: -80,
                  backgroundColor: 'rgba(125, 211, 252, 0.12)',
                  transform: [
                    { translateX: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
                    { translateY: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
                  ],
                },
              ]}
            />
            <Animated.View 
              style={[
                styles.blob,
                {
                  top: '50%',
                  right: '20%',
                  backgroundColor: 'rgba(240, 98, 146, 0.1)',
                  transform: [
                    { translateX: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
                    { translateY: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
                  ],
                },
              ]}
            />

            {/* Content Wrapper */}
            <View style={styles.contentWrapper}>
              {/* Side Avatar Header */}
              <View style={styles.sideHeader}>
                {/* Back Button */}
                <TouchableOpacity 
                  onPress={() => setCurrentScreen('doctors')} 
                  style={[styles.viewDoctorBackButton, { zIndex: 1 }]}
                >
                  <Ionicons name="arrow-back" size={24} color="#4A5568" />
                </TouchableOpacity>
                
                {/* Info */}
                <View style={[styles.sideInfo, { zIndex: 1 }]}>
                  <Text style={styles.sideDoctorName} numberOfLines={1}>{viewingDoctorData.name}</Text>
                  <View style={styles.sideClinicRow}>
                    <Ionicons name="location" size={12} color="#718096" />
                    <Text style={styles.sideClinicName} numberOfLines={1}>{viewingDoctorData.clinicName}</Text>
                  </View>
                </View>
                
                {/* Empty Space (no edit button) */}
                <View style={{ width: 48, zIndex: 1 }} />
              </View>

              {/* Content */}
              <View style={styles.content}>
                {/* 3D Floating Cards - Staggered Layout */}
                <ScrollView 
                  style={styles.cardsScrollView}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.cardsContainer}
                >
                  {/* My Statistics Card */}
                  <Animated.View
                    style={[
                      { opacity: viewDoctorFadeAnim, transform: [{ translateX: viewDoctorSlideAnim }] }
                    ]}
                  >
                    <TouchableOpacity 
                      style={[styles.floatingCard, styles.cardRight, { marginTop: 0 }]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setCurrentScreen('viewDoctorStats');
                      }}
                    >
                      <LinearGradient
                        colors={['#F5A6C8', '#F287B5']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cardGradient}
                      >
                        {/* ✅ Ticket Stub Badge */}
                        <View style={styles.ticketStub}>
                          <LinearGradient
                            colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.ticketStubGradient}
                          >
                            <Text style={styles.ticketNumber}>{viewingDoctorTotalTreatments || 0}</Text>
                            <Text style={styles.ticketLabel}>Total</Text>
                          </LinearGradient>
                        </View>
                        
                        <View style={styles.cardContent}>
                          <View style={styles.cardIconWrapper}>
                            <Ionicons name="analytics" size={32} color="#FFFFFF" />
                          </View>
                          <Text style={styles.cardTitle}>My Statistics</Text>
                          <Text style={styles.cardSubtitle}>Performance</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                </ScrollView>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // View doctor statistics screen
  if (currentScreen === 'viewDoctorStats' && viewingDoctorData) {
    return (
      <View style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
          <View style={styles.gradient}>
            {/* Gradient Mesh Background */}
            <LinearGradient
              colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.meshGradient}
            />
            
            {/* Animated Blobs */}
            <Animated.View 
              style={[
                styles.blob,
                {
                  top: 100,
                  right: -50,
                  backgroundColor: 'rgba(167, 139, 250, 0.15)',
                  transform: [
                    { translateX: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
                    { translateY: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
                  ],
                },
              ]}
            />
            <Animated.View 
              style={[
                styles.blob,
                {
                  bottom: 150,
                  left: -80,
                  backgroundColor: 'rgba(125, 211, 252, 0.12)',
                  transform: [
                    { translateX: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
                    { translateY: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
                  ],
                },
              ]}
            />
            <Animated.View 
              style={[
                styles.blob,
                {
                  top: '50%',
                  right: '20%',
                  backgroundColor: 'rgba(240, 98, 146, 0.1)',
                  transform: [
                    { translateX: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
                    { translateY: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
                  ],
                },
              ]}
            />

            {/* Content Wrapper */}
            <View style={styles.contentWrapper}>
              {/* Header */}
              <View style={styles.statsHeader}>
                <View style={styles.statsHeaderTop}>
                  <TouchableOpacity 
                    onPress={() => setCurrentScreen('viewDoctor')} 
                    style={styles.statsBackButton}
                  >
                    <Ionicons name="arrow-back" size={24} color="#4A5568" />
                  </TouchableOpacity>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.statsHeaderTitle}>{viewingDoctorData.name}</Text>
                    <Text style={styles.statsHeaderSubtitle}>{viewingDoctorData.clinicName}</Text>
                  </View>
                  <View style={{ width: 40 }} />
                </View>
              </View>

              {/* Divider */}
              <View style={styles.statsHeaderDivider} />

              {/* Content */}
              <ScrollView 
                style={styles.statsContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Timeline for Date Selection */}
                <View style={styles.statsTimelineContainer}>
                  {/* Step 1: Start Date */}
                  <View style={styles.statsTimelineStep}>
                    <TouchableOpacity onPress={() => {
                      setTempStatsDateFrom(statsDateFrom);
                      setShowStatsDateFromPicker(true);
                    }}>
                      <LinearGradient
                        colors={['#7DD3FC', '#7DD3FC']}
                        style={styles.statsTimelineDot}
                      >
                        <Ionicons name="calendar" size={24} color="#FFFFFF" />
                      </LinearGradient>
                    </TouchableOpacity>
                    <Text style={styles.statsTimelineLabel}>From</Text>
                    <Text style={styles.statsTimelineValue}>{formatStatsDate(statsDateFrom)}</Text>
                  </View>

                  {/* Line */}
                  <View style={styles.statsTimelineLine} />

                  {/* Step 2: End Date */}
                  <View style={styles.statsTimelineStep}>
                    <TouchableOpacity onPress={() => {
                      setTempStatsDateTo(statsDateTo);
                      setShowStatsDateToPicker(true);
                    }}>
                      <LinearGradient
                        colors={['#7DD3FC', '#7DD3FC']}
                        style={styles.statsTimelineDot}
                      >
                        <Ionicons name="calendar" size={24} color="#FFFFFF" />
                      </LinearGradient>
                    </TouchableOpacity>
                    <Text style={styles.statsTimelineLabel}>To</Text>
                    <Text style={styles.statsTimelineValue}>{formatStatsDate(statsDateTo)}</Text>
                  </View>

                  {/* Line */}
                  <View style={styles.statsTimelineLine} />

                  {/* Step 3: Load */}
                  <View style={styles.statsTimelineStep}>
                    <TouchableOpacity onPress={() => {
                      setStatsDateFrom(tempStatsDateFrom);
                      setStatsDateTo(tempStatsDateTo);
                      loadDoctorStatistics(tempStatsDateFrom, tempStatsDateTo);
                    }}>
                      <View style={[styles.statsTimelineDot, styles.statsTimelineDotInactive]}>
                        <Ionicons name="checkmark-circle" size={24} color="#F687B3" />
                      </View>
                    </TouchableOpacity>
                    <Text style={styles.statsTimelineLabel}>Load</Text>
                    <Text style={styles.statsTimelineValue}>Tap</Text>
                  </View>
                </View>

                {loadingStats ? (
                  <Text style={styles.statsLoadingText}>Loading...</Text>
                ) : doctorStats ? (
                  <>
                    {/* Treatment Summary - Circular Progress Cards */}
                    <Text style={styles.statsSectionTitle}>💉 Treatment Summary</Text>
                    <ScrollView
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onScroll={(event) => {
                        const scrollPosition = event.nativeEvent.contentOffset.x;
                        const pageIndex = Math.round(scrollPosition / event.nativeEvent.layoutMeasurement.width);
                        setStatsCurrentPage(pageIndex);
                      }}
                      scrollEventThrottle={16}
                      style={styles.statsHorizontalScroll}
                    >
                      {(() => {
                        const treatments = Object.entries(doctorStats.treatmentCounts);
                        const pages = [];
                        const itemsPerPage = 4;
                        
                        for (let i = 0; i < treatments.length; i += itemsPerPage) {
                          const pageItems = treatments.slice(i, i + itemsPerPage);
                          pages.push(
                            <View key={`page-${i}`} style={styles.statsCircularCardsPage}>
                              {pageItems.map(([treatment, count]: [string, any]) => {
                                const percentage = Math.round((count / doctorStats.totalPatients) * 100);
                                const colors = getTreatmentGradient(treatment);
                                
                                return (
                                  <View key={treatment} style={styles.statsCircularCard}>
                                    <View style={styles.statsCircularProgressContainer}>
                                      {/* Background Circle */}
                                      <View style={[styles.statsCircularProgressBg, { borderColor: `${colors[0]}30` }]} />
                                      
                                      {/* Progress Circle */}
                                      <LinearGradient
                                        colors={colors}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={[
                                          styles.statsCircularProgress,
                                          {
                                            transform: [
                                              { rotate: `-${90 - (percentage * 3.6)}deg` }
                                            ]
                                          }
                                        ]}
                                      />
                                      
                                      {/* Center Content */}
                                      <View style={styles.statsCircularCenter}>
                                        <Text style={styles.statsCircularCount}>{count}</Text>
                                        <Text style={styles.statsCircularPercentage}>{percentage}%</Text>
                                      </View>
                                    </View>
                                    
                                    <Text style={styles.statsCircularLabel}>{treatment}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        }
                        return pages;
                      })()}
                    </ScrollView>
                    
                    {/* Pagination Dots */}
                    {Object.entries(doctorStats.treatmentCounts).length > 4 && (
                      <View style={styles.statsPaginationContainer}>
                        {Array.from({ length: Math.ceil(Object.entries(doctorStats.treatmentCounts).length / 4) }).map((_, index) => (
                          <View
                            key={index}
                            style={[
                              styles.statsPaginationDot,
                              statsCurrentPage === index && styles.statsPaginationDotActive
                            ]}
                          />
                        ))}
                      </View>
                    )}

                    {/* Total Summary */}
                    <View style={styles.statsTotalCard}>
                      <Text style={styles.statsTotalLabel}>Total Treatments</Text>
                      <Text style={styles.statsTotalCount}>{doctorStats.totalPatients}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.statsEmptyCard}>
                    <Text style={styles.statsEmptyText}>No statistics available</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </SafeAreaView>

        {/* Date From Picker */}
        {showStatsDateFromPicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={tempStatsDateFrom}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowStatsDateFromPicker(false);
              if (selectedDate) {
                setTempStatsDateFrom(selectedDate);
                setStatsDateFrom(selectedDate);
              }
            }}
          />
        )}
        {showStatsDateFromPicker && Platform.OS === 'ios' && (
          <Modal
            transparent
            animationType="slide"
            visible={showStatsDateFromPicker}
            onRequestClose={() => setShowStatsDateFromPicker(false)}
          >
            <View style={styles.statsPickerModalOverlay}>
              <View style={styles.statsDatePickerModal}>
                <View style={styles.statsDatePickerHeader}>
                  <TouchableOpacity onPress={() => setShowStatsDateFromPicker(false)}>
                    <Text style={styles.statsDatePickerButton}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowStatsDateFromPicker(false)}>
                    <Text style={[styles.statsDatePickerButton, styles.statsDatePickerButtonDone]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempStatsDateFrom}
                  mode="date"
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) setTempStatsDateFrom(date);
                  }}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Date To Picker */}
        {showStatsDateToPicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={tempStatsDateTo}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowStatsDateToPicker(false);
              if (selectedDate) {
                setTempStatsDateTo(selectedDate);
                setStatsDateTo(selectedDate);
              }
            }}
          />
        )}
        {showStatsDateToPicker && Platform.OS === 'ios' && (
          <Modal
            transparent
            animationType="slide"
            visible={showStatsDateToPicker}
            onRequestClose={() => setShowStatsDateToPicker(false)}
          >
            <View style={styles.statsPickerModalOverlay}>
              <View style={styles.statsDatePickerModal}>
                <View style={styles.statsDatePickerHeader}>
                  <TouchableOpacity onPress={() => setShowStatsDateToPicker(false)}>
                    <Text style={styles.statsDatePickerButton}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowStatsDateToPicker(false)}>
                    <Text style={[styles.statsDatePickerButton, styles.statsDatePickerButtonDone]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempStatsDateTo}
                  mode="date"
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) setTempStatsDateTo(date);
                  }}
                />
              </View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

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
        <View style={styles.gradient}>
        
        {/* Animated Blobs */}
        <Animated.View 
          style={[
            styles.blob1, 
            {
              transform: [
                {
                  translateX: blob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 30],
                  }),
                },
                {
                  translateY: blob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -40],
                  }),
                },
              ],
            },
          ]} 
        />
        <Animated.View 
          style={[
            styles.blob2, 
            {
              transform: [
                {
                  translateX: blob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -50],
                  }),
                },
                {
                  translateY: blob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 30],
                  }),
                },
              ],
            },
          ]} 
        />
        <Animated.View 
          style={[
            styles.blob3, 
            {
              transform: [
                {
                  translateX: blob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 40],
                  }),
                },
                {
                  translateY: blob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 50],
                  }),
                },
              ],
            },
          ]} 
        />
        
        {/* Content Wrapper */}
        <View style={styles.contentWrapper}>
        {/* Content */}
        <View style={styles.content}>
          {/* Side Avatar Header */}
          <View style={styles.sideHeader}>
            {/* Info */}
            <View style={[styles.sideInfo, { zIndex: 1 }]}>
              <Text style={styles.sideDoctorName} numberOfLines={1}>{user?.name || 'Doctor'}</Text>
              <View style={styles.sideClinicRow}>
                <Ionicons name="location" size={12} color="#718096" />
                <Text style={styles.sideClinicName} numberOfLines={1}>{user?.clinicName || 'Clinic'}</Text>
              </View>
            </View>
            
            {/* Edit Button */}
            <TouchableOpacity 
              onPress={() => setShowEditModal(true)} 
              style={[styles.sideEditButton, { zIndex: 1 }]}
            >
              <Ionicons name="create-outline" size={20} color="#4A5568" />
            </TouchableOpacity>
          </View>

          {/* 3D Floating Cards - Staggered Layout */}
          <ScrollView 
            key={`cards-${currentScreen}-${animKey}`}
            style={styles.cardsScrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.cardsContainer}
          >
            {/* Team Leader Cards */}
            {user?.role === 'team_leader' && (
              <>
                {/* Card 1: Timeline - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim1, transform: [{ translateX: slideAnim1 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 0 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenTimeline && user?.clinicId) {
                        onOpenTimeline(user.clinicId, user.clinicName);
                      }
                    }}
                  >
                    <LinearGradient
                      colors={['#B8A4E5', '#9B87D1']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس على اليسار */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{waitingPatientsCount}</Text>
                          <Text style={styles.ticketLabel}>Waiting</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="pulse" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Timeline</Text>
                        <Text style={styles.cardSubtitle}>Patient Queue</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 2: My Team - Left Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim2, transform: [{ translateX: slideAnim2 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardLeft, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setPreviousScreen('profile');
                      setCurrentScreen('doctors');
                    }}
                  >
                    <LinearGradient
                      colors={['#8DD4C7', '#6BC4B5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{doctorsCount}</Text>
                          <Text style={styles.ticketLabel}>Doctors</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="people-circle" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>My Team</Text>
                        <Text style={styles.cardSubtitle}>Doctors List</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 3: My Statistics - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim3, transform: [{ translateX: slideAnim3 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenMyStatistics) {
                        onOpenMyStatistics();
                      }
                    }}
                  >
                    <LinearGradient
                      colors={['#F5A6C8', '#F287B5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{myTotalTreatments || 0}</Text>
                          <Text style={styles.ticketLabel}>Total</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="analytics" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>My Statistics</Text>
                        <Text style={styles.cardSubtitle}>Performance</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 4: Schedule - Left Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim4, transform: [{ translateX: slideAnim4 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardLeft, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('schedule')}
                  >
                    <LinearGradient
                      colors={['#D4A5E3', '#C48FD6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{new Date().getDate()}</Text>
                          <Text style={styles.ticketLabel}>{new Date().toLocaleString('en', { month: 'short' }).toUpperCase()}</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="calendar-sharp" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Schedule</Text>
                        <Text style={styles.cardSubtitle}>Work Shifts</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 5: Requests - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim5, transform: [{ translateX: slideAnim5 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('requests')}
                  >
                    <LinearGradient
                      colors={['#FFB8A0', '#FF9E85']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{pendingRequestsCount}</Text>
                          <Text style={styles.ticketLabel}>Pending</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="mail-unread" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Requests</Text>
                        <Text style={styles.cardSubtitle}>Pending Items</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </>
            )}

            {/* Coordinator Cards */}
            {(user?.role === 'super_admin' || user?.role === 'coordinator') && (
              <>
                {/* Card 1: Doctors - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim1, transform: [{ translateX: slideAnim1 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 0 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setPreviousScreen('profile');
                      setCurrentScreen('doctors');
                    }}
                  >
                    <LinearGradient
                      colors={['#8DD4C7', '#6BC4B5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{doctorsCount}</Text>
                          <Text style={styles.ticketLabel}>Doctors</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="people" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Doctors</Text>
                        <Text style={styles.cardSubtitle}>Team Management</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 2: My Statistics - Left Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim2, transform: [{ translateX: slideAnim2 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardLeft, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenMyStatistics) {
                        onOpenMyStatistics();
                      }
                    }}
                  >
                    <LinearGradient
                      colors={['#F5A6C8', '#F287B5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{myTotalTreatments || 0}</Text>
                          <Text style={styles.ticketLabel}>Total</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="analytics" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>My Statistics</Text>
                        <Text style={styles.cardSubtitle}>Performance</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 3: Dental Department - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim3, transform: [{ translateX: slideAnim3 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('departments')}
                  >
                    <LinearGradient
                      colors={['#FFA07A', '#FF8C69']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{clinicsCount}</Text>
                          <Text style={styles.ticketLabel}>Clinics</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="business" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Dental Dept</Text>
                        <Text style={styles.cardSubtitle}>Departments</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 4: Schedule - Left Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim4, transform: [{ translateX: slideAnim4 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardLeft, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('schedule')}
                  >
                    <LinearGradient
                      colors={['#D4A5E3', '#C48FD6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{new Date().getDate()}</Text>
                          <Text style={styles.ticketLabel}>{new Date().toLocaleString('en', { month: 'short' }).toUpperCase()}</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="calendar-sharp" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Schedule</Text>
                        <Text style={styles.cardSubtitle}>Work Shifts</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 5: Requests - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim5, transform: [{ translateX: slideAnim5 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('requests')}
                  >
                    <LinearGradient
                      colors={['#FFB8A0', '#FF9E85']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{pendingRequestsCount}</Text>
                          <Text style={styles.ticketLabel}>Pending</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="mail-unread" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Requests</Text>
                        <Text style={styles.cardSubtitle}>Pending Items</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </>
            )}

            {/* Doctor: 3D Floating Cards */}
            {user?.role === 'doctor' && (
              <>
                {/* Card 1: Timeline - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim1, transform: [{ translateX: slideAnim1 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 0 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenTimeline && user?.clinicId) {
                        onOpenTimeline(user.clinicId, user.clinicName);
                      }
                    }}
                  >
                  <LinearGradient
                    colors={['#B8A4E5', '#9B87D1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/* ✅ قسم منفصل بنصف قوس على اليسار */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{waitingPatientsCount}</Text>
                          <Text style={styles.ticketLabel}>Waiting</Text>
                        </LinearGradient>
                      </View>
                    
                    <View style={styles.cardContent}>
                      <View style={styles.cardIconWrapper}>
                        <Ionicons name="pulse" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.cardTitle}>Timeline</Text>
                      <Text style={styles.cardSubtitle}>Patient Queue</Text>
                    </View>
                  </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 2: My Team - Left Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim2, transform: [{ translateX: slideAnim2 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardLeft, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setPreviousScreen('profile');
                      setCurrentScreen('doctors');
                    }}
                  >
                  <LinearGradient
                    colors={['#8DD4C7', '#6BC4B5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{doctorsCount}</Text>
                          <Text style={styles.ticketLabel}>Doctors</Text>
                        </LinearGradient>
                      </View>
                    
                    <View style={styles.cardContent}>
                      <View style={styles.cardIconWrapper}>
                        <Ionicons name="people-circle" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.cardTitle}>My Team</Text>
                      <Text style={styles.cardSubtitle}>Doctors List</Text>
                    </View>
                  </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 3: My Statistics - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim3, transform: [{ translateX: slideAnim3 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenMyStatistics) {
                        onOpenMyStatistics();
                      }
                    }}
                  >
                  <LinearGradient
                    colors={['#F5A6C8', '#F287B5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{myTotalTreatments || 0}</Text>
                          <Text style={styles.ticketLabel}>Total</Text>
                        </LinearGradient>
                      </View>
                    
                    <View style={styles.cardContent}>
                      <View style={styles.cardIconWrapper}>
                        <Ionicons name="analytics" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.cardTitle}>My Statistics</Text>
                      <Text style={styles.cardSubtitle}>Performance</Text>
                    </View>
                  </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 4: Schedule - Left Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim4, transform: [{ translateX: slideAnim4 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardLeft, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('schedule')}
                  >
                  <LinearGradient
                    colors={['#D4A5E3', '#C48FD6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                                        {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{new Date().getDate()}</Text>
                          <Text style={styles.ticketLabel}>{new Date().toLocaleString('en', { month: 'short' }).toUpperCase()}</Text>
                        </LinearGradient>
                      </View>
                    
                    <View style={styles.cardContent}>
                      <View style={styles.cardIconWrapper}>
                        <Ionicons name="calendar-sharp" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.cardTitle}>Schedule</Text>
                      <Text style={styles.cardSubtitle}>Work Shifts</Text>
                    </View>
                  </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Card 5: Requests - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim5, transform: [{ translateX: slideAnim5 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('requests')}
                  >
                  <LinearGradient
                    colors={['#FFB8A0', '#FF9E85']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/* ✅ Anim                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{pendingRequestsCount}</Text>
                          <Text style={styles.ticketLabel}>Pending</Text>
                        </LinearGradient>
                      </View>
                    
                    <View style={styles.cardContent}>
                      <View style={styles.cardIconWrapper}>
                        <Ionicons name="mail-unread" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.cardTitle}>Requests</Text>
                      <Text style={styles.cardSubtitle}>Pending Items</Text>
                    </View>
                  </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </>
            )}
          </ScrollView>
        </View>
        </View>
      </View>
        </SafeAreaView>


      {/* Edit Profile Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowEditModal(false)}
          >
            <View style={styles.modalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity 
                  onPress={() => setShowEditModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#2D3748" />
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                {/* Name Field */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>الاسم:</Text>
                  <TextInput
                    style={[styles.textInput, (user?.role === 'team_leader' || user?.role === 'doctor' || user?.role === 'coordinator') && styles.disabledInput]}
                    value={managerName}
                    onChangeText={setManagerName}
                    placeholder="أدخل الاسم"
                    placeholderTextColor="#9CA3AF"
                    editable={user?.role !== 'team_leader' && user?.role !== 'doctor' && user?.role !== 'coordinator'}
                  />
                </View>

                {/* Email Field */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>الإيميل:</Text>
                  <TextInput
                    style={[styles.textInput, (user?.role === 'team_leader' || user?.role === 'doctor' || user?.role === 'coordinator') && styles.disabledInput]}
                    value={managerEmail}
                    onChangeText={setManagerEmail}
                    placeholder="أدخل الإيميل"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={user?.role !== 'team_leader' && user?.role !== 'doctor' && user?.role !== 'coordinator'}
                  />
                </View>

                {/* Change Password Button */}
                <TouchableOpacity 
                  style={styles.transparentButton}
                  onPress={() => {
                    setShowEditModal(false);
                    setShowChangePasswordModal(true);
                  }}
                >
                  <Text style={styles.transparentButtonText}>Change Password</Text>
                </TouchableOpacity>

                {/* Logout Button */}
                <TouchableOpacity 
                  style={styles.logoutButton}
                  onPress={() => {
                    setShowEditModal(false);
                    Alert.alert(
                      'Logout',
                      'Are you sure you want to logout?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Logout', 
                          style: 'destructive',
                          onPress: async () => {
                            await logout();
                          }
                        }
                      ]
                    );
                  }}
                >
                  <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
              </View>

              {/* Save & Cancel Buttons */}
              <View style={styles.bottomActions}>
                <TouchableOpacity 
                  style={[styles.bottomButton, styles.cancelButton]}
                  onPress={() => {
                    setShowEditModal(false);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.bottomButton, styles.saveButton]}
                  onPress={() => {
                    // Save changes
                    console.log('Saved:', { 
                      name: managerName, 
                      email: managerEmail
                    });
                    
                    // Show success message
                    Alert.alert(
                      'Success',
                      'Profile updated successfully!',
                      [{ text: 'OK' }]
                    );
                    
                    setShowEditModal(false);
                  }}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={showChangePasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChangePasswordModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowChangePasswordModal(false)}
          >
            <TouchableOpacity 
              activeOpacity={1} 
              onPress={(e) => e.stopPropagation()}
              style={styles.modalContent}
            >
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Change Password</Text>
                <TouchableOpacity 
                  onPress={() => setShowChangePasswordModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#2D3748" />
                </TouchableOpacity>
              </View>

              {/* Password Fields */}
              <View style={styles.formContainer}>
                {/* Old Password */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Old Password:</Text>
                  <TextInput
                    style={styles.textInput}
                    value={oldPassword}
                    onChangeText={setOldPassword}
                    placeholder="Enter old password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                  />
                </View>

                {/* New Password */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>New Password:</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                  />
                </View>

                {/* Confirm New Password */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Confirm New Password:</Text>
                  <TextInput
                    style={styles.textInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                  />
                </View>
              </View>

              {/* Save & Cancel Buttons */}
              <View style={styles.bottomActions}>
                <TouchableOpacity 
                  style={[styles.bottomButton, styles.cancelButton]}
                  onPress={() => {
                    setShowChangePasswordModal(false);
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.bottomButton, styles.saveButton]}
                  onPress={async () => {
                    // Validate passwords
                    if (!oldPassword || !newPassword || !confirmPassword) {
                      Alert.alert('Error', 'Please fill all fields');
                      return;
                    }

                    if (newPassword !== confirmPassword) {
                      Alert.alert('Error', 'New passwords do not match!');
                      return;
                    }

                    if (newPassword.length < 6) {
                      Alert.alert('Error', 'Password must be at least 6 characters');
                      return;
                    }

                    try {
                      console.log('Change password - Start');
                      console.log('User:', user?.id, user?.email);
                      console.log('Old password match:', user?.password === oldPassword);
                      
                      // Verify old password
                      if (user?.password !== oldPassword) {
                        Alert.alert('خطأ', 'كلمة المرور القديمة غير صحيحة');
                        return;
                      }
                      
                      console.log('Updating password in Supabase...');
                      
                      // Update password in Supabase
                      const { data, error } = await supabase
                        .from('doctors')
                        .update({ password: newPassword })
                        .eq('id', user.id)
                        .select();
                      
                      console.log('Supabase response:', { data, error });
                      
                      if (error) {
                        console.error('Supabase error:', error);
                        throw error;
                      }
                      
                      // Update local user state
                      if (updateUser) {
                        await updateUser({ ...user, password: newPassword });
                      }
                      
                      Alert.alert(
                        'نجح',
                        'تم تغيير كلمة المرور بنجاح!',
                        [{ text: 'OK' }]
                      );
                      
                      setShowChangePasswordModal(false);
                      setOldPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    } catch (error) {
                      console.error('Error changing password:', error);
                      Alert.alert('خطأ', 'فشل تغيير كلمة المرور. الرجاء المحاولة مرة أخرى.');
                    }
                  }}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8EAF6',
  },
  gradient: {
    flex: 1,
    position: 'relative',
  },
  meshGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentWrapper: {
    flex: 1,
  },
  blob: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  viewDoctorBackButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  blob1: {
    position: 'absolute',
    top: 100,
    right: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(179, 157, 219, 0.15)',
  },
  blob2: {
    position: 'absolute',
    bottom: 150,
    left: -80,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(129, 212, 250, 0.12)',
  },
  blob3: {
    position: 'absolute',
    top: '50%',
    right: '20%',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(240, 98, 146, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 10,
    position: 'relative',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#4A5568',
    letterSpacing: -0.5,
    textAlign: 'center',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  // Side Avatar Header
  sideHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',  // ✅ أقل شفافية
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 0,  // ✅ مستطيل كامل
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 20,
  },
  sideAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(156, 163, 175, 0.5)',
  },
  sideInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideDoctorName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sideClinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sideClinicName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4A5568',
  },
  sideEditButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Curved Header Styles
  curvedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingTop: 50,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  curvedEditButton: {
    position: 'absolute',
    top: 50,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(74, 85, 104, 0.5)',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(124, 58, 237, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  curvedDoctorName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4A5568',
    marginBottom: 6,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  curvedClinicName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#718096',
    textAlign: 'center',
    textShadowColor: 'rgba(255, 255, 255, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  waveContainer: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 30,
    overflow: 'hidden',
  },
  wave: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  doctorCard: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 20,
  },

  doctorName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 12,
    textAlign: 'center',
  },
  workCenter: {
    fontSize: 18,
    color: '#718096',
    textAlign: 'center',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 30,
    gap: 16,
  },
  actionButton: {
    width: 110,
    height: 110,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B9FED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  innerGlow: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 25,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2D3748',
    textAlign: 'center',
    lineHeight: 14,
  },
  editButton: {
    position: 'absolute',
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    paddingHorizontal: '2.5%',
  },
  modalContent: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3748',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formContainer: {
    gap: 20,
    marginBottom: 24,
  },
  formField: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    textAlign: 'right',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2D3748',
    textAlign: 'right',
  },
  disabledInput: {
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    borderColor: 'rgba(0, 0, 0, 0.05)',
    color: '#9CA3AF',
  },
  transparentButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(91, 159, 237, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(91, 159, 237, 0.3)',
    marginTop: 12,
  },
  transparentButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5B9FED',
  },
  logoutButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  bottomButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  saveButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  cancelButton: {
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  // 3D Floating Cards Styles
  cardsScrollView: {
    flex: 1,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  cardCenter: {
    alignSelf: 'center',
  },
  profileCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  profileClinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileClinic: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  profileEditButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  floatingCard: {
    width: '105%',  // ✅ عرض 105%
    height: 130,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  cardRight: {
    marginHorizontal: -20,  // ✅ الكرت يخرج خارج الشاشة 20 بكسل
  },
  cardLeft: {
    marginHorizontal: -20,  // ✅ الكرت يخرج خارج الشاشة 20 بكسل
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  cardContent: {
    alignItems: 'flex-start',
  },
  cardIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  cardStatsText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  
  // Doctor Statistics Styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#718096',
    fontWeight: '500',
  },
  statsCard: {
    width: '85%',
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  statsCardGradient: {
    padding: 24,
    minHeight: 140,
  },
  statsCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCardNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 4,
  },
  statsCardLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 0.5,
  },
  treatmentBreakdownContainer: {
    width: '85%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    padding: 20,
    marginTop: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  treatmentBreakdownTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 16,
  },
  treatmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  treatmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  treatmentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  treatmentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4A5568',
  },
  treatmentCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  noDataText: {
    fontSize: 16,
    color: '#A0AEC0',
    fontWeight: '500',
    marginTop: 16,
  },

  // View Doctor Statistics Screen Styles
  statsHeader: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  statsHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 10,
  },
  statsBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  statsHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3748',
    textAlign: 'center',
  },
  statsHeaderSubtitle: {
    fontSize: 14,
    color: '#718096',
    marginTop: 4,
    textAlign: 'center',
  },
  statsHeaderDivider: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  statsContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 20,
  },
  statsHorizontalScroll: {
    marginBottom: 20,
  },
  statsCircularCardsPage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    width: Dimensions.get('window').width,
  },
  statsCircularCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  statsCircularProgressContainer: {
    width: 100,
    height: 100,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsCircularProgressBg: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderColor: '#E5E7EB',
  },
  statsCircularProgress: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  statsCircularCenter: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsCircularCount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  statsCircularPercentage: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  statsCircularLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    textAlign: 'center',
  },
  statsPaginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    gap: 8,
  },
  statsPaginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  statsPaginationDotActive: {
    backgroundColor: '#A78BFA',
    width: 24,
  },
  statsTotalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    padding: 30,
    marginBottom: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  statsTotalLabel: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 10,
  },
  statsTotalCount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  statsLoadingText: {
    textAlign: 'center',
    color: '#718096',
    fontSize: 16,
    marginTop: 40,
  },
  statsEmptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    padding: 30,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  statsEmptyText: {
    textAlign: 'center',
    color: '#718096',
    fontSize: 16,
  },
  // Timeline Styles for viewDoctorStats
  statsTimelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 30,
    paddingHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  statsTimelineStep: {
    alignItems: 'center',
    flex: 1,
  },
  statsTimelineDot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  statsTimelineDotInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#CBD5E0',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  statsTimelineLine: {
    width: 40,
    height: 3,
    backgroundColor: '#CBD5E0',
    marginHorizontal: -10,
  },
  statsTimelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 8,
  },
  statsTimelineValue: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
  },
  // Date Picker Modal Styles (iOS)
  statsPickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  statsDatePickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  statsDatePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statsDatePickerButton: {
    fontSize: 16,
    color: '#5B9FED',
    fontWeight: '600',
  },
  statsDatePickerButtonDone: {
    fontWeight: '700',
  },
  
  // ✅ Animated Badge Styles
  badgeContainer: {
    position: 'absolute',
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 10,
  },
  badge: {
    width: 110,
    height: 100,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    // ✅ Smoky Gradient Effect - No borders, soft fade
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    // Smoky edge effect
    overflow: 'visible',
  },
  // ✅ Simple Badge - Text Only (No Background/Border)
  simpleBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ✅ Ticket Stub - قسم منفصل بنصف قوس
  ticketStub: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 90,
    overflow: 'hidden',
  },
  ticketStubGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    // ✅ نصف قوس على اليسار
    borderTopLeftRadius: 100,
    borderBottomLeftRadius: 100,
  },
  ticketNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  ticketLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badgeNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
    lineHeight: 32,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: -2,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  badgeSubtext: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: -2,
    letterSpacing: 1,
  },
});
