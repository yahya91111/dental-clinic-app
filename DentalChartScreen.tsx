
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
  Modal,
  Dimensions,
  TextInput,
  Alert,
  LogBox,
  Platform,
} from 'react-native';
import { styles, SCREEN_WIDTH, SCREEN_HEIGHT } from './screens/DentalChart/styles';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Rect, Defs, ClipPath, G, Polygon } from 'react-native-svg';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';
import {
  getCompleteToothData,
  saveToothSurfaceCondition,
  deleteToothSurfaceCondition,
  createEditingRecord,
  createPlanningRecord,
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
import type { ToothNumber, ToothSurface, ToothCondition } from './types';

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
  getSurfaceMap,
  getSurfaceNameMap,
  convertNumberToPalmer,
  convertPalmerToNumber,
  getToothLabel,
  getConditionFromDetails,
  formatTimestamp,
} from './screens/DentalChart/dentalHelpers';
import {
  ToothWithSections,
  ToothWithSectionsSquare,
  ToothWithSectionsSquareTiny,
  ToothWithSectionsSquareMedium,
  ToothWithSectionsCanineSmall,
  ToothWithSectionsIncisorSmall,
  ToothWithSectionsPremolar,
  ToothWithSectionsCanine,
  ToothWithSectionsIncisor,
  ToothWithSectionsIncisorNoCenter,
  ToothWithSectionsCanineNoCenter,
  ToothWithSectionsProps,
} from './screens/DentalChart/ToothShapes';
import {
  ToothNumberBadge,
  ConditionMenu,
  ConditionMenuProps,
} from './screens/DentalChart/DentalChartComponents';
import { DepartmentModal, ReferralsState, ReferralStatusState } from './screens/DentalChart/DepartmentModal';
import { ToothDetailsModal, ToothRecord, ToothNote, EditingRecord, PlanningRecord } from './screens/DentalChart/ToothDetailsModal';
import { useToothAnimations } from './screens/DentalChart/useToothAnimations';
import { TeethGrid, ToothAnimValues } from './screens/DentalChart/TeethGrid';

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

  // Animated Blobs - Same as PatientProfileScreen
  const blob1Anim = useState(new Animated.Value(0))[0];
  const blob2Anim = useState(new Animated.Value(0))[0];
  const blob3Anim = useState(new Animated.Value(0))[0];
  const blob4Anim = useState(new Animated.Value(0))[0];
  const blob5Anim = useState(new Animated.Value(0))[0];
  const blob6Anim = useState(new Animated.Value(0))[0];

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
  const [allPlanningRecordsGlobal, setAllPlanningRecordsGlobal] = useState<Array<{
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

    try {
      console.log('🚀 Loading dental data for patient (PARALLEL):', permanentPatientId);
      const startTime = performance.now();

      // ⚡ Load ALL data in PARALLEL (much faster!)
      const [
        toothDataResult,
        editingDataResult,
        planningDataResult,
        notesDataResult,
        referralsDataResult,
        scalingDataResult
      ] = await Promise.all([
        getCompleteToothData(permanentPatientId),
        getEditingRecords(permanentPatientId),
        getPlanningRecords(permanentPatientId),
        getAllToothNotes(permanentPatientId),
        getReferrals(permanentPatientId),
        getScalingRecords(permanentPatientId)
      ]);

      const loadTime = performance.now() - startTime;
      console.log(` All data loaded in ${loadTime.toFixed(0)}ms`);

      // Process tooth surface conditions
      const { data: toothData, error: toothError } = toothDataResult;

      if (toothError) {
        console.error('Error loading tooth data:', toothError);
        Alert.alert('خطأ', 'فشل تحميل بيانات الأسنان');
        return;
      }

      if (toothData && toothData.length > 0) {
        const newConditions: Record<number, ToothSurfaceConditions> = {};

        // Convert Palmer notation to numbers and build conditions object
        toothData.forEach((tooth) => {
          const toothNumber = convertPalmerToNumber(tooth.tooth_number as ToothNumber);
          if (toothNumber) {
            newConditions[toothNumber] = {
              top: tooth.surfaces.top || null,
              bottom: tooth.surfaces.bottom || null,
              left: tooth.surfaces.left || null,
              right: tooth.surfaces.right || null,
              center: tooth.surfaces.center || null,
            };
          }
        });

        setToothConditions(newConditions);
        console.log('Loaded tooth conditions for', Object.keys(newConditions).length, 'teeth');
        // Border colors come from editing_records and planning_records only
      }

      // Process editing records (treatments) - already loaded
      const { data: editingData, error: editingError } = editingDataResult;

      if (editingError) {
        console.error('Error loading editing records:', editingError);
      } else if (editingData && editingData.length > 0) {
        const newRecords: Record<number, ToothRecord[]> = {};
        const borderColorsFromEditing: Record<number, ToothCondition> = {};
        const conditionsFromEditing: Record<number, ToothSurfaceConditions> = {};

        editingData.forEach((record) => {
          const toothNumber = convertPalmerToNumber(record.tooth_number as ToothNumber);
          if (toothNumber) {
            // Parse surfaces once at the beginning
            const parsedSurfaces = typeof record.surfaces === 'string' ? JSON.parse(record.surfaces) : record.surfaces;

            if (!newRecords[toothNumber]) {
              newRecords[toothNumber] = [];
            }

            newRecords[toothNumber].push({
              type: 'editing',
              treatment: record.treatment,
              details: record.details || '',
              surfaces: parsedSurfaces,
              timestamp: formatTimestamp(new Date(record.timestamp)),
              timestampNum: record.timestamp_num || Date.now(),
              doctorName: record.doctor_name,
            });

            // Rebuild toothBorderColors from editing records
            if (record.treatment === 'Pulpectomy') {
              borderColorsFromEditing[toothNumber] = 'pulpectomy';
            }

            // Rebuild toothConditions from editing records
            if (record.treatment === 'Extraction') {
              conditionsFromEditing[toothNumber] = {
                top: 'missing',
                bottom: 'missing',
                left: 'missing',
                right: 'missing',
                center: 'missing',
              };
            } else if (record.details && Array.isArray(parsedSurfaces)) {
              console.log(`🔍 Processing tooth ${toothNumber}: details="${record.details}", surfaces=`, parsedSurfaces);

              // Map surface names to keys (database uses lowercase)
              // Use helper function to get correct mapping for lower teeth
              const surfaceNameMap = getSurfaceNameMap(toothNumber);

              // Determine color based on details using helper function
              const conditionColor = getConditionFromDetails(record.details);

              console.log(`   → Mapped to color: ${conditionColor}`);

              // Only apply if it's a known filling type (not the default 'treated')
              if (conditionColor && conditionColor !== 'treated' && Array.isArray(parsedSurfaces)) {
                if (!conditionsFromEditing[toothNumber]) {
                  conditionsFromEditing[toothNumber] = {
                    top: null,
                    bottom: null,
                    left: null,
                    right: null,
                    center: null,
                  };
                }

                // Apply color to specified surfaces
                parsedSurfaces.forEach((surfaceName: string) => {
                  const surfaceKey = surfaceNameMap[surfaceName];
                  if (surfaceKey) {
                    conditionsFromEditing[toothNumber][surfaceKey] = conditionColor;
                  }
                });
              }
            }
          }
        });

        setToothRecords(prev => ({ ...prev, ...newRecords }));
        console.log(' Loaded editing records for', Object.keys(newRecords).length, 'teeth');

        // Apply border colors from editing records (Pulpectomy)
        if (Object.keys(borderColorsFromEditing).length > 0) {
          setToothBorderColors(prev => {
            const updated = { ...prev, ...borderColorsFromEditing };
            console.log(' Applying border colors from editing records:', borderColorsFromEditing);
            console.log('   Previous border colors:', prev);
            console.log('   Updated border colors:', updated);
            return updated;
          });
        }

        // Editing records are for display only in Modal (history)
        // Colors come ONLY from tooth_surface_conditions table
      }

      // Process planning records (diagnoses) - already loaded
      const { data: planningData, error: planningError } = planningDataResult;

      if (planningError) {
        console.error('Error loading planning records:', planningError);
      } else if (planningData && planningData.length > 0) {
        const newPlanningRecords: Array<{
          toothNumber: number;
          action: 'diagnosed' | 'canceled';
          condition: string;
          surfaces: string[];
          timestamp: string;
          timestampNum: number;
          doctorName: string;
          isChange?: boolean;
          previousCondition?: string;
        }> = [];

        planningData.forEach((record) => {
          const toothNumber = convertPalmerToNumber(record.tooth_number as ToothNumber);
          if (toothNumber) {
            newPlanningRecords.push({
              toothNumber,
              action: record.action,
              condition: record.condition,
              surfaces: typeof record.surfaces === 'string' ? JSON.parse(record.surfaces) : record.surfaces,
              timestamp: formatTimestamp(new Date(record.timestamp)),
              timestampNum: record.timestamp_num || Date.now(),
              doctorName: record.doctor_name,
              isChange: record.is_change,
              previousCondition: record.previous_condition,
            });
          }
        });

        setAllPlanningRecordsGlobal(newPlanningRecords);
        console.log('Loaded', newPlanningRecords.length, 'planning records');

        const planningRecordsForTeeth: Record<number, ToothRecord[]> = {};

        newPlanningRecords.forEach((record) => {
          const toothNumber = record.toothNumber;

          // Add to toothRecords
          if (!planningRecordsForTeeth[toothNumber]) {
            planningRecordsForTeeth[toothNumber] = [];
          }

          planningRecordsForTeeth[toothNumber].push({
            type: 'planning',
            action: record.action,
            condition: record.condition,
            surfaces: record.surfaces,
            timestamp: record.timestamp,
            timestampNum: record.timestampNum,
            doctorName: record.doctorName,
            isChange: record.isChange,
            previousCondition: record.previousCondition,
          });
        });

        // Add planning records to toothRecords
        if (Object.keys(planningRecordsForTeeth).length > 0) {
          setToothRecords(prev => {
            const updated = { ...prev };

            // First, remove all old planning records to prevent duplicates
            Object.keys(updated).forEach((toothKey) => {
              const toothNum = parseInt(toothKey);
              updated[toothNum] = updated[toothNum].filter(record => record.type !== 'planning');
            });

            // Then add the fresh planning records from database
            Object.keys(planningRecordsForTeeth).forEach((toothKey) => {
              const toothNum = parseInt(toothKey);
              updated[toothNum] = [
                ...(updated[toothNum] || []),
                ...planningRecordsForTeeth[toothNum]
              ];
            });
            return updated;
          });
        }

        // Detect Root Canal Treated from planning records and set border colors
        const borderColorsFromPlanning: Record<number, ToothCondition> = {};
        newPlanningRecords.forEach((record) => {
          console.log(`🔍 Planning record - Tooth ${record.toothNumber}: condition="${record.condition}", surfaces=`, record.surfaces);
          if (record.surfaces.includes('Root Canal Treated')) {
            borderColorsFromPlanning[record.toothNumber] = 'treated';
            console.log(`🦷 Tooth ${record.toothNumber}: Root Canal Treated detected → setting border color to 'treated'`);
          }
        });

        if (Object.keys(borderColorsFromPlanning).length > 0) {
          setToothBorderColors(prev => {
            const updated = { ...prev, ...borderColorsFromPlanning };
            console.log(' Applying border colors from planning records:', borderColorsFromPlanning);
            console.log('   Previous border colors:', prev);
            console.log('   Updated border colors:', updated);
            return updated;
          });
        }

        // Planning records are for display only in Modal (history)
        // Colors come ONLY from tooth_surface_conditions table
      }

      // Process tooth notes - already loaded
      const { data: notesData, error: notesError } = notesDataResult;

      if (notesError) {
        console.error('Error loading tooth notes:', notesError);
      } else if (notesData && notesData.length > 0) {
        const newNotes: Record<number, Array<{ text: string; timestamp: string; doctorName: string }>> = {};

        notesData.forEach((note) => {
          const toothNumber = convertPalmerToNumber(note.tooth_number as ToothNumber);
          if (toothNumber) {
            if (!newNotes[toothNumber]) {
              newNotes[toothNumber] = [];
            }

            newNotes[toothNumber].push({
              text: note.note,
              timestamp: formatTimestamp(new Date(note.timestamp)),
              doctorName: note.doctor_name,
            });
          }
        });

        setToothNotes(newNotes);
        console.log('Loaded notes for', Object.keys(newNotes).length, 'teeth');
      }

      // Process referrals - already loaded
      const { data: referralsData, error: referralsError } = referralsDataResult;

      if (referralsError) {
        console.error('Error loading referrals:', referralsError);
      } else if (referralsData && referralsData.length > 0) {
        console.log(' Loaded', referralsData.length, 'referrals');

        // Map referral types from database to UI keys
        const referralTypeToKeyMap: Record<string, string> = {
          'Endodontics': 'endodontics',
          'Oral Surgery': 'oralSurgery',
          'Orthodontics': 'orthodontics',
          'Prosthodontics': 'prosthodontics',
          'Periodontics': 'periodontics',
          'Pediatric Dentistry': 'pediatricDentistry',
        };

        // فصل التحويلات حسب الحالة
        const notGivenReferrals = referralsData.filter(r => r.status === 'not_given' || !r.status);
        const givenReferrals = referralsData.filter(r => r.status === 'given');

        // Group referrals by tooth (فقط Not Given) - Multiple referrals per tooth
        const referralsByTooth: Record<number, string[]> = {};

        notGivenReferrals.forEach((referral) => {
          // Skip general referrals (tooth_number is null)
          if (!referral.tooth_number) return;

          const toothNumber = convertPalmerToNumber(referral.tooth_number as ToothNumber);
          if (toothNumber) {
            // Map referral type to key
            const referralKey = referralTypeToKeyMap[referral.referral_type] || referral.referral_type;

            // Add to array (multiple referrals per tooth)
            if (!referralsByTooth[toothNumber]) {
              referralsByTooth[toothNumber] = [];
            }
            if (!referralsByTooth[toothNumber].includes(referralKey)) {
              referralsByTooth[toothNumber].push(referralKey);
            }
          }
        });

        // Rebuild referrals state for Department tab (Not Given referrals فقط)
        const departmentsWithReferrals: Record<string, boolean> = {};
        const departmentStatuses: Record<string, 'not_given' | 'given'> = {};

        notGivenReferrals.forEach((referral) => {
          const referralKey = referralTypeToKeyMap[referral.referral_type] || referral.referral_type;

          // Mark department as having referrals (show in Department tab)
          departmentsWithReferrals[referralKey] = true;
          // Set status to "not_given" (will show in Department tab)
          departmentStatuses[referralKey] = 'not_given';
        });

        // Build Referral Records from Given referrals
        const givenReferralRecords: Array<{
          departmentKey: string;
          departmentName: string;
          teeth: number[];
          timestamp: string;
          timestampNum: number;
          doctorName: string;
        }> = [];

        // Group Given referrals by department AND given_at time (to separate batches)
        const givenByDept = new Map<string, typeof givenReferralRecords[0]>();

        givenReferrals.forEach((referral) => {
          const referralKey = referralTypeToKeyMap[referral.referral_type] || referral.referral_type;
          const givenTime = new Date(referral.given_at || referral.created_at);
          const roundedTime = new Date(givenTime.getFullYear(), givenTime.getMonth(), givenTime.getDate(), givenTime.getHours(), givenTime.getMinutes());
          const batchKey = `${referralKey}-${roundedTime.getTime()}`;

          // Handle general referrals (tooth_number is null)
          if (!referral.tooth_number) {
            // Create record for general referral with empty teeth array
            const existingRecord = givenByDept.get(batchKey);

            if (!existingRecord) {
              givenByDept.set(batchKey, {
                departmentKey: referralKey,
                departmentName: referral.referral_type,
                teeth: [], // Empty array for general referrals
                timestamp: givenTime.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }),
                timestampNum: givenTime.getTime(),
                doctorName: referral.doctor_name || 'Dr. Unknown'
              });
            }
            return; // Skip tooth number processing for general referrals
          }

          // Handle tooth-specific referrals
          const toothNumber = convertPalmerToNumber(referral.tooth_number as ToothNumber);

          if (toothNumber) {
            const existingRecord = givenByDept.get(batchKey);

            if (existingRecord) {
              // Add tooth to existing batch (if not already included)
              if (!existingRecord.teeth.includes(toothNumber)) {
                existingRecord.teeth.push(toothNumber);
              }
            } else {
              // Create new batch record
              givenByDept.set(batchKey, {
                departmentKey: referralKey,
                departmentName: referral.referral_type,
                teeth: [toothNumber],
                timestamp: givenTime.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }),
                timestampNum: givenTime.getTime(),
                doctorName: referral.doctor_name || 'Dr. Unknown'
              });
            }
          }
        });

        givenReferralRecords.push(...Array.from(givenByDept.values()));

        // Update states
        setSelectedReferralFor(prev => ({ ...prev, ...referralsByTooth }));

        // Update Department tab states
        setReferrals(prev => ({ ...prev, ...departmentsWithReferrals }));
        setReferralStatus(prev => ({ ...prev, ...departmentStatuses }));

        // Update Referral Records
        setReferralRecords(givenReferralRecords);

        console.log(' Applied referrals to', Object.keys(referralsByTooth).length, 'teeth');
        console.log(' Loaded departments for view:', departmentsWithReferrals);
        console.log(' Loaded Given referral records:', givenReferralRecords.length);
      }

      // Process scaling records (Oral Hygiene) - already loaded
      const { data: scalingData, error: scalingError } = scalingDataResult;

      if (scalingError) {
        console.error('Error loading scaling records:', scalingError);
      } else if (scalingData && scalingData.length > 0) {
        const newScalingRecords = scalingData.map((record) => ({
          id: record.id,
          timestamp: formatTimestamp(new Date(record.timestamp)),
          doctorName: record.doctor_name,
          timestampNum: new Date(record.timestamp).getTime(),
        }));

        setScalingRecords(newScalingRecords);
        console.log(' Loaded', newScalingRecords.length, 'scaling records');
      }

      console.log('Dental data loading complete');
    } catch (error) {
      console.error('Error in loadPatientDentalData:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
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
   * Save tooth surface condition to database
   */
  const saveToothConditionToDatabase = async (
    toothNumber: number,
    surface: keyof ToothSurfaceConditions,
    condition: ToothCondition
  ) => {
    if (!permanentPatientId || !user?.name) {
      console.log('Cannot save: missing permanentPatientId or user name');
      return;
    }

    const palmerNotation = convertNumberToPalmer(toothNumber);
    if (!palmerNotation) {
      console.error('Invalid tooth number:', toothNumber);
      return;
    }

    // Map UI surface names to database field names
    // Use helper function to get correct mapping for lower teeth
    const surfaceMap = getSurfaceMap(toothNumber);

    const dbSurface = surfaceMap[surface];

    try {
      const { error } = await saveToothSurfaceCondition(
        permanentPatientId,
        palmerNotation,
        dbSurface,
        condition
      );

      if (error) {
        console.error('Error saving tooth condition:', error);
        // Don't show alert - just log the error and continue
        // User can still work offline
      } else {
        console.log(`Saved ${surface} (${dbSurface}) of tooth ${toothNumber} (${palmerNotation}): ${condition}`);
      }
    } catch (error) {
      console.error('Exception saving tooth condition:', error);
    }
  };

  /**
   * Save planning record to database
   */
  const savePlanningRecordToDatabase = async (
    toothNumber: number,
    action: 'diagnosed' | 'canceled',
    condition: string,
    surfaces: string[]
  ) => {
    if (!permanentPatientId || !user?.name) {
      console.log('Cannot save planning record: missing permanentPatientId or user name');
      return;
    }

    const palmerNotation = convertNumberToPalmer(toothNumber);
    if (!palmerNotation) {
      console.error('Invalid tooth number:', toothNumber);
      return;
    }

    try {
      const surfaceArray = surfaces.map(s => s.toLowerCase()) as ToothSurface[];

      const { error } = await createPlanningRecord(
        permanentPatientId,
        palmerNotation,
        action,
        condition,
        surfaceArray,
        user.name
      );

      if (error) {
        console.error('Error saving planning record:', error);
      } else {
        console.log(`Saved planning record for tooth ${toothNumber} (${palmerNotation}): ${action} - ${condition}`);
      }
    } catch (error) {
      console.error('Exception saving planning record:', error);
    }
  };

  /**
   * ═══════════════════════════════════════════════════════════════
   * Handle Planning Submit - Save all pending planning records as batch
   * ═══════════════════════════════════════════════════════════════
   */
  const handlePlanningSubmit = async () => {
    if (!permanentPatientId || !user?.name || pendingPlanningRecords.length === 0) {
      console.log('Cannot submit planning: missing data or no pending records');
      return;
    }

    try {
      console.log('🔵 Submitting planning batch with', pendingPlanningRecords.length, 'records');

      // Step 1: Create a new planning batch
      const { data: batchData, error: batchError } = await createPlanningBatch(
        permanentPatientId,
        user.name
      );

      if (batchError || !batchData) {
        console.error(' Error creating planning batch:', batchError);
        Alert.alert('خطأ', 'فشل حفظ التخطيط. حاول مرة أخرى.');
        return;
      }

      const batchId = batchData.id;
      console.log(' Created planning batch:', batchId);

      // Step 2: Save all pending planning records with batch_id
      const savePromises = pendingPlanningRecords.map(async (record) => {
        const palmerNotation = convertNumberToPalmer(record.toothNumber);
        if (!palmerNotation) {
          console.error('Invalid tooth number:', record.toothNumber);
          return null;
        }

        // Don't lowercase special tooth status values (Root Canal Treated, Missing Tooth)
        // Only lowercase actual surface names (Mesial, Distal, etc.)
        const surfaceArray = record.surfaces.map(s => {
          if (s === 'Root Canal Treated' || s === 'Missing Tooth') {
            return s; // Keep as-is
          }
          return s.toLowerCase(); // Convert surface names to lowercase
        }) as ToothSurface[];

        console.log(`💾 Saving planning record - Tooth ${record.toothNumber}: condition="${record.condition}", surfaces=`, surfaceArray);

        return createPlanningRecord(
          permanentPatientId,
          palmerNotation,
          record.action,
          record.condition,
          surfaceArray,
          user.name,
          record.isChange,
          record.previousCondition,
          batchId  // ← Include batch_id
        );
      });

      const results = await Promise.all(savePromises);
      const errors = results.filter(r => r?.error);

      if (errors.length > 0) {
        console.error(' Some planning records failed to save:', errors);
        Alert.alert('تحذير', 'تم حفظ بعض السجلات فقط. تحقق من البيانات.');
      } else {
        console.log(' All planning records saved successfully with batch_id:', batchId);
      }

      // Step 2.5: Save/Delete tooth surface conditions from pendingPlanningRecords
      console.log('🔵 Saving tooth surface conditions from pending records...');

      // Helper function to extract surface name from strings like "Caries (Mesial)" or "Mesial"
      const extractSurfaceName = (surfaceLabel: string): string => {
        if (surfaceLabel.includes('(')) {
          // Extract from "Caries (Mesial)" → "Mesial"
          const match = surfaceLabel.match(/\(([^)]+)\)/);
          return match ? match[1].trim() : surfaceLabel;
        }
        return surfaceLabel; // Already just "Mesial"
      };

      // IMPORTANT: Separate delete and save operations to execute them sequentially
      // Delete operations MUST complete BEFORE save operations to prevent race conditions
      const deleteOperationPromises = [];
      const saveOperationPromises = [];

      // Process each pending planning record
      for (const record of pendingPlanningRecords) {
        const palmerNotation = convertNumberToPalmer(record.toothNumber);
        if (!palmerNotation) continue;

        console.log(`🔍 Processing record: ${record.condition}, surfaces:`, record.surfaces);

        // Get correct surface mapping for this tooth
        const surfaceMap = getSurfaceMap(record.toothNumber);

        // Map surface names directly to database surface names (no UI key conversion needed)
        const surfaceNameToDbSurface: Record<string, ToothSurface> = {
          'mesial': 'mesial',
          'distal': 'distal',
          'buccal': 'buccal',
          'lingual': 'lingual',
          'palatal': 'lingual',
          'occlusal': 'occlusal',
        };

        // إذا كان تغيير من Extraction إلى شيء آخر، احذف "extraction" من كل الأسطح أولاً
        if (record.isChange && record.previousCondition === 'Extraction') {
          console.log(`   Changing from Extraction → clearing all surfaces first`);
          for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
            const dbSurface = surfaceMap[surfaceKey];
            deleteOperationPromises.push(
              deleteToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface)
            );
          }
        }

        // Handle Clear Condition (canceled)
        if (record.action === 'canceled') {
          // Delete colors for specified surfaces
          record.surfaces.forEach(surfaceLabel => {
            const surfaceName = extractSurfaceName(surfaceLabel);
            const dbSurface = surfaceNameToDbSurface[surfaceName.toLowerCase()];
            console.log(`  → Clear: "${surfaceLabel}" → surface:"${surfaceName}" → dbSurface:"${dbSurface}"`);
            if (dbSurface) {
              deleteOperationPromises.push(
                deleteToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface)
              );
            }
          });
        }
        // Handle surface-specific diagnoses (Caries, Fracture, etc.)
        else if (record.condition && CONDITION_NAME_TO_KEY[record.condition]) {
          const color = CONDITION_NAME_TO_KEY[record.condition];
          record.surfaces.forEach(surfaceLabel => {
            const surfaceName = extractSurfaceName(surfaceLabel);
            const dbSurface = surfaceNameToDbSurface[surfaceName.toLowerCase()];
            console.log(`  → ${record.condition}: "${surfaceLabel}" → surface:"${surfaceName}" → dbSurface:"${dbSurface}" → color:"${color}"`);
            if (dbSurface) {
              saveOperationPromises.push(
                saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, color)
              );
            }
          });
        }
        // Handle Extraction (Condition)
        else if (record.condition === 'Extraction') {
          console.log('  → Extraction: saving "extraction" to all surfaces');
          for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
            const dbSurface = surfaceMap[surfaceKey];
            saveOperationPromises.push(
              saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, 'extraction')
            );
          }
        }
        // Handle Missing Tooth (Tooth Status)
        else if (record.surfaces.includes('Missing Tooth')) {
          console.log('  → Missing Tooth: saving "missing" to all surfaces');
          for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
            const dbSurface = surfaceMap[surfaceKey];
            saveOperationPromises.push(
              saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, 'missing')
            );
          }
        }
        // Root Canal Treated: border color only, NO surface colors saved
        else if (record.surfaces.includes('Root Canal Treated')) {
          console.log('  → Root Canal Treated: border color only (no surface colors saved)');
          // Do NOT save any surface conditions
          // Border color will be detected from planning_records on reload
        }
      }

      // STEP 1: Execute DELETE operations FIRST and wait for completion
      if (deleteOperationPromises.length > 0) {
        console.log(`🗑️ Executing ${deleteOperationPromises.length} delete operations...`);
        const deleteResults = await Promise.all(deleteOperationPromises);

        const deleteErrors = deleteResults.filter(r => r?.error);
        if (deleteErrors.length > 0) {
          console.error(' Some delete operations failed:', deleteErrors);
        } else {
          console.log(` All ${deleteOperationPromises.length} delete operations completed successfully`);
        }
      }

      // STEP 2: Execute SAVE operations AFTER deletes are complete
      if (saveOperationPromises.length > 0) {
        console.log(`💾 Executing ${saveOperationPromises.length} save operations...`);
        const saveResults = await Promise.all(saveOperationPromises);

        const saveErrors = saveResults.filter(r => r?.error);
        if (saveErrors.length > 0) {
          console.error(' Some save operations failed:', saveErrors);
        } else {
          console.log(` All ${saveOperationPromises.length} save operations completed successfully`);
        }
      }

      if (deleteOperationPromises.length === 0 && saveOperationPromises.length === 0) {
        console.log(' No surface conditions to save/delete');
      }

      // Step 3: Move pending records to allPlanningRecordsGlobal
      setAllPlanningRecordsGlobal(prev => [...prev, ...pendingPlanningRecords]);

      // Step 4: Clear pending records
      setPendingPlanningRecords([]);

      // Step 5: Show success message
      Alert.alert(' نجح', 'تم حفظ التخطيط بنجاح!');

      // Step 6: Reload data to show updated Planning Records
      await loadPatientDentalData();

    } catch (error) {
      console.error(' Exception in handlePlanningSubmit:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء حفظ التخطيط.');
    }
  };

  /**
   * ═══════════════════════════════════════════════════════════════
   * Handle Planning Cancel - Discard all pending planning records
   * ═══════════════════════════════════════════════════════════════
   */
  const handlePlanningCancel = () => {
    if (pendingPlanningRecords.length === 0) {
      return;
    }

    Alert.alert(
      'إلغاء التخطيط',
      'هل تريد إلغاء كل التخطيطات المعلقة؟',
      [
        { text: 'لا', style: 'cancel' },
        {
          text: 'نعم',
          style: 'destructive',
          onPress: async () => {
            console.log('🔴 Canceling planning session - clearing', pendingPlanningRecords.length, 'pending records');

            // Step 1: Remove pending planning records from toothRecords
            // (they were added locally but not saved to database)
            setToothRecords(prev => {
              const updated = { ...prev };

              // For each pending record, remove it from toothRecords
              pendingPlanningRecords.forEach(pendingRecord => {
                const toothNum = pendingRecord.toothNumber;
                if (updated[toothNum]) {
                  // Filter out records that match this pending record
                  updated[toothNum] = updated[toothNum].filter(record => {
                    if (record.type !== 'planning') return true;

                    // Remove if it matches the pending record
                    return !(
                      record.condition === pendingRecord.condition &&
                      record.timestampNum === pendingRecord.timestampNum
                    );
                  });

                  // If no records left for this tooth, remove the key
                  if (updated[toothNum].length === 0) {
                    delete updated[toothNum];
                  }
                }
              });

              return updated;
            });

            // Step 2: Clear pending records (this hides buttons)
            setPendingPlanningRecords([]);

            // Step 3: Clear selected surfaces
            setSelectedSurfaces({});

            // Step 4: Reload from database to restore saved state
            // This will replace toothConditions with saved data only
            await loadPatientDentalData();

            console.log(' Planning canceled - restored to saved state');
          }
        }
      ]
    );
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

  // Function للنقر على السن - تكبيره وتدويره
  const handleToothPress = (toothNumber: number | string) => {
    // السيناريو الثاني: إذا كان Edit Mode نشط، نعرض modal التفاصيل بدلاً من الانيميشن
    console.log('handleToothPress - toothNumber:', toothNumber, 'isEditModeActive:', isEditModeActive);
    if (isEditModeActive) {
      console.log('Opening tooth details modal for tooth:', toothNumber);
      setSelectedToothForDetails(toothNumber);

      // حفظ القيم الأصلية قبل فتح المودال
      setOriginalValues({
        treatment: selectedTreatments[toothNumber],
        details: selectedDetails[toothNumber],
        surfaces: selectedSurfaces[toothNumber] ? [...selectedSurfaces[toothNumber]] : []
      });

      setShowToothDetailsModal(true);
      setHasModalChanges(false); // Reset changes flag when opening modal
      setIsEditMode(false); // تعطيل وضع التعديل عند الفتح
      setShowNotesSection(false); // Hide notes section by default
      setShowDetailsSection(true); // Show details section by default
      setShowRecordsSection(false); // Hide records section by default
      setRecordsType('editing'); // Reset records type to editing
      setCurrentNote(''); // Clear current note input

      // إعادة تعيين Treatment و Details و Referral إلى Select عند فتح الموديل
      setSelectedTreatments(prev => ({ ...prev, [toothNumber]: '' }));
      setSelectedDetails(prev => ({ ...prev, [toothNumber]: '' }));
      setSelectedReferralFor(prev => ({ ...prev, [toothNumber]: [] }));  // Empty array for multiple referrals
      return;
    }

    // السيناريو الأول: الوضع العادي (انيميشن)
    // إذا تم النقر على نفس السن المفتوح وليس في حالة إغلاق، نتجاهل (السن مفتوح بالفعل)
    if (selectedTooth === toothNumber && !isClosing) return;

    // إذا تم النقر على نفس السن أثناء الإغلاق، نوقف الإغلاق ونفتحه مرة أخرى
    if (selectedTooth === toothNumber && isClosing && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(toothNumber)) {
      // إيقاف أنيميشن الإغلاق فوراً
      toothAnims.stopToothAnimations(toothNumber as number);
      // إلغاء حالة الإغلاق
      setIsClosing(false);
      // فتح السن مرة أخرى
      openTooth(toothNumber);
      return;
    }

    // إذا كان هناك سن آخر مفتوح (من 1-32)
    if (selectedTooth && selectedTooth !== toothNumber && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(selectedTooth)) {
      // إيقاف جميع الأنيميشنات للسن القديم فوراً
      toothAnims.stopToothAnimations(selectedTooth as number);
      // إلغاء حالة الإغلاق
      setIsClosing(false);
      // فتح السن الجديد مباشرة
      openTooth(toothNumber);
      return;
    }

    // فتح السن مباشرة
    openTooth(toothNumber);
  };

  // Function لفتح السن
  const openTooth = (toothNumber: number) => {
    setSelectedTooth(toothNumber);
    setSelectedSurface(null);
    setShowConditionMenu(false);
    setIsClosing(false);

    // إخفاء الأزرار (Edit, View, Oral Hygiene) تدريجياً عند فتح السن
    Animated.timing(toothAnims.buttonsOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Animation: تكبير السن وتدويره ونقله للمنتصف
    toothAnims.animateToothToCenter(toothNumber);
  };

  // Function لإغلاق السن المكبر
  const handleCloseTooth = () => {
    if (!selectedTooth) return;

    const toothNum = typeof selectedTooth === 'number' ? selectedTooth : parseInt(String(selectedTooth), 10);
    if (isNaN(toothNum)) return;

    setIsClosing(true);

    // إظهار الأزرار (Edit, View, Oral Hygiene) مباشرة عند إغلاق السن
    Animated.timing(toothAnims.buttonsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // العودة إلى الحجم والزاوية والموضع الأصلي
    toothAnims.animateToothToOriginal(toothNum, () => {
      setSelectedTooth(null);
      setSelectedSurface(null);
      setShowConditionMenu(false);
      setIsClosing(false);
    });
  };

  // Function للنقر على سطح السن
  const handleSurfacePress = (surface: keyof ToothSurfaceConditions) => {
    setSelectedSurface(surface);
    setShowConditionMenu(true);
  };

  // Function لاختيار حالة للسطح
  const handleConditionSelect = (condition: ToothCondition) => {
    if (selectedTooth && selectedSurface) {
      // إذا كانت الحالة treated، قم بتلوين الحدود فقط
      if (condition === 'treated') {
        console.log(`🦷 Setting border color for tooth ${selectedTooth} to 'treated' (Root Canal Treated)`);
        setToothBorderColors(prev => ({
          ...prev,
          [selectedTooth]: 'treated',
        }));

        // إضافة سجل للقائمة المعلقة (Pending) و toothRecords
        const now = new Date();
        const timestamp = formatTimestamp(now);
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: 'Tooth Status',
          surfaces: ['Root Canal Treated'],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        // استبدال السجل السابق (Whole tooth status)
        setPendingPlanningRecords(prev => {
          // Remove any existing Tooth Status record for this tooth
          const filtered = prev.filter(record =>
            record.toothNumber !== selectedTooth ||
            record.condition !== 'Tooth Status'
          );

          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

        // استبدال في toothRecords أيضاً
        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record =>
            record.type !== 'planning' ||
            record.condition !== 'Tooth Status'
          );

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        setHasModalChanges(true);
        setShowConditionMenu(false);
        return;
      }

      // إذا كانت الحالة missing، قم بتلوين جميع الأسطح
      if (condition === 'missing') {
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            top: condition,
            bottom: condition,
            left: condition,
            right: condition,
            center: condition,
          },
        }));

        // إضافة سجل للقائمة المعلقة (Pending) و toothRecords
        const now = new Date();
        const timestamp = formatTimestamp(now);
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: 'Tooth Status',
          surfaces: ['Missing Tooth'],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        // استبدال السجل السابق (Whole tooth status)
        setPendingPlanningRecords(prev => {
          const filtered = prev.filter(record =>
            record.toothNumber !== selectedTooth ||
            record.condition !== 'Tooth Status'
          );

          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

        // استبدال في toothRecords أيضاً
        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record =>
            record.type !== 'planning' ||
            record.condition !== 'Tooth Status'
          );

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        setHasModalChanges(true);
      }
      // إذا كانت الحالة extraction (Condition - يحفظ Record فوراً)
      else if (condition === 'extraction') {
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            top: condition,
            bottom: condition,
            left: condition,
            right: condition,
            center: condition,
          },
        }));

        // حفظ planning record لـ Extraction
        const now = new Date();
        const timestamp = formatTimestamp(now);

        const conditionName = getConditionName(condition);
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: conditionName.english,
          surfaces: ['All surfaces'],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        // استبدال السجل السابق (Whole tooth - Extraction)
        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record =>
            record.type !== 'planning' ||
            record.condition !== conditionName.english
          );

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        // استبدال في pendingPlanningRecords أيضاً
        setPendingPlanningRecords(prev => {
          const filtered = prev.filter(record =>
            record.toothNumber !== selectedTooth ||
            record.condition !== conditionName.english
          );

          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

      } else if (condition === 'CLEAR_TOOTH_STATUS' as any) {
        // إذا كان Clear Condition من قائمة Tooth Status - احذف border + كل الأسطح
        if (!selectedTooth) {
          console.error(' Invalid tooth number:', selectedTooth);
          return;
        }

        console.log('🧹 Clear Tooth Status: Clearing border + all surfaces for tooth', selectedTooth);

        // إزالة لون الحدود
        setToothBorderColors(prev => {
          const newBorderColors = { ...prev };
          delete newBorderColors[selectedTooth];
          return newBorderColors;
        });

        // إزالة اللون من جميع الأسطح
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null,
          },
        }));

        // حفظ planning record عند إلغاء الحالة
        const now = new Date();
        const timestamp = formatTimestamp(now);

        const surfaceOptions = getAllSurfaces(selectedTooth);
        const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
        const surfaceLabel = surface?.label || selectedSurface;
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'canceled' as const,
          condition: '',
          surfaces: [surfaceLabel],
          timestamp,
          timestampNum,
          toothNumber: selectedTooth,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record => {
            if (record.type !== 'planning') return true;
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface;
          });

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        setPendingPlanningRecords(prev => [...prev, newRecord]);

        setShowConditionMenu(false);
        setSelectedTooth(null);
        setSelectedSurface('center');

      } else if (condition === null) {
        // إذا كان Clear Condition من قائمة Condition العادية
        const currentConditions = toothConditions[selectedTooth];

        // إزالة لون الحدود
        setToothBorderColors(prev => {
          const newBorderColors = { ...prev };
          delete newBorderColors[selectedTooth];
          return newBorderColors;
        });

        // تحقق إذا كانت جميع الأسطح extraction أو missing
        if (currentConditions) {
          const allSame =
            currentConditions.top === currentConditions.bottom &&
            currentConditions.bottom === currentConditions.left &&
            currentConditions.left === currentConditions.right &&
            currentConditions.right === currentConditions.center &&
            (currentConditions.top === 'extraction' || currentConditions.top === 'missing');

          if (allSame) {
            // إزالة اللون من جميع الأسطح
            setToothConditions(prev => ({
              ...prev,
              [selectedTooth]: {
                top: null,
                bottom: null,
                left: null,
                right: null,
                center: null,
              },
            }));
          } else {
            // إزالة اللون من السطح المحدد فقط
            setToothConditions(prev => ({
              ...prev,
              [selectedTooth]: {
                ...(prev[selectedTooth] || {
                  top: null,
                  bottom: null,
                  left: null,
                  right: null,
                  center: null,
                }),
                [selectedSurface]: null,
              },
            }));
          }

          // حفظ planning record عند إلغاء الحالة
          const now = new Date();
          const timestamp = formatTimestamp(now);

          const surfaceOptions = getAllSurfaces(selectedTooth);
          const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
          const surfaceLabel = surface?.label || selectedSurface;
          const timestampNum = now.getTime() + Math.random() * 0.999;

          // Clear Condition: إضافة سجل canceled (استبدال السجل السابق)
          const newRecord = {
            type: 'planning' as const,
            action: 'canceled' as const,
            condition: '',
            surfaces: [surfaceLabel],
            timestamp,
            timestampNum,
            doctorName: user?.name || 'Dr. Unknown',
            isChange: undefined,
            previousCondition: undefined
          };

          // استبدال السجل السابق في toothRecords
          setToothRecords(prev => {
            const existingRecords = prev[selectedTooth] || [];
            const filtered = existingRecords.filter(record => {
              if (record.type !== 'planning') return true;

              // Remove old record for this surface
              const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
              return !recordSurface;
            });

            return {
              ...prev,
              [selectedTooth]: [
                ...filtered,
                newRecord
              ]
            };
          });

          // استبدال السجل السابق في pendingPlanningRecords
          setPendingPlanningRecords(prev => {
            const filtered = prev.filter(record => {
              if (record.toothNumber !== selectedTooth) return true;

              // Remove old record for this surface
              const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
              return !recordSurface;
            });

            return [
              ...filtered,
              {
                toothNumber: selectedTooth,
                ...newRecord
              }
            ];
          });
        }
      } else {
        // تلوين السطح المحدد فقط
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            ...(prev[selectedTooth] || {
              top: null,
              bottom: null,
              left: null,
              right: null,
              center: null,
            }),
            [selectedSurface]: condition,
          },
        }));

        // إضافة سجل للقائمة العامة و toothRecords مباشرةً
        const now = new Date();
        const timestamp = formatTimestamp(now);

        const conditionName = getConditionName(condition);
        const surfaceOptions = getAllSurfaces(selectedTooth);
        const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
        const surfaceLabel = surface?.label || selectedSurface;
        const timestampNum = now.getTime() + Math.random() * 0.999;

        // كشف التغيير: البحث عن آخر سجل لنفس السطح بحالة مختلفة
        // أولوية البحث:
        // 1. editing_records (العلاجات المنفذة - الأسطح الخضراء)
        // 2. planning_records (التخطيطات)

        let isChange = false;
        let previousCondition = '';

        // ══════════════════════════════════════════════════════════════
        // STEP 1: البحث في editing_records أولاً (العلاجات المنفذة)
        // ══════════════════════════════════════════════════════════════
        const editingRecordsForTooth = toothRecords[selectedTooth] || [];
        const sortedEditingRecords = [...editingRecordsForTooth].sort((a, b) => b.timestampNum - a.timestampNum);

        console.log(`🔍 Searching in editing_records for tooth ${selectedTooth}, surface ${surfaceLabel}:`, {
          editingRecordsCount: editingRecordsForTooth.length,
          records: editingRecordsForTooth.map(r => ({ details: r.details, surfaces: r.surfaces }))
        });

        // البحث عن آخر علاج لنفس السطح
        // في editing_records: surfaces = ['mesial', 'distal'], details = 'Permanent Filling'
        const lastTreatmentForSurface = sortedEditingRecords.find(r =>
          r.surfaces && Array.isArray(r.surfaces) && r.surfaces.some(s => s.toLowerCase() === surfaceLabel.toLowerCase())
        );

        if (lastTreatmentForSurface && lastTreatmentForSurface.details) {
          // وجدنا علاج سابق (السطح أخضر) - استخدم details من editing_records
          const previousConditionName = lastTreatmentForSurface.details;

          console.log(` Found treatment record: ${previousConditionName} on ${surfaceLabel}`);

          // التحقق إذا كانت الحالة مختلفة
          if (previousConditionName.toLowerCase() !== conditionName.english.toLowerCase()) {
            isChange = true;
            previousCondition = previousConditionName;
            console.log(`🔄 CHANGE DETECTED (from Treatment): ${previousConditionName} → ${conditionName.english} on ${surfaceLabel}`);
          } else {
            console.log(` Same condition (Treatment): ${conditionName.english} on ${surfaceLabel}`);
          }
        } else {
          console.log(` No treatment found in editing_records, searching in planning_records...`);
          // ══════════════════════════════════════════════════════════════
          // STEP 2: لم نجد علاج - ابحث في planning_records (التخطيطات)
          // ══════════════════════════════════════════════════════════════
          const globalRecordsForTooth = allPlanningRecordsGlobal.filter(r => r.toothNumber === selectedTooth);
          const pendingRecordsForTooth = pendingPlanningRecords.filter(r => r.toothNumber === selectedTooth);
          const allRecordsForTooth = [...globalRecordsForTooth, ...pendingRecordsForTooth];

          const sortedRecordsForTooth = allRecordsForTooth.sort((a, b) => b.timestampNum - a.timestampNum);

          // أولاً: ابحث عن Extraction
          let lastDiagnosedForSurface = sortedRecordsForTooth.find(
            r => r.action === 'diagnosed' && r.condition === 'Extraction'
          );

          // إذا لم نجد Extraction، ابحث عن سجل لنفس السطح
          if (!lastDiagnosedForSurface) {
            lastDiagnosedForSurface = sortedRecordsForTooth.find(r =>
              r.action === 'diagnosed' &&
              r.surfaces.some(s => s.toLowerCase().includes(`(${surfaceLabel.toLowerCase()})`))
            );
          }

          if (lastDiagnosedForSurface) {
            // حالة خاصة: التغيير من Extraction
            if (lastDiagnosedForSurface.condition === 'Extraction') {
              if (conditionName.english !== 'Extraction') {
                isChange = true;
                previousCondition = 'Extraction';
                console.log(`🔄 CHANGE DETECTED (from Planning): Extraction → ${conditionName.english} on ${surfaceLabel}`);
              } else {
                console.log(` Same condition (Planning): Extraction`);
              }
            } else {
              // استخراج اسم الحالة من السجل السابق
              const previousSurfaceText = lastDiagnosedForSurface.surfaces.find(s => s.toLowerCase().includes(`(${surfaceLabel.toLowerCase()})`));
              if (previousSurfaceText) {
                const previousConditionMatch = previousSurfaceText.match(/^(.+?)\s*\(/);
                const previousConditionName = previousConditionMatch ? previousConditionMatch[1].trim() : previousSurfaceText;

                // التحقق إذا كانت الحالة مختلفة
                if (previousConditionName.toLowerCase() !== conditionName.english.toLowerCase()) {
                  isChange = true;
                  previousCondition = previousConditionName;
                  console.log(`🔄 CHANGE DETECTED (from Planning): ${previousConditionName} → ${conditionName.english} on ${surfaceLabel}`);
                } else {
                  console.log(` Same condition (Planning): ${conditionName.english} on ${surfaceLabel}`);
                }
              }
            }
          } else {
            console.log(`➕ NEW diagnosis: ${conditionName.english} on ${surfaceLabel}`);
          }
        }

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: conditionName.english, // Use actual condition name (Caries, Follow-up, etc.)
          surfaces: [`${conditionName.english} (${surfaceLabel})`],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: isChange, // Track if this is a change from previous condition
          previousCondition: isChange ? previousCondition : undefined
        };

        // استبدال السجل السابق بدلاً من الإضافة (لنفس السن ونفس السطح)
        setPendingPlanningRecords(prev => {
          // Remove any existing record for this tooth + surface
          const filtered = prev.filter(record => {
            if (record.toothNumber !== selectedTooth) return true;

            // Check if this record is for the same surface
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface; // Keep only if different surface
          });

          // Add the new record
          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

        // استبدال السجل في toothRecords أيضاً
        setToothRecords(prev => {
          const existingRecordsForTooth = prev[selectedTooth] || [];

          // Remove any existing planning record for this surface
          const filtered = existingRecordsForTooth.filter(record => {
            if (record.type !== 'planning') return true; // Keep non-planning records

            // Check if this record is for the same surface
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface; // Keep only if different surface
          });

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        // إذا كان تغيير من Extraction، احذف اللون الأسود من كل الأسطح فوراً
        if (isChange && previousCondition === 'Extraction') {
          console.log('🔄 Clearing extraction color from all surfaces immediately');

          // احذف كل الألوان أولاً
          const clearedConditions = {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null,
          };

          // Mapping للأسطح (use helper to get correct mapping for lower teeth)
          const surfaceNameToKey = getSurfaceNameMap(selectedTooth);

          // أضف اللون الجديد للسطح المحدد فقط (إذا كان له لون)
          if (CONDITION_NAME_TO_KEY[conditionName.english]) {
            const surfaceKey = surfaceNameToKey[surfaceLabel.toLowerCase()];
            console.log(`  → Adding new color: condition="${conditionName.english}", surface="${surfaceLabel}", surfaceKey="${surfaceKey}", color="${CONDITION_NAME_TO_KEY[conditionName.english]}"`);
            if (surfaceKey) {
              clearedConditions[surfaceKey] = CONDITION_NAME_TO_KEY[conditionName.english];
              console.log(`   clearedConditions after adding:`, clearedConditions);
            } else {
              console.log(`   surfaceKey is null for "${surfaceLabel}"`);
            }
          } else {
            console.log(`   No color mapping for condition "${conditionName.english}"`);
          }

          console.log(`  🎨 Final clearedConditions:`, clearedConditions);
          setToothConditions(prev => ({
            ...prev,
            [selectedTooth]: clearedConditions
          }));
        }

      }
      setShowConditionMenu(false);
      setSelectedSurface(null);
    }
  };

  useEffect(() => {
    // Blob animations
    const animateBlob = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animateBlob(blob1Anim, 6000);
    animateBlob(blob2Anim, 7000);
    animateBlob(blob3Anim, 8000);
    animateBlob(blob4Anim, 6500);
    animateBlob(blob5Anim, 7500);
    animateBlob(blob6Anim, 6800);
  }, []);

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
                    translateX: blob1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 30],
                    }),
                  },
                  {
                    translateY: blob1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -20],
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
                top: '15%',
                right: '10%',
                width: 220,
                height: 220,
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                transform: [
                  {
                    translateX: blob2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -25],
                    }),
                  },
                  {
                    translateY: blob2Anim.interpolate({
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
                backgroundColor: 'rgba(91, 159, 237, 0.15)',
                transform: [
                  {
                    translateX: blob3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 20],
                    }),
                  },
                  {
                    translateY: blob3Anim.interpolate({
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
                    translateX: blob4Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -20],
                    }),
                  },
                  {
                    translateY: blob4Anim.interpolate({
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
                backgroundColor: 'rgba(91, 159, 237, 0.15)',
                transform: [
                  {
                    translateX: blob5Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 28],
                    }),
                  },
                  {
                    translateY: blob5Anim.interpolate({
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
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                transform: [
                  {
                    translateX: blob6Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -18],
                    }),
                  },
                  {
                    translateY: blob6Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 22],
                    }),
                  },
                ],
              },
            ]}
          />

          {/* Header with Back Button */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Dental Chart</Text>

            <View style={{ width: 40 }} />
          </View>

          {/* Planning Submit/Cancel Buttons - Floating */}
          {!isEditModeActive && pendingPlanningRecords.length > 0 && (
            <>
              {/* Cancel Button (Left) */}
              <TouchableOpacity
                style={styles.planningCancelButton}
                onPress={handlePlanningCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.planningCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              {/* Submit Button (Right) */}
              <TouchableOpacity
                style={styles.planningSubmitButton}
                onPress={handlePlanningSubmit}
                activeOpacity={0.8}
              >
                <Text style={styles.planningSubmitButtonText}>Submit</Text>
              </TouchableOpacity>
            </>
          )}

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
                  {/* خطوط فاصلة أصفر في المنتصف */}
                  {/* الخط العمودي العلوي */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateY: toothAnims.verticalTopLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* الخط العمودي الأصفر الصغير في الأعلى بين رقم 1 و1 */}
                      <Line
                        x1="50"
                        y1="-30"
                        x2="50"
                        y2="-10"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* الخط العمودي السفلي */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateY: toothAnims.verticalBottomLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* الخط العمودي الأصفر الصغير في الأسفل بين رقم 1 و1 للفك السفلي */}
                      <Line
                        x1="50"
                        y1="110"
                        x2="50"
                        y2="130"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* الخط الأفقي الأيسر */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateX: toothAnims.horizontalLeftLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* الخط الأفقي الأصفر الصغير بين 8 و 8 على اليسار */}
                      <Line
                        x1="10"
                        y1="50"
                        x2="30"
                        y2="50"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* الخط الأفقي الأيمن */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateX: toothAnims.horizontalRightLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* الخط الأفقي الأصفر الصغير بين 8 و 8 على اليمين */}
                      <Line
                        x1="70"
                        y1="50"
                        x2="90"
                        y2="50"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* Oral Hygiene Container - حاوية في المنتصف */}
                  <Animated.View style={[
                    {
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      zIndex: isOralHygieneExpanded ? 10001 : 800,
                      elevation: isOralHygieneExpanded ? 10001 : 800,
                      opacity: Animated.multiply(toothAnims.buttonsOpacity, toothAnims.oralHygieneOpacity),
                    }
                  ]} pointerEvents={selectedTooth ? "none" : "auto"}>
                    <Animated.View
                      style={[
                        {
                          paddingHorizontal: 16,
                          paddingVertical: 4,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.1,
                          shadowRadius: 12,
                        },
                        {
                          width: oralHygieneExpandAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [140, SCREEN_WIDTH * 0.75]
                          }),
                          height: oralHygieneExpandAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [38, 320]
                          }),
                          backgroundColor: isOralHygieneExpanded ? 'rgba(254, 215, 170, 0.2)' : 'rgba(251, 191, 36, 0.1)',
                          borderColor: isOralHygieneExpanded ? 'rgba(254, 215, 170, 0.5)' : 'rgba(255, 255, 255, 0.5)',
                          transform: [
                            {
                              translateX: oralHygieneExpandAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-70, -(SCREEN_WIDTH * 0.75) / 2]
                              })
                            },
                            {
                              translateY: oralHygieneExpandAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-19, -160]
                              })
                            }
                          ],
                          overflow: 'hidden',
                        }
                      ]}
                    >
                    <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill}>
                      <View style={{ flex: 1, backgroundColor: isOralHygieneExpanded ? 'rgba(254, 215, 170, 0.3)' : 'rgba(251, 191, 36, 0.15)' }}>
                        <TouchableOpacity
                          onPress={handleOralHygienePress}
                          activeOpacity={0.8}
                          style={{ width: '100%' }}
                        >
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: isOralHygieneExpanded ? 14 : 8,
                            width: '100%',
                            gap: 10
                          }}>
                            {isOralHygieneExpanded && (
                              <Ionicons name="fitness-outline" size={24} color="#92400E" />
                            )}
                            <Text style={[
                              styles.oralHygieneText,
                              isOralHygieneExpanded && { fontSize: 20, fontWeight: '800', letterSpacing: 0.8 }
                            ]}>Oral Hygiene</Text>
                            {isOralHygieneExpanded && (
                              <Ionicons name="chevron-up" size={20} color="#92400E" />
                            )}
                          </View>
                          {isOralHygieneExpanded && (
                            <View style={{
                              width: '85%',
                              height: 2.5,
                              backgroundColor: '#92400E',
                              borderRadius: 2,
                              alignSelf: 'center',
                              marginTop: 8
                            }} />
                          )}
                        </TouchableOpacity>

                    {isOralHygieneExpanded && (
                      <ScrollView style={{ flex: 1, padding: 16, paddingTop: 20 }} showsVerticalScrollIndicator={false}>
                        {/* زر Scaling Done */}
                        <TouchableOpacity
                          style={[styles.scalingButton, {
                            overflow: 'hidden',
                            ...Platform.select({
                              ios: {
                                shadowColor: '#059669',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.25,
                                shadowRadius: 8,
                              }
                            })
                          }]}
                          onPress={handleAddScaling}
                          activeOpacity={0.7}
                        >
                          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill}>
                            <View style={{
                              flex: 1,
                              backgroundColor: 'rgba(16, 185, 129, 0.25)',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 10
                            }}>
                              <Ionicons name="checkmark-circle" size={22} color="#059669" />
                              <Text style={[styles.scalingButtonText, { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }]}>Scaling Done</Text>
                            </View>
                          </BlurView>
                        </TouchableOpacity>

                        {/* سجلات الـ Scaling */}
                        {scalingRecords.length > 0 && (
                          <View style={[styles.scalingRecordsContainer, {
                            backgroundColor: 'rgba(255, 255, 255, 0.6)',
                            borderRadius: 16,
                            padding: 16,
                            marginTop: 4,
                            ...Platform.select({
                              ios: {
                                shadowColor: '#92400E',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.1,
                                shadowRadius: 6,
                              }
                            })
                          }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                              <Ionicons name="file-tray-full" size={20} color="#92400E" />
                              <Text style={[styles.scalingRecordsTitle, { fontSize: 15, fontWeight: '700', marginBottom: 0 }]}>Scaling Records</Text>
                            </View>
                            {scalingRecords.map((record, index) => (
                              <View key={index} style={[styles.scalingRecordItem, {
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                padding: 14,
                                borderRadius: 12,
                                marginBottom: index === scalingRecords.length - 1 ? 0 : 10,
                                borderWidth: 1,
                                borderColor: 'rgba(254, 215, 170, 0.4)',
                                ...Platform.select({
                                  ios: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 1 },
                                    shadowOpacity: 0.06,
                                    shadowRadius: 3,
                                  }
                                })
                              }]}>
                                <View style={[styles.scalingRecordIcon, {
                                  width: 38,
                                  height: 38,
                                  borderRadius: 10,
                                  backgroundColor: 'rgba(254, 215, 170, 0.3)',
                                  borderWidth: 1.5,
                                  borderColor: 'rgba(254, 215, 170, 0.6)'
                                }]}>
                                  <Ionicons name="medical" size={18} color="#92400E" />
                                </View>
                                <View style={[styles.scalingRecordInfo, { marginLeft: 12 }]}>
                                  <Text style={[styles.scalingRecordDoctor, { fontSize: 14, fontWeight: '600' }]}>{record.doctorName}</Text>
                                  <Text style={[styles.scalingRecordTime, { fontSize: 12, marginTop: 2 }]}>{record.timestamp}</Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() => {
                                    Alert.alert(
                                      'Delete Record',
                                      'Are you sure you want to delete this scaling record?',
                                      [
                                        {
                                          text: 'Cancel',
                                          style: 'cancel'
                                        },
                                        {
                                          text: 'Delete',
                                          style: 'destructive',
                                          onPress: async () => {
                                            // حذف من قاعدة البيانات
                                            const { error } = await deleteScalingRecord(record.id);

                                            if (error) {
                                              Alert.alert('Error', 'Failed to delete scaling record');
                                              console.error('Error deleting scaling record:', error);
                                              return;
                                            }

                                            // حذف من الـ state
                                            setScalingRecords(prev => prev.filter((_, i) => i !== index));
                                          }
                                        }
                                      ]
                                    );
                                  }}
                                  style={[styles.deleteRecordButton, {
                                    padding: 8,
                                    borderRadius: 8,
                                    backgroundColor: 'rgba(239, 68, 68, 0.08)'
                                  }]}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}
                      </ScrollView>
                    )}
                      </View>
                    </BlurView>
                    </Animated.View>
                  </Animated.View>

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
            <Animated.View
              style={[
                styles.referralContainer,
                {
                  transform: [{ translateX: toothAnims.referralContainerSlide }],
                  opacity: (isTreatmentRecordExpanded || isPlanningRecordExpanded) ? 0 : 1,
                  zIndex: isReferralExpanded ? 10010 : 10003,
                  elevation: isReferralExpanded ? 10010 : 10003,
                }
              ]}
              pointerEvents={isViewModeActive ? 'auto' : 'none'}
            >
              <View
                style={styles.referralTouchable}
                pointerEvents={isViewModeActive ? 'auto' : 'none'}
              >
                <BlurView
                  intensity={80}
                  tint="light"
                  style={styles.referralContent}
                >
                  <View style={styles.referralHeader}>
                    <Text style={styles.referralTitle}>
                      Need Referral For {Object.values(referrals).filter(val => val === true).length > 0 && `(${Object.values(referrals).filter(val => val === true).length})`}
                    </Text>
                  </View>

                  {/* Tab Buttons */}
                  <View style={{
                    flexDirection: 'row',
                    gap: 10,
                    paddingHorizontal: 16,
                    paddingTop: 12,
                    paddingBottom: 8,
                  }}>
                    <TouchableOpacity
                      onPress={() => setReferralTab('department')}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        backgroundColor: referralTab === 'department' ? '#0284C7' : 'rgba(186, 230, 253, 0.3)',
                        borderWidth: 1.5,
                        borderColor: referralTab === 'department' ? '#0284C7' : 'rgba(186, 230, 253, 0.6)',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: referralTab === 'department' ? '#FFFFFF' : '#0284C7',
                      }}>
                        Department
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setReferralTab('records')}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderRadius: 10,
                        backgroundColor: referralTab === 'records' ? '#0284C7' : 'rgba(186, 230, 253, 0.3)',
                        borderWidth: 1.5,
                        borderColor: referralTab === 'records' ? '#0284C7' : 'rgba(186, 230, 253, 0.6)',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: referralTab === 'records' ? '#FFFFFF' : '#0284C7',
                        }}
                      >
                        Referral Records
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Content Container - Always Visible - Dynamic Height */}
                  <View style={{
                    height: (
                      (referralTab === 'department' && Object.entries(referrals).some(([key, checked]) =>
                        checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
                      )) ||
                      (referralTab === 'records' && referralRecords.length > 0)
                    ) ? 320 : 70,
                    paddingHorizontal: 16,
                    paddingBottom: 8
                  }}>
                    {/* Department Tab Content */}
                    {referralTab === 'department' && (
                      <>
                        {/* Select Department */}
                        <TouchableOpacity
                          onPress={() => {
                            // فتح في وضع New - نظيف بدون تحديدات سابقة
                            setDepartmentModalMode('new');
                            // حفظ الحالة الحالية (للاحتفاظ بها في حال Cancel)
                            setSavedReferralsState(referrals);
                            setSavedSelectedReferralFor(selectedReferralFor);
                            // تهيئة الحالات المؤقتة - نظيفة تماماً
                            setTempReferrals({
                              endodontics: false,
                              oralSurgery: false,
                              orthodontics: false,
                              periodontics: false,
                              prosthodontics: false,
                              oralMedicine: false,
                            });
                            setTempSelectedReferralFor({});
                            setShowDepartmentModal(true);
                          }}
                          style={{
                            marginTop: 4,
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderWidth: 1.5,
                            borderColor: 'rgba(186, 230, 253, 0.6)',
                            borderRadius: 12,
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                            Select Department
                          </Text>
                          <Ionicons name="chevron-forward" size={20} color="#7DD3FC" />
                        </TouchableOpacity>

                        {/* Selected Departments Display - Below Input with ScrollView */}
                        {Object.entries(referrals).some(([_, checked]) => checked) && (
                          <View>
                              <ScrollView
                                style={{ marginTop: 10, maxHeight: 242 }}
                                contentContainerStyle={{ paddingBottom: 100 }}
                                showsVerticalScrollIndicator={true}
                                nestedScrollEnabled={true}
                                scrollEnabled={true}
                                onScrollBeginDrag={() => {
                                  // إغلاق القائمة عند بدء السكرول
                                  if (openReferralMenu !== null) {
                                    setOpenReferralMenu(null);
                                  }
                                }}
                              >
                                {Object.entries(referrals).map(([key, checked]) => {
                              if (!checked) return null;
                              // إخفاء القسم إذا كانت حالته "given"
                              if (referralStatus[key as keyof typeof referralStatus] === 'given') return null;

                              // العثور على الأسنان المحالة لهذا القسم
                              const referredTeeth = Object.entries(selectedReferralFor)
                                .filter(([_, referralKeys]) => referralKeys?.includes(key))
                                .map(([toothNumber, _]) => Number(toothNumber));

                              return (
                                <View
                                  key={key}
                                  style={{
                                    backgroundColor: 'rgba(224, 242, 254, 0.95)',
                                    borderWidth: 2,
                                    borderColor: 'rgba(56, 189, 248, 0.5)',
                                    borderRadius: 14,
                                    padding: 16,
                                    marginBottom: 12,
                                    shadowColor: '#0284C7',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 4,
                                    elevation: openReferralMenu === key ? 1000 : 3,
                                    zIndex: openReferralMenu === key ? 1000 : 1,
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: referredTeeth.length > 0 ? 8 : 0 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                                      {getReferralName(key)}
                                    </Text>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      {/* Three-dot menu button */}
                                      <TouchableOpacity
                                        onPress={() => setOpenReferralMenu(openReferralMenu === key ? null : key)}
                                        style={{
                                          padding: 6,
                                          borderRadius: 6,
                                          backgroundColor: 'rgba(148, 163, 184, 0.1)',
                                        }}
                                      >
                                        <Ionicons name="ellipsis-horizontal" size={18} color="#64748B" />
                                      </TouchableOpacity>

                                      {/* Not Given / Given button */}
                                      <TouchableOpacity
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        const currentStatus = referralStatus[key as keyof typeof referralStatus];

                                        if (currentStatus === 'not_given') {
                                          //  تحديث حالة التحويلات في قاعدة البيانات إلى given
                                          if (permanentPatientId) {
                                            const referralTypeMap: Record<string, string> = {
                                              'endodontics': 'Endodontics',
                                              'oralSurgery': 'Oral Surgery',
                                              'orthodontics': 'Orthodontics',
                                              'prosthodontics': 'Prosthodontics',
                                              'periodontics': 'Periodontics',
                                              'pediatricDentistry': 'Pediatric Dentistry',
                                            };

                                            const referralName = referralTypeMap[key] || key;

                                            // تحديث حالة جميع التحويلات من هذا النوع إلى given
                                            supabase
                                              .from('referrals')
                                              .update({
                                                status: 'given',
                                                given_at: new Date().toISOString()
                                              })
                                              .eq('permanent_patient_id', permanentPatientId)
                                              .eq('referral_type', referralName)
                                              .eq('status', 'not_given')
                                              .then(({ error }) => {
                                                if (error) {
                                                  console.error(' Error updating referral status:', error);
                                                } else {
                                                  console.log(' Referrals marked as given in database:', referralName);
                                                  // إعادة تحميل البيانات لتحديث Referral Records
                                                  loadPatientDentalData();
                                                }
                                              });
                                          }

                                          // إلغاء تحديد القسم بعد given (سيختفي من Department tab)
                                          setReferrals(prev => ({ ...prev, [key]: false }));
                                          // مسح الأسنان المحالة لهذا القسم
                                          setSelectedReferralFor(prev => {
                                            const newReferrals = { ...prev };
                                            Object.keys(newReferrals).forEach(toothNumber => {
                                              const referralKeys = newReferrals[toothNumber];
                                              if (referralKeys?.includes(key)) {
                                                // Remove this key from the array
                                                const updatedKeys = referralKeys.filter(k => k !== key);
                                                if (updatedKeys.length === 0) {
                                                  delete newReferrals[toothNumber];
                                                } else {
                                                  newReferrals[toothNumber] = updatedKeys;
                                                }
                                              }
                                            });
                                            return newReferrals;
                                          });
                                        }

                                        setReferralStatus(prev => ({
                                          ...prev,
                                          [key]: currentStatus === 'given' ? 'not_given' : 'given'
                                        }));
                                      }}
                                      style={{
                                        backgroundColor: referralStatus[key as keyof typeof referralStatus] === 'given'
                                          ? 'rgba(34, 197, 94, 0.15)'
                                          : 'rgba(156, 163, 175, 0.2)',
                                        paddingVertical: 6,
                                        paddingHorizontal: 12,
                                        borderRadius: 8,
                                        borderWidth: 1,
                                        borderColor: referralStatus[key as keyof typeof referralStatus] === 'given'
                                          ? 'rgba(34, 197, 94, 0.3)'
                                          : 'rgba(156, 163, 175, 0.4)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 13,
                                        fontWeight: '600',
                                        color: referralStatus[key as keyof typeof referralStatus] === 'given'
                                          ? '#16A34A'
                                          : '#6B7280',
                                      }}>
                                        {referralStatus[key as keyof typeof referralStatus] === 'given' ? 'Given' : 'Not Given'}
                                      </Text>
                                    </TouchableOpacity>
                                    </View>
                                  </View>

                                  {/* عرض الأسنان المحالة - دائماً */}
                                  {referredTeeth.length > 0 && (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                      {referredTeeth.map(toothNumber => (
                                        <ToothNumberBadge key={`${key}-${toothNumber}`} toothNumber={toothNumber} />
                                      ))}
                                    </View>
                                  )}

                                  {/* Three-dot Menu Modal */}
                                  {openReferralMenu === key && (
                                    <View style={{
                                      position: 'absolute',
                                      top: 40,
                                      right: 10,
                                      backgroundColor: 'rgba(224, 242, 254, 0.95)',
                                      borderRadius: 12,
                                      padding: 8,
                                      shadowColor: '#000',
                                      shadowOffset: { width: 0, height: 4 },
                                      shadowOpacity: 0.15,
                                      shadowRadius: 12,
                                      elevation: 1001,
                                      borderWidth: 1,
                                      borderColor: 'rgba(148, 163, 184, 0.2)',
                                      minWidth: 140,
                                      zIndex: 1001,
                                    }}>
                                      {/* Edit Button */}
                                      <TouchableOpacity
                                        onPress={() => {
                                          setOpenReferralMenu(null);
                                          // فتح في وضع Edit - مع التحديدات الحالية
                                          setDepartmentModalMode('edit');
                                          // فتح القسم المحدد تلقائياً لتعديل الأسنان
                                          setExpandedDepartment(key);
                                          setShowDepartmentModal(true);
                                        }}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          paddingVertical: 10,
                                          paddingHorizontal: 12,
                                          borderRadius: 8,
                                          backgroundColor: 'transparent',
                                        }}
                                      >
                                        <Ionicons name="create-outline" size={18} color="#3B82F6" />
                                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#3B82F6', marginLeft: 10 }}>Edit</Text>
                                      </TouchableOpacity>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(148, 163, 184, 0.15)', marginVertical: 4 }} />

                                      {/* Delete Button */}
                                      <TouchableOpacity
                                        onPress={async () => {
                                          setOpenReferralMenu(null);

                                          // Show confirmation alert
                                          Alert.alert(
                                            'Delete Referral',
                                            'Are you sure you want to delete this referral?',
                                            [
                                              {
                                                text: 'Cancel',
                                                style: 'cancel'
                                              },
                                              {
                                                text: 'Delete',
                                                style: 'destructive',
                                                onPress: async () => {
                                                  if (permanentPatientId) {
                                                    const referralTypeMap: Record<string, string> = {
                                                      'endodontics': 'Endodontics',
                                                      'oralSurgery': 'Oral Surgery',
                                                      'orthodontics': 'Orthodontics',
                                                      'prosthodontics': 'Prosthodontics',
                                                      'periodontics': 'Periodontics',
                                                      'oralMedicine': 'Oral Medicine',
                                                    };

                                                    const referralName = referralTypeMap[key] || key;

                                                    // Delete all referrals of this type for this patient
                                                    const { error } = await supabase
                                                      .from('referrals')
                                                      .delete()
                                                      .eq('permanent_patient_id', permanentPatientId)
                                                      .eq('referral_type', referralName)
                                                      .eq('status', 'not_given');

                                                    if (error) {
                                                      console.error('Error deleting referral:', error);
                                                      Alert.alert('Error', 'Failed to delete referral');
                                                    } else {
                                                      // Update UI
                                                      setReferrals(prev => ({ ...prev, [key]: false }));
                                                      setSelectedReferralFor(prev => {
                                                        const newReferrals = { ...prev };
                                                        Object.keys(newReferrals).forEach(toothNumber => {
                                                          const referralKeys = newReferrals[toothNumber];
                                                          if (referralKeys?.includes(key)) {
                                                            const updatedKeys = referralKeys.filter(k => k !== key);
                                                            if (updatedKeys.length === 0) {
                                                              delete newReferrals[toothNumber];
                                                            } else {
                                                              newReferrals[toothNumber] = updatedKeys;
                                                            }
                                                          }
                                                        });
                                                        return newReferrals;
                                                      });
                                                      // Reload patient data
                                                      loadPatientDentalData();
                                                    }
                                                  }
                                                }
                                              }
                                            ]
                                          );
                                        }}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          paddingVertical: 10,
                                          paddingHorizontal: 12,
                                          borderRadius: 8,
                                          backgroundColor: 'transparent',
                                        }}
                                      >
                                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444', marginLeft: 10 }}>Delete</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </ScrollView>
                          </View>
                        )}
                      </>
                    )}

                    {/* Referral Records Tab Content */}
                    {referralTab === 'records' && (
                      <ScrollView
                        style={{ marginTop: 4, maxHeight: 290 }}
                        showsVerticalScrollIndicator={true}
                      >
                        {referralRecords.length === 0 ? (
                          <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 20 }}>
                            No referral records yet
                          </Text>
                        ) : (
                          referralRecords
                            .sort((a, b) => b.timestampNum - a.timestampNum)
                            .map((record, index) => (
                              <View
                                key={index}
                                style={{
                                  backgroundColor: 'rgba(224, 242, 254, 0.95)',
                                  borderWidth: 2,
                                  borderColor: 'rgba(56, 189, 248, 0.5)',
                                  borderRadius: 14,
                                  padding: 16,
                                  marginBottom: 12,
                                  shadowColor: '#0284C7',
                                  shadowOffset: { width: 0, height: 2 },
                                  shadowOpacity: 0.1,
                                  shadowRadius: 4,
                                  elevation: 3,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                                    {record.departmentName}
                                  </Text>
                                  <View
                                    style={{
                                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                      paddingVertical: 4,
                                      paddingHorizontal: 10,
                                      borderRadius: 8,
                                      borderWidth: 1,
                                      borderColor: 'rgba(34, 197, 94, 0.3)',
                                    }}
                                  >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>
                                      Given
                                    </Text>
                                  </View>
                                </View>

                                {record.teeth.length > 0 && (
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                    {record.teeth.map((toothNumber, idx) => (
                                      <ToothNumberBadge key={`${record.id}-${toothNumber}-${idx}`} toothNumber={toothNumber} />
                                    ))}
                                  </View>
                                )}

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                                    {record.doctorName}
                                  </Text>
                                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                                    {record.timestamp}
                                  </Text>
                                </View>
                              </View>
                            ))
                        )}
                      </ScrollView>
                    )}
                  </View>
                </BlurView>
              </View>
            </Animated.View>

            {/* Total Treatment Record Container */}
            <Animated.View
              style={[
                styles.treatmentRecordContainer,
                {
                  transform: [
                    { translateX: toothAnims.treatmentRecordSlide },
                    { translateY: toothAnims.treatmentRecordPushDown }
                  ],
                  paddingTop: isTreatmentRecordExpanded ? 20 : (
                    REFERRAL_HEADER_HEIGHT +
                    ((
                      (referralTab === 'department' && Object.entries(referrals).some(([key, checked]) =>
                        checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
                      )) ||
                      (referralTab === 'records' && referralRecords.length > 0)
                    ) ? REFERRAL_CONTENT_MAX : REFERRAL_CONTENT_MIN) +
                    CONTAINER_SPACING
                  ),
                  paddingHorizontal: isTreatmentRecordExpanded ? 0 : 20,
                  zIndex: isTreatmentRecordExpanded ? 10005 : 10002,
                  elevation: isTreatmentRecordExpanded ? 10005 : 10002,
                  opacity: isPlanningRecordExpanded ? 0 : 1
                }
              ]}
              pointerEvents={isViewModeActive ? 'auto' : 'none'}
            >
                {isTreatmentRecordExpanded ? (
                  <View
                    style={{
                      width: SCREEN_WIDTH * 0.85,
                      height: SCREEN_HEIGHT * 0.75,
                    }}
                  >
                    <BlurView
                      intensity={80}
                      tint="light"
                      style={[styles.additionalContent, {
                        width: '100%',
                        height: '100%',
                      }]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text style={styles.additionalTitle}>Total Treatment Record</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setIsTreatmentRecordExpanded(false);
                            Animated.spring(treatmentRecordExpandAnim, {
                              toValue: 0,
                              useNativeDriver: false,
                              friction: 8,
                              tension: 40,
                            }).start();
                          }}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 22, fontWeight: '700', color: '#9CA3AF' }}>✕</Text>
                        </TouchableOpacity>
                      </View>

                  {/* محتوى السجلات العلاجية */}
                  {isTreatmentRecordExpanded && (
                    <ScrollView style={{ flex: 1, width: '100%', marginTop: 16, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                      {(() => {
                        // جمع جميع السجلات العلاجية
                        const allRecords: Array<{
                          type: 'treatment' | 'scaling';
                          toothNumber?: number;
                          treatment?: string;
                          details?: string;
                          surfaces?: string[];
                          timestamp: string;
                          timestampNum?: number;
                          doctorName: string;
                        }> = [];

                        // إضافة سجلات الأسنان (editing records فقط)
                        Object.entries(toothRecords).forEach(([toothNum, records]) => {
                          records.forEach((record) => {
                            if (record.type === 'editing') {
                              allRecords.push({
                                type: 'treatment',
                                toothNumber: parseInt(toothNum),
                                treatment: record.treatment,
                                details: record.details,
                                surfaces: record.surfaces,
                                timestamp: record.timestamp,
                                timestampNum: record.timestampNum,
                                doctorName: record.doctorName,
                              });
                            }
                          });
                        });

                        // إضافة سجلات السكيلنج
                        scalingRecords.forEach((record) => {
                          allRecords.push({
                            type: 'scaling',
                            timestamp: record.timestamp,
                            timestampNum: record.timestampNum,
                            doctorName: record.doctorName,
                          });
                        });

                        // ترتيب من الأحدث للأقدم - آخر إجراء في الأعلى
                        allRecords.sort((a, b) => {
                          // التأكد من وجود timestampNum صالح
                          let timeA = 0;
                          let timeB = 0;

                          if (a.timestampNum && !isNaN(a.timestampNum)) {
                            timeA = a.timestampNum;
                          } else {
                            const dateA = new Date(a.timestamp);
                            timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
                          }

                          if (b.timestampNum && !isNaN(b.timestampNum)) {
                            timeB = b.timestampNum;
                          } else {
                            const dateB = new Date(b.timestamp);
                            timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
                          }

                          return timeB - timeA; // الأحدث (الأكبر) في الأعلى
                        });

                        if (allRecords.length === 0) {
                          return (
                            <Text style={{ color: '#666', textAlign: 'center', paddingVertical: 20 }}>
                              No treatment records yet
                            </Text>
                          );
                        }

                        return allRecords.map((record, index) => (
                          <View
                            key={index}
                            style={{
                              backgroundColor: record.type === 'scaling'
                                ? 'rgba(16, 185, 129, 0.08)'
                                : 'rgba(37, 99, 235, 0.08)',
                              borderRadius: 18,
                              padding: 20,
                              marginBottom: 16,
                              borderWidth: 2,
                              borderColor: record.type === 'scaling'
                                ? 'rgba(16, 185, 129, 0.35)'
                                : 'rgba(37, 99, 235, 0.35)',
                              overflow: 'hidden',
                            }}
                          >
                            {record.type === 'scaling' ? (
                              <>
                                {/* Scaling Title with Badge */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                  <View style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 5,
                                    backgroundColor: '#047857',
                                    marginRight: 10,
                                    shadowColor: '#047857',
                                    shadowOffset: { width: 0, height: 0 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 4,
                                  }} />
                                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#047857', letterSpacing: 0.3 }}>
                                    Scaling Done
                                  </Text>
                                </View>

                                {/* Footer Info */}
                                <View style={{
                                  borderTopWidth: 1,
                                  borderTopColor: 'rgba(16, 185, 129, 0.2)',
                                  paddingTop: 12,
                                  marginTop: 8,
                                  gap: 6,
                                }}>
                                  <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                                    {record.timestamp}
                                  </Text>
                                  <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600' }}>
                                    Dr. {record.doctorName}
                                  </Text>
                                </View>
                              </>
                            ) : (
                              <>
                                {/* Tooth Info Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
                                  <ToothNumberBadge toothNumber={record.toothNumber} />
                                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#4B5563', letterSpacing: 0.2 }}>
                                    {getToothName(record.toothNumber).english}
                                  </Text>
                                </View>

                                {/* Treatment Details */}
                                <View style={{ gap: 8, marginBottom: 12 }}>
                                  <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                      Treatment:
                                    </Text>
                                    {record.treatment === 'Extraction' || record.treatment === 'Filling' || record.treatment === 'Pulpectomy' ? (
                                      <View style={{
                                        backgroundColor:
                                          record.treatment === 'Extraction'
                                            ? 'rgba(156, 163, 175, 0.15)'
                                            : record.treatment === 'Filling'
                                              ? 'rgba(16, 185, 129, 0.15)'
                                              : 'rgba(139, 92, 246, 0.15)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 4,
                                        borderRadius: 8,
                                        alignSelf: 'flex-start',
                                      }}>
                                        <Text style={{
                                          fontSize: 14,
                                          color: record.treatment === 'Extraction'
                                            ? '#4B5563'
                                            : record.treatment === 'Filling'
                                              ? '#047857'
                                              : '#7C3AED',
                                          fontWeight: '600'
                                        }}>
                                          {record.treatment}
                                        </Text>
                                      </View>
                                    ) : (
                                      <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                        {record.treatment}
                                      </Text>
                                    )}
                                  </View>

                                  {record.details && (
                                    <View style={{ flexDirection: 'row' }}>
                                      <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                        Details:
                                      </Text>
                                      <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                        {record.details}
                                      </Text>
                                    </View>
                                  )}

                                  <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                      Surfaces:
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                      {record.treatment === 'Extraction'
                                        ? 'N/A'
                                        : (record.surfaces && record.surfaces.length > 0
                                            ? record.surfaces.join(', ')
                                            : '-'
                                          )
                                      }
                                    </Text>
                                  </View>
                                </View>

                                {/* Footer Info */}
                                <View style={{
                                  borderTopWidth: 1,
                                  borderTopColor: 'rgba(37, 99, 235, 0.2)',
                                  paddingTop: 12,
                                  gap: 6,
                                }}>
                                  <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                                    {record.timestamp}
                                  </Text>
                                  <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>
                                    Dr. {record.doctorName}
                                  </Text>
                                </View>
                              </>
                            )}
                          </View>
                        ));
                      })()}
                    </ScrollView>
                  )}
                    </BlurView>
                  </View>
                ) : (
                  <View style={styles.referralTouchable}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        console.log('🎯 Total Treatment Record clicked!');
                        setIsTreatmentRecordExpanded(true);
                        Animated.spring(treatmentRecordExpandAnim, {
                          toValue: 1,
                          useNativeDriver: false,
                          friction: 8,
                          tension: 40,
                        }).start();
                      }}
                    >
                      <BlurView
                        intensity={80}
                        tint="light"
                        style={styles.additionalContent}
                      >
                        <Text style={styles.additionalTitle}>Total Treatment Record</Text>
                      </BlurView>
                    </TouchableOpacity>
                  </View>
                )}
            </Animated.View>

            {/* Total Planning Record Container */}
            <Animated.View
              style={[
                styles.planningRecordContainer,
                {
                  transform: [
                    { translateX: toothAnims.planningRecordSlide },
                    { translateY: toothAnims.planningRecordPushDown }
                  ],
                  paddingTop: isPlanningRecordExpanded ? 20 : (
                    REFERRAL_HEADER_HEIGHT +
                    ((
                      (referralTab === 'department' && Object.entries(referrals).some(([key, checked]) =>
                        checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
                      )) ||
                      (referralTab === 'records' && referralRecords.length > 0)
                    ) ? REFERRAL_CONTENT_MAX : REFERRAL_CONTENT_MIN) +
                    CONTAINER_SPACING +
                    TREATMENT_PLANNING_SPACING
                  ),
                  paddingHorizontal: isPlanningRecordExpanded ? 0 : 20,
                  zIndex: isPlanningRecordExpanded ? 10006 : 10001,
                  elevation: isPlanningRecordExpanded ? 10006 : 10001,
                  opacity: isTreatmentRecordExpanded ? 0 : 1
                }
              ]}
              pointerEvents={isViewModeActive ? 'auto' : 'none'}
            >
              {isPlanningRecordExpanded ? (
                // Expanded state - full view with scrollable records
                <View style={{ width: SCREEN_WIDTH * 0.85, height: SCREEN_HEIGHT * 0.75 }}>
                  <BlurView intensity={80} tint="light" style={[styles.additionalContent, { width: '100%', height: '100%' }]}>
                    {/* Header with title and close button */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <Text style={styles.additionalTitle}>Total Planning Record</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setIsPlanningRecordExpanded(false);
                          Animated.spring(planningRecordExpandAnim, {
                            toValue: 0,
                            useNativeDriver: false,
                            friction: 8,
                            tension: 40,
                          }).start();
                        }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 22, fontWeight: '700', color: '#9CA3AF' }}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Scrollable planning records list */}
                    <ScrollView style={{ flex: 1, width: '100%', marginTop: 16, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                      {(() => {
                        // استخدام القائمة العامة وترتيبها حسب timestampNum (الأحدث أولاً)
                        const sortedRecords = [...allPlanningRecordsGlobal].sort((a, b) => b.timestampNum - a.timestampNum);

                        if (sortedRecords.length === 0) {
                          return (
                            <Text style={{ color: '#666', textAlign: 'center', paddingVertical: 20 }}>
                              No planning records yet
                            </Text>
                          );
                        }

                        // فلترة: إخفاء السجلات القديمة التي تم استبدالها بسجلات جديدة (isChange: true)
                        const visibleRecords = sortedRecords.filter((record) => {
                          // إذا كان السجل تغيير (isChange: true)، نعرضه دائماً
                          if (record.isChange) {
                            return true;
                          }

                          // إذا كان السجل عادي (isChange: false)، نتحقق إذا تم استبداله
                          // نبحث عن سجل أحدث (timestampNum أكبر) لنفس السن مع isChange: true
                          const hasBeenReplaced = sortedRecords.some(r => {
                            if (r.toothNumber !== record.toothNumber) return false;
                            if (r.timestampNum <= record.timestampNum) return false; // يجب أن يكون أحدث
                            if (r.isChange !== true) return false;
                            if (r.previousCondition?.toLowerCase() !== record.condition?.toLowerCase()) return false;

                            // حالة خاصة: Extraction يُستبدل بأي حالة جديدة على نفس السن
                            if (record.condition === 'Extraction') {
                              return true; // إخفاء Extraction القديم
                            }

                            // للحالات الأخرى: نتحقق من تطابق السطح
                            return r.surfaces.some(newSurf => {
                              const newSurfName = newSurf.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
                              return record.surfaces.some(oldSurf => {
                                const oldSurfName = oldSurf.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
                                return newSurfName === oldSurfName;
                              });
                            });
                          });

                          // إذا تم استبداله، نخفيه
                          if (hasBeenReplaced) {
                            console.log(`🚫 Hiding replaced record: ${record.condition} on tooth ${record.toothNumber}`);
                            return false;
                          }

                          // وإلا نعرضه
                          return true;
                        });

                        // تجميع السجلات حسب القواعد التالية:
                        // 1. السجلات من نفس السن + نفس النوع (diagnosed أو canceled) تُجمع معًا في كرت واحد
                        // 2. التغييرات (isChange) تظهر في نفس الكرت حتى لو من طبيب مختلف
                        // 3. إذا تغير النوع (من diagnosed إلى canceled أو العكس)، كرت جديد
                        type RecordGroup = {
                          toothNumber: number;
                          doctorName: string;
                          action: 'diagnosed' | 'canceled';
                          records: typeof visibleRecords;
                        };

                        const groupedRecords: RecordGroup[] = [];

                        visibleRecords.forEach((record) => {
                          const lastGroup = groupedRecords[groupedRecords.length - 1];

                          // شروط بدء مجموعة جديدة:
                          const shouldStartNewGroup =
                            !lastGroup ||
                            lastGroup.toothNumber !== record.toothNumber || // سن مختلف
                            lastGroup.action !== record.action; // نوع مختلف (diagnosed ≠ canceled)

                          if (shouldStartNewGroup) {
                            groupedRecords.push({
                              toothNumber: record.toothNumber,
                              doctorName: record.doctorName,
                              action: record.action,
                              records: [record]
                            });
                          } else {
                            lastGroup.records.push(record);
                          }
                        });

                        // عرض كل مجموعة في كرت واحد
                        return groupedRecords.map((group, groupIndex) => {
                          // جمع كل الـ surfaces والـ conditions من السجلات في المجموعة
                          const allSurfaces: string[] = [];
                          const allConditions: string[] = [];

                          // جمع surfaces من السجلات الجديدة (isChange: true) فقط
                          const changedSurfaces: string[] = [];

                          group.records.forEach(rec => {
                            if (rec.condition && !allConditions.includes(rec.condition)) {
                              allConditions.push(rec.condition);
                            }
                            if (rec.surfaces) {
                              rec.surfaces.forEach(surf => {
                                if (!allSurfaces.includes(surf)) {
                                  allSurfaces.push(surf);
                                }
                              });
                            }
                            // إذا كان السجل تغيير، أضف أسطحه للقائمة المنفصلة
                            if (rec.isChange && rec.surfaces) {
                              rec.surfaces.forEach(surf => {
                                if (!changedSurfaces.includes(surf)) {
                                  changedSurfaces.push(surf);
                                }
                              });
                            }
                          });

                          // استخدام timestamp أول سجل في المجموعة (الأحدث)
                          const firstRecord = group.records[0];

                          return (
                            <View
                              key={groupIndex}
                              style={{
                                backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                borderRadius: 18,
                                padding: 20,
                                marginBottom: 16,
                                borderWidth: 2,
                                borderColor: 'rgba(37, 99, 235, 0.35)',
                                overflow: 'hidden',
                              }}
                            >
                              {/* Tooth Info Header */}
                              <View style={{ marginBottom: 14 }}>
                                {/* Row 1: Tooth Badge + Name */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                  <ToothNumberBadge toothNumber={group.toothNumber} />
                                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#4B5563', letterSpacing: 0.2 }}>
                                    {getToothName(group.toothNumber).english}
                                  </Text>
                                </View>

                                {/* Row 2: Diagnosed/Canceled Badge */}
                                <View
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    backgroundColor: group.action === 'diagnosed' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                                    alignSelf: 'flex-start',
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: group.action === 'diagnosed' ? '#D97706' : '#6B7280' }}>
                                    {group.action === 'diagnosed' ? 'Diagnosed' : 'Canceled'}
                                  </Text>
                                </View>
                              </View>

                              {/* عرض رسالة التغيير إذا كان السجل تغييراً */}
                              {(() => {
                                console.log('🔍 Planning Record Debug:', {
                                  toothNumber: group.toothNumber,
                                  condition: firstRecord.condition,
                                  isChange: firstRecord.isChange,
                                  previousCondition: firstRecord.previousCondition,
                                  doctorName: group.doctorName
                                });
                                return null;
                              })()}
                              {firstRecord.isChange && (
                                <View style={{
                                  backgroundColor: 'rgba(251, 146, 60, 0.1)',
                                  borderWidth: 2,
                                  borderColor: 'rgba(251, 146, 60, 0.3)',
                                  padding: 16,
                                  borderRadius: 12,
                                  marginBottom: 12
                                }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ fontSize: 18, marginRight: 8 }}>🔄</Text>
                                    <Text style={{ fontSize: 15, color: '#EA580C', fontWeight: '700', letterSpacing: 0.3 }}>
                                      Condition Changed
                                    </Text>
                                  </View>

                                  <View style={{ gap: 6, marginBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '600', marginRight: 6 }}>−</Text>
                                      <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '500', textDecorationLine: 'line-through' }}>
                                        {firstRecord.previousCondition}
                                      </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <Text style={{ fontSize: 16, color: '#059669', fontWeight: '600', marginRight: 6 }}>+</Text>
                                      <Text style={{ fontSize: 14, color: '#059669', fontWeight: '600' }}>
                                        {firstRecord.condition}
                                      </Text>
                                    </View>
                                  </View>

                                  {changedSurfaces.length > 0 && (
                                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                                      <Text style={{ fontSize: 13, color: '#EA580C', fontWeight: '600', minWidth: 70 }}>
                                        Surfaces:
                                      </Text>
                                      <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '500', flex: 1 }}>
                                        {changedSurfaces.join(', ')}
                                      </Text>
                                    </View>
                                  )}

                                  <View style={{
                                    borderTopWidth: 1,
                                    borderTopColor: 'rgba(251, 146, 60, 0.2)',
                                    paddingTop: 8,
                                    marginTop: 4
                                  }}>
                                    <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '600' }}>
                                      Modified by: Dr. {group.doctorName}
                                    </Text>
                                  </View>
                                </View>
                              )}

                              {/* Planning Details */}
                              <View style={{ gap: 8, marginBottom: 12 }}>
                                {!firstRecord.isChange && allConditions.length > 0 && (() => {
                                  // حالة خاصة: Root Canal Treated
                                  // Root Canal Treated يُحفظ كـ condition="Tooth Status", surfaces=['Root Canal Treated']
                                  const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

                                  console.log('🔍 Planning Details Debug:', {
                                    toothNumber: group.toothNumber,
                                    allConditions,
                                    allSurfaces,
                                    hasRootCanalTreated,
                                    recordsCount: group.records.length,
                                    records: group.records.map(r => ({ condition: r.condition, surfaces: r.surfaces }))
                                  });

                                  if (hasRootCanalTreated) {
                                    console.log(' Root Canal Treated detected! Special rendering...');

                                    // فصل Root Canal Treated عن باقي الأسطح
                                    const otherSurfaces = allSurfaces.filter(s => s !== 'Root Canal Treated');

                                    return (
                                      <>
                                        {/* عرض Root Canal Treated كـ Condition رئيسي */}
                                        <View style={{ flexDirection: 'row' }}>
                                          <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                            Condition:
                                          </Text>
                                          <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                            Root Canal Treated
                                          </Text>
                                        </View>

                                        {/* عرض باقي الأسطح تحت Surfaces */}
                                        {otherSurfaces.length > 0 && (
                                          <View style={{ flexDirection: 'row' }}>
                                            <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                              Surfaces:
                                            </Text>
                                            <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                              {otherSurfaces.join(', ')}
                                            </Text>
                                          </View>
                                        )}
                                      </>
                                    );
                                  } else {
                                    // الحالة العادية: عرض كل الـ conditions بدون معالجة خاصة
                                    return (
                                      <View style={{ flexDirection: 'row' }}>
                                        <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                          Condition:
                                        </Text>
                                        <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                          {allConditions.join(', ')}
                                        </Text>
                                      </View>
                                    );
                                  }
                                })()}

                                {!firstRecord.isChange && allSurfaces.length > 0 && !allConditions.includes('Extraction') && !allSurfaces.some(s => s === 'Root Canal Treated') && (
                                  <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                      Surfaces:
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                      {allSurfaces.join(', ')}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {/* Footer Info */}
                              <View style={{
                                borderTopWidth: 1,
                                borderTopColor: 'rgba(37, 99, 235, 0.2)',
                                paddingTop: 12,
                                gap: 6,
                              }}>
                                <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                                  {firstRecord.timestamp}
                                </Text>
                                <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>
                                  Dr. {group.doctorName}
                                </Text>
                              </View>

                              {/* عرض مؤقت للتحقق من الترتيب */}
                              <Text style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                                Group #{groupIndex + 1} - {group.records.length} record(s)
                              </Text>
                            </View>
                          );
                        });
                      })()}
                    </ScrollView>
                  </BlurView>
                </View>
              ) : (
                // Collapsed state - small card
                <View style={styles.referralTouchable}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      console.log('🎯 Total Planning Record clicked!');
                      setIsPlanningRecordExpanded(true);
                      Animated.spring(planningRecordExpandAnim, {
                        toValue: 1,
                        useNativeDriver: false,
                        friction: 8,
                        tension: 40,
                      }).start();
                    }}
                  >
                    <BlurView intensity={80} tint="light" style={styles.additionalContent}>
                      <Text style={styles.additionalTitle}>Total Planning Record</Text>
                    </BlurView>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          </ScrollView>

        {/* طبقة شفافة للنقر عليها لإغلاق الأسنان 1-32 - تغطي كل الشاشة ماعدا منطقة السن */}
      {selectedTooth && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(selectedTooth) && !showConditionMenu && !isClosing && (() => {
        // حساب حدود السن المكبر
        // Tiny teeth (6,7,8,9,10,11,22,23,24,25,26,27): 37x47، Medium teeth (1-5,12-21,28-32): 33x42
        const isTinyTooth = [6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27].includes(selectedTooth);
        const originalWidth = isTinyTooth ? 37 : 33;
        const originalHeight = isTinyTooth ? 47 : 42;
        // للأسنان المدورة ±90 درجة (1-32)، نعكس الأبعاد
        const isRotatedTooth = selectedTooth >= 1 && selectedTooth <= 32;
        let toothWidth = (isRotatedTooth ? originalHeight : originalWidth) * 8;
        let toothHeight = (isRotatedTooth ? originalWidth : originalHeight) * 8;

        let centerX = SCREEN_WIDTH / 2 - 20;
        let centerY = SCREEN_HEIGHT / 2;

        // حساب يدوي مستقل للأسنان 6, 7, 8, 9, 10, 11 (8, 7, 6 يمين ويسار فوق)
        if (selectedTooth === 6 || selectedTooth === 7 || selectedTooth === 8 || selectedTooth === 9 || selectedTooth === 10 || selectedTooth === 11) {
          // قيم يدوية للطبقة الشفافة
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 - 20; // مركز الشاشة أفقياً - زيح لليسار
          centerY = SCREEN_HEIGHT / 2 + 69; // تنزيل للأسفل - رفع نقطة
          toothWidth = originalToothHeight * 8; // 47 * 8 = 376 (بعد الدوران)
          toothHeight = originalToothWidth * 8; // 37 * 8 = 296 (بعد الدوران)
        }

        // حساب يدوي مستقل للأسنان 25, 26, 27 (8, 7, 6 تحت يسار) - نفس إعدادات 8, 7, 6 فوق
        if (selectedTooth === 25 || selectedTooth === 26 || selectedTooth === 27) {
          // قيم يدوية للطبقة الشفافة
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 + 30; // إلى اليمين
          centerY = SCREEN_HEIGHT / 2 + 50; // رفع قليلاً
          toothWidth = originalToothHeight * 8; // 47 * 8 = 376 (بعد الدوران)
          toothHeight = originalToothWidth * 8; // 37 * 8 = 296 (بعد الدوران)
        }

        // حساب يدوي مستقل للأسنان 22, 23, 24 (3, 2, 1 تحت يمين) - حجم أكبر
        if (selectedTooth === 22 || selectedTooth === 23 || selectedTooth === 24) {
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 + 10; // تحريك إلى اليسار
          centerY = SCREEN_HEIGHT / 2 + 30; // تنزيل للأسفل 20 بكسل
          toothWidth = originalToothHeight * 8; // 47 * 8 = 376 (حجم أكبر)
          toothHeight = originalToothWidth * 8; // 37 * 8 = 296 (حجم أكبر)
        }

        // حساب يدوي مستقل للأسنان 17-21 (8-4 تحت يمين) - حجم عادي
        if (selectedTooth >= 17 && selectedTooth <= 21) {
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 + 10; // تحريك إلى اليسار
          centerY = SCREEN_HEIGHT / 2 + 10; // رفع للأعلى 40 بكسل
          toothWidth = originalToothHeight * 7; // 47 * 7 = 329
          toothHeight = originalToothWidth * 7; // 37 * 7 = 259
        }

        // حساب يدوي مستقل للأسنان 4, 5, 12, 13 (5, 4 يمين ويسار فوق)
        if (selectedTooth === 4 || selectedTooth === 5 || selectedTooth === 12 || selectedTooth === 13) {
          // قيم يدوية للطبقة الشفافة
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2; // مركز الشاشة أفقياً
          centerY = SCREEN_HEIGHT / 2 + 90; // تنزيل للأسفل أكثر
          toothWidth = originalToothHeight * 7; // 47 * 7 = 329 (بعد الدوران - أصغر)
          toothHeight = originalToothWidth * 7; // 37 * 7 = 259 (بعد الدوران - أصغر)
        }

        // حساب يدوي مستقل للأسنان 1, 2, 3, 14, 15, 16 (3, 2, 1 يمين ويسار فوق)
        if (selectedTooth === 1 || selectedTooth === 2 || selectedTooth === 3 || selectedTooth === 14 || selectedTooth === 15 || selectedTooth === 16) {
          // قيم يدوية للطبقة الشفافة - نفس حجم الأسنان 4، 5
          centerX = SCREEN_WIDTH / 2; // مركز الشاشة أفقياً
          centerY = SCREEN_HEIGHT / 2 + 110; // تنزيل للأسفل أكثر
          toothWidth = 329; // نفس حجم الأسنان 4، 5
          toothHeight = 259; // نفس حجم الأسنان 4، 5
        }

        // حساب يدوي مستقل للأسنان 28-32 (8-4 تحت يسار)
        if (selectedTooth >= 28 && selectedTooth <= 32) {
          const originalToothWidth = 33; // medium tooth
          const originalToothHeight = 42; // medium tooth

          centerX = SCREEN_WIDTH / 2 + 10; // تحريك 30 بكسل إلى اليمين من الافتراضي (-20 + 30 = +10)
          centerY = SCREEN_HEIGHT / 2;
          toothWidth = originalToothHeight * 8; // 42 * 8 = 336 (بعد الدوران)
          toothHeight = originalToothWidth * 8; // 33 * 8 = 264 (بعد الدوران)
        }

        const toothTop = centerY - toothHeight / 2; // الحد العلوي للسن
        const toothBottom = centerY + toothHeight / 2; // الحد السفلي للسن
        const toothLeft = centerX - toothWidth / 2; // الحد الأيسر للسن
        const toothRight = centerX + toothWidth / 2; // الحد الأيمن للسن

        return (
          <>
            {/* المنطقة العلوية - من أعلى الشاشة حتى الحد العلوي للسن */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: SCREEN_WIDTH,
                  height: toothTop,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>

            {/* المنطقة السفلية - من الحد السفلي للسن حتى أسفل الشاشة */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: toothBottom,
                  left: 0,
                  width: SCREEN_WIDTH,
                  height: SCREEN_HEIGHT - toothBottom,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>

            {/* المنطقة اليسرى - من يسار الشاشة حتى الحد الأيسر للسن */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: toothTop,
                  left: 0,
                  width: toothLeft,
                  height: toothHeight,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>

            {/* المنطقة اليمنى - من الحد الأيمن للسن حتى يمين الشاشة */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: toothTop,
                  left: toothRight,
                  width: SCREEN_WIDTH - toothRight,
                  height: toothHeight,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>
          </>
        );
      })()}

      {/* Enlarged Tooth Overlay - لباقي الأسنان فقط (ليس الأسنان 1-8 و 25-32) */}
      {selectedTooth && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(selectedTooth) && (
        <Modal
          transparent
          visible={!!selectedTooth}
          animationType="fade"
          onRequestClose={handleCloseTooth}
        >
          <View style={styles.enlargedToothOverlay}>
            {/* Background dimmer */}
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleCloseTooth}
            />

            {/* Close button */}
            <TouchableOpacity
              style={styles.enlargedToothCloseButton}
              onPress={handleCloseTooth}
            >
              <Ionicons name="close-circle" size={50} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Enlarged tooth container */}
            <View style={styles.enlargedToothContainer}>
              {/* Render the enlarged tooth based on tooth number */}
              {[6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27].includes(selectedTooth) ? (
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[selectedTooth]}
                  onSurfacePress={(surface) => handleSurfacePress(surface)}
                  swapSides={selectedTooth >= 17 && selectedTooth <= 32}
                />
              ) : (
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[selectedTooth]}
                  onSurfacePress={(surface) => handleSurfacePress(surface)}
                  swapSides={selectedTooth >= 17 && selectedTooth <= 32}
                />
              )}

              {/* Tooth number display */}
              <View style={styles.enlargedToothNumberBadge}>
                <Text style={styles.enlargedToothNumberText}>{getToothLabel(selectedTooth)}</Text>
              </View>
            </View>
          </View>
        </Modal>
      )}

        {/* Condition Menu */}
        <ConditionMenu
          visible={showConditionMenu}
          onSelect={handleConditionSelect}
          onClose={handleConditionMenuClose}
          selectedSurface={selectedSurface}
          selectedTooth={selectedTooth}
        />

        {/* Tooth Details Modal - Edit Mode */}
        <Modal
          visible={showToothDetailsModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            // استعادة القيم الأصلية أو حذف القيم الجديدة عند الإغلاق دون Submit
            if (selectedToothForDetails) {
              // استعادة أو حذف Treatment
              setSelectedTreatments(prev => {
                const newState = { ...prev };
                if (originalValues.treatment) {
                  newState[selectedToothForDetails] = originalValues.treatment;
                } else {
                  delete newState[selectedToothForDetails];
                }
                return newState;
              });

              // استعادة أو حذف Details
              setSelectedDetails(prev => {
                const newState = { ...prev };
                if (originalValues.details) {
                  newState[selectedToothForDetails] = originalValues.details;
                } else {
                  delete newState[selectedToothForDetails];
                }
                return newState;
              });

              // استعادة أو حذف Surfaces
              setSelectedSurfaces(prev => {
                const newState = { ...prev };
                if (originalValues.surfaces && originalValues.surfaces.length > 0) {
                  newState[selectedToothForDetails] = [...originalValues.surfaces];
                } else {
                  delete newState[selectedToothForDetails];
                }
                return newState;
              });
            }

            setShowToothDetailsModal(false);
            setHasModalChanges(false);
            setShowNotesSection(false);
            setShowReferralSection(false);
            setIsEditMode(false);
            setCurrentNote('');
            setOriginalValues({});
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={{ width: '95%', height: '75%', borderRadius: 24, overflow: 'hidden' }}>
              <BlurView intensity={90} tint="light" style={styles.newModalContainer}>
                <View style={{ backgroundColor: 'rgba(240, 249, 255, 0.95)', flex: 1 }}>
                {/* Header */}
                <View style={styles.newModalHeader}>
                  <View style={[
                    styles.toothNumberBox,
                    selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'UL' && { borderLeftWidth: 2, borderBottomWidth: 2, borderLeftColor: '#1E3A8A', borderBottomColor: '#1E3A8A' },
                    selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'UR' && { borderRightWidth: 2, borderBottomWidth: 2, borderRightColor: '#1E3A8A', borderBottomColor: '#1E3A8A' },
                    selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'LL' && { borderLeftWidth: 2, borderTopWidth: 2, borderLeftColor: '#1E3A8A', borderTopColor: '#1E3A8A' },
                    selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'LR' && { borderRightWidth: 2, borderTopWidth: 2, borderRightColor: '#1E3A8A', borderTopColor: '#1E3A8A' },
                  ]}>
                    <Text style={styles.modalToothNumberText}>
                      {selectedToothForDetails ? getToothPositionNumber(selectedToothForDetails) : ''}
                    </Text>
                  </View>
                  <Text style={styles.modalToothNameText}>
                    {selectedToothForDetails ? getToothName(selectedToothForDetails).english : ''}
                  </Text>
                  <View style={styles.headerButtons}>
                    <TouchableOpacity
                      style={[styles.editButton, isEditMode && styles.editButtonActive]}
                      onPress={() => {
                        setIsEditMode(!isEditMode);
                        // عند إلغاء Edit mode، إلغاء أي تغييرات
                        if (isEditMode) {
                          setHasModalChanges(false);
                        }
                      }}
                    >
                      <Ionicons name="create-outline" size={24} color={isEditMode ? "#FFFFFF" : "#1E3A8A"} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        // استعادة القيم الأصلية أو حذف القيم الجديدة عند الإغلاق دون Submit
                        if (selectedToothForDetails) {
                          // استعادة أو حذف Treatment
                          setSelectedTreatments(prev => {
                            const newState = { ...prev };
                            if (originalValues.treatment) {
                              newState[selectedToothForDetails] = originalValues.treatment;
                            } else {
                              delete newState[selectedToothForDetails];
                            }
                            return newState;
                          });

                          // استعادة أو حذف Details
                          setSelectedDetails(prev => {
                            const newState = { ...prev };
                            if (originalValues.details) {
                              newState[selectedToothForDetails] = originalValues.details;
                            } else {
                              delete newState[selectedToothForDetails];
                            }
                            return newState;
                          });

                          // استعادة أو حذف Surfaces
                          setSelectedSurfaces(prev => {
                            const newState = { ...prev };
                            if (originalValues.surfaces && originalValues.surfaces.length > 0) {
                              newState[selectedToothForDetails] = [...originalValues.surfaces];
                            } else {
                              delete newState[selectedToothForDetails];
                            }
                            return newState;
                          });
                        }

                        setShowToothDetailsModal(false);
                        setHasModalChanges(false);
                        setShowNotesSection(false);
                        setShowReferralSection(false);
                        setIsEditMode(false);
                        setCurrentNote('');
                        setOriginalValues({});
                      }}
                      style={styles.closeButton}
                    >
                      <Ionicons name="close" size={24} color="#1E3A8A" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Header Divider */}
                <View style={styles.headerDivider} />

                {/* Tab Buttons */}
                <View style={styles.tabButtons}>
                  <TouchableOpacity
                    style={[styles.tabBtn, showRecordsSection && styles.tabBtnActive]}
                    onPress={() => {
                      setShowRecordsSection(true);
                      setShowDetailsSection(false);
                      setShowNotesSection(false);
                      setShowReferralSection(false);
                    }}
                  >
                    <Ionicons name="document-text-outline" size={22} color={showRecordsSection ? "#FFFFFF" : "#64748B"} />
                    <Text style={[styles.tabBtnText, showRecordsSection && styles.tabBtnTextActive]}>Records</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabBtn, showDetailsSection && styles.tabBtnActive]}
                    onPress={() => {
                      setShowDetailsSection(true);
                      setShowNotesSection(false);
                      setShowRecordsSection(false);
                      setShowReferralSection(false);
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={22} color={showDetailsSection ? "#FFFFFF" : "#64748B"} />
                    <Text style={[styles.tabBtnText, showDetailsSection && styles.tabBtnTextActive]}>Details</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabBtn, showNotesSection && styles.tabBtnActive]}
                    onPress={() => {
                      setShowNotesSection(true);
                      setShowDetailsSection(false);
                      setShowRecordsSection(false);
                      setShowReferralSection(false);
                      // Clear unread notes badge when opening notes
                      if (selectedToothForDetails) {
                        setUnreadNotes(prev => ({
                          ...prev,
                          [selectedToothForDetails]: 0
                        }));
                      }
                    }}
                  >
                    <View>
                      <Ionicons name="create-outline" size={22} color={showNotesSection ? "#FFFFFF" : "#64748B"} />
                      {selectedToothForDetails && unreadNotes[selectedToothForDetails] > 0 && (
                        <View style={styles.notificationBadge}>
                          <Text style={styles.notificationBadgeText}>
                            {unreadNotes[selectedToothForDetails]}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tabBtnText, showNotesSection && styles.tabBtnTextActive]}>Notes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabBtn, showReferralSection && styles.tabBtnActive]}
                    onPress={() => {
                      setShowReferralSection(true);
                      setShowDetailsSection(false);
                      setShowNotesSection(false);
                      setShowRecordsSection(false);
                    }}
                  >
                    <Ionicons name="arrow-redo-outline" size={22} color={showReferralSection ? "#FFFFFF" : "#64748B"} />
                    <Text style={[styles.tabBtnText, showReferralSection && styles.tabBtnTextActive]}>Referral</Text>
                  </TouchableOpacity>
                </View>

                {/* Content Sections */}
                <View style={{ flex: 1 }}>
                <ScrollView
                  style={styles.modalContent}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={true}
                >
                  {/* Main Container for All Sections */}
                  {!showRecordsSection && (
                  <View style={styles.mainSectionsContainer}>
                    {/* Details Section - Surfaces, Treatment, Details */}
                    {showDetailsSection && (
                      <>
                    {/* Surfaces Section - مخفي عند اختيار Extraction أو إذا كان السن Missing أو Extraction */}
                    {selectedToothForDetails && (() => {
                      const conditions = toothConditions[selectedToothForDetails];
                      const isMissingTooth = conditions && Object.values(conditions).every(condition => condition === 'missing');
                      const isExtractionTooth = conditions && Object.values(conditions).some(condition => condition === 'extraction');
                      return selectedTreatments[selectedToothForDetails] !== 'extraction' && !isMissingTooth && !isExtractionTooth;
                    })() && (
                    <>
                    <View style={styles.sectionRow}>
                    <View style={styles.sectionLabelContainer}>
                      <Ionicons name="layers-outline" size={20} color="#1E293B" />
                      <Text style={styles.sectionTitle}>Surfaces</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                      onPress={() => isEditMode && setShowSurfaceOptions(!showSurfaceOptions)}
                      disabled={!isEditMode}
                    >
                      <Ionicons name={showSurfaceOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                      <Text style={styles.dropdownText}>
                        {(() => {
                          if (!selectedToothForDetails) return 'Select';
                          const allSurfaces = selectedSurfaces[selectedToothForDetails] || [];
                          // فلترة الأسطح المعالجة والمتابعة - عرض المشاكل فقط
                          const conditions = toothConditions[selectedToothForDetails] || {};
                          const toothSurfaces = allSurfaces.filter(surface => {
                            const condition = conditions[surface as keyof ToothSurfaceConditions];
                            return condition !== 'treated' && condition !== 'permanent_filling' && condition !== 'follow_up';
                          });
                          if (toothSurfaces.length === 0) return 'Select';
                          const surfaceOptions = getAllSurfaces(selectedToothForDetails);
                          const labels = toothSurfaces.map(s => surfaceOptions.find(opt => opt.key === s)?.label).filter(Boolean);
                          return labels.join(', ') || 'Select';
                        })()}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Surface Options Modal */}
                  <Modal
                    visible={showSurfaceOptions && !!selectedToothForDetails}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowSurfaceOptions(false)}
                  >
                    <TouchableOpacity
                      style={styles.dropdownModalOverlay}
                      activeOpacity={1}
                      onPress={() => setShowSurfaceOptions(false)}
                    >
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => e.stopPropagation()}
                        style={{ width: '85%' }}
                      >
                        <View style={styles.dropdownModalContent}>
                          <Text style={styles.dropdownModalTitle}>Select Surfaces</Text>
                        <ScrollView
                          style={styles.dropdownModalList}
                          showsVerticalScrollIndicator={true}
                        >
                          {selectedToothForDetails && getAllSurfaces(selectedToothForDetails).map((surface) => {
                            const toothSurfaces = selectedSurfaces[selectedToothForDetails] || [];
                            const conditions = toothConditions[selectedToothForDetails] || {};
                            const surfaceCondition = conditions[surface.key as keyof ToothSurfaceConditions];
                            // إخفاء الأسطح المعالجة والمتابعة من الاختيار
                            const isSelected = toothSurfaces.includes(surface.key) &&
                                              surfaceCondition !== 'treated' &&
                                              surfaceCondition !== 'permanent_filling' &&
                                              surfaceCondition !== 'follow_up';

                            return (
                              <TouchableOpacity
                                key={surface.key}
                                style={styles.dropdownModalOption}
                                onPress={() => {
                                  if (!isEditMode || !selectedToothForDetails) return;

                                  const currentSurfaces = selectedSurfaces[selectedToothForDetails] || [];
                                  const newSurfaces = isSelected
                                    ? currentSurfaces.filter(s => s !== surface.key)
                                    : [...currentSurfaces, surface.key];

                                  setSelectedSurfaces(prev => ({
                                    ...prev,
                                    [selectedToothForDetails]: newSurfaces
                                  }));

                                  // Update toothConditions
                                  const existingConditions = toothConditions[selectedToothForDetails] || {};
                                  const updatedConditions: ToothSurfaceConditions = {
                                    top: null,
                                    bottom: null,
                                    left: null,
                                    right: null,
                                    center: null,
                                  };

                                  newSurfaces.forEach((surfaceKey) => {
                                    const key = surfaceKey as keyof ToothSurfaceConditions;
                                    updatedConditions[key] = existingConditions[key] || 'caries';
                                  });

                                  setToothConditions(prev => ({
                                    ...prev,
                                    [selectedToothForDetails]: updatedConditions
                                  }));

                                  // Mark that changes have been made
                                  setHasModalChanges(true);
                                }}
                              >
                                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                  {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                                </View>
                                <Text style={styles.optionText}>{surface.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>

                  <View style={styles.sectionDivider} />
                  </>
                  )}

                  {/* Treatment Section */}
                  <View style={styles.sectionRow}>
                    <View style={styles.sectionLabelContainer}>
                      <Ionicons name="medical-outline" size={20} color="#1E293B" />
                      <Text style={styles.sectionTitle}>Treatment</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                      onPress={() => isEditMode && setShowTreatmentOptions(!showTreatmentOptions)}
                      disabled={!isEditMode}
                    >
                      <Ionicons name={showTreatmentOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                      <Text style={styles.dropdownText}>
                        {selectedToothForDetails && selectedTreatments[selectedToothForDetails]
                          ? treatmentOptions.find(opt => opt.key === selectedTreatments[selectedToothForDetails])?.label || 'Select'
                          : 'Select'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Treatment Options Modal */}
                  <Modal
                    visible={showTreatmentOptions && !!selectedToothForDetails}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowTreatmentOptions(false)}
                  >
                    <TouchableOpacity
                      style={styles.dropdownModalOverlay}
                      activeOpacity={1}
                      onPress={() => setShowTreatmentOptions(false)}
                    >
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => e.stopPropagation()}
                        style={{ width: '85%' }}
                      >
                        <View style={styles.dropdownModalContent}>
                          <Text style={styles.dropdownModalTitle}>Select Treatment</Text>
                        <ScrollView
                          style={styles.dropdownModalList}
                          showsVerticalScrollIndicator={true}
                        >
                          {treatmentOptions.map((treatment) => {
                            const isSelected = selectedToothForDetails && selectedTreatments[selectedToothForDetails] === treatment.key;

                            return (
                              <TouchableOpacity
                                key={treatment.key}
                                style={styles.dropdownModalOption}
                                onPress={() => {
                                  if (!isEditMode || !selectedToothForDetails) return;

                                  setSelectedTreatments(prev => ({
                                    ...prev,
                                    [selectedToothForDetails]: treatment.key
                                  }));
                                  setShowTreatmentOptions(false);
                                  setHasModalChanges(true);
                                }}
                              >
                                <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
                                  {isSelected && <View style={styles.radioButtonInner} />}
                                </View>
                                <Text style={styles.optionText}>{treatment.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>

                  <View style={styles.sectionDivider} />

                  {/* Details Section - مخفي عند اختيار Extraction أو إذا كان السن Missing أو Extraction */}
                  {selectedToothForDetails && (() => {
                    const conditions = toothConditions[selectedToothForDetails];
                    const isMissingTooth = conditions && Object.values(conditions).every(condition => condition === 'missing');
                    const isExtractionTooth = conditions && Object.values(conditions).some(condition => condition === 'extraction');
                    return selectedTreatments[selectedToothForDetails] !== 'extraction' && !isMissingTooth && !isExtractionTooth;
                  })() && (
                  <>
                  <View style={styles.sectionRow}>
                    <View style={styles.sectionLabelContainer}>
                      <Ionicons name="list-outline" size={20} color="#1E293B" />
                      <Text style={styles.sectionTitle}>Details</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                      onPress={() => isEditMode && setShowDetailsOptions(!showDetailsOptions)}
                      disabled={!isEditMode}
                    >
                      <Ionicons name={showDetailsOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                      <Text style={styles.dropdownText}>
                        {selectedToothForDetails && selectedDetails[selectedToothForDetails]
                          ? detailsOptions.find(opt => opt.key === selectedDetails[selectedToothForDetails])?.label || 'Select'
                          : 'Select'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Details Options Modal */}
                  <Modal
                    visible={showDetailsOptions && !!selectedToothForDetails}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowDetailsOptions(false)}
                  >
                    <TouchableOpacity
                      style={styles.dropdownModalOverlay}
                      activeOpacity={1}
                      onPress={() => setShowDetailsOptions(false)}
                    >
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => e.stopPropagation()}
                        style={{ width: '85%' }}
                      >
                        <View style={styles.dropdownModalContent}>
                        <Text style={styles.dropdownModalTitle}>Select Details</Text>
                        <ScrollView
                          style={styles.dropdownModalList}
                          showsVerticalScrollIndicator={true}
                        >
                          {detailsOptions.map((detail) => {
                            const isSelected = selectedToothForDetails && selectedDetails[selectedToothForDetails] === detail.key;

                            return (
                              <TouchableOpacity
                                key={detail.key}
                                style={styles.dropdownModalOption}
                                onPress={() => {
                                  if (!isEditMode || !selectedToothForDetails) return;

                                  setSelectedDetails(prev => ({
                                    ...prev,
                                    [selectedToothForDetails]: detail.key
                                  }));
                                  setShowDetailsOptions(false);
                                  setHasModalChanges(true);
                                }}
                              >
                                <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
                                  {isSelected && <View style={styles.radioButtonInner} />}
                                </View>
                                <Text style={styles.optionText}>{detail.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>
                  </>
                  )}
                  </>
                  )}

                  {/* Notes Section */}
                  {showNotesSection && (
                    <View style={styles.notesSection}>
                      {/* New Note Input - Fixed at Top */}
                      <View style={styles.newNoteContainer}>
                        <TextInput
                          style={styles.noteInput}
                          placeholder="Write a note..."
                          placeholderTextColor="rgba(30, 58, 138, 0.5)"
                          multiline
                          numberOfLines={3}
                          value={currentNote}
                          onChangeText={(text) => {
                            setCurrentNote(text);
                            if (text.trim()) {
                              setHasModalChanges(true);
                            }
                          }}
                        />
                      </View>

                      {/* Saved Notes - Scrollable */}
                      {selectedToothForDetails && toothNotes[selectedToothForDetails]?.length > 0 && (
                        <ScrollView
                          style={{ maxHeight: 230 }}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled={true}
                        >
                          {toothNotes[selectedToothForDetails].slice().reverse().map((note, index) => (
                            <View key={index} style={[styles.noteCard, { marginBottom: 12 }]}>
                              <View style={styles.noteHeader}>
                                <Text style={styles.noteDoctorName}>{note.doctorName || 'Dr. Ahmed'}</Text>
                                <Text style={styles.noteTimestamp}>{note.timestamp}</Text>
                              </View>
                              <Text style={styles.noteText}>{note.text}</Text>
                            </View>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* Referral Section */}
                  {showReferralSection && (
                    <>
                      {/* Need Referral Section */}
                      <View style={styles.sectionRow}>
                        <View style={styles.sectionLabelContainer}>
                          <Ionicons name="share-outline" size={18} color="#1E293B" />
                          <Text style={[styles.sectionTitle, { fontSize: 14 }]}>Need Referral</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.dropdownInput, styles.dropdownInputActive]}
                          onPress={() => setShowReferralOptions(!showReferralOptions)}
                        >
                          <Ionicons name={showReferralOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                          <Text style={styles.dropdownText}>
                            {(() => {
                              if (!selectedToothForDetails) return 'Select';
                              const selectedReferrals = selectedReferralFor[selectedToothForDetails] || [];
                              if (selectedReferrals.length === 0) return 'Select';
                              const labels = selectedReferrals
                                .map(key => referralOptions.find(opt => opt.key === key)?.label)
                                .filter(Boolean);
                              return labels.join(', ') || 'Select';
                            })()}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Referral Options Modal */}
                      <Modal
                        visible={showReferralOptions && !!selectedToothForDetails}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setShowReferralOptions(false)}
                      >
                        <TouchableOpacity
                          style={styles.dropdownModalOverlay}
                          activeOpacity={1}
                          onPress={() => setShowReferralOptions(false)}
                        >
                          <TouchableOpacity
                            activeOpacity={1}
                            onPress={(e) => e.stopPropagation()}
                            style={{ width: '85%' }}
                          >
                            <View style={styles.dropdownModalContent}>
                              <Text style={styles.dropdownModalTitle}>Select Referral</Text>
                              <ScrollView
                                style={styles.dropdownModalList}
                                showsVerticalScrollIndicator={true}
                              >
                                {referralOptions.map((referral) => {
                                  const selectedReferrals = selectedReferralFor[selectedToothForDetails] || [];
                                  const isSelected = selectedReferrals.includes(referral.key);

                                  return (
                                    <TouchableOpacity
                                      key={referral.key}
                                      style={styles.dropdownModalOption}
                                      onPress={() => {
                                        if (!selectedToothForDetails) return;

                                        setSelectedReferralFor(prev => {
                                          const currentReferrals = prev[selectedToothForDetails] || [];
                                          const newReferrals = isSelected
                                            ? currentReferrals.filter(r => r !== referral.key)  // Remove if already selected
                                            : [...currentReferrals, referral.key];  // Add if not selected

                                          return {
                                            ...prev,
                                            [selectedToothForDetails]: newReferrals
                                          };
                                        });
                                        setHasModalChanges(true);
                                      }}
                                    >
                                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                        {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                                      </View>
                                      <Text style={styles.optionText}>{referral.label}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </Modal>
                    </>
                  )}
                  </View>
                  )}

                  {/* Records Section - Single White Container */}
                  {showRecordsSection && (
                    <View style={styles.recordsMainContainer}>
                      {/* Records Type Buttons - Fixed at Top */}
                      <View style={styles.recordsTypeButtons}>
                        <TouchableOpacity
                          style={[
                            styles.recordsTypeBtn,
                            recordsType === 'editing' && styles.recordsTypeBtnActive
                          ]}
                          onPress={() => setRecordsType('editing')}
                        >
                          <Text style={[
                            styles.recordsTypeBtnText,
                            recordsType === 'editing' && styles.recordsTypeBtnTextActive
                          ]}>Editing Records</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.recordsTypeBtn,
                            recordsType === 'planning' && styles.recordsTypeBtnActive
                          ]}
                          onPress={() => setRecordsType('planning')}
                        >
                          <Text style={[
                            styles.recordsTypeBtnText,
                            recordsType === 'planning' && styles.recordsTypeBtnTextActive
                          ]}>Planning Records</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Saved Records - Scrollable */}
                      <ScrollView
                        style={{ maxHeight: 350 }}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                      >
                        {selectedToothForDetails && toothRecords[selectedToothForDetails]?.filter(r => r.type === recordsType).length > 0 ? (
                          <>
                            {(() => {
                              // فلترة السجلات حسب النوع (planning أو editing)
                              const filteredRecords = toothRecords[selectedToothForDetails].filter(r => r.type === recordsType);

                              // ترتيب حسب timestampNum (الأحدث أولاً)
                              const sortedRecords = [...filteredRecords].sort((a, b) => b.timestampNum - a.timestampNum);

                              // إذا كان النوع هو editing، نعرض كل سجل بشكل منفصل (كما هو)
                              if (recordsType === 'editing') {
                                return sortedRecords.map((record, index) => (
                                  <View
                                    key={index}
                                    style={{
                                      backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                      borderRadius: 18,
                                      padding: 20,
                                      marginBottom: 16,
                                      borderWidth: 2,
                                      borderColor: 'rgba(37, 99, 235, 0.35)',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {/* Treatment Details */}
                                    <View style={{ gap: 8, marginBottom: 12 }}>
                                      <View style={{ flexDirection: 'row' }}>
                                        <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                          Treatment:
                                        </Text>
                                        {record.treatment === 'Extraction' || record.treatment === 'Filling' || record.treatment === 'Pulpectomy' ? (
                                          <View style={{
                                            backgroundColor:
                                              record.treatment === 'Extraction'
                                                ? 'rgba(156, 163, 175, 0.15)'
                                                : record.treatment === 'Filling'
                                                  ? 'rgba(16, 185, 129, 0.15)'
                                                  : 'rgba(139, 92, 246, 0.15)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 8,
                                            alignSelf: 'flex-start',
                                          }}>
                                            <Text style={{
                                              fontSize: 14,
                                              color: record.treatment === 'Extraction'
                                                ? '#4B5563'
                                                : record.treatment === 'Filling'
                                                  ? '#047857'
                                                  : '#7C3AED',
                                              fontWeight: '600'
                                            }}>
                                              {record.treatment}
                                            </Text>
                                          </View>
                                        ) : (
                                          <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                            {record.treatment}
                                          </Text>
                                        )}
                                      </View>

                                      {record.details && (
                                        <View style={{ flexDirection: 'row' }}>
                                          <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                            Details:
                                          </Text>
                                          <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                            {record.details}
                                          </Text>
                                        </View>
                                      )}

                                      <View style={{ flexDirection: 'row' }}>
                                        <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                          Surfaces:
                                        </Text>
                                        <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                          {record.treatment === 'Extraction'
                                            ? 'N/A'
                                            : (record.surfaces && record.surfaces.length > 0
                                                ? record.surfaces.join(', ')
                                                : '-'
                                              )
                                          }
                                        </Text>
                                      </View>
                                    </View>

                                    {/* Footer Info */}
                                    <View style={{
                                      borderTopWidth: 1,
                                      borderTopColor: 'rgba(37, 99, 235, 0.2)',
                                      paddingTop: 12,
                                      gap: 6,
                                    }}>
                                      <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                                        {record.timestamp}
                                      </Text>
                                      <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>
                                        Dr. {record.doctorName}
                                      </Text>
                                    </View>
                                  </View>
                                ));
                              }

                              // أما planning records، نطبق منطق التجميع:
                              // 1. كل طبيب مختلف في كرت منفصل
                              // 2. السجلات المتتالية من نفس الطبيب + نفس النوع (diagnosed أو canceled) تُجمع معًا
                              // 3. إذا تغير النوع (من diagnosed إلى canceled أو العكس)، كرت جديد

                              // التأكد من أننا نعمل فقط على planning records
                              type PlanningRecordType = Extract<ToothRecord, { type: 'planning' }>;
                              const planningRecords = sortedRecords as PlanningRecordType[];

                              type RecordGroup = {
                                doctorName: string;
                                action: 'diagnosed' | 'canceled';
                                records: PlanningRecordType[];
                              };

                              const groupedRecords: RecordGroup[] = [];

                              planningRecords.forEach((record) => {
                                const lastGroup = groupedRecords[groupedRecords.length - 1];

                                const shouldStartNewGroup =
                                  !lastGroup ||
                                  lastGroup.action !== record.action; // نوع مختلف فقط (diagnosed ≠ canceled)

                                if (shouldStartNewGroup) {
                                  groupedRecords.push({
                                    doctorName: record.doctorName,
                                    action: record.action,
                                    records: [record]
                                  });
                                } else {
                                  lastGroup.records.push(record);
                                }
                              });

                              return groupedRecords.map((group, groupIndex) => {
                                // جمع كل الـ surfaces والـ conditions من السجلات في المجموعة
                                const allSurfaces: string[] = [];
                                const allConditions: string[] = [];

                                // جمع surfaces من السجلات الجديدة (isChange: true) فقط
                                const changedSurfaces: string[] = [];

                                group.records.forEach(rec => {
                                  if (rec.condition && !allConditions.includes(rec.condition)) {
                                    allConditions.push(rec.condition);
                                  }
                                  if (rec.surfaces) {
                                    rec.surfaces.forEach(surf => {
                                      if (!allSurfaces.includes(surf)) {
                                        allSurfaces.push(surf);
                                      }
                                    });
                                  }
                                  // إذا كان السجل تغيير، أضف أسطحه للقائمة المنفصلة
                                  if (rec.isChange && rec.surfaces) {
                                    rec.surfaces.forEach(surf => {
                                      if (!changedSurfaces.includes(surf)) {
                                        changedSurfaces.push(surf);
                                      }
                                    });
                                  }
                                });

                                const firstRecord = group.records[0];

                                return (
                                  <View
                                    key={groupIndex}
                                    style={{
                                      backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                      borderRadius: 18,
                                      padding: 20,
                                      marginBottom: 16,
                                      borderWidth: 2,
                                      borderColor: 'rgba(37, 99, 235, 0.35)',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {/* Diagnosed/Canceled Badge */}
                                    <View
                                      style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 4,
                                        borderRadius: 8,
                                        backgroundColor: group.action === 'diagnosed' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                                        alignSelf: 'flex-start',
                                        marginBottom: 14,
                                      }}
                                    >
                                      <Text style={{ fontSize: 12, fontWeight: '600', color: group.action === 'diagnosed' ? '#D97706' : '#6B7280' }}>
                                        {group.action === 'diagnosed' ? 'Diagnosed' : 'Canceled'}
                                      </Text>
                                    </View>

                                    {/* عرض رسالة التغيير إذا كان السجل تغييراً */}
                                    {firstRecord.isChange && (
                                      <View style={{
                                        backgroundColor: 'rgba(251, 146, 60, 0.1)',
                                        borderWidth: 2,
                                        borderColor: 'rgba(251, 146, 60, 0.3)',
                                        padding: 16,
                                        borderRadius: 12,
                                        marginBottom: 12
                                      }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                          <Text style={{ fontSize: 18, marginRight: 8 }}>🔄</Text>
                                          <Text style={{ fontSize: 15, color: '#EA580C', fontWeight: '700', letterSpacing: 0.3 }}>
                                            Condition Changed
                                          </Text>
                                        </View>

                                        <View style={{ gap: 6, marginBottom: 10 }}>
                                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '600', marginRight: 6 }}>−</Text>
                                            <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '500', textDecorationLine: 'line-through' }}>
                                              {firstRecord.previousCondition}
                                            </Text>
                                          </View>
                                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ fontSize: 16, color: '#059669', fontWeight: '600', marginRight: 6 }}>+</Text>
                                            <Text style={{ fontSize: 14, color: '#059669', fontWeight: '600' }}>
                                              {firstRecord.condition}
                                            </Text>
                                          </View>
                                        </View>

                                        {changedSurfaces.length > 0 && (
                                          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                                            <Text style={{ fontSize: 13, color: '#EA580C', fontWeight: '600', minWidth: 70 }}>
                                              Surfaces:
                                            </Text>
                                            <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '500', flex: 1 }}>
                                              {changedSurfaces.join(', ')}
                                            </Text>
                                          </View>
                                        )}

                                        <View style={{
                                          borderTopWidth: 1,
                                          borderTopColor: 'rgba(251, 146, 60, 0.2)',
                                          paddingTop: 8,
                                          marginTop: 4
                                        }}>
                                          <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '600' }}>
                                            Modified by: Dr. {group.doctorName}
                                          </Text>
                                        </View>
                                      </View>
                                    )}

                                    {/* Planning Details */}
                                    <View style={{ gap: 8, marginBottom: 12 }}>
                                      {!firstRecord.isChange && allConditions.length > 0 && (() => {
                                        // حالة خاصة: Root Canal Treated
                                        // Root Canal Treated يُحفظ كـ condition="Tooth Status", surfaces=['Root Canal Treated']
                                        const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

                                        if (hasRootCanalTreated) {
                                          // فصل Root Canal Treated عن باقي الأسطح
                                          const otherSurfaces = allSurfaces.filter(s => s !== 'Root Canal Treated');

                                          return (
                                            <>
                                              {/* عرض Root Canal Treated كـ Condition رئيسي */}
                                              <View style={{ flexDirection: 'row' }}>
                                                <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                                  Condition:
                                                </Text>
                                                <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                  Root Canal Treated
                                                </Text>
                                              </View>

                                              {/* عرض باقي الأسطح تحت Surfaces */}
                                              {otherSurfaces.length > 0 && (
                                                <View style={{ flexDirection: 'row' }}>
                                                  <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                                    Surfaces:
                                                  </Text>
                                                  <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                    {otherSurfaces.join(', ')}
                                                  </Text>
                                                </View>
                                              )}
                                            </>
                                          );
                                        } else {
                                          // الحالة العادية: عرض كل الـ conditions بدون معالجة خاصة
                                          return (
                                            <View style={{ flexDirection: 'row' }}>
                                              <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                                Condition:
                                              </Text>
                                              <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                {allConditions.join(', ')}
                                              </Text>
                                            </View>
                                          );
                                        }
                                      })()}

                                      {!firstRecord.isChange && allSurfaces.length > 0 && !allConditions.includes('Extraction') && !allSurfaces.some(s => s === 'Root Canal Treated') && (
                                        <View style={{ flexDirection: 'row' }}>
                                          <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                            Surfaces:
                                          </Text>
                                          <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                            {allSurfaces.join(', ')}
                                          </Text>
                                        </View>
                                      )}
                                    </View>

                                    {/* Footer Info */}
                                    <View style={{
                                      borderTopWidth: 1,
                                      borderTopColor: 'rgba(37, 99, 235, 0.2)',
                                      paddingTop: 12,
                                      gap: 6,
                                    }}>
                                      <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                                        {firstRecord.timestamp}
                                      </Text>
                                      <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>
                                        Dr. {group.doctorName}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              });
                            })()}
                          </>
                        ) : (
                          <View style={styles.noRecordsContainer}>
                            <Ionicons name="document-text-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
                            <Text style={styles.noRecordsText}>
                              {recordsType === 'editing' ? 'No editing records yet' : 'No planning records yet'}
                            </Text>
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </ScrollView>
                </View>

                {/* Submit Button */}
                <View style={styles.submitButtonContainer}>
                  <TouchableOpacity
                    style={[styles.submitButton, hasModalChanges && styles.submitButtonActive]}
                    disabled={!hasModalChanges}
                    onPress={async () => {
                      if (!hasModalChanges || !selectedToothForDetails) return;

                      // Save note if there's text
                      if (currentNote.trim()) {
                        const now = new Date();
                        const timestamp = formatTimestamp(now);

                        const existingNotes = toothNotes[selectedToothForDetails] || [];
                        setToothNotes(prev => ({
                          ...prev,
                          [selectedToothForDetails]: [
                            ...existingNotes,
                            { text: currentNote.trim(), timestamp, doctorName: user?.name || 'Dr. Unknown' }
                          ]
                        }));

                        // Save tooth note to database
                        if (permanentPatientId && user?.name && typeof selectedToothForDetails === 'number') {
                          const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
                          if (palmerNotation) {
                            const { error: noteError } = await createToothNote(
                              permanentPatientId,
                              palmerNotation,
                              currentNote.trim(),
                              user.name
                            );

                            if (noteError) {
                              console.error(' Error saving tooth note:', noteError);
                            } else {
                              console.log(' Saved tooth note to database');
                            }
                          }
                        }

                        // Set unread badge for this tooth
                        setUnreadNotes(prev => ({
                          ...prev,
                          [selectedToothForDetails]: (prev[selectedToothForDetails] || 0) + 1
                        }));

                        setCurrentNote('');
                      }

                      // Save referrals if selected (multiple) - Show in Department tab, not Records yet
                      const selectedReferrals = selectedReferralFor[selectedToothForDetails] || [];
                      if (selectedReferrals.length > 0) {
                        // Update referrals state to show all referral cards in Department tab
                        const newReferralsState: Record<string, boolean> = {};
                        const newReferralStatuses: Record<string, 'not_given' | 'given'> = {};

                        selectedReferrals.forEach(referralKey => {
                          newReferralsState[referralKey] = true;
                          newReferralStatuses[referralKey] = 'not_given';
                        });

                        setReferrals(prev => ({
                          ...prev,
                          ...newReferralsState
                        }));

                        setReferralStatus(prev => ({
                          ...prev,
                          ...newReferralStatuses
                        }));

                        // Save all referrals to database immediately to persist after logout
                        if (permanentPatientId && user?.name && typeof selectedToothForDetails === 'number') {
                          const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
                          if (palmerNotation) {
                            const referralTypeMap: Record<string, string> = {
                              'endodontics': 'Endodontics',
                              'oralSurgery': 'Oral Surgery',
                              'orthodontics': 'Orthodontics',
                              'prosthodontics': 'Prosthodontics',
                              'periodontics': 'Periodontics',
                              'pediatricDentistry': 'Pediatric Dentistry',
                            };

                            // Save each referral separately
                            for (const referralKey of selectedReferrals) {
                              const referralName = referralTypeMap[referralKey] || referralKey;

                              const { error: referralError } = await createReferral(
                                permanentPatientId,
                                palmerNotation,
                                referralName,
                                user.name
                              );

                              if (referralError) {
                                console.error(` Error saving referral ${referralName}:`, referralError);
                              } else {
                                console.log(` Saved referral ${referralName} to database`);
                              }
                            }
                          }
                        }
                      }

                      // Save record ONLY if Edit mode is active AND (treatment or details were selected)
                      if (isEditMode) {
                        const treatment = selectedTreatments[selectedToothForDetails];
                        const details = selectedDetails[selectedToothForDetails];

                        if (treatment || details) {
                          const now = new Date();
                          const timestamp = formatTimestamp(now);

                          const treatmentLabel = treatment ? treatmentOptions.find(opt => opt.key === treatment)?.label || treatment : 'N/A';
                          const detailsLabel = details ? detailsOptions.find(opt => opt.key === details)?.label || details : 'N/A';

                          // الحصول على أسماء الأسطح المحددة
                          const selectedSurfacesForTooth = selectedSurfaces[selectedToothForDetails] || [];
                          const surfaceNames = selectedSurfacesForTooth.map(surfaceKey => {
                            const surfaceOptions = getAllSurfaces(selectedToothForDetails);
                            const surface = surfaceOptions.find(opt => opt.key === surfaceKey);
                            return surface?.label || surfaceKey;
                          });

                          const existingRecords = toothRecords[selectedToothForDetails] || [];
                          setToothRecords(prev => ({
                            ...prev,
                            [selectedToothForDetails]: [
                              ...existingRecords,
                              {
                                treatment: treatmentLabel,
                                details: detailsLabel,
                                surfaces: surfaceNames,
                                timestamp,
                                timestampNum: now.getTime(),
                                doctorName: user?.name || 'Dr. Unknown',
                                type: 'editing'
                              }
                            ]
                          }));

                          // Save editing record to database
                          if (permanentPatientId && user?.name && typeof selectedToothForDetails === 'number') {
                            const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
                            if (palmerNotation) {
                              // Map UI surface keys to database surface names
                              // Use helper function to get correct mapping for lower teeth
                              const surfaceMap = getSurfaceMap(selectedToothForDetails);

                              const dbSurfaces = selectedSurfacesForTooth
                                .map(key => surfaceMap[key as keyof ToothSurfaceConditions])
                                .filter((s): s is ToothSurface => s !== undefined);

                              // Save editing record to database
                              const { error: editingError } = await createEditingRecord(
                                permanentPatientId,
                                palmerNotation,
                                treatmentLabel,
                                dbSurfaces,
                                user.name,
                                detailsLabel
                              );

                              if (editingError) {
                                console.error(' Error saving editing record:', editingError);
                              } else {
                                console.log(' Saved editing record to database');
                              }

                              // ═══════════════════════════════════════════════════════════════
                              // IMPORTANT: Also save colors to tooth_surface_conditions
                              // This ensures colors persist after reload
                              // ═══════════════════════════════════════════════════════════════
                              // Save surface colors for Filling and Pulpectomy (if Details selected)
                              if (selectedSurfacesForTooth.length > 0 && details && (treatment === 'filling' || treatment === 'pulpectomy')) {
                                // Determine color based on details using helper function
                                const conditionColor = getConditionFromDetails(details);

                                // Save to tooth_surface_conditions for each selected surface
                                try {
                                  const surfacePromises = dbSurfaces.map(dbSurface =>
                                    saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, conditionColor)
                                  );

                                  await Promise.all(surfacePromises);
                                  console.log(` Saved ${dbSurfaces.length} surface colors (${conditionColor}) to database`);
                                } catch (error) {
                                  console.error(' Error saving surface conditions:', error);
                                }
                              }
                            }
                          }

                          // تحويل لون الأسطح المحددة بناءً على نوع الحشوة المختار (UI only)
                          if (selectedSurfacesForTooth.length > 0) {
                            // تعطيل Planning Record لأن هذا Editing Record
                            skipPlanningRecordRef.current = true;

                            setToothConditions(prev => {
                              const existingConditions = prev[selectedToothForDetails] || {};
                              const updatedConditions: ToothSurfaceConditions = { ...existingConditions };

                              // تحديد اللون بناءً على نوع الحشوة using helper function
                              const conditionColor = getConditionFromDetails(details);

                              selectedSurfacesForTooth.forEach((surfaceKey) => {
                                const key = surfaceKey as keyof ToothSurfaceConditions;
                                updatedConditions[key] = conditionColor;
                              });

                              return {
                                ...prev,
                                [selectedToothForDetails]: updatedConditions
                              };
                            });
                          }

                          // تغيير لون حدود السن إلى عنابي إذا كان العلاج pulpectomy
                          if (treatment === 'pulpectomy') {
                            // تعطيل Planning Record لأن هذا Editing Record
                            skipPlanningRecordRef.current = true;

                            setToothBorderColors(prev => ({
                              ...prev,
                              [selectedToothForDetails]: 'pulpectomy'
                            }));

                            console.log(` Set border color for tooth ${selectedToothForDetails} to 'pulpectomy' (border only, no surface colors)`);
                            // Border color will be detected from editing_records on reload
                            // Do NOT save any surface conditions
                          }

                          // إذا كان العلاج extraction، جعل السن missing (علامة X)
                          if (treatment === 'extraction') {
                            // تعطيل Planning Record لأن هذا Editing Record
                            skipPlanningRecordRef.current = true;

                            setToothConditions(prev => ({
                              ...prev,
                              [selectedToothForDetails]: {
                                top: 'missing',
                                bottom: 'missing',
                                left: 'missing',
                                right: 'missing',
                                center: 'missing',
                              }
                            }));

                            // Save extraction to tooth_surface_conditions (all surfaces)
                            if (permanentPatientId && typeof selectedToothForDetails === 'number') {
                              const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
                              if (palmerNotation) {
                                try {
                                  const allSurfaces: ToothSurface[] = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'];
                                  const extractionPromises = allSurfaces.map(surface =>
                                    saveToothSurfaceCondition(permanentPatientId, palmerNotation, surface, 'missing')
                                  );
                                  await Promise.all(extractionPromises);
                                  console.log(' Saved extraction (missing) to all tooth surfaces');
                                } catch (error) {
                                  console.error(' Error saving extraction:', error);
                                }
                              }
                            }
                          }
                        }
                      }

                      // Close modal and reset
                      setShowToothDetailsModal(false);
                      setHasModalChanges(false);
                      setShowNotesSection(false);
                      setShowReferralSection(false);
                      setIsEditMode(false);
                      setOriginalValues({}); // مسح القيم الأصلية بعد الحفظ
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={22}
                      color={hasModalChanges ? "#FFFFFF" : "#1E3A8A"}
                    />
                    <Text style={[styles.submitButtonText, hasModalChanges && { color: '#FFFFFF' }]}>
                      Submit
                    </Text>
                  </TouchableOpacity>
                </View>
                </View>
              </BlurView>
            </View>
          </View>
        </Modal>

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

