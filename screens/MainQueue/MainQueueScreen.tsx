import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  PanResponder,
  Dimensions,
  Alert,
  RefreshControl,
} from 'react-native';
import { scale } from '../../lib/scale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '../../theme';
import { Patient, TimelineEvent } from './constants';
import { Referral, ToothNote, DentalSummary } from '../../types';
import { styles } from './styles';
import { AnimatedPatientCard } from './PatientCard';
import { PatientCardV2 } from './PatientCardV2';

// Design toggle — flip to false to instantly restore the classic patient card.
const USE_V2_CARD = true;
import { AppModals } from './AppModals';
import { QueueTimelinePager, Lane, Break } from './QueueTimeline';
import { etaFromLanes } from './queueLanes';
import { QueueStatsStrip } from './QueueStatsStrip';
import { QueueBoard } from './QueueBoard';
import { ExpandedPatientHeader } from '../../components/ExpandedPatientHeader';
import { createScalingRecord, getScalingRecords } from '../../lib/database';

export interface MainQueueScreenProps {
  // Animated blob values
  timelineBlob1Anim: Animated.Value;
  timelineBlob2Anim: Animated.Value;
  timelineBlob3Anim: Animated.Value;
  timelineBlob4Anim: Animated.Value;
  timelineBlob5Anim: Animated.Value;
  timelineBlob6Anim: Animated.Value;

  // Header animation values
  headerTranslateY: Animated.Value;
  queueMarginTop: Animated.Value;
  headerElementsOpacity: Animated.Value;
  headerElementsTranslate: Animated.Value;

  // Header collapse
  isHeaderCollapsed: boolean;
  toggleHeaderCollapse: () => void;

  // Clinic info
  selectedClinicName: string;
  selectedClinicId: string | null;

  // User
  user: { role?: string; name?: string; email?: string } | null;

  // Stats
  totalPatients: number;
  waitingPatients: number;
  treatmentStats: { [key: string]: number };
  showTreatmentStats: boolean;
  setShowTreatmentStats: (val: boolean) => void;

  // Filters/display
  // showTimeline يبقى: يمرُّ إلى الكرتِ الكلاسيكيِّ (خلفَ USE_V2_CARD). ومفاتيحُه ذهبتْ مع لوحِ الخيارات.
  showTimeline: boolean;
  filterWaitingOnly: boolean;
  setFilterWaitingOnly: (val: boolean) => void;

  // Expanded card
  expandedCardId: string | null;
  setExpandedCardId: (val: string | null) => void;
  expandedPermanentCardId: string | null;

  // Patients
  filteredPatients: Patient[];
  patients: Patient[];
  // إعادةُ الجلبِ من الخادم (السحبُ للتحديث في صفحةِ المخطّط)
  reloadPatients?: (silent?: boolean) => Promise<void>;
  animKey: number;

  // Navigation handlers
  setSavedClinicId: (val: string | null) => void;
  setSavedClinicName: (val: string) => void;
  setSelectedClinicId: (val: string | null) => void;
  setSelectedClinicName: (val: string) => void;
  showClinicDetails: boolean;
  setShowClinicDetails: (val: boolean) => void;
  showDentalDepartments: boolean;
  setShowDentalDepartments: (val: boolean) => void;
  setShowDoctorProfile: (val: boolean) => void;
  setNavigationStack: (val: string[]) => void;

  // Card actions
  setShowMenuForPatient: (val: string | null) => void;
  handleViewNote: (patientId: string) => void;
  openTimeline: (patient: Patient) => void;
  setEditingPatientId: (val: string | null) => void;
  setEditingField: (val: 'clinic' | 'condition' | 'treatment' | null) => void;
  setShowClinicDropdown: (val: boolean) => void;
  setShowConditionDropdown: (val: boolean) => void;
  setShowTreatmentDropdown: (val: boolean) => void;
  handleViewDetails: (patientId: string) => void;
  cardTimelines: { [key: string]: TimelineEvent[] };
  showTimelineTab: { [key: string]: boolean };
  handleToggleTab: (patientId: string) => void;
  setSelectedPatientForProfile: (val: { id: string; fileNumber: string } | null) => void;
  setShowPatientFile: (val: boolean) => void;
  togglePermanentCardExpansion: (patient: Patient) => void;
  loadDentalData?: (permanentPatientId: string, patientId: string, forceReload?: boolean) => void;
  activeDentalTab: { [key: string]: 'treatment' | 'referrals' | 'notes' };
  setActiveDentalTab: React.Dispatch<React.SetStateAction<{ [key: string]: 'treatment' | 'referrals' | 'notes' }>>;
  dentalSummaries: { [key: string]: DentalSummary };
  loadingDentalData: { [key: string]: boolean };
  patientReferrals: { [key: string]: Referral[] };
  setPatientReferrals: React.Dispatch<React.SetStateAction<{ [key: string]: Referral[] }>>;
  patientToothNotes: { [key: string]: ToothNote[] };
  setPatientToothNotes: React.Dispatch<React.SetStateAction<{ [key: string]: ToothNote[] }>>;
  lastScalingDates: { [key: string]: string | null };
  setLastScalingDates: React.Dispatch<React.SetStateAction<{ [key: string]: string | null }>>;
  patientConsents: { [key: string]: boolean };
  togglePatientConsent: (patient: Patient) => void;

  // Tooth modal
  setToothModalPatientId: (val: string) => void;
  setSelectedTooth: (val: string) => void;
  setShowToothModal: (val: boolean) => void;

  // Referral/note loading
  getReferrals: (permanentPatientId: string) => Promise<any>;
  getAllToothNotes: (permanentPatientId: string) => Promise<any>;
  onUpdateReferralStatus: (patientPermanentId: string, referralId: string, newStatus: string) => void;

  // FAB
  showAddModal: boolean;
  setShowAddModal: (val: boolean) => void;

  // Bottom nav
  setShowAppointments: (val: boolean) => void;
  setShowArchiveScreen: (val: boolean) => void;

