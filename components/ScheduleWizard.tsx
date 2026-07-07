import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Animated,
  Easing, Platform, StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../lib/scale';
import { getDoctorGroups } from '../lib/database';
import { getTemplateByName } from '../lib/algorithms/groupTemplates';
import {
  schedule, loadDoctorRoster, WEEK_DAYS,
  type AssignedSlot, type ScheduleBuildInput, type WeekDay, type Period, type PreviewAbsence,
} from '../lib/algorithms/schedule';
import { parseExceptions, type ParsedExceptions, type RosterEntry, type Clarification, type ResolvedClarification, type UnsupportedRequest } from '../lib/ai_v2/parseExceptions';
import { ScheduleOrbit, type OrbitFacet } from './ScheduleOrbit';
import { GlassNavButton } from './GlassNavButton';
import { ScheduleGrid } from '../screens/Schedule/ScheduleGrid';
import type { ScheduleSlot, DoctorRole, DoctorStatus, DayOfWeek } from '../screens/Schedule/types';
// منطقُ الإنشاءِ المشترك (أنواع + تواريخ + تحويلُ المدخلات) — مصدرٌ واحدٌ مع كرتِ المحادثة
import {
  type DayKey, type ShiftValue, type TraineeMode, type TraineeConfig, type WizardResult,
  ALL_MORNING, snapToSunday, nextWeekSunday, thisWeekSunday, formatYMD, applyResolved, resultToBuildInput,
} from '../lib/algorithms/scheduleFlow';
// إعادةُ تصدير الأنواع للتوافق (يستوردها AISchedulePanel وشاشةُ الجدول من هنا)
export type { DayKey, ShiftValue, TraineeMode, TraineeConfig, WizardResult } from '../lib/algorithms/scheduleFlow';

// ═══════════════════════════════════════════════════════════════
// WizardContent — استبيان "إنشاء جدول" داخل صفحة الذكاء (لا Modal)
// ───────────────────────────────────────────────────────────────
// يُعرَض كطبقة داخل AISchedulePanel بعد أن تطير أزرار الجدول يمينًا.
// السؤال يظهر برأس الصفحة بوضوح (بنبرة الذكاء)، والتحكّم تحته،
// وحقل كتابة حرّ في نفس المكان لإجابة مستقلّة. خطوتان حاليًّا:
//   1) تاريخ بداية الأسبوع (افتراضي: الأسبوع القادم)
//   2) فترات عمل القروبات (جدول جيك-بوكس: صبح/عصر لكل يوم)
// الخلفية (التدرّج/الدخان) تأتي من اللوحة، لذا هذا المكوّن شفّاف.
// ═══════════════════════════════════════════════════════════════

const { width: W } = Dimensions.get('window');

// الأنواع (DayKey/ShiftValue/TraineeMode/TraineeConfig/WizardResult) نُقلت إلى
// lib/algorithms/scheduleFlow — تُستورَد وتُعاد تصديرُها أعلاه.

interface WizardContentProps {
  clinicId: string | null;
  onComplete: (result: WizardResult) => void;
  onBack: () => void;   // رجوع من الخطوة الأولى → مدار الجدول
  // تأكيد الأسماء الغامضة (يُدار في اللوحة، الجات): الويزرد يُبلّغ ويستهلك الحلول
  resolved?: ResolvedClarification[];          // حلول الأسماء الغامضة (من الجات)
  pendingClarifyCount?: number;                // عدد الغموض غير المحلول (لاعتراض الحفظ)
  onClarifications?: (list: Clarification[]) => void;  // تبليغ اللوحة بالأسماء الغامضة بعد البناء
  onNeedClarify?: () => void;                  // عند الحفظ مع وجود غموض → افتح الجات وحذّر
  onUnsupported?: (list: UnsupportedRequest[]) => void; // طلبات غير مدعومة → تُعرَض في الجات
  onPreviewChange?: (inPreview: boolean) => void;       // طورُ المعاينة (خلفيّةٌ فاتحة) → اللوحةُ تُلوّنُ زرَّ الجات
}

/** يدمج حلول الغموض (المُختارة في الجات) كغيابات/استئذانات في المدخلات قبل البناء */
const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 'sunday', label: 'الأحد', short: 'أحد' },
  { key: 'monday', label: 'الاثنين', short: 'اثنين' },
  { key: 'tuesday', label: 'الثلاثاء', short: 'ثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء', short: 'أربعاء' },
  { key: 'thursday', label: 'الخميس', short: 'خميس' },
];

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// رؤوس الأيام (إنجليزيّة) — بترتيب DAYS: الأحد ← الخميس
const EN_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU'];

