import React, { useState, useEffect, useCallback } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Animated, Dimensions, InteractionManager } from 'react-native';
import { scaledStyleSheet, scale } from './lib/scale';
// Swipe gesture removed
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DentalDepartmentsScreen from './DentalDepartmentsScreen';
import DoctorsScreen from './DoctorsScreen';
import ComingSoonScreen from './ComingSoonScreen';
import ScheduleScreen from './screens/Schedule';
import { shadows } from './theme';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabaseClient';
import { getPermissions } from './permissions';
import { getUnreadCount, getNotifications as fetchNotifications, markAsRead, markAllAsRead, createNotification, subscribeToNotifications } from './lib/database';
import { registerForPushNotifications, addNotificationResponseListener, addNotificationReceivedListener } from './lib/pushNotifications';

// ═══ Notifications design helpers (light glass, per-type) ═══
const NFY_INK = '#20233A';
const NFY_SOFT = '#4C5069';
const NFY_MUTED = '#7C8098';
const NFY_FAINT = '#A9ADC4';
const nfyClamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const nfyParse = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const nfyRgba = (hex: string, a: number) => { const [r, g, b] = nfyParse(hex); return `rgba(${r},${g},${b},${a})`; };
const nfyLighten = (hex: string, amt: number) => { const [r, g, b] = nfyParse(hex); return `rgb(${nfyClamp(r + (255 - r) * amt)},${nfyClamp(g + (255 - g) * amt)},${nfyClamp(b + (255 - b) * amt)})`; };
const nfyDarken = (hex: string, amt: number) => { const [r, g, b] = nfyParse(hex); return `rgb(${nfyClamp(r * (1 - amt))},${nfyClamp(g * (1 - amt))},${nfyClamp(b * (1 - amt))})`; };

type NfyVisual = { c: string; icon: string; title: string };
// نوعُ الإشعار → لونٌ دلاليّ + أيقونة + عنوانٌ إنجليزيٌّ واضح
function notifVisual(notif: any): NfyVisual {
  const t = notif?.type;
  const blob = `${notif?.body || ''} ${notif?.title || ''}`;
  switch (t) {
    case 'swap_request': return { c: '#8B7CF0', icon: 'swap-horizontal', title: 'Swap Request' };
    case 'coverage_request': return { c: '#4F9BF0', icon: 'shield-checkmark-outline', title: 'Coverage Needed' };
    case 'request_result': return { c: '#2FBF8F', icon: 'checkmark-done-circle-outline', title: 'Swap Result' };
    case 'schedule_created': return { c: '#8E93C8', icon: 'calendar-outline', title: 'Schedule Published' };
    case 'trainee_attached': return { c: '#14B8A6', icon: 'school-outline', title: 'New Trainee' };
    case 'seat_change': return { c: '#8B7CF0', icon: 'shuffle-outline', title: 'Schedule Changed' };
    case 'shortage_alert': return { c: '#EF4E6B', icon: 'warning-outline', title: 'Empty Slot' };
    case 'rebalance_consent': return { c: '#4F9BF0', icon: 'git-compare-outline', title: 'Balance This Day?' };
    case 'broadcast':
    case 'admin_message':
    case 'general': return { c: '#38BDF8', icon: 'megaphone-outline', title: 'Announcement' };
    case 'request_info':
      if (/مرض|sick/i.test(blob)) return { c: '#EC6A6A', icon: 'medkit-outline', title: 'Sick Leave' };
      if (/استئذان|تفرّغ|تفرغ|permission/i.test(blob)) return { c: '#F2A33D', icon: 'hourglass-outline', title: 'Permission' };
      if (/إجاز|اجاز|vacation/i.test(blob)) return { c: '#45B6E8', icon: 'airplane-outline', title: 'Vacation' };
      return { c: '#8E93C8', icon: 'document-text-outline', title: 'New Request' };
    default: return { c: '#8E93C8', icon: 'notifications-outline', title: notif?.title || 'Notification' };
  }
}

//  Simple Badge Component - Text Only (No Background)
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
  doctorData?: {id: string, name: string, clinic_id: string | null, role: string};  //  بيانات الطبيب المختار (إذا كان يعرض طبيباً آخر)
  onOpenTimeline?: (clinicId: string, clinicName: string) => void;
  onOpenMyStatistics?: () => void;
  onOpenClinicSelection?: () => void;
  currentWaitingCount?: number;  // عدد المرضى من Timeline
  currentDoctorsCount?: number;  // عدد الأطباء من Timeline
  currentTotalTreatments?: number;  // عدد العلاجات من Timeline
  myTotalTreatments?: number;  // عدد المرضى الذين عالجتهم أنا (من صفحة احصائياتي)
};