  // AppModals props
  isPatientEditMode: boolean;
  setIsPatientEditMode: (val: boolean) => void;
  isModalExpanded: boolean;
  setIsModalExpanded: (val: boolean) => void;
  patientMode: 'search' | 'walk-in' | 'new-profile';
  setPatientMode: (val: 'search' | 'walk-in' | 'new-profile') => void;
  newPatientName: string;
  setNewPatientName: (val: string) => void;
  newPatientFileNumber: string;
  setNewPatientFileNumber: (val: string) => void;
  newPatientQueueNumber: string;
  setNewPatientQueueNumber: (val: string) => void;
  newPatientCondition: string;
  setNewPatientCondition: (val: string) => void;
  newPatientTreatment: string;
  setNewPatientTreatment: (val: string) => void;
  newPatientMinutes: number | null;
  setNewPatientMinutes: (val: number | null) => void;
  isElderly: boolean;
  setIsElderly: (val: boolean) => void;
  isSpecialNeeds: boolean;
  setIsSpecialNeeds: (val: boolean) => void;
  newPatientNote: string;
  setNewPatientNote: (val: string) => void;
  permanentPatientSearchResults: any[];
  setPermanentPatientSearchResults: (val: any[]) => void;
  selectedPermanentPatientId: string | null;
  setSelectedPermanentPatientId: (val: string | null) => void;
  showPatientSuggestions: boolean;
  setShowPatientSuggestions: (val: boolean) => void;
  showFileNumberSuggestions: boolean;
  setShowFileNumberSuggestions: (val: boolean) => void;
  fileNumberSearchResults: any[];
  setFileNumberSearchResults: (val: any[]) => void;
  modalEditingPatientId: string | null;
  setModalEditingPatientId: (val: string | null) => void;
  handleAddPatient: () => void;
  handleFileNumberSearch: (text: string) => void;
  handlePatientNameSearch: (text: string) => void;
  showMenuForPatient: string | null;
  handleMenuAction: (action: string, patientId: string) => void;
  showNoteModal: boolean;
  setShowNoteModal: (val: boolean) => void;
  currentNote: string;
  setCurrentNote: (val: string) => void;
  handleSaveNote: () => void;
  showViewNoteModal: boolean;
  setShowViewNoteModal: (val: boolean) => void;
  viewNoteContent: string;
  setViewNoteContent: (val: string) => void;
  notePatientId: string | null;
  handleDeleteNote: () => void;
  showConvertModal: boolean;
  setShowConvertModal: (val: boolean) => void;
  convertFileNumber: string;
  setConvertFileNumber: (val: string) => void;
  convertToPermanentPatient: () => void;
  showTreatmentDoneModal: boolean;
  setShowTreatmentDoneModal: (val: boolean) => void;
  clinicDoctors: any[];
  doctorSearchQuery: string;
  setDoctorSearchQuery: (val: string) => void;
  handleTreatmentDoneByDoctor: (doctorId: string) => void;
  showClinicDropdown: boolean;
  showConditionDropdown: boolean;
  showTreatmentDropdown: boolean;
  editingPatientId: string | null;
  handleUpdateField: (patientId: string, field: 'clinic' | 'condition' | 'treatment', value: string) => void;
  handleSetExpectedMinutes: (patientId: string, minutes: number | null) => void;
  handleSetAppointment: (patientId: string, min: number | null) => void;
  handleWriteNote: (patientId: string, note: string | null) => void;
  showTimelineModal: boolean;
  setShowTimelineModal: (val: boolean) => void;
  selectedPatient: Patient | null;
  timeline: TimelineEvent[];
  treatmentNote: string;
  setTreatmentNote: (val: string) => void;
  markTreatmentDone: () => void;
  showToothModal: boolean;
  toothModalPatientId: string;
  selectedTooth: string;
  currentDoctorName: string;
  treatmentDonePatientId: string | null;
  setDentalSummaries: React.Dispatch<React.SetStateAction<{ [key: string]: DentalSummary }>>;
}

// قائمةٌ متحرّكة: بها وحدَها يُربَطُ حدثُ التمريرِ بعقدةٍ أصليّةٍ فتُحسَبُ الشفافيّاتُ هناك.
// وهي FlatList نفسُها في كلِّ شيءٍ آخر، فيبقى النوعُ كما هو والمرجعُ يمرُّ إلى داخلِها.
const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

// ── ذوبانُ الكرتِ عندَ حدِّ القائمة ──
// t = موضعُ رأسِ الكرتِ من حدِّ القائمة: صفرٌ عندَ الحدِّ، وسالبٌ كلّما مضى خلفَه.
// عندَ الصفرِ تامٌّ — وهذا شرطٌ لا بدَّ منه، فالكرتُ الأوّلُ يستقرُّ ملاصقًا للحدِّ ولا
// يجوزُ أن يُرى باهتًا وهو ساكن. ثمّ ينحدرُ سريعًا فور مُضيِّه: عندَ سبعةَ عشرَ بكسلًا
// صارَ ثُلثَينِ، وعندَ ستّةٍ وثلاثينَ خُمسًا، ويفنى قبلَ أن يُقطَعَ نصفُه. فما يصلُ خطَّ
// القصِّ لا لونَ فيه يُرسمُ به خطّ.
//
// ويصغُرُ معَ بهوتِه قليلًا — ستّةٌ في المئة — فيُقرأُ مبتعِدًا إلى الخلفِ لا ذائبًا في
// مكانِه. وهي الفارقُ بينَ «اختفى» و«ذهبَ خلفَه».
const FADE_T = [-scale(52), -scale(36), -scale(17), 0];
const FADE_O = [0, 0.2, 0.66, 1];

// ما تُمرِّرُه القائمةُ للخليّةِ (onFocusCapture منها، وليس في أنواعِ View) يُمرَّرُ كما جاء
type CellProps = { children?: React.ReactNode; style?: any; onLayout?: (e: any) => void; onFocusCapture?: (e: any) => void };

const PlainCell = ({ children, style, onLayout, onFocusCapture }: CellProps) => {
  const pass: any = { style, onLayout, onFocusCapture };
  return <View {...pass}>{children}</View>;
};

const makeFadingCell = (scrollY: Animated.Value) =>
  function QueueCell({ children, style, onLayout, onFocusCapture }: CellProps) {
    // موضعُ الكرتِ في المحتوى، يُعرَفُ بالقياس. وقبلَ أن يُقاسَ فهو بعيدٌ جدًّا — أي تامٌّ.
    const top = useRef(new Animated.Value(99999)).current;
    const t = useMemo(() => Animated.subtract(top, scrollY), [top, scrollY]);
    const opacity = useMemo(
      () => t.interpolate({ inputRange: FADE_T, outputRange: FADE_O, extrapolate: 'clamp' }), [t]);
    const shrink = useMemo(
      () => t.interpolate({ inputRange: [FADE_T[0], 0], outputRange: [0.94, 1], extrapolate: 'clamp' }), [t]);
    const pass: any = {
      style: [style, { opacity, transform: [{ scale: shrink }] }],
      onLayout: (e: any) => { top.setValue(e.nativeEvent.layout.y); onLayout?.(e); },
      onFocusCapture,
    };
    return <Animated.View {...pass}>{children}</Animated.View>;
  };

// ── ذاكرةُ اللوحِ خارجَ الشجرة ──
// كما تُحفَظُ صفحةُ الصفّاحةِ في QueueTimeline (lastPage): في الذاكرةِ لا في التخزينِ الدائم،
// لأنّ قراءةَ التخزينِ غيرُ متزامنة، فتُرى الحالُ الأولى لحظةً ثمّ تقفز — وقفزةٌ مع كلِّ
// دخولٍ أسوأُ من نسيانٍ عندَ إعادةِ تشغيلِ التطبيق. لكلِّ مركزٍ مفتاحُه.
const lastFold: { [clinic: string]: 0 | 1 } = {};
const lastStatsH: { [clinic: string]: number } = {};