// ─── تواريخ (snapToSunday/nextWeekSunday/thisWeekSunday/formatYMD في scheduleFlow) ───
function formatArabic(d: Date): string {
  return `الأحد ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── كرة الذكاء الصغيرة بجانب السؤال ──────────────────────────
const MINI_THREADS = [
  'M20 60 C 30 20, 90 20, 100 60 C 90 100, 30 100, 20 60 Z',
  'M60 20 C 100 30, 100 90, 60 100 C 20 90, 20 30, 60 20 Z',
  'M14 60 Q 32 30, 60 60 T 106 60',
  'M14 60 Q 32 90, 60 60 T 106 60',
];
function MiniOrb({ size = scale(30) }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }], shadowColor: '#A855F7', shadowOpacity: 0.8, shadowRadius: scale(6), shadowOffset: { width: 0, height: 0 } }}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {MINI_THREADS.map((d, i) => (
          <Path key={i} d={d} stroke={['#C084FC', '#A855F7', '#DDD6FE', '#8B5CF6'][i]} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.9} />
        ))}
        <Circle cx={60} cy={18} r={3} fill="#E9D5FF" />
      </Svg>
    </Animated.View>
  );
}

// ─── رأس السؤال (يظهر أعلى الصفحة) ────────────────────────────
function QuestionHeader({ step, total, text }: { step: number; total: number; text: string }) {
  return (
    <View style={{ paddingHorizontal: scale(22), paddingTop: scale(54), paddingBottom: scale(18) }}>
      <Text style={{ fontSize: scale(11), fontWeight: '700', color: 'rgba(196,176,255,0.55)', marginBottom: scale(12), textAlign: 'right' }}>
        السؤال {step} من {total}
      </Text>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(10) }}>
        <MiniOrb />
        <Text style={{ flex: 1, fontSize: scale(21), fontWeight: '800', color: '#F2ECFF', lineHeight: scale(30), textAlign: 'right' }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

type StepId = 'date' | 'groups' | 'board' | 'trainees' | 'exceptions';
const STEPS: StepId[] = ['date', 'groups', 'board', 'trainees', 'exceptions'];
// ALL_MORNING مُستورَدٌ من scheduleFlow

// أوجهُ «مُكوِّن المدار» — بؤرةٌ لكلّ خطوة (لونٌ + أيقونة + عنوان)
const FACET_META: { key: StepId; label: string; sub: string; color: [number, number, number]; icon: OrbitFacet['icon']; title: string }[] = [
  { key: 'date', label: 'التاريخ', sub: 'date', color: [120, 200, 150], icon: 'calendar', title: 'When does the week start?' },
  { key: 'groups', label: 'القروبات', sub: 'shifts', color: [250, 204, 21], icon: 'contrast', title: "Set the groups' work periods" },
  { key: 'board', label: 'البورد', sub: 'board', color: [120, 170, 255], icon: 'shield-half', title: 'Board settings' },
  { key: 'trainees', label: 'المتدرّبون', sub: 'trainees', color: [178, 120, 255], icon: 'people', title: 'Trainee settings' },
  { key: 'exceptions', label: 'الاستثناءات', sub: 'exceptions', color: [255, 150, 90], icon: 'document-text', title: 'Anything special this week?' },
];

// resultToBuildInput مُستورَدٌ من scheduleFlow (منطقٌ مشتركٌ مع كرتِ المحادثة)

export function WizardContent({ clinicId, onComplete, onBack, resolved = [], pendingClarifyCount = 0, onClarifications, onNeedClarify, onUnsupported, onPreviewChange }: WizardContentProps) {
  const [stepId, setStepId] = useState<StepId>('date');

  // التاريخ
  const [weekDate, setWeekDate] = useState<Date>(nextWeekSunday());
  const [showPicker, setShowPicker] = useState(false);

  // فترات القروبات (قروب A؛ B = العكس)
  const [shifts, setShifts] = useState<Record<DayKey, ShiftValue>>({ ...ALL_MORNING });

  // البورد (كلّه في صفحة واحدة)
  const [boardPresent, setBoardPresent] = useState(true);
  const [boardShifts, setBoardShifts] = useState<Record<DayKey, ShiftValue>>({ ...ALL_MORNING });
  const [boardInEx, setBoardInEx] = useState(false);

  // قائمة كل الأطباء (id/name) — لمطابقة أسماء الاستثناءات
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  // قروب كل طبيب (group_a/group_b/board/agd) — لتحديد شفته عند كتابة خانة EX
  const [groupKeyById, setGroupKeyById] = useState<Map<string, string>>(new Map());

  // المتدرّبون (كلّ متدرّب بأسئلته في صفحة واحدة)
  const [trainees, setTrainees] = useState<TraineeConfig[]>([]);
  const updateTrainee = (id: string, patch: Partial<TraineeConfig>) =>
    setTrainees((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // الاستثناءات الموحّدة (الصفحة الأخيرة)
  const [exceptionsText, setExceptionsText] = useState('');

  const [groupAName, setGroupAName] = useState('قروب A');
  const [groupBName, setGroupBName] = useState('قروب B');
  const [boardName, setBoardName] = useState('البورد');

  // إجابات حرّة لخطوتَي التاريخ والقروبات
  const [dateNote, setDateNote] = useState('');
  const [groupNote, setGroupNote] = useState('');

  // مُكوِّن المدار: البؤرة المفتوحة + البؤر المُكتملة + رسالةٌ عابرة للقلب
  const [openFacet, setOpenFacet] = useState<StepId | null>(null);
  const [done, setDone] = useState<Record<StepId, boolean>>({ date: false, groups: false, board: false, trainees: false, exceptions: false });
  const [centerHint, setCenterHint] = useState<string | null>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [pvMounted, setPvMounted] = useState(false);          // المعاينة مُركَّبة (تبقى أثناء تلاشي الخروج)
  const previewOp = useRef(new Animated.Value(0)).current;    // 0 = مدار .. 1 = معاينة

  // أسماء القروبات + قائمة المتدرّبين (اللوحة تعيد تركيب المكوّن عبر key عند كل فتح)
  useEffect(() => {
    if (!clinicId) return;
    (async () => {
      const { data: groups } = await getDoctorGroups(clinicId);
      if (groups) {
        for (const g of groups) {
          const key = getTemplateByName(g.name)?.key;
          if (key === 'group_a') setGroupAName(g.name);
          if (key === 'group_b') setGroupBName(g.name);
          if (key === 'board') setBoardName(g.name);
        }
      }
      const { doctors } = await loadDoctorRoster(clinicId);
      if (doctors) {
        setRoster(doctors.map((d) => ({ id: d.id, name: d.name })));
        setGroupKeyById(new Map(doctors.map((d) => [d.id, d.groupTemplate.key])));
        setTrainees(
          doctors
            .filter((d) => d.workStatus === 'trainee')
            .map((d) => ({ id: d.id, name: d.name, mode: 'beginner' as TraineeMode, inDelegator: false, inReserve: false })),
        );
      }
    })();
  }, [clinicId]);

  const toggleGroup = (day: DayKey) => setShifts((p) => ({ ...p, [day]: p[day] === 'morning' ? 'evening' : 'morning' }));
  const toggleBoard = (day: DayKey) => setBoardShifts((p) => ({ ...p, [day]: p[day] === 'morning' ? 'evening' : 'morning' }));
  // أسهمُ التاريخ: تنقّلٌ أسبوعًا للأمام/الخلف (مثبَّتًا على الأحد)
  const shiftWeek = (delta: number) => setWeekDate((d) => { const x = new Date(d); x.setDate(x.getDate() + delta * 7); return snapToSunday(x); });

  const collect = (): WizardResult => ({
    weekStart: formatYMD(weekDate),
    aShiftPlan: shifts,
    board: { present: boardPresent, shiftPlan: boardShifts, inExRotation: boardInEx },
    trainees: trainees.map((t) => ({ id: t.id, name: t.name, mode: t.mode, inDelegator: t.inDelegator, inReserve: t.inReserve })),
    exceptions: exceptionsText.trim() || undefined,
    dateNotes: dateNote.trim() || undefined,
    groupNotes: groupNote.trim() || undefined,
  });

  // البناء + المعاينة
  const [mode, setMode] = useState<'form' | 'preview'>('form');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ slots: AssignedSlot[]; absences: PreviewAbsence[]; clinicCount: number; summary: string; warnings: string[] } | null>(null);

  // نتيجة تفسير الاستثناءات (تُحسَب مرّة عند "أنشئ" وتُعاد عند "حفظ")
  const parsedRef = useRef<ParsedExceptions | null>(null);

  // يبني المعاينة من تفسيرٍ مُعطى (مع دمج حلول الغموض) — يُعاد استخدامه عند التحديث التلقائيّ
  const buildPreviewFrom = async (parsed: ParsedExceptions) => {
    if (!clinicId) { setBuildError('لا توجد عيادة مرتبطة بك.'); return; }
    setBuilding(true); setBuildError(null);
    try {
      const r = collect();
      const merged = applyResolved(parsed, resolved);
      const res = await schedule.build(resultToBuildInput(r, clinicId, true, merged));
      if (res.success && res.previewSlots) {
        const warnings = [
          ...parsed.unresolved.map((u) => `لم يُطبَّق تلقائيًّا: ${u}`),
          ...res.warnings,
        ];
        setPreview({ slots: res.previewSlots, absences: res.previewAbsences ?? [], clinicCount: res.clinicCount ?? 1, summary: res.summary, warnings });
        setMode('preview');
      } else {
        setBuildError(res.errors[0] || res.summary || 'تعذّر بناء الجدول.');
      }
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setBuilding(false);
    }
  };

  // "أنشئ الجدول" → يفسّر الاستثناءات (الذكاء يترجم) ثم يبني المعاينة + يُبلّغ بالأسماء الغامضة
  const runBuild = async () => {
    if (!clinicId) { setBuildError('لا توجد عيادة مرتبطة بك.'); return; }
    setBuilding(true); setBuildError(null);
    try {
      const r = collect();
      const parsed = await parseExceptions(r.exceptions || '', roster);
      parsedRef.current = parsed;
      onClarifications?.(parsed.clarifications);   // اللوحة تعرض البادج + تسأل في الجات
      onUnsupported?.(parsed.unsupported);         // اللوحة تفتح الجات بطلبات غير مدعومة
      await buildPreviewFrom(parsed);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
      setBuilding(false);
    }
  };

  // تحديث تلقائيّ للمعاينة عند حلّ غموضٍ في الجات (يستعمل التفسير المخزَّن، بلا نداء ذكاء جديد)
  useEffect(() => {
    if (mode === 'preview' && parsedRef.current) buildPreviewFrom(parsedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  // أبلِغ اللوحةَ بطورِ المعاينة (خلفيّةٌ فاتحة) كي تُلوّنَ زرَّ الجات بنفسجيًّا فيظهر
  useEffect(() => {
    onPreviewChange?.(mode === 'preview');
    return () => onPreviewChange?.(false);
  }, [mode, onPreviewChange]);

  // "حفظ الجدول" → يكتب خانات المعاينة (بعد أيّ تبديل يدويّ) مباشرةً في DB.
  // المعاينة ناتج بناء حتميّ، فكتابتها تعادل البناء الفعليّ + تحفظ تعديلات الليدر.
  const handleSave = async (finalSlots: AssignedSlot[]) => {
    if (!clinicId) return;
    // اعتراض الحفظ: إن بقي اسمٌ غامض دون توضيح → افتح الجات وحذّر (لا تحفظ)
    if (pendingClarifyCount > 0) { onNeedClarify?.(); return; }
    setBuilding(true); setBuildError(null);
    try {
      const r = collect();
      // علامات الاستئذان (PS/PE) — تشمل المحلولة من الجات — تُكتب لتظهر بالجدول الأساسيّ
      const nameById = new Map(roster.map((d) => [d.id, d.name]));
      const merged = parsedRef.current ? applyResolved(parsedRef.current, resolved) : null;
      // خانة EX الصحيحة حسب شفت الطبيب ذلك اليوم: 1=صباح، 2=مساء.
      // الأولوية لنقل الشفت (extraShift)، ثم قروب الطبيب مع خطّة الشفتات.
      const exCell = (doctorId: string, day: WeekDay): number => {
        const ov = (merged?.extraShifts || []).find((s) => s.doctorId === doctorId && s.day === day);
        let shift: ShiftValue;
        if (ov) shift = ov.shift;
        else {
          const key = groupKeyById.get(doctorId);
          const aShift = shifts[day];
          if (key === 'group_b') shift = aShift === 'morning' ? 'evening' : 'morning';
          else if (key === 'board') shift = boardShifts[day];
          else shift = aShift; // group_a + غيره يتبع خطّة القروب A
        }
        return shift === 'morning' ? 1 : 2;
      };
      const permissions = (merged?.extraPermissions || []).map((p) => ({
        doctorId: p.doctorId,
        doctorName: nameById.get(p.doctorId) || '',
        day: p.day,
        kind: p.kind,
        clinicNumber: exCell(p.doctorId, p.day),
      }));
      // الغياب النصّي (تفرّغ/مرضية) يُحفظ كغياب حقيقيّ — لا فرق عن اليدويّ
      const absences = (merged?.extraAbsences || []).map((a) => ({
        doctorId: a.doctorId,
        doctorName: nameById.get(a.doctorId) || '',
        day: a.day,
        status: (a.status === 'sick_leave' ? 'sick_leave' : 'vacation') as 'sick_leave' | 'vacation',
        clinicNumber: exCell(a.doctorId, a.day),
      }));
      const buildInput = resultToBuildInput(r, clinicId, false, merged ?? undefined);
      const res = await schedule.saveSlots(clinicId, r.weekStart, finalSlots, permissions, absences, buildInput.aShiftPlan, buildInput.boardConfig);
      if (res.success) {
        // احفظ «وصفة البناء» مع الجدول — لتعيد التغطيةُ لاحقًا توزيع شفتٍ بنفس الإعدادات.
        // (غير قاتل: فشلُه لا يمنع حفظ الجدول.)
        await schedule.saveBuildConfig(buildInput);
        onComplete(r);
      } else setBuildError(res.error || 'تعذّر حفظ الجدول.');
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setBuilding(false);
    }
  };

  // crossfade مدار ⇄ معاينة (نفس انتقال الجدول→الإنشاء): تلاشٍ متبادلٌ في نفس الماء الداكن.
  // المعاينة تبقى مُركَّبةً أثناء تلاشي الخروج ثمّ تُسرَّح (لا قفزةَ صفحة).
  useEffect(() => {
    const easing = Easing.bezier(0.22, 1, 0.36, 1);
    if (mode === 'preview') {
      setPvMounted(true);
      Animated.timing(previewOp, { toValue: 1, duration: 520, easing, useNativeDriver: true }).start();
    } else {
      Animated.timing(previewOp, { toValue: 0, duration: 520, easing, useNativeDriver: true }).start(({ finished }) => { if (finished) setPvMounted(false); });
    }
  }, [mode, previewOp]);

  // ── مُكوِّن المدار ──────────────────────────────────────────────
  const doneCount = FACET_META.filter((m) => done[m.key]).length;
  const ready = done.date && done.groups && done.board;   // الأساسيّات الثلاث تكفي للبناء
  const orbitFacets: OrbitFacet[] = FACET_META.map((m) => ({ key: m.key, label: m.label, sub: m.sub, color: m.color, icon: m.icon, done: done[m.key] }));
  const active = FACET_META.find((m) => m.key === openFacet);

  const openSheet = (key: StepId) => {
    setOpenFacet(key);
    sheetAnim.setValue(0);
    Animated.timing(sheetAnim, { toValue: 1, duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  };
  const closeSheet = (complete: boolean) => {
    const k = openFacet;
    if (complete && k) setDone((d) => ({ ...d, [k]: true }));
    Animated.timing(sheetAnim, { toValue: 0, duration: 300, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true }).start(() => setOpenFacet(null));
  };
  const onCenter = () => {
    if (building) return;
    if (!ready) { setCenterHint('Set DATE, SHIFTS & BOARD first'); setTimeout(() => setCenterHint(null), 2400); return; }
    runBuild();
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* طبقة المدار — تتلاشى عند ظهور المعاينة (تلاشٍ متبادل، نفس منحنى الجدول→الإنشاء) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: previewOp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} pointerEvents={mode === 'preview' ? 'none' : 'auto'}>
      <ScheduleOrbit
        facets={orbitFacets}
        progress={doneCount / FACET_META.length}
        ready={ready}
        building={building}
        onFacet={(k) => openSheet(k as StepId)}
        onCenter={onCenter}
        embedded
      />

      {/* رجوع لمدار الجدول — زرٌّ زجاجيٌّ مصقول (نفسُ زرِّ العودةِ في صفحاتِ الذكاء) */}
      <View style={{ position: 'absolute', top: scale(80), left: scale(16), zIndex: 5 }}>
        <GlassNavButton icon="chevron-back" idPrefix="navBackWizard" onPress={onBack} iconSize={scale(26)} nudge={-scale(2)} />
      </View>

      {/* رسالةُ القلب / خطأ البناء */}
      {(centerHint || buildError) && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: scale(40), left: scale(24), right: scale(24), alignItems: 'center', zIndex: 6 }}>
          <Text style={{ backgroundColor: 'rgba(20,14,40,0.92)', color: buildError ? '#FCA5A5' : '#E9DDFF', paddingVertical: scale(10), paddingHorizontal: scale(16), borderRadius: scale(12), fontSize: scale(12.5), overflow: 'hidden', borderWidth: scale(1), borderColor: 'rgba(167,139,250,0.4)', textAlign: 'center' }}>
            {buildError || centerHint}
          </Text>
        </View>
      )}

      {/* لوحةُ البؤرة — تتفتّح فوق الماء */}
      {active && (
        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 10, opacity: sheetAnim, transform: [{ scale: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,2,12,0.96)' }]} />
          <View style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: scale(22), paddingTop: scale(20), paddingBottom: scale(64) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ marginBottom: scale(44) }}>
                <Text style={{ fontSize: scale(17), letterSpacing: scale(4), fontWeight: '900', color: `rgb(${active.color[0]},${active.color[1]},${active.color[2]})`, textAlign: 'left', textShadowColor: `rgba(${active.color[0]},${active.color[1]},${active.color[2]},0.75)`, textShadowRadius: scale(18), textShadowOffset: { width: 0, height: 0 } }}>{active.sub.toUpperCase()}</Text>
                <Text style={{ fontSize: scale(23), fontWeight: '800', color: '#F4EEFF', marginTop: scale(7), textAlign: 'left' }}>{active.title}</Text>
              </View>
              {openFacet === 'date' && (
                <StepDate weekDate={weekDate} onPick={() => setShowPicker(true)} onShiftWeek={shiftWeek} onQuick={(which) => setWeekDate(which === 'next' ? nextWeekSunday() : thisWeekSunday())} />
              )}
              {openFacet === 'groups' && (
                <StepShifts shifts={shifts} onToggle={toggleGroup} />
              )}
              {openFacet === 'board' && (
                <StepBoard present={boardPresent} onPresent={setBoardPresent} shifts={boardShifts} onToggle={toggleBoard} />
              )}
              {openFacet === 'trainees' && (
                <StepTrainees trainees={trainees} onUpdate={updateTrainee} />
              )}
              {openFacet === 'exceptions' && (
                <StepExceptions value={exceptionsText} onChange={setExceptionsText} />
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: scale(10), paddingHorizontal: scale(22), paddingTop: scale(10), paddingBottom: Platform.OS === 'ios' ? scale(34) : scale(20) }}>
              <TouchableOpacity onPress={() => closeSheet(true)} activeOpacity={0.85} style={{ flex: 1, borderRadius: scale(18), overflow: 'hidden', shadowColor: `rgb(${active.color[0]},${active.color[1]},${active.color[2]})`, shadowOpacity: 0.34, shadowRadius: scale(14), shadowOffset: { width: 0, height: scale(6) } }}>
                <LinearGradient colors={[`rgba(${active.color[0]},${active.color[1]},${active.color[2]},0.98)`, `rgba(${active.color[0]},${active.color[1]},${active.color[2]},0.72)`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: scale(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(9) }}>
                  <Text style={{ fontSize: scale(15), fontWeight: '800', letterSpacing: scale(2), color: '#0a0720' }}>DONE</Text>
                  <View style={{ width: scale(23), height: scale(23), borderRadius: scale(12), backgroundColor: 'rgba(10,7,32,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark" size={scale(14)} color="#0a0720" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => closeSheet(false)} activeOpacity={0.85} style={{ paddingVertical: scale(16), paddingHorizontal: scale(20), borderRadius: scale(18), backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                <Ionicons name="chevron-back" size={scale(18)} color="rgba(255,255,255,0.7)" />
                <Text style={{ fontSize: scale(15), fontWeight: '700', letterSpacing: scale(2), color: 'rgba(255,255,255,0.7)' }}>BACK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
      </Animated.View>

      {/* طبقة المعاينة — تتبلور فوق نفس الماء الداكن بنفس المنحنى (تلاشٍ متبادل، بلا قفزة) */}
      {pvMounted && preview && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: previewOp, backgroundColor: '#0a0720' }]} pointerEvents={mode === 'preview' ? 'auto' : 'none'}>
          <PreviewView
            preview={preview}
            building={building}
            error={buildError}
            onSave={handleSave}
            onEdit={() => { setMode('form'); setBuildError(null); }}
          />
        </Animated.View>
      )}

      {showPicker && (
        <DateTimePicker
          value={weekDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_e, d) => {
            setShowPicker(false);
            if (d) setWeekDate(snapToSunday(d));
          }}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// أوراقُ البؤر — تصاميمُ «حبرٌ في الماء» (مطابقةٌ لـ design/concept-create-sheets.html)
// كلُّ ورقةٍ مُلوّنةٌ بلون بؤرتها؛ النصُّ العربيُّ من اليمين والإنجليزيُّ من اليسار.
// ═══════════════════════════════════════════════════════════════

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── الخطوة 1: التاريخ — تيّارُ الأسابيع ──────────────────────
const GREEN_RGB = '120,200,150';
function Chev({ dir, onPress }: { dir: 'back' | 'forward'; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ width: scale(42), height: scale(42), borderRadius: scale(21), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.12)' }}>
      <Ionicons name={dir === 'back' ? 'chevron-back' : 'chevron-forward'} size={scale(20)} color="#cdbef0" />
    </TouchableOpacity>
  );
}
function DateChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ paddingVertical: scale(10), paddingHorizontal: scale(16), borderRadius: scale(14), backgroundColor: active ? `rgba(${GREEN_RGB},0.22)` : 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: active ? `rgba(${GREEN_RGB},0.65)` : 'rgba(255,255,255,0.12)' }}>
      <Text style={{ fontSize: scale(13), fontWeight: '700', color: active ? '#EAFBEF' : 'rgba(255,255,255,0.55)' }}>{label}</Text>
    </TouchableOpacity>
  );
}
function StepDate({ weekDate, onPick, onShiftWeek, onQuick }: { weekDate: Date; onPick: () => void; onShiftWeek: (d: number) => void; onQuick: (w: 'this' | 'next') => void }) {
  const isNext = formatYMD(weekDate) === formatYMD(nextWeekSunday());
  const isThis = formatYMD(weekDate) === formatYMD(thisWeekSunday());
  return (
    <View>
      {/* تنقّلُ الأسابيع (LTR: السابق يسارًا، التالي يمينًا) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), marginBottom: scale(16) }}>
        <Chev dir="back" onPress={() => onShiftWeek(-1)} />
        <TouchableOpacity onPress={onPick} activeOpacity={0.85} style={{ flex: 1, paddingVertical: scale(24), paddingHorizontal: scale(16), borderRadius: scale(20), alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: scale(1), borderColor: `rgba(${GREEN_RGB},0.35)`, shadowColor: `rgb(${GREEN_RGB})`, shadowOpacity: 0.18, shadowRadius: scale(18), shadowOffset: { width: 0, height: 0 } }}>
          <Text style={{ fontSize: scale(10.5), letterSpacing: scale(3), color: `rgba(${GREEN_RGB},0.6)`, fontWeight: '700', marginBottom: scale(10) }}>WEEK STARTS</Text>
          <Text style={{ fontSize: scale(30), fontWeight: '800', color: '#EAFBEF', textShadowColor: `rgba(${GREEN_RGB},0.35)`, textShadowRadius: scale(14), textShadowOffset: { width: 0, height: 0 } }}>{EN_MONTHS[weekDate.getMonth()]} {weekDate.getDate()}</Text>
          <Text style={{ fontSize: scale(12.5), color: `rgba(${GREEN_RGB},0.6)`, marginTop: scale(7) }}>Sunday · {weekDate.getFullYear()}</Text>
        </TouchableOpacity>
        <Chev dir="forward" onPress={() => onShiftWeek(1)} />
      </View>
      {/* رقائقُ سريعة (تبدأ من اليسار) */}
      <View style={{ flexDirection: 'row', gap: scale(9) }}>
        <DateChip label="This week" active={isThis} onPress={() => onQuick('this')} />
        <DateChip label="Next week" active={isNext} onPress={() => onQuick('next')} />
      </View>
    </View>
  );
}

// ─── الخطوة 2: الشفتات — قرصُ يومٍ بعملتَي مجموعة ─────────────
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
      <View style={{ width: scale(11), height: scale(11), borderRadius: scale(6), backgroundColor: color, shadowColor: color, shadowOpacity: 0.6, shadowRadius: scale(4), shadowOffset: { width: 0, height: 0 } }} />
      <Text style={{ fontSize: scale(11), color: 'rgba(214,196,255,0.6)' }}>{label}</Text>
    </View>
  );
}
// عملتان (A أزرق · B بنفسجيّ) تنزلقان بين الصبح (أعلى) والمساء (أسفل)؛ صاحبةُ الأعلى تتوهّج أصفر
function DualDayTrack({ dayLabel, morning, onToggle }: { dayLabel: string; morning: boolean; onToggle: () => void }) {
  const slide = useRef(new Animated.Value(morning ? 0 : 1)).current;
  useEffect(() => { Animated.spring(slide, { toValue: morning ? 0 : 1, useNativeDriver: true, friction: 8, tension: 55 }).start(); }, [morning, slide]);
  const TRAVEL = scale(62);
  const aY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });
  const bY = slide.interpolate({ inputRange: [0, 1], outputRange: [TRAVEL, 0] });
  const coin = (letter: 'A' | 'B', ty: Animated.AnimatedInterpolation<number>, glow: boolean) => {
    const color = letter === 'A' ? '#8AC7FF' : '#CBA6FF';
    const border = letter === 'A' ? 'rgba(120,185,255,0.6)' : 'rgba(196,150,255,0.6)';
    return (
      <Animated.View style={{ position: 'absolute', top: scale(22), left: '50%', marginLeft: scale(-20), width: scale(40), height: scale(40), borderRadius: scale(20), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26,22,48,0.92)', borderWidth: scale(1.5), borderColor: glow ? 'rgba(250,204,21,0.6)' : border, transform: [{ translateY: ty }], shadowColor: glow ? '#FACC15' : (letter === 'A' ? '#60A5FA' : '#A878FA'), shadowOpacity: glow ? 0.75 : 0.3, shadowRadius: scale(glow ? 8 : 5), shadowOffset: { width: 0, height: 0 }, elevation: 6 }}>
        <Text style={{ fontSize: scale(18), fontWeight: '900', color }}>{letter}</Text>
      </Animated.View>
    );
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: scale(9) }}>
      <Text style={{ fontSize: scale(11), fontWeight: '700', color: 'rgba(255,255,255,0.65)' }}>{dayLabel}</Text>
      <TouchableOpacity activeOpacity={0.9} onPress={onToggle} style={{ width: '100%', maxWidth: scale(60), height: scale(146) }}>
        <LinearGradient colors={['rgba(250,204,21,0.20)', 'rgba(18,14,40,0.22)', 'rgba(99,102,241,0.24)']} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFill, { borderRadius: scale(20), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)' }]} />
        <View style={{ position: 'absolute', left: scale(12), right: scale(12), top: '50%', height: scale(1), backgroundColor: 'rgba(255,255,255,0.18)' }} />
        {coin('A', aY, morning)}
        {coin('B', bY, !morning)}
      </TouchableOpacity>
    </View>
  );
}
function StepShifts({ shifts, onToggle }: { shifts: Record<DayKey, ShiftValue>; onToggle: (d: DayKey) => void }) {
  return (
    <View>
      <Text style={{ fontSize: scale(13), color: 'rgba(236,228,255,0.8)', textAlign: 'center', lineHeight: scale(20), marginBottom: scale(14) }}>
        Tap a day to set <Text style={{ fontWeight: '800', color: '#fff' }}>Group A</Text>’s period — <Text style={{ fontWeight: '800', color: '#fff' }}>Group B</Text> always takes the opposite.
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: scale(18), marginBottom: scale(18) }}>
        <LegendDot color="#5aa6f5" label="Group A" />
        <LegendDot color="#a878f0" label="Group B" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
          <Ionicons name="sunny" size={scale(13)} color="#FFD23F" />
          <Text style={{ fontSize: scale(11), color: 'rgba(214,196,255,0.6)' }}>Morning</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: scale(6) }}>
        {DAYS.map((d, i) => (
          <DualDayTrack key={d.key} dayLabel={EN_DAYS[i]} morning={shifts[d.key] === 'morning'} onToggle={() => onToggle(d.key)} />
        ))}
      </View>
    </View>
  );
}

// ─── الخطوة 3: البورد — بطاقاتُ حضورٍ + قرصُ شمس/قمر ─────────
const BOARD_RGB = '120,170,255';
function PresenceCard({ isYes, label, sub, icon, selected, onPress }: { isYes: boolean; label: string; sub: string; icon: IoniconName; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1, paddingTop: scale(24), paddingBottom: scale(18), paddingHorizontal: scale(14), borderRadius: scale(22), alignItems: 'center', gap: scale(12), backgroundColor: selected ? (isYes ? `rgba(${BOARD_RGB},0.16)` : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.045)', borderWidth: scale(1), borderColor: selected ? (isYes ? `rgba(${BOARD_RGB},0.6)` : 'rgba(255,255,255,0.32)') : 'rgba(255,255,255,0.1)', shadowColor: isYes ? `rgb(${BOARD_RGB})` : '#000', shadowOpacity: selected ? (isYes ? 0.25 : 0.28) : 0, shadowRadius: scale(14), shadowOffset: { width: 0, height: scale(8) } }}>
      {selected && (
        <View style={{ position: 'absolute', top: scale(13), right: scale(13), width: scale(22), height: scale(22), borderRadius: scale(11), alignItems: 'center', justifyContent: 'center', backgroundColor: isYes ? '#6aa6ff' : '#fff' }}>
          <Ionicons name="checkmark" size={scale(13)} color={isYes ? '#06122b' : '#1a1730'} />
        </View>
      )}
      <View style={{ width: scale(56), height: scale(56), borderRadius: scale(28), alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? (isYes ? `rgba(${BOARD_RGB},0.25)` : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: selected ? (isYes ? 'rgba(150,190,255,0.7)' : 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.12)' }}>
        <Ionicons name={icon} size={scale(26)} color={selected ? (isYes ? '#e0ecff' : '#fff') : 'rgba(255,255,255,0.55)'} />
      </View>
      <View style={{ alignItems: 'center', gap: scale(3) }}>
        <Text style={{ fontSize: scale(15), fontWeight: '800', color: selected ? '#F4EEFF' : 'rgba(255,255,255,0.62)' }}>{label}</Text>
        <Text style={{ fontSize: scale(10), color: 'rgba(255,255,255,0.34)' }}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}
// قرصُ البورد (مجموعةٌ واحدة): كرةُ شمسٍ صفراء بسيطة (صبح) أو قمر (مساء) تنزلق
function BoardDayTrack({ dayLabel, morning, onToggle }: { dayLabel: string; morning: boolean; onToggle: () => void }) {
  const slide = useRef(new Animated.Value(morning ? 0 : 1)).current;
  useEffect(() => { Animated.spring(slide, { toValue: morning ? 0 : 1, useNativeDriver: true, friction: 8, tension: 55 }).start(); }, [morning, slide]);
  const ty = slide.interpolate({ inputRange: [0, 1], outputRange: [0, scale(58)] });
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: scale(9) }}>
      <Text style={{ fontSize: scale(11), fontWeight: '700', color: 'rgba(255,255,255,0.65)' }}>{dayLabel}</Text>
      <TouchableOpacity activeOpacity={0.9} onPress={onToggle} style={{ width: '100%', maxWidth: scale(58), height: scale(128) }}>
        <LinearGradient colors={['rgba(250,204,21,0.18)', 'rgba(18,14,40,0.22)', 'rgba(99,102,241,0.22)']} locations={[0, 0.5, 1]} style={[StyleSheet.absoluteFill, { borderRadius: scale(18), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)' }]} />
        <View style={{ position: 'absolute', left: scale(11), right: scale(11), top: '50%', height: scale(1), backgroundColor: 'rgba(255,255,255,0.16)' }} />
        <Animated.View style={{ position: 'absolute', top: scale(16), left: '50%', marginLeft: scale(-19), width: scale(38), height: scale(38), borderRadius: scale(19), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26,22,48,0.92)', borderWidth: scale(1.5), borderColor: morning ? 'rgba(250,204,21,0.5)' : 'rgba(170,160,235,0.5)', transform: [{ translateY: ty }], shadowColor: morning ? '#FACC15' : '#AAA0EB', shadowOpacity: 0.6, shadowRadius: scale(7), shadowOffset: { width: 0, height: 0 }, elevation: 6 }}>
          {morning ? (
            <View style={{ width: scale(18), height: scale(18), borderRadius: scale(9), backgroundColor: '#FFD23F', shadowColor: '#FACC15', shadowOpacity: 0.8, shadowRadius: scale(4), shadowOffset: { width: 0, height: 0 } }} />
          ) : (
            <Ionicons name="moon" size={scale(17)} color="#A5B4FC" />
          )}
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}
function StepBoard({ present, onPresent, shifts, onToggle }: { present: boolean; onPresent: (v: boolean) => void; shifts: Record<DayKey, ShiftValue>; onToggle: (d: DayKey) => void }) {
  return (
    <View style={{ gap: scale(22) }}>
      <View>
        <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#E8DEFF', textAlign: 'left', marginBottom: scale(12) }}>Is the board present this week?</Text>
        <View style={{ flexDirection: 'row', gap: scale(14) }}>
          <PresenceCard isYes={true} label="Present" sub="Working this week" icon="shield-checkmark" selected={present} onPress={() => onPresent(true)} />
          <PresenceCard isYes={false} label="Away" sub="Not this week" icon="remove-circle" selected={!present} onPress={() => onPresent(false)} />
        </View>
      </View>
      {present && (
        <View>
          <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#E8DEFF', textAlign: 'left', marginBottom: scale(12) }}>Board work periods</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: scale(6) }}>
            {DAYS.map((d, i) => (
              <BoardDayTrack key={d.key} dayLabel={EN_DAYS[i]} morning={shifts[d.key] === 'morning'} onToggle={() => onToggle(d.key)} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── الخطوة 4: المتدرّبون — مفتاحٌ + صفوفُ تبديل ─────────────
const VIOLET_RGB = '178,120,255';
function ModeOption({ label, sub, active, onPress }: { label: string; sub: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', paddingVertical: scale(10), paddingHorizontal: scale(4), zIndex: 2 }}>
      <Text style={{ fontSize: scale(13), fontWeight: '800', color: active ? '#F4EEFF' : 'rgba(255,255,255,0.6)' }}>{label}</Text>
      <Text style={{ fontSize: scale(9), color: active ? 'rgba(214,196,255,0.7)' : 'rgba(255,255,255,0.38)', marginTop: scale(2) }}>{sub}</Text>
    </TouchableOpacity>
  );
}
function ModeSwitch({ mode, onChange }: { mode: TraineeMode; onChange: (m: TraineeMode) => void }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(mode === 'beginner' ? 0 : 1)).current;
  useEffect(() => { Animated.spring(x, { toValue: mode === 'beginner' ? 0 : 1, useNativeDriver: true, friction: 8, tension: 60 }).start(); }, [mode, x]);
  const PAD = scale(4);
  const kw = w > 0 ? (w - PAD * 2) / 2 : 0;
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [0, kw] });
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.12)', borderRadius: scale(14), padding: PAD, position: 'relative' }}>
      {w > 0 && (
        <Animated.View style={{ position: 'absolute', top: PAD, bottom: PAD, left: PAD, width: kw, borderRadius: scale(11), transform: [{ translateX: tx }], overflow: 'hidden', borderWidth: scale(1), borderColor: `rgba(${VIOLET_RGB},0.6)` }}>
          <LinearGradient colors={[`rgba(${VIOLET_RGB},0.45)`, 'rgba(139,92,246,0.3)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <ModeOption label="Beginner" sub="shadows a doctor" active={mode === 'beginner'} onPress={() => onChange('beginner')} />
      <ModeOption label="Independent" sub="own clinic" active={mode === 'independent'} onPress={() => onChange('independent')} />
    </View>
  );
}
function ToggleRow({ icon, label, sub, on, onToggle }: { icon: IoniconName; label: string; sub: string; on: boolean; onToggle: () => void }) {
  const kx = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.spring(kx, { toValue: on ? 1 : 0, useNativeDriver: true, friction: 8, tension: 70 }).start(); }, [on, kx]);
  const tx = kx.interpolate({ inputRange: [0, 1], outputRange: [0, scale(20)] });
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: scale(11), paddingVertical: scale(12), paddingHorizontal: scale(14), borderRadius: scale(15), backgroundColor: on ? `rgba(${VIOLET_RGB},0.13)` : 'rgba(255,255,255,0.04)', borderWidth: scale(1), borderColor: on ? `rgba(${VIOLET_RGB},0.42)` : 'rgba(255,255,255,0.1)' }}>
      <View style={{ width: scale(36), height: scale(36), borderRadius: scale(11), alignItems: 'center', justifyContent: 'center', backgroundColor: on ? `rgba(${VIOLET_RGB},0.22)` : 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: on ? `rgba(${VIOLET_RGB},0.6)` : 'rgba(255,255,255,0.1)' }}>
        <Ionicons name={icon} size={scale(18)} color={on ? '#EBD8FF' : 'rgba(214,196,255,0.6)'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: scale(13.5), fontWeight: '800', color: on ? '#F4EEFF' : 'rgba(255,255,255,0.72)', textAlign: 'left' }}>{label}</Text>
        <Text style={{ fontSize: scale(9.5), color: 'rgba(255,255,255,0.36)', textAlign: 'left', marginTop: scale(1) }}>{sub}</Text>
      </View>
      <View style={{ width: scale(48), height: scale(28), borderRadius: scale(14), backgroundColor: on ? undefined : 'rgba(255,255,255,0.1)', borderWidth: scale(1), borderColor: on ? 'transparent' : 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
        {on && <LinearGradient colors={['#cba6ff', '#a06eff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
        <Animated.View style={{ position: 'absolute', top: scale(2.5), left: scale(3), width: scale(22), height: scale(22), borderRadius: scale(11), backgroundColor: '#fff', transform: [{ translateX: tx }], shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: scale(2), shadowOffset: { width: 0, height: scale(1) } }} />
      </View>
    </TouchableOpacity>
  );
}
function TraineeCard({ t, onChange }: { t: TraineeConfig; onChange: (patch: Partial<TraineeConfig>) => void }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.055)', borderRadius: scale(20), padding: scale(16), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.12)', gap: scale(14) }}>
      <Text style={{ fontSize: scale(16), fontWeight: '800', color: '#F2ECFF', textAlign: 'right' }}>{t.name}</Text>
      <ModeSwitch mode={t.mode} onChange={(mode) => onChange({ mode })} />
      {t.mode === 'independent' && (
        <View style={{ gap: scale(10) }}>
          <ToggleRow icon="git-network" label="Delegator" sub="joins the delegator rotation" on={t.inDelegator} onToggle={() => onChange({ inDelegator: !t.inDelegator })} />
          <ToggleRow icon="add-circle" label="Extra" sub="joins the extra rotation" on={t.inReserve} onToggle={() => onChange({ inReserve: !t.inReserve })} />
        </View>
      )}
    </View>
  );
}
function StepTrainees({ trainees, onUpdate }: { trainees: TraineeConfig[]; onUpdate: (id: string, patch: Partial<TraineeConfig>) => void }) {
  if (trainees.length === 0) {
    return (
      <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: scale(16), padding: scale(20), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.1)' }}>
        <Text style={{ fontSize: scale(13), color: 'rgba(214,196,255,0.6)', textAlign: 'center', lineHeight: scale(20) }}>لا يوجد متدرّبون في عيادتك هذا الأسبوع.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: scale(14) }}>
      {trainees.map((t) => (
        <TraineeCard key={t.id} t={t} onChange={(patch) => onUpdate(t.id, patch)} />
      ))}
    </View>
  );
}

// ─── الخطوة 5: الاستثناءات — بئرُ الحبر ───────────────────────
function PulseDot() {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(p, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [p]);
  return (
    <Animated.View style={{ width: scale(7), height: scale(7), borderRadius: scale(4), backgroundColor: '#FFB07A', opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }], shadowColor: '#FF965A', shadowOpacity: 0.8, shadowRadius: scale(4), shadowOffset: { width: 0, height: 0 } }} />
  );
}
const EX_PLACEHOLDER = 'مثالٌ — اكتب بأسلوبك:\n\n•  د. محمد متفرّغ يوم الثلاثاء\n•  د. سارة في إجازة هذا الأسبوع\n•  الخميس عطلة رسميّة\n•  بدون (Delegators) هذا الأسبوع';
function StepExceptions({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [foc, setFoc] = useState(false);
  const ORANGE = '255,150,90';
  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFoc(true)}
        onBlur={() => setFoc(false)}
        placeholder={EX_PLACEHOLDER}
        placeholderTextColor="rgba(255,200,170,0.42)"
        multiline
        textAlignVertical="top"
        style={{
          minHeight: scale(248), backgroundColor: 'rgba(255,150,90,0.06)', borderRadius: scale(22),
          borderWidth: scale(1), borderColor: foc ? `rgba(${ORANGE},0.55)` : `rgba(${ORANGE},0.3)`,
          paddingHorizontal: scale(18), paddingTop: scale(20), paddingBottom: scale(46),
          fontSize: scale(14.5), lineHeight: scale(26), color: '#fff', textAlign: 'right',
          shadowColor: '#FF965A', shadowOpacity: foc ? 0.22 : 0, shadowRadius: scale(13), shadowOffset: { width: 0, height: 0 },
        }}
      />
      {/* شارةُ الذكاء (نقطةٌ نابضة) — تبدأ من اليسار */}
      <View style={{ position: 'absolute', bottom: scale(14), left: scale(14), flexDirection: 'row', alignItems: 'center', gap: scale(6), backgroundColor: `rgba(${ORANGE},0.12)`, borderWidth: scale(1), borderColor: `rgba(${ORANGE},0.28)`, borderRadius: scale(20), paddingVertical: scale(5), paddingHorizontal: scale(11) }}>
        <PulseDot />
        <Text style={{ fontSize: scale(11), fontWeight: '800', letterSpacing: scale(0.5), color: 'rgba(255,196,150,0.85)' }}>Ai</Text>
      </View>
    </View>
  );
}

// AssignedSlot[] + غيابُ المعاينة → ScheduleSlot[] (نفسُ شكلِ الجدولِ الحقيقيّ) كي نعرضَها
// بمكوّنِ الجدولِ الحقيقيّ ScheduleGrid — تمامًا كبطاقة «طرأ تغييرٌ على جدولك» (SeatChangeOverlay).
function previewToGridSlots(slots: AssignedSlot[], absences: PreviewAbsence[]): ScheduleSlot[] {
  const out: ScheduleSlot[] = [];
  slots.forEach((s, i) => {
    const role: DoctorRole = s.role === 'delegator' ? 'delegator' : s.role === 'ex' ? 'ex' : 'clinic';
    out.push({
      id: `pv-${s.day}-${s.period}-${s.clinicNumber}-${role}-${s.doctor.id}-${i}`,
      day: s.day as DayOfWeek, period: s.period, clinicNumber: s.clinicNumber,
      doctorId: s.doctor.id, doctorName: s.doctor.name,
      role, status: 'active',
    });
  });
  // الغياب (PreviewAbsence) → صفُّ الـ EX (period=0)، بالحالةِ من الكود (SL/VC/PS/PE)
  const labelToStatus = (lbl: string): DoctorStatus => {
    const u = (lbl || '').toUpperCase();
    if (u.includes('SL')) return 'sick_leave';
    if (u.includes('PS')) return 'permission_start';
    if (u.includes('PE')) return 'permission_end';
    return 'vacation';   // VC / متفرّغ
  };
  absences.forEach((a, i) => {
    out.push({
      id: `pv-abs-${a.day}-${i}`,
      // خانةُ الـ EX حسب شفتِ الطبيب: صباح=1 (يمين)، مساء=2 (يسار). الافتراضُ صباحٌ للتوافق.
      day: a.day as DayOfWeek, period: 0, clinicNumber: a.shift === 'evening' ? 2 : 1,
      doctorId: `pv-abs-${a.day}-${i}`, doctorName: a.doctorName,
      role: 'clinic', status: labelToStatus(a.label),
    });
  });
  return out;
}

// المتدرّبُ المبتدئ (الظلّ) مرتبطٌ بمدرّبه عبر supervisorDoctorId. نقرُ الظلِّ يُحسَبُ على مدرّبه
// (نُرجِع مُعرّفَ المدرّبِ إن كان حاضرًا في نفسِ اليوم) — فالاختيارُ والتبديلُ دائمًا على المدرّب.
function supervisorOf(slots: AssignedSlot[], day: string, id: string): string {
  const slot = slots.find((s) => s.day === day && s.doctor.id === id);
  const sup = slot?.doctor.supervisorDoctorId;
  if (sup && slots.some((s) => s.day === day && s.doctor.id === sup)) return sup;
  return id;
}

// تبديلُ طبيبين بكاملِ خاناتِهما في يومٍ واحد، **ثُمّ إعادةُ بناءِ كلِّ الظلال** (المتدرّبين المبتدئين)
// كي يُطابقَ كلُّ ظلٍّ مقاعدَ مدرّبه الحاليّةَ **أينما حلّ** — فيلتصقُ به كشخصٍ واحد، حتى عند
// التبديلِ بين فترتين مختلفتين (نفسُ ما يفعله بناءُ الجدولِ الأصليّ: الظلُّ مرآةُ مقاعدِ المدرّب).
function swapDoctorsInDay(slots: AssignedSlot[], day: string, rawA: string, rawB: string): AssignedSlot[] {
  const idA = supervisorOf(slots, day, rawA);
  const idB = supervisorOf(slots, day, rawB);
  if (idA === idB) return slots;
  const docA = slots.find((s) => s.day === day && s.doctor.id === idA)?.doctor;
  const docB = slots.find((s) => s.day === day && s.doctor.id === idB)?.doctor;
  if (!docA || !docB) return slots;

  // مَن هو ظلٌّ ذلكَ اليوم: طبيبٌ مدرّبُه (supervisorDoctorId) حاضرٌ في نفسِ اليوم.
  const presentThatDay = new Set(slots.filter((s) => s.day === day).map((s) => s.doctor.id));
  const shadowDoc = new Map<string, AssignedSlot['doctor']>();   // معرّفُ الظلِّ → كائنُ الطبيب
  const supOf = new Map<string, string>();                       // معرّفُ الظلِّ → معرّفُ مدرّبه
  for (const s of slots) {
    if (s.day !== day) continue;
    const sup = s.doctor.supervisorDoctorId;
    if (sup && sup !== s.doctor.id && presentThatDay.has(sup)) {
      shadowDoc.set(s.doctor.id, s.doctor);
      supOf.set(s.doctor.id, sup);
    }
  }
  const shadowIds = new Set(shadowDoc.keys());

  // ١) بدّل الطبيبين في كلِّ مقاعدِهما ذلكَ اليوم، واحذف كلَّ مقاعدِ الظلال (سنُعيدُ بناءَها).
  const base: AssignedSlot[] = [];
  for (const s of slots) {
    if (s.day !== day) { base.push(s); continue; }
    if (shadowIds.has(s.doctor.id)) continue;                    // ظلٌّ — يُحذفُ ليُعادَ بناؤه على مقعدِ مدرّبه الجديد
    if (s.doctor.id === idA) { base.push({ ...s, doctor: docB }); continue; }   // مقعدُ A ← B
    if (s.doctor.id === idB) { base.push({ ...s, doctor: docA }); continue; }   // مقعدُ B ← A
    base.push(s);
  }

  // ٢) أعِد بناءَ كلِّ ظلٍّ مرآةً لمقاعدِ مدرّبه الحاليّةِ (بعدَ التبديل) — يلحقُ به ولو تغيّرت الفترة.
  const rebuilt: AssignedSlot[] = [];
  for (const shadowId of shadowIds) {
    const beg = shadowDoc.get(shadowId)!;
    const supId = supOf.get(shadowId)!;
    for (const s of base) {
      if (s.day === day && s.doctor.id === supId) {
        rebuilt.push({ day: s.day, period: s.period, clinicNumber: s.clinicNumber, doctor: beg, role: s.role });
      }
    }
  }
  return [...base, ...rebuilt];
}

export function PreviewView({ preview, building, error, onSave, onEdit, hideEdit }: {
  preview: { slots: AssignedSlot[]; absences: PreviewAbsence[]; clinicCount: number; summary: string; warnings: string[] };
  building: boolean;
  error: string | null;
  onSave: (slots: AssignedSlot[]) => void;
  onEdit: () => void;
  hideEdit?: boolean;   // مسار الجات: يُخفي "BACK" (أيقونة المحادثة تكفي)
}) {
  // يُعرَض بمكوّنِ الجدولِ الحقيقيّ — بشكله الطبيعيّ كصفحةِ الجدول، مع تبديلٍ بالنقر (طبيبٌ ثُمّ آخر).
  const [slots, setSlots] = useState<AssignedSlot[]>(preview.slots);
  const [sel, setSel] = useState<{ day: string; id: string } | null>(null);
  useEffect(() => { setSlots(preview.slots); setSel(null); }, [preview.slots]);   // إعادةُ بناءِ المعاينة → زامِن
  const gridSlots = useMemo(() => previewToGridSlots(slots, preview.absences), [slots, preview.absences]);

  // نقرُ طبيبٍ ثُمّ آخرَ في نفسِ اليوم → تبديلٌ (يُطبَّقُ على المقعد، ويتبعُ المتدرّبُ مدرّبَه)
  const onDocTap = (day: DayOfWeek, rawId: string) => {
    const id = supervisorOf(slots, day, rawId);
    if (!sel || sel.day !== day) { setSel({ day, id }); return; }
    if (sel.id === id) { setSel(null); return; }
    setSlots((s) => swapDoctorsInDay(s, day, sel.id, id));
    setSel(null);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* خلفيّةُ صفحةِ الجدولِ الحقيقيّةِ (فاتحة) — ليظهرَ الجدولُ بشكله الطبيعيّ */}
      <LinearGradient colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']} style={StyleSheet.absoluteFill} />

      {/* رأسٌ منخفضٌ ووسطيّ — مُبتعِدٌ عن زرّ الجات أعلى اليمين */}
      <View style={{ paddingTop: scale(94), paddingHorizontal: scale(20), paddingBottom: scale(6), alignItems: 'center' }}>
        <Text style={{ fontSize: scale(19), fontWeight: '800', color: '#3F4A5F', textAlign: 'center', letterSpacing: scale(0.3) }}>معاينة الجدول</Text>
        <Text style={{ fontSize: scale(11), fontWeight: '700', color: sel ? '#6D4FB8' : '#94A0B3', textAlign: 'center', marginTop: scale(5) }}>
          {sel ? 'اختر طبيبًا آخرَ في نفسِ اليومِ لتبديله — أو انقر نفسَه للإلغاء' : 'للتبديل: انقر طبيبًا ثُمّ آخرَ في نفسِ اليوم'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: scale(12), paddingTop: scale(4), paddingBottom: scale(20) }} showsVerticalScrollIndicator={false}>
        <ScheduleGrid slots={gridSlots} clinicCount={preview.clinicCount} onCellPress={() => {}} onDoctorPress={onDocTap} selSwap={sel} />
        {preview.warnings.length > 0 && (
          <View style={{ marginTop: scale(14), backgroundColor: 'rgba(234,179,8,0.12)', borderRadius: scale(12), padding: scale(12), borderWidth: scale(1), borderColor: 'rgba(202,138,4,0.35)' }}>
            <Text style={{ fontSize: scale(12), fontWeight: '800', color: '#92600A', textAlign: 'right', marginBottom: scale(6) }}>تنبيهات:</Text>
            {preview.warnings.map((w, i) => (
              <Text key={i} style={{ fontSize: scale(11.5), color: '#A16207', textAlign: 'right', lineHeight: scale(18) }}>• {w}</Text>
            ))}
          </View>
        )}
      </ScrollView>

      {error && (
        <Text style={{ paddingHorizontal: scale(22), paddingBottom: scale(6), color: '#DC2626', fontSize: scale(12), textAlign: 'right', fontWeight: '700' }}>{error}</Text>
      )}

      {/* الأزرارُ — SAVE/BACK مبدّلا الموضعِ بتصميمٍ أنيق (SAVE الأساسيُّ يسارًا، BACK يمينًا) */}
      <View style={{ flexDirection: 'row', gap: scale(11), paddingHorizontal: scale(20), paddingTop: scale(10), paddingBottom: Platform.OS === 'ios' ? scale(34) : scale(20) }}>
        <TouchableOpacity
          onPress={building ? undefined : () => onSave(slots)}
          disabled={building}
          activeOpacity={0.85}
          style={{ flex: 1, borderRadius: scale(17), overflow: 'hidden', shadowColor: '#6354C8', shadowOpacity: 0.35, shadowRadius: scale(14), shadowOffset: { width: 0, height: scale(6) }, elevation: 6 }}
        >
          <LinearGradient
            colors={building ? ['#AEA2E4', '#9A8ED6'] : ['#7E6BE6', '#5E4FC4']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingVertical: scale(15), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: scale(8) }}
          >
            {building ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={scale(19)} color="#fff" />
                <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#fff', letterSpacing: scale(1.5) }}>SAVE</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        {!hideEdit && (
          <TouchableOpacity
            onPress={onEdit}
            disabled={building}
            activeOpacity={0.85}
            style={{ borderRadius: scale(17), paddingVertical: scale(15), paddingHorizontal: scale(20), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: scale(1.5), borderColor: 'rgba(124,108,180,0.35)', shadowColor: '#94A3B8', shadowOpacity: 0.2, shadowRadius: scale(8), shadowOffset: { width: 0, height: scale(3) }, elevation: 3 }}
          >
            <Ionicons name="chevron-back" size={scale(18)} color="#5E4FC4" />
            <Text style={{ fontSize: scale(14.5), fontWeight: '800', color: '#5E4FC4', letterSpacing: scale(1.5) }}>BACK</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
