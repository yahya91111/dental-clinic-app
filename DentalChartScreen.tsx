
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StatusBar,
  Animated,
  ScrollView,
  Dimensions,
  TextInput,
  Alert,
  LogBox,
  Platform,
} from 'react-native';
import { styles, SCREEN_WIDTH, SCREEN_HEIGHT } from './screens/DentalChart/styles';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';
import {
  getCompleteToothData,
  deleteToothSurfaceCondition,
  createEditingRecord,
  createPlanningBatch,
  getEditingRecords,
  getPlanningRecords,
  createToothNote,
  createReferral,
  getAllToothNotes,
  getReferrals,
  createScalingRecord,
  getScalingRecords,
  deleteScalingRecord,
} from './lib/database';
import type { ToothNumber, ToothCondition } from './types';

// Import constants and helpers from extracted files
import {
  CONDITION_COLORS,
  CONDITION_NAMES,
  CONDITION_NAME_TO_KEY,
  REFERRAL_HEADER_HEIGHT,
  REFERRAL_CONTENT_MIN,
  REFERRAL_CONTENT_MAX,
  CONTAINER_SPACING,
  TREATMENT_PLANNING_SPACING,
  treatmentOptions,
  detailsOptions,
  referralOptions,
  conditionsList,
  toothStatusList,
} from './screens/DentalChart/constants';
import {
  ToothSurfaceConditions,
  getSurfaceName,
  getArabicSurfaceName,
  getToothPosition,
  getQuadrantToothNumber,
  getToothDisplayName,
  palmerToNumber,
  getToothPositionNumber,
  getToothQuadrant,
  getToothName,
  getQuadrant,
  getConditionName,
  getReferralName,
  getToothAngle,
  getToothSVGCoordinates,
  getAllSurfaces,
  getSurfaceNameMap,
  convertPalmerToNumber,
  getConditionFromDetails,
  formatTimestamp,
} from './screens/DentalChart/dentalHelpers';
import {
  ToothNumberBadge,
  ConditionMenu,
  ConditionMenuProps,
} from './screens/DentalChart/DentalChartComponents';
import { DepartmentModal, ReferralsState, ReferralStatusState } from './screens/DentalChart/DepartmentModal';
import { ToothDetailsModal, ToothRecord, ToothNote, EditingRecord, PlanningRecord } from './screens/DentalChart/ToothDetailsModal';
import { useToothAnimations } from './screens/DentalChart/useToothAnimations';
import { TeethGrid, ToothAnimValues } from './screens/DentalChart/TeethGrid';
import { ReferralContainer } from './screens/DentalChart/ReferralContainer';
import { TreatmentRecordContainer } from './screens/DentalChart/TreatmentRecordContainer';
import { PlanningRecordContainer } from './screens/DentalChart/PlanningRecordContainer';
import { OralHygieneContainer } from './screens/DentalChart/OralHygieneContainer';
import { loadPatientDentalData as loadDentalDataFromDB } from './screens/DentalChart/loadDentalData';
import {
  handlePlanningSubmit as submitPlanning,
  handlePlanningCancel as cancelPlanning,
  PendingPlanningRecord,
} from './screens/DentalChart/planningHandlers';
import {
  handleConditionSelect as selectCondition,
  PlanningRecordGlobal,
} from './screens/DentalChart/conditionHandler';
import { AnimatedBackground } from './screens/DentalChart/AnimatedBackground';
import { TransparentTouchLayer } from './screens/DentalChart/TransparentTouchLayer';
import { CrossDividerLines } from './screens/DentalChart/CrossDividerLines';
import { EnlargedToothModal } from './screens/DentalChart/EnlargedToothModal';
import { HeaderAndPlanningButtons } from './screens/DentalChart/HeaderAndPlanningButtons';
import {
  handleToothPress as pressToothHandler,
  handleCloseTooth as closeToothHandler,
} from './screens/DentalChart/toothHandlers';

// إخفاء التحذيرات غير المهمة
LogBox.ignoreLogs([
  "Style property 'height' is not supported by native animated module",
  "Style property 'width' is not supported by native animated module",
]);

interface DentalChartScreenProps {
  onBack: () => void;
  permanentPatientId?: string; // ID المريض الدائم من permanent_patients
}