export const MainQueueScreen: React.FC<MainQueueScreenProps> = (props) => {
  const {
    timelineBlob1Anim,
    timelineBlob2Anim,
    timelineBlob3Anim,
    timelineBlob4Anim,
    timelineBlob5Anim,
    timelineBlob6Anim,
    headerTranslateY,
    queueMarginTop,
    headerElementsOpacity,
    headerElementsTranslate,
    isHeaderCollapsed,
    toggleHeaderCollapse,
    selectedClinicName,
    selectedClinicId,
    user,
    totalPatients,
    waitingPatients,
    treatmentStats,
    showTreatmentStats,
    setShowTreatmentStats,
    showTimeline,
    filterWaitingOnly,
    setFilterWaitingOnly,
    expandedCardId,
    setExpandedCardId,
    expandedPermanentCardId,
    filteredPatients,
    patients,
    reloadPatients,
    animKey,
    setSavedClinicId,
    setSavedClinicName,
    setSelectedClinicId,
    setSelectedClinicName,
    showClinicDetails,
    setShowClinicDetails,
    showDentalDepartments,
    setShowDentalDepartments,
    setShowDoctorProfile,
    setNavigationStack,
    setShowMenuForPatient,
    handleViewNote,
    openTimeline,
    setEditingPatientId,
    setEditingField,
    setShowClinicDropdown,
    setShowConditionDropdown,
    setShowTreatmentDropdown,
    handleViewDetails,
    cardTimelines,
    showTimelineTab,
    handleToggleTab,
    setSelectedPatientForProfile,
    setShowPatientFile,
    togglePermanentCardExpansion,
    loadDentalData,
    activeDentalTab,
    setActiveDentalTab,
    dentalSummaries,
    loadingDentalData,
    patientReferrals,
    setPatientReferrals,
    patientToothNotes,
    setPatientToothNotes,
    lastScalingDates,
    setLastScalingDates,
    patientConsents,
    togglePatientConsent,
    setToothModalPatientId,
    setSelectedTooth,
    setShowToothModal,
    getReferrals,
    getAllToothNotes,
    showAddModal,
    setShowAddModal,
    setShowAppointments,
    setShowArchiveScreen,
    showToothModal,
    toothModalPatientId,
    selectedTooth,
    currentDoctorName,
    setDentalSummaries,
    setModalEditingPatientId,
    setViewNoteContent,
  } = props;

  // سياقُ حجزِ موعدِ الدخول: يأتي جاهزًا من مخطّطِ الدور (QueueTimelinePager عبرَ onSchedule) فيطابقُ
  // تمامًا ما يظهرُ على المخطّطِ — محاكاةً كان أو وقتًا فعليًّا. يُخزَّنُ في مرجعٍ (ref) كي لا تُعادَ
  // رسمُ قائمةِ الكروتِ مع كلِّ نبضةِ ساعةِ المحاكاة، ويُلتقَطُ لقطةً عندَ فتحِ كرتٍ للحجز.
  const scheduleRef = useRef<{ lanes: Lane[]; chairCount: number; breaks: Break[]; nowMin: number }>({ lanes: [], chairCount: 0, breaks: [], nowMin: 0 });
  // ── ساعةُ دخولِ المنتظِرِ على كرتِه ──
  // هي ساعةُ المخطّطِ نفسُها لا حسابٌ ثانٍ يُشبِهُها: تُؤخَذُ من الكتلةِ التي رسمَها المخطّطُ
  // لذلك المريضِ بعينِه. ولأنّ اللقطةَ في مرجعٍ (كي لا تُعادَ رسمُ القائمةِ مع كلِّ نبضةِ
  // ساعة)، نُخرِجُ منها هذا القدرَ إلى حالةٍ — ولا تُحدَّثُ إلّا إذا **تغيّرَ رقمٌ فعلًا**،
  // فبصمةٌ نصّيّةٌ تُقارَنُ أوّلًا. فالساعةُ تمضي دقائقَ دون أن يتحرّكَ الدورُ فلا تُرسَمُ القائمة.
  const [etaMap, setEtaMap] = useState<{ [id: string]: number }>({});
  const etaSig = useRef('');
  const onSchedule = useCallback((lanes: Lane[], chairCount: number, breaks: Break[], nowMin: number) => {
    scheduleRef.current = { lanes, chairCount, breaks, nowMin };
    const next = etaFromLanes(lanes);
    const sig = Object.keys(next).sort().map((k) => k + ':' + next[k]).join('|');
    if (sig !== etaSig.current) { etaSig.current = sig; setEtaMap(next); }
  }, []);
  const appointmentCtx = useMemo(() => scheduleRef.current, [expandedPermanentCardId, patients]);

  // ── الإحصاءُ يُطوى بالسحب، والطيُّ يتبعُ الإصبع ──
  // سحبةٌ للأعلى فوقَ بطاقتَي «Total / Waiting» تُقلِّصُهما إلى شريطٍ زجاجيٍّ واحدٍ
  // يحملُ الأرقامَ نفسَها، والمساحةُ المتحرِّرةُ تنزلُ لكروتِ المرضى.
  //
  // كان القرارُ يقعُ عندَ رفعِ الإصبع: تسحبُ فلا يتغيّرُ شيء، ثمّ يقفزُ الشكلُ دفعةً واحدة.
  // وسحبُ كرتِ المريضِ يفعلُ العكسَ — يمشي مع اليدِ بمقدارِ ما تُعطيه — فليكنْ هذا مثلَه:
  // foldT تمشي مع الإصبعِ بين ٠ (مفتوح) و١ (مطويّ)، فترى البطاقتَينِ تذهبانِ والشريطَ
  // يأتي وأنت ما زلتَ تسحب، ولا يستقرُّ الأمرُ على طرفٍ إلّا عندَ الرفع.
  //
  // ولا بكسلَ واحدًا من هذا يمرُّ على التخطيط. جرّبتُ ارتفاعًا متحرّكًا أوّلًا فقطّع:
  // الارتفاعُ خاصّيّةُ تخطيطٍ لا يعرفُها المحرّكُ الأصليّ، فكلُّ إطارٍ يعبرُ الجسرَ ويُعيدُ
  // حسابَ الصفحة. فالطيُّ هنا **إزاحةٌ لا ارتفاع**: صندوقٌ ثابتُ الارتفاعِ يقصُّ، وداخلَه
  // لوحٌ ينزلقُ للأعلى (البطاقتانِ تخرجانِ من فوقِه والشريطُ يدخلُ من تحته)، والقائمةُ
  // تنزلقُ معه بالقدرِ المتحرَّر. إزاحةٌ وشفافيّةٌ فقط — وكلتاهما تعملُ على المحرّكِ الأصليّ،
  // فالحركةُ كلُّها على خيطِ الواجهةِ ولا تمسُّ جافاسكربت.
  const STRIP_H = scale(50);
  // ── والطيُّ يبقى كما تركتَه ──
  // صفحةُ الدورِ تُهدَمُ كلَّما حلَّ محلَّها ملفُّ مريضٍ أو صفحةٌ أخرى، فتُفقَدُ حالتُها.
  // وقد كانت صفحةُ الصفّاحةِ تبقى (lastPage في QueueTimeline) بينما يعودُ اللوحُ منشورًا
  // وإن تركتَه مطويًّا — فيرجعُ نصفُ ما تركتَ. نحفظُ الطيَّ حيثُ نحفظُها: خارجَ الشجرة.
  // ومعه ارتفاعُ البطاقتَينِ المقيس، لأنّ مسافةَ الطيِّ تُشتَقُّ منه — ولا يُقاسُ وهو مطويّ،
  // فلولا حفظُه لعادَ مطويًّا بمسافةِ صفر. فيُستأنَفُ مكانَه من أوّلِ إطارٍ بلا قفزة.
  const foldKey = selectedClinicId || '·';
  const [statsH, setStatsH] = useState(() => lastStatsH[foldKey] ?? 0);   // ارتفاعُ البطاقتَين — منه تُشتَقُّ مسافاتُ الإزاحة
  const foldedRef = useRef(!!lastFold[foldKey]);

  const foldT = useRef(new Animated.Value(lastFold[foldKey] ? 1 : 0)).current;   // ٠ مفتوح · ١ مطويّ
  const foldAt = useRef<0 | 1>(lastFold[foldKey] ? 1 : 0);                       // الطرفُ المستقرُّ الذي تبدأُ منه السحبةُ التالية
  const rangeRef = useRef(1);                            // ما تقطعُه السحبةُ بالبكسل
  rangeRef.current = Math.max(1, statsH - STRIP_H);

  // اللوحُ يصعدُ بكاملِ ارتفاعِ البطاقتَين، فيحلُّ الشريطُ (وهو ملصَقٌ أسفلَهما) محلَّهما
  const sheetRise = useMemo(
    () => foldT.interpolate({ inputRange: [0, 1], outputRange: [0, -statsH] }), [statsH, foldT]);
  // والقائمةُ تصعدُ بالفرقِ وحدَه — وهو المساحةُ التي تحرّرت لها.
  // إلّا أن يكونَ كرتٌ موسَّعًا: عندَها يُلغى رأسُ الصفحةِ كلُّه (height:0) فلا مساحةَ
  // تحرّرت ولا صعودَ — ولو بقيَ الصعودُ لارتفعَ الكرتُ فوقَ حافّةِ الشاشةِ واختفى رأسُه.
  // نضربُ في مفتاحٍ لا نُبدِّلُ العُقدةَ بعدد: منظرٌ يتأرجحُ بين قيمةٍ متحرّكةٍ وثابتةٍ
  // يُعيدُ ربطَ عُقدتِه في كلِّ مرّة، وهذا بابُ أعطالٍ في المحرّكِ الأصليّ.
  //
  // ويتحرّكُ المفتاحُ بمدّةِ LayoutAnimation نفسِها ومنحناها (٢٤٠ms، easeInOut) — وهي التي
  // يُطويها بها الكرتُ رأسَ الصفحة. فلو كان المفتاحُ لحظيًّا لنزلت القائمةُ دفعةً واحدةً
  // ثمّ سحبَها انطواءُ الرأسِ إلى فوقَ على مهلٍ: نَزْوَةٌ ثمّ انزلاق. وباتّفاقِ المدّتَينِ
  // تُلغي الحركتانِ إحداهما الأخرى فلا يُرى إلّا مستقرُّ الأمر.
  const expandT = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(expandT, {
      toValue: expandedPermanentCardId ? 1 : 0,
      duration: 240,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [expandedPermanentCardId, expandT]);
  const listRise = useMemo(
    () => Animated.multiply(
      foldT.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(0, statsH - STRIP_H)] }),
      Animated.subtract(1, expandT),
    ), [statsH, foldT, expandT]);
  // البطاقتانِ تذهبانِ في أوّلِ السحبة، والشريطُ يأتي في آخرِها — فلا يُقرآنِ معًا
  const cardsFade = useMemo(
    () => foldT.interpolate({ inputRange: [0, 0.55], outputRange: [1, 0], extrapolate: 'clamp' }), [foldT]);
  const stripFade = useMemo(
    () => foldT.interpolate({ inputRange: [0.35, 0.9], outputRange: [0, 1], extrapolate: 'clamp' }), [foldT]);

  // ── الإزاحةُ لا تُعاد، لأنّها لا تضيع ──
  // الكرتُ الموسَّعُ وحدَه في الصفحةِ كما هو التصميم، فينكمشُ المحتوى إلى كرتٍ واحد.
  // وكنتُ أُعالِجُ ما يترتّبُ على ذلك: تُقصَرُ الإزاحةُ إلى صفرٍ قسرًا (لم يبقَ محتوًى
  // تُقاسُ عليه)، فأُعيدُها عندَ الإغلاق. والعلاجُ نفسُه كان هو الثقل: القائمةُ تجدُ
  // نفسَها عندَ الصفرِ فتبني نافذةَ الرأسِ كلَّها، ثمّ تُقفَزُ إلى الخامسِ والعشرينَ فتبني
  // نافذةً ثانية — أربعَ عشرةَ بطاقةً بدلَ سبع، وكلُّها في مشهدٍ واحد.
  //
  // فالأصلحُ ألّا تُقصَرَ الإزاحةُ من أوّلِها: يبقى المحتوى بطولِه (minHeight) وينزلُ
  // الكرتُ الموسَّعُ إلى موضعِ إزاحتِك (paddingTop)، فتراه في رأسِ الشاشةِ والقائمةُ لم
  // تبرحْ مكانَها. وعندَ الإغلاقِ لا قفزةَ ولا انتظار: هي حيثُ كانت، وتبني نافذتَها
  // الصحيحةَ من أوّلِ مرّة.
  //
  // ويُقاسُ الأدنى بارتفاعِ الشاشةِ لا بارتفاعِ القائمة. فالقائمةُ تطولُ وتقصرُ في أثناءِ
  // ذلك (رأسُ الصفحةِ ينطوي بـ LayoutAnimation، وهامشُها السالبُ يُلغى)، وقياسُها يصلُ
  // متأخّرًا إطارًا أو إطارَين — ففي تلك الفجوةِ يصيرُ المحتوى أقصرَ ممّا يلزم فتُقصَرُ
  // الإزاحةُ عشراتِ البكسلات، وهي التي كنتَ تراها «تعودُ للأعلى قليلًا». وارتفاعُ الشاشةِ
  // سقفٌ لا تبلغُه القائمةُ أبدًا، فلا فجوةَ ولا قياسَ ولا إعادةَ رسم.
  const WIN_H = Dimensions.get('window').height;
  const listRef = useRef<FlatList<Patient>>(null);
  const offsetY = useRef(0);
  const [frozenY, setFrozenY] = useState(0);   // الإزاحةُ التي جُمِّدت عليها الصفحةُ وهي موسَّعة

  const toggleCard = useCallback((patient: Patient) => {
    if (expandedPermanentCardId !== patient.id) { setFrozenY(offsetY.current); }
    // وإن قرأتَ في الكرتِ الموسَّعِ فتمرّرت، فالإغلاقُ يردُّكَ إلى موضعِك لا إلى موضعِ
    // قراءتِك. والردُّ هنا رخيص: القائمةُ ما زالت كرتًا واحدًا، فلا نافذةَ تُبنى.
    else if (Math.abs(offsetY.current - frozenY) > 1) {
      listRef.current?.scrollToOffset({ offset: frozenY, animated: false });
      offsetY.current = frozenY;
    }
    togglePermanentCardExpansion(patient);
  }, [expandedPermanentCardId, frozenY, togglePermanentCardExpansion]);

  // ── لا يُقطَعُ إلّا ما بقيَ ظاهرًا ──
  // كان الضبابُ يُغطّي الحدَّ من فوق: جسمٌ يُوضَعُ على الصفحةِ ليَستُرَ ما تحتَه، فيُرى هو.
  // والصوابُ ألّا يكونَ عندَ الحدِّ ما يُستَر: الكرتُ يبهُتُ وهو يمضي خلفَه، فلا يبلغُ خطَّ
  // القصِّ منه إلّا شبح. لا طبقةَ فوقَ الصفحة، ولا شيءَ يظهرُ ويختفي، ولا لونَ يُطمَسُ به
  // ما تحتَه — الأثرُ في الكرتِ نفسِه.
  //
  // والإزاحةُ تُقادُ بالمحرّكِ الأصليّ: حدثُ التمريرِ يكتبُ scrollY في العقدةِ الأصليّةِ
  // مباشرةً، فتُحسَبُ شفافيّةُ كلِّ كرتٍ هناك ولا يعبرُ الجسرَ في الإطارِ شيء.
  const scrollY = useRef(new Animated.Value(0)).current;
  const onListScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: true,
      listener: (e: any) => { offsetY.current = e.nativeEvent.contentOffset.y; },
    }),
    [scrollY]);
  // كرتٌ موسَّعٌ طويلٌ لا يُبهَت: رأسُه يعلو الحدَّ وأنتَ تقرأُ ذيلَه، فلو رُبِطَ البهوتُ
  // برأسِه لغابَ كلُّه وأنتَ فيه. والبهوتُ لقصيرٍ منتظمٍ فحسب.
  const Cell = useMemo(
    () => (expandedPermanentCardId ? PlainCell : makeFadingCell(scrollY)),
    [expandedPermanentCardId, scrollY]);

  // نافذةُ الدخول: تُفتَحُ عندَ أوّلِ رسمٍ للصفحةِ (ومع كلِّ animKey جديد) وتُغلَقُ بعدَها.
  // ما رُكِّبَ داخلَها فهو داخلٌ يتتابع، وما رُكِّبَ بعدَها فهو عائدٌ يظهرُ في مكانِه.
  const enterUntil = useRef(0);
  React.useEffect(() => { enterUntil.current = Date.now() + 700; }, [animKey]);

  // ── سحبُ الطابورِ إلى الأسفل ──
  // كالمخطّط: الحيُّ (Realtime) هو الأصلُ ولم يُمَسَّ، وهذه يدُك للحظةِ الشكِّ وحدَها.
  // وأرضيّةٌ قصيرةٌ للدوّار: ردٌّ يعودُ في لمحةٍ يجعلُه ومضةً تُقرأُ عطلًا لا تحديثًا.
  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    const floor = new Promise((r) => setTimeout(r, 350));
    try { await Promise.all([Promise.resolve(reloadPatients?.()), floor]); } catch {}
    setRefreshing(false);
  }, [reloadPatients]);

  const settle = useCallback((to: 0 | 1) => {
    foldAt.current = to;
    foldedRef.current = to === 1;
    lastFold[foldKey] = to;                                // يُستأنَفُ عليه عندَ العودة
    Animated.spring(foldT, { toValue: to, useNativeDriver: true, speed: 15, bounciness: 0 }).start();
  }, [foldT, foldKey]);

  // عموديًّا فقط، وإلّا فالسحبُ الأفقيُّ يبقى لصفحاتِ المخطّط
  const statsPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        foldT.setValue(Math.max(0, Math.min(1, foldAt.current - g.dy / rangeRef.current)));
      },
      onPanResponderRelease: (_e, g) => {
        // السرعةُ تُرجِّحُ قبلَ المسافة: نفضةٌ قصيرةٌ سريعةٌ تكفي، كما في سحبِ الكرت
        const t = Math.max(0, Math.min(1, foldAt.current - g.dy / rangeRef.current));
        settle(g.vy < -0.4 ? 1 : g.vy > 0.4 ? 0 : t > 0.5 ? 1 : 0);
      },
      onPanResponderTerminate: () => settle(foldAt.current === 1 ? 1 : 0),
    }),
  ).current;


  // إجراءاتُ نافذةِ المريضِ على المخطّط = دوالُّ الكرتِ نفسُها، فالحدثُ واحدٌ أينما نُفِّذ:
  // الإدخالُ يكتبُ العيادةَ ووقتَ الدخول، و«غيرُ متاح» يُبدّلُ الحالة، و«إنهاء» يفتحُ مسارَ Done ذاتَه.
  const tlEnterClinic = useCallback((patientId: string, clinic: string) => {
    props.handleUpdateField(patientId, 'clinic', clinic);
  }, [props.handleUpdateField]);
  const tlToggleNA = useCallback((patientId: string) => {
    (props.handleMenuAction as unknown as (id: string, action: string) => void)(patientId, 'na');
  }, [props.handleMenuAction]);
  const tlDone = useCallback((patientId: string) => {
    (props.handleMenuAction as unknown as (id: string, action: string) => void)(patientId, 'complete');
  }, [props.handleMenuAction]);

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
                    outputRange: [scale(0), scale(30)],
                  }),
                },
                {
                  translateY: timelineBlob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(40)],
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
                    outputRange: [scale(0), scale(-25)],
                  }),
                },
                {
                  translateY: timelineBlob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(35)],
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
                    outputRange: [scale(0), scale(20)],
                  }),
                },
                {
                  translateY: timelineBlob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-30)],
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
                    outputRange: [scale(0), scale(-20)],
                  }),
                },
                {
                  translateY: timelineBlob4Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(25)],
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
                    outputRange: [scale(0), scale(28)],
                  }),
                },
                {
                  translateY: timelineBlob5Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-32)],
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
                    outputRange: [scale(0), scale(-18)],
                  }),
                },
                {
                  translateY: timelineBlob6Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(22)],
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
            },
            // an expanded card owns the page: the chrome above it is invisible
            // anyway, so it gives up its space too
            expandedPermanentCardId ? fold.away : null,
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
                <Ionicons name="arrow-back" size={scale(24)} color="#7DD3C0" style={{ zIndex: 10 }} />
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
                <Ionicons name="arrow-back" size={scale(24)} color="#7DD3C0" style={{ zIndex: 10 }} />
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Dental Clinic</Text>
            {selectedClinicName && (
              <Text style={styles.headerSubtitle}>{selectedClinicName}</Text>
            )}
          </View>

          <View style={{ width: scale(44) }} />
        </Animated.View>

        {/* Statistics + horizontal timeline (swipe left/right) — swipe up/down to fold */}
        <Animated.View
          style={[
            { marginBottom: scale(24) },
            {
              transform: [
                { translateY: headerTranslateY },
                { translateY: headerElementsTranslate },
              ],
              opacity: headerElementsOpacity,
              zIndex: expandedPermanentCardId ? 1 : 10,
            },
            fold.clip,
            expandedPermanentCardId ? fold.away : null,
          ]}
          // box-none لا auto: الصندوقُ يحتفظُ بارتفاعِ البطاقتَينِ كاملًا حتّى وهو مطويّ
          // (الطيُّ إزاحةٌ لا ارتفاع)، فلو التقطَ اللمسَ بنفسِه لابتلعَ ما تحتَ الشريطِ من
          // الشاشة — وهناك يقعُ أوّلُ كرتَين. فلْيمرَّ اللمسُ خلالَه إلّا حيثُ يقفُ ابنٌ.
          pointerEvents={expandedPermanentCardId ? 'none' : 'box-none'}
        >
        {/* اللوحُ المنزلِق: البطاقتانِ، والشريطُ ملصَقٌ أسفلَهما مباشرةً (top:'100%')
            فلا يزيدُ في ارتفاعِ الصندوقِ ولا يحتاجُ قياسًا كي يقفَ في مكانِه. */}
        <Animated.View
          style={{ transform: [{ translateY: sheetRise }] }}
          {...statsPan.panHandlers}
        >
        <Animated.View
          style={{ opacity: cardsFade }}
          onLayout={(e) => {
            // re-measured whenever the cards themselves change height (the
            // statistics card is taller than the two counters)
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== statsH && !foldedRef.current) { setStatsH(h); lastStatsH[foldKey] = h; }
          }}
        >
          <QueueTimelinePager
            patients={patients}
            clinicId={selectedClinicId}
            currentDoctorName={currentDoctorName}
            onSchedule={onSchedule}
            onEnterClinic={tlEnterClinic}
            onToggleNA={tlToggleNA}
            onDone={tlDone}
            // سحبُ المخطّطِ إلى الأسفل: نفسُ الجلبِ الذي يستدعيه الحيُّ (وهو باقٍ كما هو).
            // نمرّرُها كما هي — مرجعٌ ثابتٌ لا يُعادُ بناؤه مع كلِّ رسمة.
            onReload={reloadPatients}
            // «Show profile» من نافذةِ المخطّط — نفسُ مسارِ فتحِ الملفِّ من كرتِ الدور
            onProfile={(id) => {
              const p = patients.find((x) => x.id === id);
              if (!p?.permanent_patient_id) return;
              setSelectedPatientForProfile({ id: p.permanent_patient_id, fileNumber: p.file_number || '' });
              setShowPatientFile(true);
            }}
            // بطاقتانِ لا تحملانِ إلّا رقمَين صارتا لوحًا واحدًا يحملُ اليومَ كلَّه — والعلاجاتُ
            // التي كانت خلفَ لمسةٍ لا يعرفُها أحدٌ صارت سطرًا ظاهرًا فيه.
            statsNode={
              <QueueBoard
                patients={patients}
                treatmentStats={treatmentStats}
                filterWaitingOnly={filterWaitingOnly}
                onToggleFilter={() => setFilterWaitingOnly(!filterWaitingOnly)}
                showTreatments={showTreatmentStats}
                onToggleTreatments={() => setShowTreatmentStats(!showTreatmentStats)}
              />
            }
          />
        </Animated.View>

          {/* what the two cards fold into — يقفُ تحتَ البطاقتَينِ تمامًا فيصعدُ محلَّهما */}
          <Animated.View style={[fold.under, { opacity: stripFade }]}>
            <QueueStatsStrip
              total={totalPatients}
              waiting={waitingPatients}
              patients={patients}
            />
          </Animated.View>
        </Animated.View>
        </Animated.View>

        {/* (حُذفَ لوحُ «Expandable Options»: كان يُفتَحُ بزرِّ «▼ View Details» في الرأس، وقد
            ذهبَ الزرُّ فلم يبقَ ما يضعُ expandedCardId='header' — لوحٌ بلا يدٍ تفتحُه.
            وفيه كان مفتاحا Show Timeline و Show NA Patient؛ والاثنانِ سقطا معه.) */}

        {/* Content Wrapper - Animated with marginTop */}
        <Animated.View
          style={{
            flex: 1,
            marginTop: headerTranslateY,
          }}
        >
          {/* القائمةُ تصعدُ مع الطيِّ بالمساحةِ المتحرَّرة. إزاحةٌ لا ارتفاع، وطبقةٌ مستقلّةٌ
              عن الأمِّ لأنَّ تلك تتحرّكُ بمحرّكِ جافاسكربت (marginTop) وهذه بالمحرّكِ الأصليّ،
              ولا يجتمعُ محرّكانِ على منظرٍ واحد. والهامشُ السالبُ يُطيلُها بالقدرِ نفسِه،
              فما ينكشفُ أسفلَ الشاشةِ وهي تصعدُ مملوءٌ لا فراغ. */}
          <Animated.View
            style={{
              flex: 1,
              marginBottom: expandedPermanentCardId ? 0 : -Math.max(0, statsH - STRIP_H),
              transform: [{ translateY: listRise }],
            }}
          >
          {/* Patient List — قائمةٌ مُنافَذة (FlatList) لا ScrollView.
              كان الطابورُ يُركِّبُ كلَّ كروتِه دفعةً واحدة: مئتا كرتٍ = مئتا Swipeable
              وتدرّجًا لونيًّا مضاعفًا ونقطةً نابضة، كلُّها تُبنى قبلَ أن تُرسَمَ الشاشةُ
              أوّلَ مرّة. فلا يُنقَذُ ذلك بضبطِ حركةٍ ولا بتخفيفِ ظلّ. الآن يُركَّبُ ما
              يُرى وما يليه، ويأتي الباقي مع التمرير.
              removeClippedSubviews مُطفأٌ عمدًا: وجها الكرتِ (الوجهُ والظهر) مطلقانِ
              فوقَ بعضِهما، وقصُّ الأبناءِ على أندرويد يُفرِّغُ مثلَ هذه البِنى. */}
          <AnimatedFlatList
            ref={listRef}
            CellRendererComponent={Cell}
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              // موسَّعٌ: الكرتُ ينزلُ إلى موضعِ إزاحتِك، والمحتوى يبقى بطولٍ يُبقيها صالحة
              expandedPermanentCardId
                ? { paddingTop: frozenY + scale(52), minHeight: frozenY + WIN_H }
                : null,
            ]}
            data={filteredPatients.filter(p => !expandedPermanentCardId || p.id === expandedPermanentCardId)}
            // القائمةُ المُنافَذةُ لا تُعيدُ رسمَ صفوفِها لتغيُّرِ شيءٍ خارجَ عناصرِها — وساعاتُ
            // الدخولِ خارجُها. ومرجعُ الخريطةِ لا يتبدّلُ إلّا إذا تبدّلَ رقمٌ فعلًا.
            extraData={etaMap}
            keyExtractor={(patient) => `${patient.id}-${animKey}`}
            onScroll={onListScroll}
            // آخرُ إطارٍ هو المهمّ: بالخنقِ وحدَه تفوتُ نهايةُ الاندفاعِ فتُحفَظُ إزاحةٌ
            // أقدمُ من الحقيقيّةِ ببضعِ عشراتِ البكسلات — فيُلتقَطُ المستقرُّ صراحةً.
            onScrollEndDrag={(e) => { offsetY.current = e.nativeEvent.contentOffset.y; }}
            onMomentumScrollEnd={(e) => { offsetY.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            // السحبُ للتحديث — لا وأنتَ داخلَ كرتٍ موسَّع: القائمةُ حينَها مجمَّدةٌ على
            // إزاحتِك بحشوةٍ عليا، فسحبُها ليس طلبَ خبرٍ بل خروجٌ من قراءتِك.
            refreshControl={expandedPermanentCardId ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
                tintColor="#0E7C66"
                colors={['#0E7C66']}
                progressBackgroundColor="#FFFFFF"
              />
            )}
            initialNumToRender={7}
            maxToRenderPerBatch={4}
            updateCellsBatchingPeriod={60}
            windowSize={5}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: patient, index }) => (
            USE_V2_CARD ? (
            <PatientCardV2
              key={`${patient.id}-${animKey}`}
              patient={patient}
              index={index}
              animKey={animKey}
              animate={Date.now() < enterUntil.current}
              isExpanded={expandedPermanentCardId === patient.id}
              onUpdateField={props.handleUpdateField}
              onSetDuration={props.handleSetExpectedMinutes}
              onSetAppointment={props.handleSetAppointment}
              onWriteNote={props.handleWriteNote}
              onMenuAction={(id, action) => (props.handleMenuAction as unknown as (id: string, action: string) => void)(id, action)}
              onProfilePress={(pp) => {
                setSelectedPatientForProfile({ id: pp.permanent_patient_id || pp.id, fileNumber: pp.file_number || '' });
                setShowPatientFile(true);
              }}
              onToggleExpand={() => toggleCard(patient)}
              hasProfile={!!patient.permanent_patient_id}
              appointmentCtx={appointmentCtx}
              etaMin={etaMap[patient.id] ?? null}
              renderProfile={(backRef) => (
                <ExpandedPatientHeader
                  backRef={backRef}
                  patient={patient as any}
                  dentalSummary={(dentalSummaries[patient.id] || null) as any}
                  loadingDentalData={loadingDentalData[patient.id] || false}
                  patientReferrals={(patient.permanent_patient_id ? patientReferrals[patient.permanent_patient_id] || [] : []) as any}
                  loadingReferrals={false}
                  onLoadReferrals={async () => {
                    if (!patient.permanent_patient_id) return;
                    const result = await getReferrals(patient.permanent_patient_id);
                    if (result.data) setPatientReferrals(prev => ({ ...prev, [patient.permanent_patient_id!]: result.data || [] }));
                  }}
                  toothNotes={(patient.permanent_patient_id ? patientToothNotes[patient.permanent_patient_id] || [] : []) as any}
                  loadingToothNotes={false}
                  onLoadToothNotes={async () => {
                    if (!patient.permanent_patient_id) return;
                    const result = await getAllToothNotes(patient.permanent_patient_id);
                    if (result.data) setPatientToothNotes(prev => ({ ...prev, [patient.permanent_patient_id!]: result.data || [] }));
                  }}
                  lastScalingDate={lastScalingDates[patient.id] ? new Date(lastScalingDates[patient.id]!) : undefined}
                  onFluoridePress={() => {}}
                  onScalingPress={async () => {
                    if (!patient.permanent_patient_id) return;
                    const { error } = await createScalingRecord(patient.permanent_patient_id, currentDoctorName || 'Doctor');
                    if (error) { Alert.alert('Error', 'Failed to save'); return; }
                    const { data: recs } = await getScalingRecords(patient.permanent_patient_id);
                    if (recs && recs.length > 0) {
                      const latest = recs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                      setLastScalingDates(prev => ({ ...prev, [patient.id]: latest.timestamp }));
                    }
                    Alert.alert('Success', 'Scaling record saved');
                  }}
                  patientConsents={patientConsents[patient.id] ? [{ consent_type: 'general', signed: true }] : []}
                  onConsentPress={() => togglePatientConsent(patient)}
                  onOpenDentalChart={() => {
                    if (!patient.permanent_patient_id) return;
                    setSelectedPatientForProfile({ id: patient.permanent_patient_id, fileNumber: patient.file_number || '' });
                    setShowPatientFile(true);
                  }}
                  onTogglePermanentExpansion={() => toggleCard(patient)}
                  onToothEditPress={(_pid, tooth) => {
                    if (!patient.permanent_patient_id) return;
                    setToothModalPatientId(patient.permanent_patient_id);
                    setSelectedTooth(String(tooth));
                    setShowToothModal(true);
                  }}
                  onPatientNamePress={(patientId, fileNumber) => {
                    setSelectedPatientForProfile({ id: patientId, fileNumber });
                    setShowPatientFile(true);
                  }}
                  doctorName={currentDoctorName}
                  // undoing a treatment repaints its tooth, so the summary
                  // the card is showing has to be read again
                  onDentalChanged={() => {
                    if (patient.permanent_patient_id) loadDentalData?.(patient.permanent_patient_id, patient.id, true);
                  }}
                  embedded
                />
              )}
            />
            ) : (
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
              appointmentCtx={appointmentCtx}
              onTogglePermanentExpansion={toggleCard}
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
            )
          )}
        />

          </Animated.View>

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
            <Ionicons name="home-sharp" size={scale(26)} color="#7DD3C0" />
            <Text style={[styles.navLabel, styles.navLabelActive]}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setShowPatientFile(true)}
          >
            <Ionicons name="person-circle" size={scale(28)} color="#9CA3AF" />
            <Text style={styles.navLabel}>Patient File</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setShowAppointments(true)}
          >
            <Ionicons name="calendar-sharp" size={scale(26)} color="#9CA3AF" />
            <Text style={styles.navLabel}>Appointments</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setShowArchiveScreen(true)}
          >
            <Ionicons name="archive-sharp" size={scale(26)} color="#9CA3AF" />
            <Text style={styles.navLabel}>Archive</Text>
          </TouchableOpacity>
        </View>

        <AppModals
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
          isPatientEditMode={props.isPatientEditMode}
          setIsPatientEditMode={props.setIsPatientEditMode}
          isModalExpanded={props.isModalExpanded}
          setIsModalExpanded={props.setIsModalExpanded}
          patientMode={props.patientMode}
          setPatientMode={props.setPatientMode}
          newPatientName={props.newPatientName}
          setNewPatientName={props.setNewPatientName}
          newPatientFileNumber={props.newPatientFileNumber}
          setNewPatientFileNumber={props.setNewPatientFileNumber}
          newPatientQueueNumber={props.newPatientQueueNumber}
          setNewPatientQueueNumber={props.setNewPatientQueueNumber}
          newPatientCondition={props.newPatientCondition}
          setNewPatientCondition={props.setNewPatientCondition}
          newPatientTreatment={props.newPatientTreatment}
          setNewPatientTreatment={props.setNewPatientTreatment}
          newPatientMinutes={props.newPatientMinutes}
          setNewPatientMinutes={props.setNewPatientMinutes}
          isElderly={props.isElderly}
          setIsElderly={props.setIsElderly}
          isSpecialNeeds={props.isSpecialNeeds}
          setIsSpecialNeeds={props.setIsSpecialNeeds}
          newPatientNote={props.newPatientNote}
          setNewPatientNote={props.setNewPatientNote}
          permanentPatientSearchResults={props.permanentPatientSearchResults}
          setPermanentPatientSearchResults={props.setPermanentPatientSearchResults}
          selectedPermanentPatientId={props.selectedPermanentPatientId}
          setSelectedPermanentPatientId={props.setSelectedPermanentPatientId}
          showPatientSuggestions={props.showPatientSuggestions}
          setShowPatientSuggestions={props.setShowPatientSuggestions}
          showFileNumberSuggestions={props.showFileNumberSuggestions}
          setShowFileNumberSuggestions={props.setShowFileNumberSuggestions}
          fileNumberSearchResults={props.fileNumberSearchResults}
          setFileNumberSearchResults={props.setFileNumberSearchResults}
          modalEditingPatientId={props.modalEditingPatientId}
          handleAddPatient={props.handleAddPatient}
          handleFileNumberSearch={props.handleFileNumberSearch}
          handlePatientNameSearch={props.handlePatientNameSearch}
          patients={patients}
          showMenuForPatient={props.showMenuForPatient}
          setShowMenuForPatient={setShowMenuForPatient}
          handleMenuAction={props.handleMenuAction}
          showNoteModal={props.showNoteModal}
          setShowNoteModal={props.setShowNoteModal}
          currentNote={props.currentNote}
          setCurrentNote={props.setCurrentNote}
          handleSaveNote={props.handleSaveNote}
          showViewNoteModal={props.showViewNoteModal}
          setShowViewNoteModal={props.setShowViewNoteModal}
          viewNoteContent={props.viewNoteContent}
          notePatientId={props.notePatientId}
          handleDeleteNote={props.handleDeleteNote}
          showConvertModal={props.showConvertModal}
          setShowConvertModal={props.setShowConvertModal}
          convertFileNumber={props.convertFileNumber}
          setConvertFileNumber={props.setConvertFileNumber}
          convertToPermanentPatient={props.convertToPermanentPatient}
          showTreatmentDoneModal={props.showTreatmentDoneModal}
          setShowTreatmentDoneModal={props.setShowTreatmentDoneModal}
          clinicDoctors={props.clinicDoctors}
          doctorSearchQuery={props.doctorSearchQuery}
          setDoctorSearchQuery={props.setDoctorSearchQuery}
          handleTreatmentDoneByDoctor={props.handleTreatmentDoneByDoctor}
          showClinicDropdown={props.showClinicDropdown}
          setShowClinicDropdown={setShowClinicDropdown}
          showConditionDropdown={props.showConditionDropdown}
          setShowConditionDropdown={setShowConditionDropdown}
          showTreatmentDropdown={props.showTreatmentDropdown}
          setShowTreatmentDropdown={setShowTreatmentDropdown}
          editingPatientId={props.editingPatientId}
          handleUpdateField={props.handleUpdateField}
          showTimelineModal={props.showTimelineModal}
          setShowTimelineModal={props.setShowTimelineModal}
          selectedPatient={props.selectedPatient}
          timeline={props.timeline}
          treatmentNote={props.treatmentNote}
          setTreatmentNote={props.setTreatmentNote}
          markTreatmentDone={props.markTreatmentDone}
          showToothModal={showToothModal}
          setShowToothModal={setShowToothModal}
          toothModalPatientId={toothModalPatientId}
          selectedTooth={selectedTooth}
          currentDoctorName={currentDoctorName}
          treatmentDonePatientId={props.treatmentDonePatientId}
          setDentalSummaries={setDentalSummaries}
          setPatientReferrals={setPatientReferrals}
          setPatientToothNotes={setPatientToothNotes}
          setModalEditingPatientId={setModalEditingPatientId}
          setViewNoteContent={setViewNoteContent}
        />

      </View>
    </SafeAreaView>
    </View>
  );
};

// the strip sits over the cards' own space, so the fold is a single height change
const fold = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // ملصَقٌ أسفلَ اللوحِ بلا قياس: top:'100%' نسبةٌ من ارتفاعِ اللوحِ نفسِه، فيقفُ الشريطُ
  // خلفَ حافّتِه السفلى مهما تغيّرَ ارتفاعُ البطاقتَين، وخارجَ الصندوقِ القاصِّ فلا يُرى
  // حتّى يصعدَ اللوحُ به.
  under: { position: 'absolute', top: '100%', left: 0, right: 0 },
  away: { height: 0, marginBottom: 0, overflow: 'hidden' },
});
