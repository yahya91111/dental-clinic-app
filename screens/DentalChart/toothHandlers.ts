import { Animated } from 'react-native';
import { ToothSurfaceConditions } from './dentalHelpers';

// ═══════════════════════════════════════════════════════════════
// Tooth Handlers
// Functions for handling tooth press, open, and close interactions
// ═══════════════════════════════════════════════════════════════

// List of all standard teeth (1-32)
const ALL_TEETH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

export interface ToothHandlersParams {
  selectedTooth: number | string | null;
  isClosing: boolean;
  isEditModeActive: boolean;
  selectedTreatments: Record<number | string, string>;
  selectedDetails: Record<number | string, string>;
  selectedSurfaces: Record<number | string, string[]>;
  toothAnims: {
    buttonsOpacity: Animated.Value;
    stopToothAnimations: (toothNumber: number) => void;
    animateToothToCenter: (toothNumber: number) => void;
    animateToothToOriginal: (toothNumber: number, callback: () => void) => void;
  };
  // Setters
  setSelectedTooth: (tooth: number | string | null) => void;
  setSelectedSurface: (surface: keyof ToothSurfaceConditions | null) => void;
  setShowConditionMenu: (show: boolean) => void;
  setIsClosing: (closing: boolean) => void;
  setSelectedToothForDetails: (tooth: number | null) => void;
  setOriginalValues: (values: { treatment?: string; details?: string; surfaces?: string[] }) => void;
  setShowToothDetailsModal: (show: boolean) => void;
  setHasModalChanges: (has: boolean) => void;
  setIsEditMode: (edit: boolean) => void;
  setShowNotesSection: (show: boolean) => void;
  setShowDetailsSection: (show: boolean) => void;
  setShowRecordsSection: (show: boolean) => void;
  setRecordsType: (type: 'editing' | 'planning') => void;
  setCurrentNote: (note: string) => void;
  setSelectedTreatments: React.Dispatch<React.SetStateAction<Record<number | string, string>>>;
  setSelectedDetails: React.Dispatch<React.SetStateAction<Record<number | string, string>>>;
  setSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
}

/**
 * Open a tooth with animation - move to center and enlarge
 */
export function openTooth(
  toothNumber: number,
  toothAnims: ToothHandlersParams['toothAnims'],
  setSelectedTooth: ToothHandlersParams['setSelectedTooth'],
  setSelectedSurface: ToothHandlersParams['setSelectedSurface'],
  setShowConditionMenu: ToothHandlersParams['setShowConditionMenu'],
  setIsClosing: ToothHandlersParams['setIsClosing']
) {
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
}

/**
 * Handle tooth press - main entry point for tooth interactions
 */
export function handleToothPress(
  toothNumber: number | string,
  params: ToothHandlersParams
) {
  const {
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
  } = params;

  // السيناريو الثاني: إذا كان Edit Mode نشط، نعرض modal التفاصيل بدلاً من الانيميشن
  console.log('handleToothPress - toothNumber:', toothNumber, 'isEditModeActive:', isEditModeActive);
  if (isEditModeActive) {
    console.log('Opening tooth details modal for tooth:', toothNumber);
    setSelectedToothForDetails(toothNumber as number);

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
  if (selectedTooth === toothNumber && isClosing && ALL_TEETH.includes(toothNumber as number)) {
    // إيقاف أنيميشن الإغلاق فوراً
    toothAnims.stopToothAnimations(toothNumber as number);
    // إلغاء حالة الإغلاق
    setIsClosing(false);
    // فتح السن مرة أخرى
    openTooth(toothNumber as number, toothAnims, setSelectedTooth, setSelectedSurface, setShowConditionMenu, setIsClosing);
    return;
  }

  // إذا كان هناك سن آخر مفتوح (من 1-32)
  if (selectedTooth && selectedTooth !== toothNumber && ALL_TEETH.includes(selectedTooth as number)) {
    // إيقاف جميع الأنيميشنات للسن القديم فوراً
    toothAnims.stopToothAnimations(selectedTooth as number);
    // إلغاء حالة الإغلاق
    setIsClosing(false);
    // فتح السن الجديد مباشرة
    openTooth(toothNumber as number, toothAnims, setSelectedTooth, setSelectedSurface, setShowConditionMenu, setIsClosing);
    return;
  }

  // فتح السن مباشرة
  openTooth(toothNumber as number, toothAnims, setSelectedTooth, setSelectedSurface, setShowConditionMenu, setIsClosing);
}

/**
 * Handle closing the enlarged tooth - return to original position
 */
export function handleCloseTooth(
  selectedTooth: number | string | null,
  toothAnims: ToothHandlersParams['toothAnims'],
  setSelectedTooth: ToothHandlersParams['setSelectedTooth'],
  setSelectedSurface: ToothHandlersParams['setSelectedSurface'],
  setShowConditionMenu: ToothHandlersParams['setShowConditionMenu'],
  setIsClosing: ToothHandlersParams['setIsClosing']
) {
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
}