export default function DentalChartScreen({
  onBack,
  permanentPatientId,
}: DentalChartScreenProps) {
  // Get user context for doctor name
  const { user } = useAuth();

  // Tooth animations hook
  const toothAnims = useToothAnimations();

  // State Management لحالات الأسنان
  const [toothConditions, setToothConditions] = useState<Record<number | string, ToothSurfaceConditions>>({});
  const [toothBorderColors, setToothBorderColors] = useState<Record<number | string, ToothCondition>>({});
  const [selectedTooth, setSelectedTooth] = useState<number | string | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<keyof ToothSurfaceConditions | null>(null);
  const [showConditionMenu, setShowConditionMenu] = useState(false);
  const [isClosing, setIsClosing] = useState(false); // لتتبع حالة الإغلاق
  const [isEditModeActive, setIsEditModeActive] = useState(false); // لتتبع حالة Edit Mode
  const [showToothDetailsModal, setShowToothDetailsModal] = useState(false); // لعرض تفاصيل السن في Edit Mode
  const [isViewModeActive, setIsViewModeActive] = useState(false); // لتتبع حالة View Mode
  const [selectedToothForDetails, setSelectedToothForDetails] = useState<number | null>(null); // السن المحدد للتفاصيل
  const [showSurfaceOptions, setShowSurfaceOptions] = useState(false); // لعرض خيارات الأسطح
  const [showTreatmentOptions, setShowTreatmentOptions] = useState(false); // لعرض خيارات العلاج
  const [showDetailsOptions, setShowDetailsOptions] = useState(false); // لعرض خيارات التفاصيل
  const [showReferralOptions, setShowReferralOptions] = useState(false); // لعرض خيارات التحويل
  const [hasModalChanges, setHasModalChanges] = useState(false); // لتتبع التغييرات في المودال
  const [isEditMode, setIsEditMode] = useState(false); // وضع التعديل
  const [showNotesSection, setShowNotesSection] = useState(false); // لعرض قسم الملاحظات
  const [showDetailsSection, setShowDetailsSection] = useState(true); // لعرض قسم البنود (Surfaces, Treatment, Details)
  const [showRecordsSection, setShowRecordsSection] = useState(false); // لعرض قسم السجلات
  const [showReferralSection, setShowReferralSection] = useState(false); // لعرض قسم التحويلات
  const [recordsType, setRecordsType] = useState<'editing' | 'planning'>('editing'); // نوع السجلات المعروضة
  const [currentNote, setCurrentNote] = useState(''); // للملاحظة الحالية
  const [unreadNotes, setUnreadNotes] = useState<Record<number | string, number>>({}); // عدد الملاحظات غير المقروءة لكل سن

  // Referral state
  const [referrals, setReferrals] = useState<ReferralsState>({
    endodontics: false,
    oralSurgery: false,
    orthodontics: false,
    periodontics: false,
    prosthodontics: false,
    oralMedicine: false,
  });
  const [referralStatus, setReferralStatus] = useState<ReferralStatusState>({
    endodontics: 'not_given', // 'given' أو 'not_given'
    oralSurgery: 'not_given',
    orthodontics: 'not_given',
    periodontics: 'not_given',
    prosthodontics: 'not_given',
    oralMedicine: 'not_given',
  });
  const [selectedReferral, setSelectedReferral] = useState<string | null>(null); // للتمييز البصري
  const [isReferralExpanded, setIsReferralExpanded] = useState(false); // لتتبع حالة فتح/إغلاق الأقسام (مغلقة افتراضياً)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false); // للتحكم في فتح/إغلاق Modal الأقسام
  const [departmentModalMode, setDepartmentModalMode] = useState<'new' | 'edit'>('new'); // وضع الموديل: جديد أو تعديل
  const [savedReferralsState, setSavedReferralsState] = useState<ReferralsState | null>(null); // لحفظ حالة referrals مؤقتاً
  const [savedSelectedReferralFor, setSavedSelectedReferralFor] = useState<Record<number | string, string[]> | null>(null); // لحفظ حالة selectedReferralFor مؤقتاً
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null); // للتحكم في عرض الأسنان تحت القسم
  // Temporary states for "new" mode - not saved to database until Save is clicked
  const [tempReferrals, setTempReferrals] = useState<ReferralsState>({
    endodontics: false,
    oralSurgery: false,
    orthodontics: false,
    periodontics: false,
    prosthodontics: false,
    oralMedicine: false,
  });
  const [tempSelectedReferralFor, setTempSelectedReferralFor] = useState<Record<number, string[]>>({});
  const [referralTab, setReferralTab] = useState<'department' | 'records'>('department'); // للتبديل بين Department و Referral Records
  const [referralRecords, setReferralRecords] = useState<Array<{
    departmentKey: string;
    departmentName: string;
    teeth: number[];
    timestamp: string;
    doctorName: string;
    timestampNum: number
  }>>([]); // سجلات التحويلات

  // Oral Hygiene (Scaling) state
  const [isOralHygieneExpanded, setIsOralHygieneExpanded] = useState(false); // لتتبع حالة توسع حاوية Oral Hygiene
  const oralHygieneExpandAnim = useRef(new Animated.Value(0)).current; // أنيميشن التوسع
  const [scalingRecords, setScalingRecords] = useState<Array<{ id: string; timestamp: string; doctorName: string; timestampNum: number }>>([]);

  // Total Treatment Record state
  const [isTreatmentRecordExpanded, setIsTreatmentRecordExpanded] = useState(false); // لتتبع حالة توسع Total Treatment Record
  const treatmentRecordExpandAnim = useRef(new Animated.Value(0)).current; // أنيميشن التوسع

  // Total Planning Record state
  const [isPlanningRecordExpanded, setIsPlanningRecordExpanded] = useState(false); // لتتبع حالة توسع Total Planning Record
  const planningRecordExpandAnim = useRef(new Animated.Value(0)).current; // أنيميشن التوسع

  // حفظ القيم الأصلية قبل التعديل
  const [originalValues, setOriginalValues] = useState<{
    treatment?: string;
    details?: string;
    surfaces?: string[];
  }>({});

  // Ref لتعطيل Planning Record عند العمل من Tooth Details Modal
  const skipPlanningRecordRef = useRef(false);

  // بيانات الأسنان المحفوظة
  const [selectedTreatments, setSelectedTreatments] = useState<Record<number | string, string>>({});
  const [selectedDetails, setSelectedDetails] = useState<Record<number | string, string>>({});
  const [selectedReferralFor, setSelectedReferralFor] = useState<Record<number | string, string[]>>({});  // Changed to array for multiple referrals
  const [selectedSurfaces, setSelectedSurfaces] = useState<Record<number | string, string[]>>({});
  const [openReferralMenu, setOpenReferralMenu] = useState<string | null>(null); // Track which referral card menu is open
  const [toothNotes, setToothNotes] = useState<Record<number | string, ToothNote[]>>({});
  const [toothRecords, setToothRecords] = useState<Record<number | string, ToothRecord[]>>({});

  // قائمة عامة لكل planning records بترتيب الإضافة الفعلي
  const [allPlanningRecordsGlobal, setAllPlanningRecordsGlobal] = useState<PlanningRecordGlobal[]>([]);

  // ═══════════════════════════════════════════════════════════════
  // Pending Planning Records State (Before Submit)
  // ═══════════════════════════════════════════════════════════════
  const [pendingPlanningRecords, setPendingPlanningRecords] = useState<Array<{
    toothNumber: number;
    action: 'diagnosed' | 'canceled';
    condition: string;
    surfaces: string[];
    timestamp: string;
    timestampNum: number;
    doctorName: string;
    isChange?: boolean;
    previousCondition?: string;
  }>>([]);

  // ═══════════════════════════════════════════════════════════════
  // Realtime Subscription References
  // ═══════════════════════════════════════════════════════════════
  const realtimeChannelRef = useRef<any>(null);

  // الحاويات في موقع ثابت - لا حاجة لتحريكها
  React.useEffect(() => {
    // قيمة 0 تعني أن الحاويات في موقعها الطبيعي الثابت
    toothAnims.treatmentRecordPushDown.setValue(0);
    toothAnims.planningRecordPushDown.setValue(0);
  }, []);

  // أنيميشن توسع حاوية Oral Hygiene
  useEffect(() => {
    Animated.timing(oralHygieneExpandAnim, {
      toValue: isOralHygieneExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isOralHygieneExpanded]);

  // دالة للنقر على حاوية Oral Hygiene
  const handleOralHygienePress = () => {
    setIsOralHygieneExpanded(!isOralHygieneExpanded);
  };

  // دالة لإضافة سجل Scaling جديد
  const handleAddScaling = async () => {
    if (!permanentPatientId) {
      Alert.alert('Error', 'No patient selected');
      return;
    }

    const now = new Date();
    const timestamp = formatTimestamp(now);

    // حفظ في قاعدة البيانات
    const { data, error } = await createScalingRecord(
      permanentPatientId,
      user?.name || 'Dr. Unknown'
    );

    if (error) {
      Alert.alert('Error', 'Failed to save scaling record');
      console.error('Error saving scaling record:', error);
      return;
    }

    // إضافة للـ state
    if (data) {
      setScalingRecords(prev => [
        {
          id: data.id,
          timestamp,
          doctorName: user?.name || 'Dr. Unknown',
          timestampNum: now.getTime()
        },
        ...prev
      ]);
    }

    // إغلاق الحاوية بعد الإضافة
    setIsOralHygieneExpanded(false);
  };

  // دالة لحذف سجل Scaling
  const handleDeleteScalingRecord = async (recordId: string, index: number) => {
    const { error } = await deleteScalingRecord(recordId);
    if (error) {
      Alert.alert('Error', 'Failed to delete scaling record');
      console.error('Error deleting scaling record:', error);
      return;
    }
    setScalingRecords(prev => prev.filter((_, i) => i !== index));
  };

  // NOTE: Individual tooth animations and stopToothAnimations are now handled by useToothAnimations hook
  // getToothAnimValues replaced by toothAnims.getToothAnimations
  // stopToothAnimations replaced by toothAnims.stopToothAnimations

  // ═══════════════════════════════════════════════════════════════
  // Database Integration Functions
  // ═══════════════════════════════════════════════════════════════


  /**
   * Load all dental data for the patient from database
   */
  const loadPatientDentalData = async () => {
    if (!permanentPatientId) {
      console.log('No permanent patient ID, skipping data load');
      return;
    }

    const data = await loadDentalDataFromDB(permanentPatientId);

    if (data) {
      // Apply loaded data to state
      setToothConditions(data.toothConditions);
      setToothBorderColors(prev => ({ ...prev, ...data.toothBorderColors }));
      setToothRecords(prev => {
        const updated = { ...prev };
        // Remove old planning records to prevent duplicates
        Object.keys(updated).forEach((toothKey) => {
          const toothNum = parseInt(toothKey);
          updated[toothNum] = updated[toothNum]?.filter(record => record.type !== 'planning') || [];
        });
        // Merge with new records
        Object.keys(data.toothRecords).forEach((toothKey) => {
          const toothNum = parseInt(toothKey);
          updated[toothNum] = [
            ...(updated[toothNum] || []),
            ...data.toothRecords[toothNum]
          ];
        });
        return updated;
      });
      setToothNotes(data.toothNotes);
      setAllPlanningRecordsGlobal(data.allPlanningRecordsGlobal);
      setSelectedReferralFor(prev => ({ ...prev, ...data.selectedReferralFor }));
      setReferrals(prev => ({ ...prev, ...data.referrals }));
      setReferralStatus(prev => ({ ...prev, ...data.referralStatus }));
      setReferralRecords(data.referralRecords);
      setScalingRecords(data.scalingRecords);
    }
  };

  // Load data when component mounts or permanentPatientId changes + Setup Realtime
  useEffect(() => {
    if (!permanentPatientId) return;

    // Initial load
    loadPatientDentalData();

    // Cleanup previous subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    // ❌ Real-time DISABLED for Dental Chart
    // Reason: Manual refresh is preferred to avoid constant reloads
    /*
    // Setup Realtime subscription for dental data tables
    // Listen to changes on all tables related to this patient
    const dentalChannel = supabase
      .channel(`dental-chart-${Date.now()}`)
      // tooth_surface_conditions table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tooth_surface_conditions',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('🔄 Real-time: tooth_surface_conditions changed:', payload);
          loadPatientDentalData(); // Silent refresh
        }
      )
      // editing_records table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'editing_records',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('🔄 Real-time: editing_records changed:', payload);
          loadPatientDentalData();
        }
      )
      // planning_records table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'planning_records',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('🔄 Real-time: planning_records changed:', payload);
          loadPatientDentalData();
        }
      )
      // tooth_notes table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tooth_notes',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('🔄 Real-time: tooth_notes changed:', payload);
          loadPatientDentalData();
        }
      )
      // referrals table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referrals',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('🔄 Real-time: referrals changed:', payload);
          loadPatientDentalData();
        }
      )
      // scaling_records table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scaling_records',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('🔄 Real-time: scaling_records changed:', payload);
          loadPatientDentalData();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time: Subscribed to dental chart updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time: Channel error, retrying...');
          setTimeout(() => {
            loadPatientDentalData();
          }, 3000);
        }
      });

    realtimeChannelRef.current = dentalChannel;
    */

    // Cleanup on unmount or when permanentPatientId changes
    return () => {
      if (realtimeChannelRef.current) {
        console.log('🧹 Cleaning up dental chart real-time subscription');
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [permanentPatientId]);

  /**
   * Handle Planning Submit - Save all pending planning records
   */
  const handlePlanningSubmit = async () => {
    await submitPlanning({
      permanentPatientId: permanentPatientId!,
      userName: user?.name || 'Dr. Unknown',
      pendingPlanningRecords,
      setAllPlanningRecordsGlobal,
      setPendingPlanningRecords,
      loadPatientDentalData,
    });
  };

  /**
   * Handle Planning Cancel - Discard all pending planning records
   */
  const handlePlanningCancel = () => {
    cancelPlanning({
      pendingPlanningRecords,
      setToothRecords,
      setPendingPlanningRecords,
      setSelectedSurfaces,
      loadPatientDentalData,
    });
  };

  /**
   * Handle closing condition menu - just close without removing anything
   */
  const handleConditionMenuClose = () => {
    // Just close the menu without removing anything
    // User didn't make any changes, so keep existing state
    setShowConditionMenu(false);
    setSelectedSurface(null);
  };

  // Function للنقر على السن - Extracted to toothHandlers.ts
  const handleToothPress = (toothNumber: number | string) => {
    pressToothHandler(toothNumber, {
      selectedTooth,
      isClosing,
      isEditModeActive,
      selectedTreatments,
      selectedDetails,
      selectedSurfaces,
      toothAnims,
      setSelectedTooth,
      setSelectedSurface,
      setShowConditionMenu,
      setIsClosing,
      setSelectedToothForDetails,
      setOriginalValues,
      setShowToothDetailsModal,
      setHasModalChanges,
      setIsEditMode,
      setShowNotesSection,
      setShowDetailsSection,
      setShowRecordsSection,
      setRecordsType,
      setCurrentNote,
      setSelectedTreatments,
      setSelectedDetails,
      setSelectedReferralFor,
    });
  };

  // Function لإغلاق السن المكبر - Extracted to toothHandlers.ts
  const handleCloseTooth = () => {
    closeToothHandler(
      selectedTooth,
      toothAnims,
      setSelectedTooth,
      setSelectedSurface,
      setShowConditionMenu,
      setIsClosing
    );
  };

  // Function للنقر على سطح السن
  const handleSurfacePress = (surface: keyof ToothSurfaceConditions) => {
    setSelectedSurface(surface);
    setShowConditionMenu(true);
  };

  // Function لاختيار حالة للسطح - Extracted to conditionHandler.ts
  const handleConditionSelect = (condition: ToothCondition) => {
    selectCondition({
      condition,
      selectedTooth,
      selectedSurface,
      toothConditions,
      toothRecords,
      allPlanningRecordsGlobal,
      pendingPlanningRecords,
      userName: user?.name || 'Dr. Unknown',
      setToothBorderColors,
      setToothConditions,
      setPendingPlanningRecords,
      setToothRecords,
      setHasModalChanges,
      setShowConditionMenu,
      setSelectedTooth,
      setSelectedSurface,
    });
  };

  // DISABLED: تحديث Tooth Status Record تلقائياً عند تغيير toothConditions أو toothBorderColors
  // This useEffect has been disabled to prevent automatic saving
  // All changes now only save when Submit button is pressed
  // useEffect(() => {
  //   ... disabled code ...
  // }, [toothConditions, toothBorderColors]);

  // Sync selectedSurfaces with toothConditions when modal opens
  // Exclude surfaces with "follow-up" since they don't need treatment (just monitoring)
  useEffect(() => {
    if (showToothDetailsModal && selectedToothForDetails) {
      const toothCondition = toothConditions[selectedToothForDetails];
      if (toothCondition) {
        const activeSurfaces: string[] = [];
        (Object.keys(toothCondition) as Array<keyof ToothSurfaceConditions>).forEach((surface) => {
          // Only add surfaces that are not null AND not "follow-up"
          if (toothCondition[surface] !== null && toothCondition[surface] !== 'follow-up') {
            activeSurfaces.push(surface);
          }
        });

        if (activeSurfaces.length > 0 || selectedSurfaces[selectedToothForDetails]) {
          setSelectedSurfaces(prev => ({
            ...prev,
            [selectedToothForDetails]: activeSurfaces
          }));
        }
      }
    }
  }, [showToothDetailsModal, selectedToothForDetails, toothConditions]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />

      {/* Gradient Mesh Background - Same as PatientProfileScreen */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.container}>
        <View style={styles.gradient}>
          {/* Animated Blobs - Extracted to AnimatedBackground.tsx */}
          <AnimatedBackground />

          {/* Header with Back Button + Planning Submit/Cancel Buttons */}
          <HeaderAndPlanningButtons
            onBack={onBack}
            isEditModeActive={isEditModeActive}
            pendingPlanningRecordsCount={pendingPlanningRecords.length}
            onPlanningCancel={handlePlanningCancel}
            onPlanningSubmit={handlePlanningSubmit}
          />

          {/* Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
                {/* Edit Mode Button */}
                <Animated.View
                  style={[
                    styles.editButtonContainer,
                    {
                      transform: [{ translateX: toothAnims.editButtonSlide }],
                      opacity: isOralHygieneExpanded ? 0 : toothAnims.buttonsOpacity,
                      zIndex: isOralHygieneExpanded ? 700 : (selectedTooth ? 900 : 9999),
                      elevation: isOralHygieneExpanded ? 700 : (selectedTooth ? 900 : 9999),
                    }
                  ]}
                  pointerEvents={selectedTooth ? "none" : "box-none"}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const newState = !isEditModeActive;
                      console.log('✓ Edit Button Pressed! New state:', newState);
                      setIsEditModeActive(newState);
                    }}
                    style={[
                      styles.editModeButton,
                      isEditModeActive ? styles.editModeButtonActive : styles.editModeButtonInactive,
                    ]}
                  >
                    <Text style={[
                      styles.editModeButtonText,
                      isEditModeActive && styles.editModeButtonTextActive
                    ]}>
                      Edit
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                {/* View Mode Button */}
                <Animated.View style={[styles.viewButtonContainer, {
                  opacity: isOralHygieneExpanded ? 0 : toothAnims.buttonsOpacity,
                  zIndex: isOralHygieneExpanded ? 700 : ((isTreatmentRecordExpanded || isPlanningRecordExpanded || isReferralExpanded) ? 9998 : (isViewModeActive ? 10020 : (selectedTooth ? 900 : 9999))),
                  elevation: isOralHygieneExpanded ? 700 : ((isTreatmentRecordExpanded || isPlanningRecordExpanded || isReferralExpanded) ? 9998 : (isViewModeActive ? 10020 : (selectedTooth ? 900 : 9999))),
                  transform: [
                    { translateX: -50 },
                    {
                      translateY: toothAnims.viewButtonPositionAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -(SCREEN_HEIGHT * 0.41 - 100)] // من 41% إلى 100 بكسل من الأعلى
                      })
                    }
                  ]
                }]} pointerEvents={selectedTooth ? "none" : "box-none"}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const newState = !isViewModeActive;
                      console.log('✓ View Button Pressed! Current state:', isViewModeActive, '→ New state:', newState);
                      setIsViewModeActive(newState);

                      if (newState) {
                        console.log('🔵 Showing referral container - hiding teeth');
                        // إخفاء الأسنان وزر Edit والخطوط وأرقام الأسنان
                        Animated.parallel([
                          Animated.timing(toothAnims.rightTeethSlide, {
                            toValue: 500, // إزاحة لليمين خارج الشاشة
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.leftTeethSlide, {
                            toValue: -500, // إزاحة لليسار خارج الشاشة
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.editButtonSlide, {
                            toValue: -300, // إزاحة زر Edit لليسار
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.verticalTopLineSlide, {
                            toValue: -200, // إزاحة الخط العمودي العلوي للأعلى
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.verticalBottomLineSlide, {
                            toValue: 200, // إزاحة الخط العمودي السفلي للأسفل
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.horizontalRightLineSlide, {
                            toValue: 500, // إزاحة الخط الأفقي الأيمن لليمين
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.horizontalLeftLineSlide, {
                            toValue: -500, // إزاحة الخط الأفقي الأيسر لليسار
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.rightNumbersSlide, {
                            toValue: 500, // إزاحة أرقام الأسنان اليمنى لليمين
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.leftNumbersSlide, {
                            toValue: -500, // إزاحة أرقام الأسنان اليسرى لليسار
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.oralHygieneOpacity, {
                            toValue: 0, // إخفاء حاوية Oral Hygiene
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.viewButtonPositionAnim, {
                            toValue: 1, // تحريك زر View إلى أعلى يمين
                            duration: 400,
                            useNativeDriver: true,
                          }),
                        ]).start(() => {
                          console.log('🟢 Teeth hidden - now showing containers');
                          // إعادة تعيين الحاوية للحالة المغلقة
                          setIsReferralExpanded(false);
                          toothAnims.referralSectionsHeight.setValue(0);
                          // إعادة تعيين pushDown للحاويات الأخرى
                          toothAnims.treatmentRecordPushDown.setValue(0);
                          toothAnims.planningRecordPushDown.setValue(0);
                          // بعد انتهاء اختفاء الأسنان، إظهار الحاويات بالتسلسل
                          // 1. Referral من اليمين
                          Animated.timing(toothAnims.referralContainerSlide, {
                            toValue: 0,
                            duration: 150,
                            useNativeDriver: true,
                          }).start(() => {
                            console.log(' Referral container visible');
                            // 2. Treatment Record من اليسار
                            Animated.timing(toothAnims.treatmentRecordSlide, {
                              toValue: 0,
                              duration: 150,
                              useNativeDriver: true,
                            }).start(() => {
                              console.log(' Treatment Record visible');
                              // 3. Planning Record من اليمين
                              Animated.timing(toothAnims.planningRecordSlide, {
                                toValue: 0,
                                duration: 150,
                                useNativeDriver: true,
                              }).start(() => {
                                console.log(' All containers visible');
                                // الحاويات في موقع ثابت - لا حاجة لتحريكها
                              });
                            });
                          });
                        });
                      } else {
                        console.log('🔴 Hiding containers - returning teeth');
                        // إعادة تعيين الحاوية للحالة المغلقة
                        setIsReferralExpanded(false);
                        toothAnims.referralSectionsHeight.setValue(0);
                        toothAnims.treatmentRecordPushDown.setValue(0);
                        toothAnims.planningRecordPushDown.setValue(0);
                        // إخفاء الحاويات بالتسلسل العكسي
                        // 1. Planning Record (يمين)
                        Animated.timing(toothAnims.planningRecordSlide, {
                          toValue: 1000,
                          duration: 100,
                          useNativeDriver: true,
                        }).start(() => {
                          console.log('🟡 Planning Record hidden');
                          // 2. Treatment Record (يسار)
                          Animated.timing(toothAnims.treatmentRecordSlide, {
                            toValue: -1000,
                            duration: 100,
                            useNativeDriver: true,
                          }).start(() => {
                            console.log('🟡 Treatment Record hidden');
                            // 3. Referral (يمين)
                            Animated.timing(toothAnims.referralContainerSlide, {
                              toValue: 1000,
                              duration: 100,
                              useNativeDriver: true,
                            }).start(() => {
                              console.log('🟡 All containers hidden - now returning teeth');
                          // ثم إرجاع الأسنان وزر Edit والخطوط وأرقام الأسنان لأماكنها
                          Animated.parallel([
                          Animated.timing(toothAnims.rightTeethSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.leftTeethSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.editButtonSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.verticalTopLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.verticalBottomLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.horizontalRightLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.horizontalLeftLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.rightNumbersSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.leftNumbersSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.oralHygieneOpacity, {
                            toValue: 1, // إعادة إظهار حاوية Oral Hygiene
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(toothAnims.viewButtonPositionAnim, {
                            toValue: 0, // إعادة زر View إلى موقعه الأصلي
                            duration: 300,
                            useNativeDriver: true,
                          }),
                        ]).start(() => {
                          console.log(' Teeth returned to original position');
                        });
                            });
                          });
                        });
                      }
                    }}
                    style={[
                      styles.viewModeButton,
                      isViewModeActive ? styles.viewModeButtonActive : styles.viewModeButtonInactive,
                    ]}
                  >
                    <Text style={[
                      styles.viewModeButtonText,
                      isViewModeActive && styles.viewModeButtonTextActive
                    ]}>
                      View
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                {/* Teeth Container */}
                <View style={styles.crossContainer}>
                  {/* Cross Divider Lines - Extracted to CrossDividerLines.tsx */}
                  <CrossDividerLines
                    verticalTopLineSlide={toothAnims.verticalTopLineSlide}
                    verticalBottomLineSlide={toothAnims.verticalBottomLineSlide}
                    horizontalLeftLineSlide={toothAnims.horizontalLeftLineSlide}
                    horizontalRightLineSlide={toothAnims.horizontalRightLineSlide}
                  />

                  {/* Oral Hygiene Container */}
                  <OralHygieneContainer
                    isExpanded={isOralHygieneExpanded}
                    onToggle={handleOralHygienePress}
                    onAddScaling={handleAddScaling}
                    onDeleteRecord={handleDeleteScalingRecord}
                    scalingRecords={scalingRecords}
                    buttonsOpacity={toothAnims.buttonsOpacity}
                    oralHygieneOpacity={toothAnims.oralHygieneOpacity}
                    expandAnim={oralHygieneExpandAnim}
                    isToothSelected={!!selectedTooth}
                  />

                  {/* TeethGrid Component - All 32 teeth with numbers */}
                  <TeethGrid
                    selectedTooth={selectedTooth}
                    isClosing={isClosing}
                    isEditModeActive={isEditModeActive}
                    toothConditions={toothConditions}
                    toothBorderColors={toothBorderColors}
                    rightTeethSlide={toothAnims.rightTeethSlide}
                    leftTeethSlide={toothAnims.leftTeethSlide}
                    rightNumbersSlide={toothAnims.rightNumbersSlide}
                    leftNumbersSlide={toothAnims.leftNumbersSlide}
                    getToothAnims={toothAnims.getToothAnimations}
                    onToothPress={handleToothPress}
                    onSurfacePress={handleSurfacePress}
                  />
              </View>

            {/* Referral Container */}
            <ReferralContainer
              referralContainerSlide={toothAnims.referralContainerSlide}
              referrals={referrals}
              referralStatus={referralStatus}
              referralTab={referralTab}
              referralRecords={referralRecords}
              selectedReferralFor={selectedReferralFor}
              openReferralMenu={openReferralMenu}
              isReferralExpanded={isReferralExpanded}
              isTreatmentRecordExpanded={isTreatmentRecordExpanded}
              isPlanningRecordExpanded={isPlanningRecordExpanded}
              isViewModeActive={isViewModeActive}
              permanentPatientId={permanentPatientId}
              setReferralTab={setReferralTab}
              setReferrals={setReferrals}
              setReferralStatus={setReferralStatus}
              setSelectedReferralFor={setSelectedReferralFor}
              setOpenReferralMenu={setOpenReferralMenu}
              setDepartmentModalMode={setDepartmentModalMode}
              setSavedReferralsState={setSavedReferralsState}
              setSavedSelectedReferralFor={setSavedSelectedReferralFor}
              setTempReferrals={setTempReferrals}
              setTempSelectedReferralFor={setTempSelectedReferralFor}
              setShowDepartmentModal={setShowDepartmentModal}
              setExpandedDepartment={setExpandedDepartment}
              loadPatientDentalData={loadPatientDentalData}
            />

            {/* Total Treatment Record Container */}
            <TreatmentRecordContainer
              treatmentRecordSlide={toothAnims.treatmentRecordSlide}
              treatmentRecordPushDown={toothAnims.treatmentRecordPushDown}
              treatmentRecordExpandAnim={treatmentRecordExpandAnim}
              isTreatmentRecordExpanded={isTreatmentRecordExpanded}
              isPlanningRecordExpanded={isPlanningRecordExpanded}
              isViewModeActive={isViewModeActive}
              referralTab={referralTab}
              referrals={referrals}
              referralStatus={referralStatus}
              referralRecords={referralRecords}
              toothRecords={toothRecords}
              scalingRecords={scalingRecords}
              setIsTreatmentRecordExpanded={setIsTreatmentRecordExpanded}
            />

            {/* Total Planning Record Container */}
            <PlanningRecordContainer
              planningRecordSlide={toothAnims.planningRecordSlide}
              planningRecordPushDown={toothAnims.planningRecordPushDown}
              planningRecordExpandAnim={planningRecordExpandAnim}
              isPlanningRecordExpanded={isPlanningRecordExpanded}
              isTreatmentRecordExpanded={isTreatmentRecordExpanded}
              isViewModeActive={isViewModeActive}
              referralTab={referralTab}
              referrals={referrals}
              referralStatus={referralStatus}
              referralRecords={referralRecords}
              allPlanningRecordsGlobal={allPlanningRecordsGlobal}
              setIsPlanningRecordExpanded={setIsPlanningRecordExpanded}
            />
          </ScrollView>

        {/* Transparent Touch Layer - Extracted to TransparentTouchLayer.tsx */}
        {selectedTooth && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(selectedTooth) && !showConditionMenu && !isClosing && (
          <TransparentTouchLayer
            selectedTooth={selectedTooth}
            onClose={handleCloseTooth}
          />
        )}

      {/* Enlarged Tooth Overlay - Extracted to EnlargedToothModal.tsx */}
      <EnlargedToothModal
        selectedTooth={selectedTooth}
        toothConditions={toothConditions}
        onClose={handleCloseTooth}
        onSurfacePress={handleSurfacePress}
      />

        {/* Condition Menu */}
        <ConditionMenu
          visible={showConditionMenu}
          onSelect={handleConditionSelect}
          onClose={handleConditionMenuClose}
          selectedSurface={selectedSurface}
          selectedTooth={selectedTooth}
        />

        {/* Tooth Details Modal - Edit Mode */}
        <ToothDetailsModal
          visible={showToothDetailsModal}
          selectedToothForDetails={selectedToothForDetails}
          toothConditions={toothConditions}
          selectedTreatments={selectedTreatments}
          selectedDetails={selectedDetails}
          selectedSurfaces={selectedSurfaces}
          originalValues={originalValues}
          hasModalChanges={hasModalChanges}
          showNotesSection={showNotesSection}
          showReferralSection={showReferralSection}
          showDetailsSection={showDetailsSection}
          showRecordsSection={showRecordsSection}
          isEditMode={isEditMode}
          currentNote={currentNote}
          showSurfaceOptions={showSurfaceOptions}
          showTreatmentOptions={showTreatmentOptions}
          showDetailsOptions={showDetailsOptions}
          showReferralOptions={showReferralOptions}
          recordsType={recordsType}
          unreadNotes={unreadNotes}
          toothNotes={toothNotes}
          toothRecords={toothRecords}
          selectedReferralFor={selectedReferralFor}
          referrals={referrals}
          toothBorderColors={toothBorderColors}
          permanentPatientId={permanentPatientId}
          userName={user?.name}
          skipPlanningRecordRef={skipPlanningRecordRef}
          setSelectedTreatments={setSelectedTreatments}
          setSelectedDetails={setSelectedDetails}
          setSelectedSurfaces={setSelectedSurfaces}
          setOriginalValues={setOriginalValues}
          setHasModalChanges={setHasModalChanges}
          setShowNotesSection={setShowNotesSection}
          setShowReferralSection={setShowReferralSection}
          setShowDetailsSection={setShowDetailsSection}
          setShowRecordsSection={setShowRecordsSection}
          setIsEditMode={setIsEditMode}
          setCurrentNote={setCurrentNote}
          setShowSurfaceOptions={setShowSurfaceOptions}
          setShowTreatmentOptions={setShowTreatmentOptions}
          setShowDetailsOptions={setShowDetailsOptions}
          setShowReferralOptions={setShowReferralOptions}
          setRecordsType={setRecordsType}
          setUnreadNotes={setUnreadNotes}
          setToothNotes={setToothNotes}
          setToothRecords={setToothRecords}
          setSelectedReferralFor={setSelectedReferralFor}
          setReferrals={setReferrals}
          setReferralStatus={setReferralStatus}
          setToothBorderColors={setToothBorderColors}
          setToothConditions={setToothConditions}
          onClose={() => {
            setShowToothDetailsModal(false);
            setHasModalChanges(false);
            setShowNotesSection(false);
            setShowReferralSection(false);
            setIsEditMode(false);
            setCurrentNote('');
            setOriginalValues({});
          }}
        />

        {/* Department Selection Modal */}
        <DepartmentModal
          visible={showDepartmentModal}
          mode={departmentModalMode}
          permanentPatientId={permanentPatientId || null}
          userName={user?.name}
          referrals={referrals}
          tempReferrals={tempReferrals}
          selectedReferralFor={selectedReferralFor}
          tempSelectedReferralFor={tempSelectedReferralFor}
          expandedDepartment={expandedDepartment}
          savedReferralsState={savedReferralsState}
          savedSelectedReferralFor={savedSelectedReferralFor}
          setReferrals={setReferrals}
          setTempReferrals={setTempReferrals}
          setSelectedReferralFor={setSelectedReferralFor}
          setTempSelectedReferralFor={setTempSelectedReferralFor}
          setExpandedDepartment={setExpandedDepartment}
          setSelectedReferral={setSelectedReferral}
          setReferralStatus={setReferralStatus}
          setSavedReferralsState={setSavedReferralsState}
          setSavedSelectedReferralFor={setSavedSelectedReferralFor}
          onClose={() => setShowDepartmentModal(false)}
          loadPatientDentalData={loadPatientDentalData}
        />
      </View>
    </View>
    </View>
  );
}

