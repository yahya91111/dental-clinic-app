
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  Animated,
  ScrollView,
  RefreshControl,
  LogBox,
} from 'react-native';
import { styles } from './styles';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../AuthContext';
import type { ToothCondition } from '../../types';

// Import helpers and components from extracted files
import { ToothSurfaceConditions } from './dentalHelpers';
import { ConditionMenu } from './DentalChartComponents';
import { DepartmentModal, ReferralsState, ReferralStatusState } from './DepartmentModal';
import { ToothDetailsModal, ToothRecord, ToothNote } from './ToothDetailsModal';
import { useToothAnimations } from './useToothAnimations';
import { TeethGrid } from './TeethGrid';
import { ReferralContainer } from './ReferralContainer';
import { TreatmentRecordContainer } from './TreatmentRecordContainer';
import { PlanningRecordContainer } from './PlanningRecordContainer';
import { OralHygieneContainer } from './OralHygieneContainer';
import { loadPatientDentalData as loadDentalDataFromDB } from './loadDentalData';
import {
  handlePlanningSubmit as submitPlanning,
  handlePlanningCancel as cancelPlanning,
} from './planningHandlers';
import {
  handleConditionSelect as selectCondition,
  PlanningRecordGlobal,
} from './conditionHandler';
import { AnimatedBackground } from './AnimatedBackground';
import { TransparentTouchLayer } from './TransparentTouchLayer';
import { CrossDividerLines } from './CrossDividerLines';
import { EnlargedToothModal } from './EnlargedToothModal';
import { HeaderAndPlanningButtons } from './HeaderAndPlanningButtons';
import {
  handleToothPress as pressToothHandler,
  handleCloseTooth as closeToothHandler,
} from './toothHandlers';
import { EditViewModeButtons } from './EditViewModeButtons';
import {
  handleAddScaling as addScalingRecord,
  handleDeleteScalingRecord as deleteScalingRecordHandler,
} from './oralHygieneHandlers';

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
  // Pull-to-Refresh State
  // ═══════════════════════════════════════════════════════════════
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // دالة لإضافة سجل Scaling جديد - Extracted to oralHygieneHandlers.ts
  const handleAddScaling = () => addScalingRecord({
    permanentPatientId,
    userName: user?.name,
    setScalingRecords,
    setIsOralHygieneExpanded,
  });

  // دالة لحذف سجل Scaling - Extracted to oralHygieneHandlers.ts
  const handleDeleteScalingRecord = (recordId: string, index: number) =>
    deleteScalingRecordHandler(recordId, index, setScalingRecords);

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

  // Load data when component mounts or permanentPatientId changes
  useEffect(() => {
    if (!permanentPatientId) return;
    loadPatientDentalData();
  }, [permanentPatientId]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadPatientDentalData();
    setIsRefreshing(false);
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
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                colors={['#667eea']}
                tintColor="#667eea"
              />
            }
          >
                {/* Edit/View Mode Buttons - Extracted to EditViewModeButtons.tsx */}
                <EditViewModeButtons
                  isEditModeActive={isEditModeActive}
                  setIsEditModeActive={setIsEditModeActive}
                  editButtonSlide={toothAnims.editButtonSlide}
                  isViewModeActive={isViewModeActive}
                  setIsViewModeActive={setIsViewModeActive}
                  viewButtonPositionAnim={toothAnims.viewButtonPositionAnim}
                  toothAnims={toothAnims}
                  setIsReferralExpanded={setIsReferralExpanded}
                  buttonsOpacity={toothAnims.buttonsOpacity}
                  isOralHygieneExpanded={isOralHygieneExpanded}
                  isTreatmentRecordExpanded={isTreatmentRecordExpanded}
                  isPlanningRecordExpanded={isPlanningRecordExpanded}
                  isReferralExpanded={isReferralExpanded}
                  selectedTooth={selectedTooth}
                />

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