export default function DoctorProfileScreen({ onBack, doctorData, onOpenTimeline, onOpenMyStatistics, onOpenClinicSelection, currentWaitingCount, currentDoctorsCount, currentTotalTreatments, myTotalTreatments }: DoctorProfileScreenProps) {
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
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifTab, setNotifTab] = useState<'unread' | 'read' | 'announcements'>('unread');
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [swapDetail, setSwapDetail] = useState<any | null>(null); // كرتُ التبديلِ المفتوحُ في صفحةِ القرار
  const [showCompose, setShowCompose] = useState(false); // ورقةُ كتابةِ التعميم
  const [composeText, setComposeText] = useState('');
  const [sendingAnnounce, setSendingAnnounce] = useState(false);
  const notifFadeAnim = React.useRef(new Animated.Value(0)).current;

  // Real-time data from database
  const [waitingPatientsCount, setWaitingPatientsCount] = useState(0);
  const [doctorsCount, setDoctorsCount] = useState(0);
  const [totalTreatments, setTotalTreatments] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [clinicsCount, setClinicsCount] = useState(0);  //  عدد المراكز
  const [isDoctorsCountLoading, setIsDoctorsCountLoading] = useState(true);  //  منع race condition

  //  Realtime subscriptions refs
  const doctorsChannelRef = React.useRef<any>(null);
  const clinicsChannelRef = React.useRef<any>(null);
  const patientsChannelRef = React.useRef<any>(null);
  const viewingDoctorChannelRef = React.useRef<any>(null);
  const reconnectTimeoutRef = React.useRef<any>(null);

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

  // Use values from Timeline (mirror Timeline data) - Only for Doctors Count
  // Register push notifications & fetch unread count
  useEffect(() => {
    if (!user?.id || !user?.clinicId) return;

    // Register push token
    registerForPushNotifications(user.id, user.clinicId);

    // Listen for incoming notifications (refresh count)
    const notifSub = addNotificationReceivedListener(() => {
      getUnreadCount(user.id).then(setUnreadNotifications);
    });

    // Listen for notification taps (open notifications page)
    const responseSub = addNotificationResponseListener(() => {
      openNotifications();
    });

    // Fetch unread count
    const fetchUnread = async () => {
      const count = await getUnreadCount(user.id);
      setUnreadNotifications(count);
    };
    fetchUnread();
    // وصول فوريّ (Realtime): يحدّث العدّاد لحظة إنشاء أيّ إشعار للمستخدم،
    // والمزامنةُ-عند-الاتّصال تغطّي إعادةَ الاتّصال (لا فحص دوريّ يُثقل الشبكة).
    const unsub = subscribeToNotifications(user.id, fetchUnread);

    return () => {
      unsub();
      notifSub.remove();
      responseSub.remove();
    };
  }, [user?.id, user?.clinicId]);

  React.useEffect(() => {
    //  Doctors Count: اجلب من قاعدة البيانات إذا لم يتم تمريره
    if (currentDoctorsCount !== undefined) {
      setDoctorsCount(currentDoctorsCount);
      setIsDoctorsCountLoading(false);  //  تم التحميل
    } else {
      setIsDoctorsCountLoading(true);  //  بدء التحميل
      const fetchDoctorsCount = async () => {
        if (!user) return;

        try {
          //  للتيم ليدر والطبيب: جلب clinic_id أولاً
          if (user.role === 'team_leader' || user.role === 'doctor') {
            const { data: userData, error: userError } = await supabase
              .from('doctors')
              .select('clinic_id')
              .eq('email', user.email)
              .single();

            //  إذا لم يتم العثور على clinic_id، لا تحديث العدد
            if (userError || !userData?.clinic_id) {
              setDoctorsCount(0);
              return;
            }

            //  جلب عدد الأطباء في المركز فقط
            const { count: doctorsCountResult, error: doctorsError } = await supabase
              .from('doctors')
              .select('*', { count: 'exact', head: true })
              .eq('clinic_id', userData.clinic_id);

            if (!doctorsError) {
              setDoctorsCount(doctorsCountResult || 0);
            }
          } else {
            //  للمدير والمنسق: جلب جميع الأطباء
            const { count: doctorsCountResult, error: doctorsError } = await supabase
              .from('doctors')
              .select('*', { count: 'exact', head: true });

            if (!doctorsError) {
              setDoctorsCount(doctorsCountResult || 0);
            }
          }
        } catch (error) {
          // Error handled silently
        } finally {
          setIsDoctorsCountLoading(false);  //  انتهى التحميل
        }
      };

      fetchDoctorsCount();
    }

    //  Pending Requests Count
    setPendingRequestsCount(0);
  }, [user, currentDoctorsCount]);

  // Note: waitingPatientsCount and totalTreatments are fetched from database in the next useEffect
  // We ignore currentWaitingCount and currentTotalTreatments props to avoid conflicts
  
  //  Fetch doctors count - مع useCallback
  const fetchDoctorsCountCallback = React.useCallback(async () => {
    if (!user) return;

    try {
      //  للتيم ليدر والطبيب: جلب clinic_id أولاً
      if (user.role === 'team_leader' || user.role === 'doctor') {
        const { data: userData, error: userError } = await supabase
          .from('doctors')
          .select('clinic_id')
          .eq('email', user.email)
          .single();

        if (userError || !userData?.clinic_id) return;

        const { count: doctorsCountResult, error: doctorsError } = await supabase
          .from('doctors')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', userData.clinic_id);

        if (!doctorsError) {
          setDoctorsCount(doctorsCountResult || 0);
        }
      } else {
        const { count: doctorsCountResult, error: doctorsError } = await supabase
          .from('doctors')
          .select('*', { count: 'exact', head: true });

        if (!doctorsError) {
          setDoctorsCount(doctorsCountResult || 0);
        }
      }
    } catch (error) {
      // Error handled silently
    }
  }, [user]);

  //  Fetch clinics count - مع useCallback للتأكد من عدم إعادة إنشاءها
  const fetchClinicsCountCallback = React.useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('clinics')
        .select('*', { count: 'exact', head: true });

      if (!error && count !== null) {
        setClinicsCount(count);
      }
    } catch (error) {
      // Error handled silently
    }
  }, []);


  //  Realtime: التحديث الفوري لجميع البيانات
  React.useEffect(() => {
    if (!user) return;
    if (isDoctorsCountLoading) {
      setIsDoctorsCountLoading(false);
    }

    const fetchWaitingPatientsCount = async () => {
      try {
        const { data: userData, error: userError } = await supabase
          .from('doctors')
          .select('clinic_id')
          .eq('email', user.email)
          .single();

        if (userError || !userData?.clinic_id) return;

        // جلب جميع المرضى غير المؤرشفين (بدون فلتر تاريخ) - مطابق لـ App.tsx
        const { data, error } = await supabase
          .from('patients')
          .select('clinic, status')
          .eq('clinic_id', userData.clinic_id)
          .neq('status', 'complete')
          .neq('status', 'na')
          .is('archive_date', null);  // فقط غير المؤرشفين

        if (!error) {
          const count = data?.filter(p => p.clinic === 'Clinic' || !p.clinic).length || 0;
          setWaitingPatientsCount(count);
        }
      } catch (error) {
        // Error handled silently
      }
    };

    const fetchPendingRequestsCount = async () => {
      try {
        //  مؤقتاً: إبقاء 0
        setPendingRequestsCount(0);
      } catch (error) {
        // Error handled silently
      }
    };

    // Initial fetch
    fetchDoctorsCountCallback();
    fetchClinicsCountCallback();
    fetchWaitingPatientsCount();
    fetchPendingRequestsCount();

    // Cleanup previous subscriptions
    if (doctorsChannelRef.current) {
      supabase.removeChannel(doctorsChannelRef.current);
      doctorsChannelRef.current = null;
    }
    if (clinicsChannelRef.current) {
      supabase.removeChannel(clinicsChannelRef.current);
      clinicsChannelRef.current = null;
    }
    if (patientsChannelRef.current) {
      supabase.removeChannel(patientsChannelRef.current);
      patientsChannelRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Setup Realtime for doctors table
    const doctorsChannel = supabase
      .channel(`doctor-profile-doctors-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doctors'
        },
        () => {
          fetchDoctorsCountCallback();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          reconnectTimeoutRef.current = setTimeout(() => {
            fetchDoctorsCountCallback();
          }, 3000);
        }
      });

    doctorsChannelRef.current = doctorsChannel;

    // Setup Realtime for clinics table
    const clinicsChannel = supabase
      .channel(`doctor-profile-clinics-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clinics'
        },
        () => {
          fetchClinicsCountCallback();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          reconnectTimeoutRef.current = setTimeout(() => {
            fetchClinicsCountCallback();
          }, 3000);
        }
      });

    clinicsChannelRef.current = clinicsChannel;

    // Setup Realtime for patients table
    const patientsChannel = supabase
      .channel(`doctor-profile-patients-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients'
        },
        () => {
          fetchWaitingPatientsCount();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          reconnectTimeoutRef.current = setTimeout(() => {
            fetchWaitingPatientsCount();
          }, 3000);
        }
      });

    patientsChannelRef.current = patientsChannel;

    // Cleanup
    return () => {
      if (doctorsChannelRef.current) {
        supabase.removeChannel(doctorsChannelRef.current);
        doctorsChannelRef.current = null;
      }
      if (clinicsChannelRef.current) {
        supabase.removeChannel(clinicsChannelRef.current);
        clinicsChannelRef.current = null;
      }
      if (patientsChannelRef.current) {
        supabase.removeChannel(patientsChannelRef.current);
        patientsChannelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [user, fetchDoctorsCountCallback, fetchClinicsCountCallback]);
  
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

  //  Realtime: حساب Total Treatments للطبيب المختار (اليوم فقط)
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
          return;
        }

        // Filter by today's date range
        const filteredPatients = patients?.filter((patient: any) => {
          const completedDate = patient.completed_at ? new Date(patient.completed_at) : new Date(patient.updated_at);
          const patientTime = completedDate.getTime();
          return patientTime >= fromTime && patientTime <= toTime;
        }) || [];

        //  استثناء كلمة "Treatment" من العدد
        const validPatients = filteredPatients.filter((p: any) => p.treatment !== 'Treatment');
        setViewingDoctorTotalTreatments(validPatients.length);
      } catch (error) {
        // Error handled silently
      }
    };

    if (!viewingDoctorData) {
      // Cleanup if no doctor is being viewed
      if (viewingDoctorChannelRef.current) {
        supabase.removeChannel(viewingDoctorChannelRef.current);
        viewingDoctorChannelRef.current = null;
      }
      setViewingDoctorTotalTreatments(0);
      return;
    }

    // Initial fetch
    fetchViewingDoctorTotalTreatments();

    // Cleanup previous subscription
    if (viewingDoctorChannelRef.current) {
      supabase.removeChannel(viewingDoctorChannelRef.current);
      viewingDoctorChannelRef.current = null;
    }

    // Setup Realtime for viewing doctor's patients
    const viewingDoctorChannel = supabase
      .channel(`doctor-profile-viewing-${viewingDoctorData.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `doctor_id=eq.${viewingDoctorData.id}`
        },
        () => {
          fetchViewingDoctorTotalTreatments();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setTimeout(() => {
            fetchViewingDoctorTotalTreatments();
          }, 3000);
        }
      });

    viewingDoctorChannelRef.current = viewingDoctorChannel;

    return () => {
      if (viewingDoctorChannelRef.current) {
        supabase.removeChannel(viewingDoctorChannelRef.current);
        viewingDoctorChannelRef.current = null;
      }
    };
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

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  // قبولُ إشعارٍ (تبديل → المحرّك الذرّيّ؛ غيره → updateNotificationAction). يُرجِع نجاحًا.
  const acceptNotif = async (notif: any): Promise<boolean> => {
    if (!user?.id) return false;
    const { updateNotificationAction } = await import('./lib/database');
    const { notifications: notifEngine } = await import('./lib/algorithms/notifications');
    try {
      if (notif.type === 'swap_request') {
        const res = await notifEngine.acceptSwap({ notificationId: notif.id, targetId: user.id, targetRole: user.role, targetName: user.name });
        if (!res.success) {
          Alert.alert('طلب التبديل', res.error || 'تعذّر تنفيذ التبديل.');
          const { data } = await fetchNotifications(user.id);
          setNotifications(data || []);
          return false;
        }
      } else {
        await updateNotificationAction(notif.id, 'accepted');
      }
    } catch (e) { /* أبقِ الواجهة متّسقة */ }
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, action_status: 'accepted', is_read: true } : n));
    return true;
  };

  // رفضُ إشعارٍ (تبديل → رفضٌ صامت؛ غيره → updateNotificationAction)
  const rejectNotif = async (notif: any) => {
    const { updateNotificationAction } = await import('./lib/database');
    const { notifications: notifEngine } = await import('./lib/algorithms/notifications');
    try {
      if (notif.type === 'swap_request') {
        await notifEngine.rejectSwap({ notificationId: notif.id, targetName: user?.name });
      } else {
        await updateNotificationAction(notif.id, 'rejected');
      }
    } catch (e) { /* أبقِ الواجهة متّسقة */ }
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, action_status: 'rejected', is_read: true } : n));
  };

  // تحديدُ الكلِّ كمقروء (ما عدا المعلّق) — نفسُ منطقِ الإغلاق
  const markAllNotifsRead = () => {
    if (!user?.id) return;
    setNotifications(prev => {
      const toMark = prev.filter(n => !n.is_read && !(n.action_type === 'accept_reject' && n.action_status === 'pending'));
      toMark.forEach(n => markAsRead(n.id));
      const pendingCount = prev.filter(n => n.action_type === 'accept_reject' && n.action_status === 'pending' && !n.is_read).length;
      setUnreadNotifications(pendingCount);
      return prev.map(n => (n.action_type === 'accept_reject' && n.action_status === 'pending') ? n : ({ ...n, is_read: true }));
    });
  };

  // مَن يملكُ إرسالَ التعاميم: قائدُ فريقٍ/منسّق/مدير (لا الطبيب)
  const canBroadcast = user ? getPermissions(user.role).canSendAnnouncement : false;
  // المدير (super_admin/coordinator) يصلُ تعميمُه لكلِّ الأطباءِ والقادة؛ القائدُ لمركزه فقط
  const isManagerRole = user?.role === 'super_admin' || user?.role === 'coordinator';

  const sendAnnouncement = async () => {
    if (!user?.id || !composeText.trim() || sendingAnnounce) return;
    setSendingAnnounce(true);
    try {
      const { notifications: notifEngine } = await import('./lib/algorithms/notifications');
      const body = composeText.trim();
      if (isManagerRole) {
        // مدير → كلُّ الأطباءِ والقادة، مجمّعًا حسب المركز (كي يحملَ كلُّ إشعارٍ مركزَ مستلِمِه)
        const { data } = await supabase.from('doctors').select('id, clinic_id').in('role', ['doctor', 'team_leader']).neq('id', user.id);
        const rows = (data || []) as { id: string; clinic_id: string | null }[];
        const byClinic = new Map<string, string[]>();
        for (const r of rows) { if (!r.id || !r.clinic_id) continue; const arr = byClinic.get(r.clinic_id) || []; arr.push(r.id); byClinic.set(r.clinic_id, arr); }
        let total = 0;
        for (const [cid, ids] of Array.from(byClinic.entries())) {
          if (!ids.length) continue;
          total += ids.length;
          await notifEngine.broadcast({ clinicId: cid, recipientIds: ids, senderId: user.id, senderName: user.name, title: 'تعميم', body });
        }
        setSendingAnnounce(false);
        setComposeText(''); setShowCompose(false);
        Alert.alert('تعميم', total ? `تمّ إرسالُ التعميمِ إلى ${total} عضوًا.` : 'لا يوجد مستلمون.');
      } else if (user.clinicId) {
        // قائدُ فريق → كلُّ أطباءِ وقادةِ مركزه
        const { data } = await supabase.from('doctors').select('id').eq('clinic_id', user.clinicId).in('role', ['doctor', 'team_leader']).neq('id', user.id);
        const ids = (data || []).map((d: any) => d.id).filter(Boolean);
        if (!ids.length) { setSendingAnnounce(false); Alert.alert('تعميم', 'لا يوجد مستلمون في المركز.'); return; }
        const res = await notifEngine.broadcast({ clinicId: user.clinicId, recipientIds: ids, senderId: user.id, senderName: user.name, title: 'تعميم', body });
        setSendingAnnounce(false);
        if (res.success) { setComposeText(''); setShowCompose(false); Alert.alert('تعميم', `تمّ إرسالُ التعميمِ إلى ${ids.length} عضوًا.`); }
        else Alert.alert('تعميم', res.error || 'تعذّر الإرسال.');
      } else {
        setSendingAnnounce(false);
        Alert.alert('تعميم', 'لا يمكنُ تحديدُ المستلمين.');
      }
    } catch (e) {
      setSendingAnnounce(false);
      Alert.alert('تعميم', 'تعذّر إرسالُ التعميم.');
    }
  };

  // Open notifications with card exit animation
  const openNotifications = useCallback(async () => {
    // Animate cards out: staggered, alternating left/right
    const anims = [
      { fade: fadeAnim1, slide: slideAnim1, dir: 300 },
      { fade: fadeAnim2, slide: slideAnim2, dir: -300 },
      { fade: fadeAnim3, slide: slideAnim3, dir: 300 },
      { fade: fadeAnim4, slide: slideAnim4, dir: -300 },
      { fade: fadeAnim5, slide: slideAnim5, dir: 300 },
      { fade: fadeAnim6, slide: slideAnim6, dir: -300 },
    ];

    Animated.stagger(80, anims.map(a =>
      Animated.parallel([
        Animated.timing(a.fade, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(a.slide, { toValue: a.dir, duration: 300, useNativeDriver: true }),
      ])
    )).start(() => {
      setNotificationsVisible(true);
      notifFadeAnim.setValue(0);
      Animated.timing(notifFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });

    // Load notifications
    if (user?.id) {
      setLoadingNotifs(true);
      // إسقاط كسول لكروت التبديل المنتهية قبل العرض (لا مؤقّت خلفيّ)
      try {
        const { notifications: notifEngine } = await import('./lib/algorithms/notifications');
        await notifEngine.pruneExpiredSwaps(user.id);
      } catch { /* تنظيف فقط */ }
      const { data } = await fetchNotifications(user.id);
      setNotifications(data || []);
      setLoadingNotifs(false);
    }
    setShowNotifications(true);
  }, [user?.id]);

  // Close notifications with card enter animation
  const closeNotifications = useCallback(() => {
    Animated.timing(notifFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setNotificationsVisible(false);
      setShowNotifications(false);

      // Reset card positions
      const slideDefaults = [50, -50, 50, -50, 50, -50];
      const slides = [slideAnim1, slideAnim2, slideAnim3, slideAnim4, slideAnim5, slideAnim6];
      const fades = [fadeAnim1, fadeAnim2, fadeAnim3, fadeAnim4, fadeAnim5, fadeAnim6];

      fades.forEach((f, i) => { f.setValue(0); slides[i].setValue(slideDefaults[i]); });

      // Animate cards back in (reverse order)
      Animated.stagger(80, fades.map((f, i) =>
        Animated.parallel([
          Animated.timing(f, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(slides[i], { toValue: 0, useNativeDriver: true, friction: 8 }),
        ])
      )).start();
    });

    // Mark all as read except pending action notifications
    if (user?.id) {
      setNotifications(prev => {
        const toMark = prev.filter(n => !n.is_read && !(n.action_type === 'accept_reject' && n.action_status === 'pending'));
        toMark.forEach(n => markAsRead(n.id));
        const pendingCount = prev.filter(n => n.action_type === 'accept_reject' && n.action_status === 'pending' && !n.is_read).length;
        setUnreadNotifications(pendingCount);
        return prev.map(n => {
          if (n.action_type === 'accept_reject' && n.action_status === 'pending') return n;
          return { ...n, is_read: true };
        });
      });
    }
  }, [user?.id]);

  // Dental Departments screen
  if (currentScreen === 'departments') {
    return (
      <DentalDepartmentsScreen
        onBack={() => {
          setSelectedClinicId(null);
          setCurrentScreen('profile');
          //  Re-fetch clinics count when returning from departments
          fetchClinicsCountCallback();
        }}
        onOpenTimeline={(clinicId, clinicName) => {
          if (onOpenTimeline) {
            onOpenTimeline(clinicId, clinicName);
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
          //  Re-fetch doctors count when returning
          fetchDoctorsCountCallback();
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
      <ScheduleScreen
        onBack={() => setCurrentScreen('profile')}
        clinicId={user?.clinicId}
        userId={user?.id}
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
                    { translateX: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(30)] }) },
                    { translateY: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(-40)] }) },
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
                    { translateX: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(-50)] }) },
                    { translateY: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(30)] }) },
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
                    { translateX: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(40)] }) },
                    { translateY: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(-50)] }) },
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
                  <Ionicons name="arrow-back" size={scale(24)} color="#FFFFFF" />
                </TouchableOpacity>
                
                {/* Info */}
                <View style={[styles.sideInfo, { zIndex: 1 }]}>
                  <Text style={styles.sideDoctorName} numberOfLines={1}>{viewingDoctorData.name}</Text>
                  <View style={styles.sideClinicRow}>
                    <Ionicons name="location" size={scale(12)} color="#718096" />
                    <Text style={styles.sideClinicName} numberOfLines={1}>{viewingDoctorData.clinicName}</Text>
                  </View>
                </View>
                
                {/* Empty Space (no edit button) */}
                <View style={{ width: scale(48), zIndex: 1 }} />
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
                      style={[styles.floatingCard, styles.cardRight, { marginTop: scale(0) }]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setCurrentScreen('viewDoctorStats');
                      }}
                    >
                      <LinearGradient
                        colors={['rgba(197, 179, 255, 0.6)', 'rgba(177, 159, 255, 0.5)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cardGradient}
                      >
                        {/*  Ticket Stub Badge */}
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
                            <Ionicons name="analytics" size={scale(32)} color="#FFFFFF" />
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
                    { translateX: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(30)] }) },
                    { translateY: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(-40)] }) },
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
                    { translateX: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(-50)] }) },
                    { translateY: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(30)] }) },
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
                    { translateX: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(40)] }) },
                    { translateY: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [scale(0), scale(-50)] }) },
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
                    <Ionicons name="arrow-back" size={scale(24)} color="#FFFFFF" />
                  </TouchableOpacity>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.statsHeaderTitle}>{viewingDoctorData.name}</Text>
                    <Text style={styles.statsHeaderSubtitle}>{viewingDoctorData.clinicName}</Text>
                  </View>
                  <View style={{ width: scale(40) }} />
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
                        <Ionicons name="calendar" size={scale(24)} color="#FFFFFF" />
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
                        <Ionicons name="calendar" size={scale(24)} color="#FFFFFF" />
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
                        <Ionicons name="checkmark-circle" size={scale(24)} color="#F687B3" />
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
                            <View key={`page-${i}`} style={[styles.statsCircularCardsPage, { width: Dimensions.get('window').width }]}>
                              {pageItems.map(([treatment, count]: [string, any]) => {
                                const percentage = Math.round((count / doctorStats.totalPatients) * 100);
                                const colors = getTreatmentGradient(treatment);
                                
                                return (
                                  <View key={treatment} style={styles.statsCircularCard}>
                                    <View style={styles.statsCircularProgressContainer}>
                                      {/* Background Circle */}
                                      <View style={[styles.statsCircularProgressBg, { borderColor: `${colors[0]}30` }]} />
                                      
                                      {/* Progress Circle - Removed on Android due to transform issues */}
                                      {Platform.OS === 'ios' && (
                                        <LinearGradient
                                          colors={[colors[0], colors[1]]}
                                          start={{ x: 0, y: 0 }}
                                          end={{ x: 1, y: 1 }}
                                          style={[
                                            styles.statsCircularProgress,
                                            {
                                              transform: [
                                                { rotate: (270 + (percentage * 3.6)).toFixed(0) + 'deg' }
                                              ]
                                            }
                                          ]}
                                        />
                                      )}
                                      
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
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />
      {/* Gradient Mesh Background */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.container}>
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
                    outputRange: [scale(0), scale(30)],
                  }),
                },
                {
                  translateY: blob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-40)],
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
                    outputRange: [scale(0), scale(-50)],
                  }),
                },
                {
                  translateY: blob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(30)],
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
                    outputRange: [scale(0), scale(40)],
                  }),
                },
                {
                  translateY: blob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(50)],
                  }),
                },
              ],
            },
          ]} 
        />
        
        {/* Content Wrapper */}
        <View style={styles.contentWrapper}>
          {/* Glass Container Header */}
          <View style={styles.glassHeaderContainer}>
            {/* Color Tint Layer */}
            <LinearGradient
              colors={[
                'rgba(168, 85, 247, 0.10)',
                'rgba(91, 159, 237, 0.10)',
                'rgba(125, 211, 192, 0.10)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glassHeaderColorTint}
            />

            {/* Header Content */}
            <View style={styles.glassHeaderContent}>
              {/* Notifications Bell / Home Button - Left */}
              <TouchableOpacity
                onPress={showNotifications ? closeNotifications : openNotifications}
                style={[
                  styles.glassHeaderEditButton,
                  Platform.OS === 'android' && {
                    shadowColor: 'transparent',
                    shadowOffset: { width: scale(0), height: scale(0) },
                    shadowOpacity: 0,
                    shadowRadius: 0,
                    elevation: 0,
                  }
                ]}
              >
                <Ionicons name={showNotifications ? "home-outline" : "notifications-outline"} size={scale(22)} color="#FFFFFF" />
                {!showNotifications && unreadNotifications > 0 && (
                  <View style={{
                    position: 'absolute',
                    top: scale(-2),
                    right: scale(-2),
                    backgroundColor: '#EF4444',
                    borderRadius: scale(10),
                    minWidth: scale(18),
                    height: scale(18),
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: scale(2),
                    borderColor: 'rgba(255,255,255,0.3)',
                  }}>
                    <Text style={{ fontSize: scale(10), fontWeight: '800', color: '#FFFFFF' }}>
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Info */}
              <View style={styles.glassHeaderInfo}>
                <Text style={styles.glassHeaderDoctorName} numberOfLines={1}>{user?.name || 'Doctor'}</Text>
                <View style={styles.glassHeaderClinicRow}>
                  <Ionicons name="location" size={scale(14)} color="rgba(255, 255, 255, 0.9)" />
                  <Text style={styles.glassHeaderClinicName} numberOfLines={1}>{user?.clinicName || 'Clinic'}</Text>
                </View>
              </View>

              {/* Edit Button - Right */}
              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                style={[
                  styles.glassHeaderEditButton,
                  Platform.OS === 'android' && {
                    shadowColor: 'transparent',
                    shadowOffset: { width: scale(0), height: scale(0) },
                    shadowOpacity: 0,
                    shadowRadius: 0,
                    elevation: 0,
                  }
                ]}
              >
                <Ionicons name="create-outline" size={scale(22)} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

        {/* Content */}
        <View style={styles.content}>

          {/* 3D Floating Cards - Staggered Layout */}
          {/* تُخفى أثناء فتح الإشعارات حتى تظهر خلفيّة الرئيسيّة نفسها خلف الـ Overlay */}
          <ScrollView
            key={`cards-${currentScreen}-${animKey}`}
            style={[styles.cardsScrollView, notificationsVisible && { display: 'none' }]}
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(0) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenTimeline && user?.clinicId) {
                        onOpenTimeline(user.clinicId, user.clinicName);
                      }
                    }}
                  >
                    <LinearGradient
                      colors={['rgba(168, 218, 255, 0.6)', 'rgba(126, 200, 255, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس على اليسار */}
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
                          <Ionicons name="pulse" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardLeft,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setPreviousScreen('profile');
                      setCurrentScreen('doctors');
                    }}
                  >
                    <LinearGradient
                      colors={['rgba(157, 223, 206, 0.6)', 'rgba(125, 211, 189, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="people-circle" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenMyStatistics) {
                        onOpenMyStatistics();
                      }
                    }}
                  >
                    <LinearGradient
                      colors={['rgba(197, 179, 255, 0.6)', 'rgba(177, 159, 255, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="analytics" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardLeft,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('schedule')}
                  >
                    <LinearGradient
                      colors={['rgba(255, 212, 163, 0.6)', 'rgba(255, 199, 138, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="calendar-sharp" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('requests')}
                  >
                    <LinearGradient
                      colors={['rgba(255, 184, 212, 0.6)', 'rgba(255, 163, 199, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="mail-unread" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(0) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setPreviousScreen('profile');
                      setCurrentScreen('doctors');
                    }}
                  >
                    <LinearGradient
                      colors={['rgba(157, 223, 206, 0.6)', 'rgba(125, 211, 189, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
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
                          <Ionicons name="people" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardLeft,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenMyStatistics) {
                        onOpenMyStatistics();
                      }
                    }}
                  >
                    <LinearGradient
                      colors={['rgba(197, 179, 255, 0.6)', 'rgba(177, 159, 255, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="analytics" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('departments')}
                  >
                    <LinearGradient
                      colors={['rgba(163, 228, 224, 0.6)', 'rgba(138, 217, 213, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="business" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardLeft,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('schedule')}
                  >
                    <LinearGradient
                      colors={['rgba(255, 212, 163, 0.6)', 'rgba(255, 199, 138, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="calendar-sharp" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('requests')}
                  >
                    <LinearGradient
                      colors={['rgba(255, 184, 212, 0.6)', 'rgba(255, 163, 199, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/*  قسم منفصل بنصف قوس */}
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
                          <Ionicons name="mail-unread" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(0) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenTimeline && user?.clinicId) {
                        onOpenTimeline(user.clinicId, user.clinicName);
                      }
                    }}
                  >
                  <LinearGradient
                    colors={['rgba(168, 218, 255, 0.6)', 'rgba(126, 200, 255, 0.5)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/*  قسم منفصل بنصف قوس على اليسار */}
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
                        <Ionicons name="pulse" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardLeft,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setPreviousScreen('profile');
                      setCurrentScreen('doctors');
                    }}
                  >
                  <LinearGradient
                    colors={['rgba(157, 223, 206, 0.6)', 'rgba(125, 211, 189, 0.5)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/*  قسم منفصل بنصف قوس */}
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
                        <Ionicons name="people-circle" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (onOpenMyStatistics) {
                        onOpenMyStatistics();
                      }
                    }}
                  >
                  <LinearGradient
                    colors={['rgba(197, 179, 255, 0.6)', 'rgba(177, 159, 255, 0.5)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/*  قسم منفصل بنصف قوس */}
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
                        <Ionicons name="analytics" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardLeft,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('schedule')}
                  >
                  <LinearGradient
                    colors={['rgba(255, 212, 163, 0.6)', 'rgba(255, 199, 138, 0.5)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                                        {/*  قسم منفصل بنصف قوس */}
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
                        <Ionicons name="calendar-sharp" size={scale(32)} color="#FFFFFF" />
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
                    style={[
                      styles.floatingCard,
                      styles.cardRight,
                      { marginTop: scale(20) },
                      Platform.OS === 'android' && {
                        shadowColor: 'transparent',
                        shadowOffset: { width: scale(0), height: scale(0) },
                        shadowOpacity: 0,
                        shadowRadius: 0,
                        elevation: 0,
                      }
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setCurrentScreen('requests')}
                  >
                  <LinearGradient
                    colors={['rgba(255, 184, 212, 0.6)', 'rgba(255, 163, 199, 0.5)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                  >
                    {/*  Anim                      {/*  قسم منفصل بنصف قوس */}
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
                        <Ionicons name="mail-unread" size={scale(32)} color="#FFFFFF" />
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

          {/* Notifications Overlay */}
          {notificationsVisible && (
            <Animated.View style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              opacity: notifFadeAnim,
              paddingHorizontal: scale(16),
              paddingTop: scale(8),
            }}>
              {/* Tabs — sliding pill */}
              <View style={{ flexDirection: 'row', gap: scale(4), borderRadius: scale(16), backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.8)', padding: scale(5), marginBottom: scale(14) }}>
                {([
                  { key: 'unread' as const, label: 'Unread' },
                  { key: 'read' as const, label: 'Read' },
                  { key: 'announcements' as const, label: 'Announcements' },
                ] as const).map(tab => {
                  const on = notifTab === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setNotifTab(tab.key)}
                      activeOpacity={0.7}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: scale(6),
                        paddingVertical: scale(10),
                        borderRadius: scale(12),
                        backgroundColor: on ? '#FFFFFF' : 'transparent',
                        shadowColor: '#3C3278',
                        shadowOffset: { width: 0, height: scale(4) },
                        shadowOpacity: on ? 0.18 : 0,
                        shadowRadius: scale(8),
                        elevation: on ? 2 : 0,
                      }}
                    >
                      <Text style={{ fontSize: scale(12.5), fontWeight: '800', color: on ? '#241d4d' : NFY_MUTED }}>{tab.label}</Text>
                      {tab.key === 'unread' && unreadNotifications > 0 && (
                        <View style={{ minWidth: scale(18), height: scale(18), paddingHorizontal: scale(5), borderRadius: scale(9), backgroundColor: '#8B7CF0', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: scale(10), fontWeight: '800', color: '#fff' }}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Send Announcement — team leaders / managers only, on the Announcements tab */}
              {notifTab === 'announcements' && canBroadcast && (
                <TouchableOpacity
                  onPress={() => setShowCompose(true)}
                  activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(9), paddingVertical: scale(14), borderRadius: scale(16), marginBottom: scale(14), backgroundColor: '#38BDF8', shadowColor: '#38BDF8', shadowOffset: { width: 0, height: scale(10) }, shadowOpacity: 0.5, shadowRadius: scale(14), elevation: 5 }}
                >
                  <Ionicons name="megaphone" size={scale(20)} color="#fff" />
                  <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#fff' }}>Send Announcement</Text>
                </TouchableOpacity>
              )}

              {/* Notifications List */}
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: scale(40) }}>
                {loadingNotifs ? (
                  <View style={{ alignItems: 'center', paddingTop: scale(40) }}>
                    <Text style={{ fontSize: scale(13), color: '#9CA3AF' }}>Loading...</Text>
                  </View>
                ) : (() => {
                  // محادثة الذكاء (تغطية/نتائجها) لا تظهر هنا — مكانها الجات.
                  // أمّا **طلبات التبديل** ونتائجها (request_result مع data.swap_v2)
                  // فمكانها هنا حصرًا (موافق/رفض من الإشعارات، لا من الذكاء).
                  const AI_CHAT_TYPES = ['gap_alert', 'request_result'];
                  const filtered = notifications.filter(n => {
                    if (AI_CHAT_TYPES.includes(n.type) && !(n.type === 'request_result' && n.data?.swap_v2)) return false;
                    if (notifTab === 'unread') return !n.is_read;
                    if (notifTab === 'read') return n.is_read;
                    if (notifTab === 'announcements') return n.type === 'broadcast' || n.type === 'admin_message' || n.type === 'general';
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <View style={{ alignItems: 'center', paddingTop: scale(70) }}>
                        <View style={{ width: scale(60), height: scale(60), borderRadius: scale(20), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.8)', marginBottom: scale(14) }}>
                          <Ionicons name={notifTab === 'announcements' ? 'megaphone-outline' : 'notifications-outline'} size={scale(26)} color={NFY_FAINT} />
                        </View>
                        <Text style={{ fontSize: scale(14), color: NFY_MUTED, fontWeight: '700' }}>
                          {notifTab === 'unread' ? 'No new notifications' : notifTab === 'announcements' ? 'No announcements' : 'No read notifications'}
                        </Text>
                      </View>
                    );
                  }

                  return filtered.map((notif: any) => {
                    const v = notifVisual(notif);
                    const c = v.c;
                    const unread = !notif.is_read;
                    const isSwap = notif.type === 'swap_request';
                    const pending = notif.action_type === 'accept_reject' && notif.action_status === 'pending';
                    const timeAgo = getTimeAgo(new Date(notif.created_at));

                    return (
                      <TouchableOpacity
                        key={notif.id}
                        activeOpacity={0.85}
                        onPress={async () => {
                          if (isSwap && pending) { setSwapDetail(notif); return; }
                          // Don't mark as read if it has pending action
                          if (!notif.is_read && !pending) {
                            await markAsRead(notif.id);
                            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
                            setUnreadNotifications(prev => Math.max(0, prev - 1));
                          }
                        }}
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.66)',
                          borderRadius: scale(20),
                          padding: scale(14),
                          marginBottom: scale(12),
                          borderWidth: scale(1),
                          borderColor: unread ? nfyRgba(c, 0.45) : 'rgba(255,255,255,0.75)',
                          shadowColor: '#3C3278',
                          shadowOffset: { width: 0, height: scale(10) },
                          shadowOpacity: 0.1,
                          shadowRadius: scale(18),
                          elevation: 3,
                        }}
                      >
                        <View style={{ flexDirection: 'row-reverse', gap: scale(12), alignItems: 'flex-start' }}>
                          {/* Medallion */}
                          <LinearGradient
                            colors={[c, nfyLighten(c, 0.5)]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ width: scale(44), height: scale(44), borderRadius: scale(14), alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Ionicons name={v.icon as any} size={scale(22)} color="#FFFFFF" />
                          </LinearGradient>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            {/* Title + time */}
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: scale(8) }}>
                              <Text style={{ fontSize: scale(15), fontWeight: '800', color: NFY_INK, textAlign: 'right' }} numberOfLines={1}>{v.title}</Text>
                              <Text style={{ fontSize: scale(10.5), fontWeight: '600', color: NFY_FAINT }}>{timeAgo}</Text>
                            </View>
                            {/* Body */}
                            <Text style={{ fontSize: scale(12.5), lineHeight: scale(19), color: NFY_SOFT, textAlign: 'right', marginTop: scale(4) }} numberOfLines={4}>{notif.body}</Text>
                            {/* Sender */}
                            {notif.sender_name ? (
                              <Text style={{ fontSize: scale(10.5), fontWeight: '600', color: NFY_MUTED, textAlign: 'right', marginTop: scale(5) }}>— {notif.sender_name}</Text>
                            ) : null}

                            {/* Swap: preview + Review */}
                            {isSwap && pending && (
                              <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginTop: scale(10), paddingVertical: scale(9), paddingHorizontal: scale(10), borderRadius: scale(12), backgroundColor: nfyRgba(c, 0.08), borderWidth: scale(1), borderColor: nfyRgba(c, 0.18) }}>
                                  <View style={{ flex: 1, paddingVertical: scale(6), borderRadius: scale(9), backgroundColor: c, alignItems: 'center' }}>
                                    <Text style={{ fontSize: scale(12), fontWeight: '800', color: '#fff' }}>You</Text>
                                  </View>
                                  <Ionicons name="swap-horizontal" size={scale(18)} color={c} />
                                  <View style={{ flex: 1, paddingVertical: scale(6), borderRadius: scale(9), backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center' }}>
                                    <Text style={{ fontSize: scale(12), fontWeight: '800', color: NFY_INK }} numberOfLines={1}>{notif.sender_name || notif.data?.requester_name || '—'}</Text>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  onPress={() => setSwapDetail(notif)}
                                  activeOpacity={0.85}
                                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), marginTop: scale(11), paddingVertical: scale(12), borderRadius: scale(14), backgroundColor: c, shadowColor: c, shadowOffset: { width: 0, height: scale(8) }, shadowOpacity: 0.45, shadowRadius: scale(12), elevation: 4 }}
                                >
                                  <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#fff' }}>Review request</Text>
                                  <Ionicons name="chevron-back" size={scale(17)} color="#fff" />
                                </TouchableOpacity>
                              </>
                            )}

                            {/* Non-swap decision: inline Accept / Decline */}
                            {!isSwap && pending && (
                              <View style={{ flexDirection: 'row', gap: scale(9), marginTop: scale(11) }}>
                                <TouchableOpacity
                                  onPress={() => acceptNotif(notif)}
                                  activeOpacity={0.85}
                                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), paddingVertical: scale(12), borderRadius: scale(14), backgroundColor: '#2FBF8F', shadowColor: '#2FBF8F', shadowOffset: { width: 0, height: scale(8) }, shadowOpacity: 0.5, shadowRadius: scale(12), elevation: 4 }}
                                >
                                  <Ionicons name="checkmark" size={scale(17)} color="#fff" />
                                  <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#fff' }}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => rejectNotif(notif)}
                                  activeOpacity={0.85}
                                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), paddingVertical: scale(12), borderRadius: scale(14), backgroundColor: 'rgba(240,98,122,0.11)', borderWidth: scale(1.5), borderColor: 'rgba(240,98,122,0.34)' }}
                                >
                                  <Ionicons name="close" size={scale(17)} color="#E0416A" />
                                  <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#E0416A' }}>Decline</Text>
                                </TouchableOpacity>
                              </View>
                            )}

                            {/* Resolved state */}
                            {notif.action_status === 'accepted' && (
                              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(6), marginTop: scale(9), alignSelf: 'flex-end', paddingVertical: scale(6), paddingHorizontal: scale(11), borderRadius: scale(10), backgroundColor: 'rgba(47,191,143,0.13)' }}>
                                <Ionicons name="checkmark-circle" size={scale(14)} color="#1E9E77" />
                                <Text style={{ fontSize: scale(11), fontWeight: '800', color: '#1E9E77' }}>Accepted</Text>
                              </View>
                            )}
                            {notif.action_status === 'rejected' && (
                              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(6), marginTop: scale(9), alignSelf: 'flex-end', paddingVertical: scale(6), paddingHorizontal: scale(11), borderRadius: scale(10), backgroundColor: 'rgba(240,98,122,0.12)' }}>
                                <Ionicons name="close-circle" size={scale(14)} color="#C0466A" />
                                <Text style={{ fontSize: scale(11), fontWeight: '800', color: '#C0466A' }}>Declined</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </ScrollView>
            </Animated.View>
          )}
        </View>
        </View>
        </View>
      </View>


      {/* Swap Request — approve / reject page */}
      <Modal transparent visible={!!swapDetail} animationType="slide" onRequestClose={() => setSwapDetail(null)}>
        {swapDetail && (() => {
          const c = '#8B7CF0';
          const requester = swapDetail.sender_name || swapDetail.data?.requester_name || '—';
          const dayKey = swapDetail.data?.day;
          const DAY_LABEL: Record<string, string> = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday' };
          const expiresAt = swapDetail.data?.expires_at;
          let expiryTxt = '';
          if (expiresAt) {
            const ms = new Date(expiresAt).getTime() - Date.now();
            if (ms > 0) { const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); expiryTxt = h >= 1 ? `Expires in ${h}h` : `Expires in ${Math.max(1, m)}m`; }
            else expiryTxt = 'Expired';
          }
          return (
            <View style={{ flex: 1 }}>
              <LinearGradient colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
              <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                <View style={{ flex: 1, paddingHorizontal: scale(18) }}>
                  {/* Header */}
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(10), paddingVertical: scale(12) }}>
                    <Text style={{ flex: 1, fontSize: scale(21), fontWeight: '800', color: '#1B1E33', textAlign: 'right' }}>Swap Request</Text>
                    <View style={{ paddingVertical: scale(6), paddingHorizontal: scale(11), borderRadius: scale(999), backgroundColor: nfyRgba(c, 0.14) }}>
                      <Text style={{ fontSize: scale(10.5), fontWeight: '800', color: nfyDarken(c, 0.1) }}>Needs your decision</Text>
                    </View>
                    <TouchableOpacity onPress={() => setSwapDetail(null)} style={{ width: scale(40), height: scale(40), borderRadius: scale(14), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.85)' }}>
                      <Ionicons name="close" size={scale(20)} color={NFY_SOFT} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: scale(20) }}>
                    {/* Hero: You ⇄ requester */}
                    <View style={{ alignItems: 'center', paddingVertical: scale(24) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(16) }}>
                        <View style={{ alignItems: 'center', gap: scale(9), width: scale(112) }}>
                          <LinearGradient colors={[c, nfyLighten(c, 0.4)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: scale(70), height: scale(70), borderRadius: scale(35), alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="person" size={scale(34)} color="#fff" />
                          </LinearGradient>
                          <Text style={{ fontSize: scale(14), fontWeight: '800', color: NFY_INK }}>You</Text>
                        </View>
                        <View style={{ width: scale(50), height: scale(50), borderRadius: scale(16), alignItems: 'center', justifyContent: 'center', backgroundColor: c, shadowColor: c, shadowOffset: { width: 0, height: scale(10) }, shadowOpacity: 0.4, shadowRadius: scale(14), elevation: 5 }}>
                          <Ionicons name="swap-horizontal" size={scale(26)} color="#fff" />
                        </View>
                        <View style={{ alignItems: 'center', gap: scale(9), width: scale(112) }}>
                          <View style={{ width: scale(70), height: scale(70), borderRadius: scale(35), alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9ECF5', borderWidth: scale(1), borderColor: 'rgba(35,32,74,0.08)' }}>
                            <Ionicons name="person" size={scale(34)} color="#7E86A2" />
                          </View>
                          <Text style={{ fontSize: scale(14), fontWeight: '800', color: NFY_INK }} numberOfLines={1}>{requester}</Text>
                        </View>
                      </View>
                      {dayKey ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginTop: scale(18), paddingVertical: scale(8), paddingHorizontal: scale(14), borderRadius: scale(12), backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.85)' }}>
                          <Ionicons name="calendar-outline" size={scale(15)} color={NFY_SOFT} />
                          <Text style={{ fontSize: scale(12.5), fontWeight: '700', color: NFY_SOFT }}>{DAY_LABEL[dayKey] || dayKey}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Details / message */}
                    <View style={{ borderRadius: scale(18), padding: scale(16), backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.78)' }}>
                      <Text style={{ fontSize: scale(11), fontWeight: '800', letterSpacing: 1, color: NFY_FAINT, marginBottom: scale(8), textAlign: 'right' }}>DETAILS</Text>
                      <Text style={{ fontSize: scale(14), lineHeight: scale(22), color: NFY_SOFT, textAlign: 'right' }}>{swapDetail.body}</Text>
                    </View>

                    {expiryTxt ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), marginTop: scale(16) }}>
                        <Ionicons name="time-outline" size={scale(15)} color="#C77" />
                        <Text style={{ fontSize: scale(12.5), fontWeight: '700', color: '#C77' }}>{expiryTxt}</Text>
                      </View>
                    ) : null}
                  </ScrollView>

                  {/* Sticky actions */}
                  <View style={{ flexDirection: 'row', gap: scale(12), paddingVertical: scale(14) }}>
                    <TouchableOpacity
                      onPress={async () => { const s = swapDetail; setSwapDetail(null); await acceptNotif(s); }}
                      activeOpacity={0.85}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), paddingVertical: scale(15), borderRadius: scale(16), backgroundColor: '#2FBF8F', shadowColor: '#2FBF8F', shadowOffset: { width: 0, height: scale(10) }, shadowOpacity: 0.5, shadowRadius: scale(14), elevation: 5 }}
                    >
                      <Ionicons name="checkmark" size={scale(19)} color="#fff" />
                      <Text style={{ fontSize: scale(15.5), fontWeight: '800', color: '#fff' }}>Accept swap</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => { const s = swapDetail; setSwapDetail(null); await rejectNotif(s); }}
                      activeOpacity={0.85}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), paddingVertical: scale(15), borderRadius: scale(16), backgroundColor: 'rgba(240,98,122,0.11)', borderWidth: scale(1.5), borderColor: 'rgba(240,98,122,0.34)' }}
                    >
                      <Ionicons name="close" size={scale(19)} color="#E0416A" />
                      <Text style={{ fontSize: scale(15.5), fontWeight: '800', color: '#E0416A' }}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </SafeAreaView>
            </View>
          );
        })()}
      </Modal>

      {/* Compose Announcement — team leaders / managers */}
      <Modal transparent visible={showCompose} animationType="slide" onRequestClose={() => setShowCompose(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowCompose(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(40,42,70,0.30)' }} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.98)', borderTopLeftRadius: scale(30), borderTopRightRadius: scale(30), paddingTop: scale(10), paddingHorizontal: scale(20), paddingBottom: scale(28) }}>
              <View style={{ width: scale(44), height: scale(5), borderRadius: scale(3), backgroundColor: 'rgba(35,32,74,0.18)', alignSelf: 'center', marginBottom: scale(16) }} />
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(12), marginBottom: scale(6) }}>
                <View style={{ width: scale(38), height: scale(38), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center', backgroundColor: '#38BDF8' }}>
                  <Ionicons name="megaphone" size={scale(20)} color="#fff" />
                </View>
                <Text style={{ flex: 1, fontSize: scale(19), fontWeight: '800', color: NFY_INK, textAlign: 'right' }}>New Announcement</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(7), marginBottom: scale(12) }}>
                <Ionicons name={isManagerRole ? 'people-outline' : 'business-outline'} size={scale(14)} color={NFY_MUTED} />
                <Text style={{ fontSize: scale(12), fontWeight: '700', color: NFY_MUTED }}>{isManagerRole ? 'To: all doctors & team leaders' : 'To: your clinic'}</Text>
              </View>
              <TextInput
                value={composeText}
                onChangeText={setComposeText}
                placeholder="اكتب محتوى التعميم…"
                placeholderTextColor={NFY_FAINT}
                multiline
                textAlign="right"
                style={{ minHeight: scale(120), borderRadius: scale(16), padding: scale(14), backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: scale(1), borderColor: 'rgba(35,32,74,0.12)', fontSize: scale(14.5), lineHeight: scale(22), color: NFY_INK, textAlignVertical: 'top' }}
              />
              <View style={{ flexDirection: 'row', gap: scale(12), marginTop: scale(16) }}>
                <TouchableOpacity onPress={() => setShowCompose(false)} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: scale(14), borderRadius: scale(16), backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: scale(1), borderColor: 'rgba(35,32,74,0.12)' }}>
                  <Text style={{ fontSize: scale(15), fontWeight: '800', color: NFY_SOFT }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!composeText.trim() || sendingAnnounce}
                  onPress={sendAnnouncement}
                  activeOpacity={0.85}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), paddingVertical: scale(14), borderRadius: scale(16), backgroundColor: '#38BDF8', opacity: (!composeText.trim() || sendingAnnounce) ? 0.5 : 1, shadowColor: '#38BDF8', shadowOffset: { width: 0, height: scale(8) }, shadowOpacity: 0.5, shadowRadius: scale(12), elevation: 4 }}
                >
                  <Ionicons name="send" size={scale(17)} color="#fff" />
                  <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#fff' }}>{sendingAnnounce ? 'Sending…' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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

              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity
                  onPress={() => setShowEditModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={scale(24)} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                {/* Name Field */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>الاسم:</Text>
                  <TextInput
                    style={[styles.textInput, !(user && getPermissions(user.role).canEditAnyProfile) && styles.disabledInput]}
                    value={managerName}
                    onChangeText={setManagerName}
                    placeholder="أدخل الاسم"
                    placeholderTextColor="#9CA3AF"
                    editable={!!(user && getPermissions(user.role).canEditAnyProfile)}
                  />
                </View>

                {/* Email Field */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>الإيميل:</Text>
                  <TextInput
                    style={[styles.textInput, !(user && getPermissions(user.role).canEditAnyProfile) && styles.disabledInput]}
                    value={managerEmail}
                    onChangeText={setManagerEmail}
                    placeholder="أدخل الإيميل"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!!(user && getPermissions(user.role).canEditAnyProfile)}
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

              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Change Password</Text>
                <TouchableOpacity
                  onPress={() => setShowChangePasswordModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={scale(24)} color="#FFFFFF" />
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
                      // Verify old password
                      if (user?.password !== oldPassword) {
                        Alert.alert('خطأ', 'كلمة المرور القديمة غير صحيحة');
                        return;
                      }

                      // Update password in Supabase
                      const { data, error } = await supabase
                        .from('doctors')
                        .update({ password: newPassword })
                        .eq('id', user.id)
                        .select();

                      if (error) {
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

const styles = scaledStyleSheet({
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
  blurView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    overflow: 'hidden',
  },
  viewDoctorBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(125, 211, 192, 0.35)', //  فيروزي شفاف موحد
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
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
    paddingTop: Platform.OS === 'android' ? 0 : 12,
    paddingBottom: Platform.OS === 'android' ? 0 : 10,
    position: 'relative',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(125, 211, 192, 0.35)', //  فيروزي شفاف موحد
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
  },
  // Side Avatar Header
  sideHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',  //  أقل شفافية
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 0,  //  مستطيل كامل
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatarGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerInfo: {
    flex: 1,
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  clinicName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#718096',
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
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: '2.5%',
  },
  modalContent: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 15,
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'right',
  },
  disabledInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  transparentButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    marginTop: 12,
  },
  transparentButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  logoutButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    marginTop: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  bottomButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  saveButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    width: '100%',
    height: 130,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  cardRight: {
    marginHorizontal: 0,
  },
  cardLeft: {
    marginHorizontal: 0,
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
    backgroundColor: 'rgba(125, 211, 192, 0.35)', //  فيروزي شفاف موحد
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 8 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.15,
    shadowRadius: Platform.OS === 'android' ? 0 : 12,
    elevation: Platform.OS === 'android' ? 0 : 5,
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
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 8 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.15,
    shadowRadius: Platform.OS === 'android' ? 0 : 12,
    elevation: Platform.OS === 'android' ? 0 : 5,
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
  
  //  Animated Badge Styles
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
    //  Smoky Gradient Effect - No borders, soft fade
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    // Smoky edge effect
    overflow: 'visible',
  },
  //  Simple Badge - Text Only (No Background/Border)
  simpleBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  //  Ticket Stub - قسم منفصل بنصف قوس
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
    //  نصف قوس على اليسار
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
  glassHeaderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    borderWidth: 2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 10,
    overflow: 'hidden',
    paddingTop: 60,
    marginLeft: -20,
    marginRight: -20,
    paddingHorizontal: 20,
  },
  glassHeaderColorTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  glassHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'relative',
    zIndex: 1,
    width: '100%',
  },
  glassHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassHeaderDoctorName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  glassHeaderClinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  glassHeaderClinicName: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  glassHeaderEditButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});
