import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Animated,
  Easing, Platform, StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Path, Circle } from 'react-native-svg';
import { scale } from '../lib/scale';
import { getDoctorGroups } from '../lib/database';
import { getTemplateByName } from '../lib/algorithms/groupTemplates';
import {
  schedule, loadDoctorRoster, WEEK_DAYS,
  type AssignedSlot, type ScheduleBuildInput, type WeekDay, type Period, type PreviewAbsence,
} from '../lib/algorithms/schedule';
import { parseExceptions, type ParsedExceptions, type RosterEntry, type Clarification, type ResolvedClarification, type UnsupportedRequest } from '../lib/ai_v2/parseExceptions';

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

export type DayKey = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
export type ShiftValue = 'morning' | 'evening';
export type TraineeMode = 'beginner' | 'independent';

export interface TraineeConfig {
  id: string;
  name: string;
  mode: TraineeMode;       // مبتدئ (مع الطبيب) أو مستقل (وحده)
  inDelegator: boolean;    // (للمستقلّ) يدخل توزيع الدليقيتر
  inReserve: boolean;      // (للمستقلّ) يدخل توزيع الاحتياطي
}

export interface WizardResult {
  weekStart: string;                       // YYYY-MM-DD (أحد)
  aShiftPlan: Record<DayKey, ShiftValue>;  // فترة قروب A لكل يوم (B = العكس)
  board: {
    present: boolean;                      // هل البورد متواجدون هذا الأسبوع
    shiftPlan: Record<DayKey, ShiftValue>; // فترة البورد لكل يوم (إن حضروا)
    inExRotation: boolean;                 // هل يدخلون دورة الاحتياطي
  };
  trainees: TraineeConfig[];               // إعدادات كلّ متدرّب
  exceptions?: string;                     // كل الاستثناءات (نصّ حرّ موحّد)
  dateNotes?: string;                      // إجابة حرّة على خطوة التاريخ
  groupNotes?: string;                     // إجابة حرّة على خطوة القروبات
}

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
}

/** يدمج حلول الغموض (المُختارة في الجات) كغيابات/استئذانات في المدخلات قبل البناء */
function applyResolved(parsed: ParsedExceptions, resolved: ResolvedClarification[]): ParsedExceptions {
  if (!resolved.length) return parsed;
  const extraAbsences = [...parsed.extraAbsences];
  const extraPermissions = [...parsed.extraPermissions];
  for (const r of resolved) {
    if (r.clar.kind === 'absence') {
      extraAbsences.push({ doctorId: r.doctorId, day: r.clar.day, scope: r.clar.scope ?? 'full' });
    } else {
      extraPermissions.push({ doctorId: r.doctorId, day: r.clar.day, kind: r.clar.permKind ?? 'end' });
    }
  }
  return { ...parsed, extraAbsences, extraPermissions };
}

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 'sunday', label: 'الأحد', short: 'أحد' },
  { key: 'monday', label: 'الاثنين', short: 'اثنين' },
  { key: 'tuesday', label: 'الثلاثاء', short: 'ثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء', short: 'أربعاء' },
  { key: 'thursday', label: 'الخميس', short: 'خميس' },
];

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

// ─── تواريخ ───────────────────────────────────────────────────
function snapToSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // getDay: 0 = الأحد
  return x;
}
function nextWeekSunday(): Date {
  const s = snapToSunday(new Date());
  s.setDate(s.getDate() + 7);
  return s;
}
function thisWeekSunday(): Date {
  return snapToSunday(new Date());
}
function formatYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
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
const ALL_MORNING: Record<DayKey, ShiftValue> = { sunday: 'morning', monday: 'morning', tuesday: 'morning', wednesday: 'morning', thursday: 'morning' };

// يحوّل نتيجة الاستبيان إلى مدخل الخوارزمية. ملاحظة: الاستثناءات الحرّة
// (تفرّغ/عطل/بدون دليقيتر) لا تُمرَّر هنا — تفسيرها لاحقًا. المعاينة تُبنى
// من المدخلات المنظَّمة فقط.
function resultToBuildInput(
  r: WizardResult,
  clinicId: string,
  dryRun: boolean,
  parsed?: ParsedExceptions,
): ScheduleBuildInput {
  const eveningDays = WEEK_DAYS.filter((d) => r.board.shiftPlan[d] === 'evening');
  let scenario: ScheduleBuildInput['boardConfig']['scenario'];
  if (!r.board.present) scenario = { kind: 'separate_schedule' };
  else if (eveningDays.length === 0) scenario = { kind: 'all_morning' };
  else if (eveningDays.length === WEEK_DAYS.length) scenario = { kind: 'all_evening' };
  else scenario = { kind: 'hybrid_evening_days', eveningDays };

  const traineeModes: Record<string, TraineeMode> = {};
  const traineeOptions: Record<string, { inDelegator?: boolean; inReserve?: boolean }> = {};
  for (const t of r.trainees) {
    traineeModes[t.id] = t.mode;
    // خيارات الدليقيتر/الاحتياطي للمستقلّ فقط
    if (t.mode === 'independent') {
      traineeOptions[t.id] = { inDelegator: t.inDelegator, inReserve: t.inReserve };
    }
  }

  return {
    weekStart: r.weekStart,
    clinicId,
    aShiftPlan: r.aShiftPlan,
    boardConfig: { scenario, includeInExRotation: r.board.inExRotation },
    traineeModes,
    traineeOptions,
    // استثناءات التيم ليدر بعد تفسيرها (إن وُجدت)
    holidayDays: parsed?.holidayDays,
    delegatorEnabled: parsed?.delegatorEnabled,
    extraAbsences: parsed?.extraAbsences,
    extraPermissions: parsed?.extraPermissions,
    extraShifts: parsed?.extraShifts,
    dryRun,
  };
}

export function WizardContent({ clinicId, onComplete, onBack, resolved = [], pendingClarifyCount = 0, onClarifications, onNeedClarify, onUnsupported }: WizardContentProps) {
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
      const res = await schedule.saveSlots(clinicId, r.weekStart, finalSlots, permissions, absences);
      if (res.success) {
        // احفظ «وصفة البناء» مع الجدول — لتعيد التغطيةُ لاحقًا توزيع شفتٍ بنفس الإعدادات.
        // (غير قاتل: فشلُه لا يمنع حفظ الجدول.)
        await schedule.saveBuildConfig(resultToBuildInput(r, clinicId, false, merged ?? undefined));
        onComplete(r);
      } else setBuildError(res.error || 'تعذّر حفظ الجدول.');
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setBuilding(false);
    }
  };

  const idx = STEPS.indexOf(stepId);
  const isLast = idx === STEPS.length - 1;
  const next = () => (isLast ? runBuild() : setStepId(STEPS[idx + 1]!));
  const back = () => (idx === 0 ? onBack() : setStepId(STEPS[idx - 1]!));

  const QUESTIONS: Record<StepId, string> = {
    date: 'ما تاريخ بداية الأسبوع الذي تريد بناء جدوله؟',
    groups: `ما فترات عمل القروبات؟ اختر صبح أو عصر لكل يوم (${groupBName} يأخذ العكس تلقائيًّا).`,
    board: 'إعدادات البورد لهذا الأسبوع',
    trainees: 'إعدادات المتدرّبين لهذا الأسبوع',
    exceptions: 'الاستثناءات — اكتب أيّ حالة خاصّة',
  };

  // وضع المعاينة — الجدول المُنشأ بكروت/إطارات بيضاء قبل الحفظ
  if (mode === 'preview' && preview) {
    return (
      <PreviewView
        preview={preview}
        building={building}
        error={buildError}
        onSave={handleSave}
        onEdit={() => { setMode('form'); setBuildError(null); }}
      />
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* السؤال أعلى الصفحة */}
      <QuestionHeader step={idx + 1} total={STEPS.length} text={QUESTIONS[stepId]} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: scale(22), paddingBottom: scale(24) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {stepId === 'date' && (
          <>
            <StepDate
              weekDate={weekDate}
              onPick={() => setShowPicker(true)}
              onQuick={(which) => setWeekDate(which === 'next' ? nextWeekSunday() : thisWeekSunday())}
            />
            <FreeNote label="أو اكتب إجابتك بأسلوبك" placeholder="مثال: ابدأ من أوّل يوليو" value={dateNote} onChange={setDateNote} />
          </>
        )}
        {stepId === 'groups' && (
          <>
            <StepShifts shifts={shifts} groupAName={groupAName} groupBName={groupBName} onToggle={toggleGroup} />
            <FreeNote label="أو اكتب توزيعًا مختلفًا" placeholder="مثال: قروب A يومين صبح ويومين عصر" value={groupNote} onChange={setGroupNote} />
          </>
        )}
        {stepId === 'board' && (
          <StepBoard
            present={boardPresent} onPresent={setBoardPresent}
            boardName={boardName}
            shifts={boardShifts} onToggle={toggleBoard}
            inEx={boardInEx} onInEx={setBoardInEx}
          />
        )}
        {stepId === 'trainees' && (
          <StepTrainees trainees={trainees} onUpdate={updateTrainee} />
        )}
        {stepId === 'exceptions' && (
          <StepExceptions value={exceptionsText} onChange={setExceptionsText} />
        )}
      </ScrollView>

      {/* خطأ البناء إن وُجد */}
      {buildError && (
        <Text style={{ paddingHorizontal: scale(22), paddingBottom: scale(6), color: '#FCA5A5', fontSize: scale(12), textAlign: 'right' }}>{buildError}</Text>
      )}

      {/* أزرار التنقّل */}
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(10), paddingHorizontal: scale(22), paddingTop: scale(10), paddingBottom: Platform.OS === 'ios' ? scale(34) : scale(20) }}>
        <TouchableOpacity
          onPress={building ? undefined : next}
          activeOpacity={0.85}
          disabled={building}
          style={{ flex: 1, paddingVertical: scale(14), borderRadius: scale(16), backgroundColor: building ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.85)', alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'center', gap: scale(8) }}
        >
          {building && isLast ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#fff' }}>{isLast ? 'أنشئ الجدول' : 'التالي'}</Text>
              <Ionicons name={isLast ? 'sparkles' : 'arrow-back'} size={scale(18)} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={back}
          activeOpacity={0.85}
          disabled={building}
          style={{ paddingVertical: scale(14), paddingHorizontal: scale(20), borderRadius: scale(16), backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' }}
        >
          <Text style={{ fontSize: scale(15), fontWeight: '700', color: 'rgba(255,255,255,0.6)' }}>رجوع</Text>
        </TouchableOpacity>
      </View>

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

// ─── الخطوة 1: التاريخ ────────────────────────────────────────
function StepDate({ weekDate, onPick, onQuick }: { weekDate: Date; onPick: () => void; onQuick: (w: 'this' | 'next') => void }) {
  const next = nextWeekSunday();
  const isNext = formatYMD(weekDate) === formatYMD(next);
  const isThis = formatYMD(weekDate) === formatYMD(thisWeekSunday());
  return (
    <View>
      {/* بطاقة الأسبوع المختار */}
      <TouchableOpacity onPress={onPick} activeOpacity={0.85} style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: scale(18), padding: scale(18), borderWidth: scale(1.5), borderColor: 'rgba(139,92,246,0.4)', flexDirection: 'row-reverse', alignItems: 'center', gap: scale(12) }}>
        <View style={{ width: scale(44), height: scale(44), borderRadius: scale(12), backgroundColor: 'rgba(139,92,246,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="calendar" size={scale(22)} color="#E8DEFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: scale(12), color: 'rgba(196,176,255,0.6)', textAlign: 'right', marginBottom: scale(3) }}>أسبوع يبدأ</Text>
          <Text style={{ fontSize: scale(17), fontWeight: '800', color: '#F2ECFF', textAlign: 'right' }}>{formatArabic(weekDate)}</Text>
        </View>
        <Ionicons name="chevron-back" size={scale(18)} color="rgba(255,255,255,0.35)" />
      </TouchableOpacity>

      {/* اختصارات سريعة */}
      <View style={{ flexDirection: 'row-reverse', gap: scale(10), marginTop: scale(14) }}>
        <QuickChip label="الأسبوع القادم" active={isNext} onPress={() => onQuick('next')} />
        <QuickChip label="هذا الأسبوع" active={isThis} onPress={() => onQuick('this')} />
      </View>
    </View>
  );
}

function QuickChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ paddingVertical: scale(10), paddingHorizontal: scale(16), borderRadius: scale(13), backgroundColor: active ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)', borderWidth: scale(1.5), borderColor: active ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.12)' }}>
      <Text style={{ fontSize: scale(13), fontWeight: '700', color: active ? '#F2ECFF' : 'rgba(255,255,255,0.55)' }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── الخطوة 2: جدول فترات القروبات ────────────────────────────
function StepShifts({ shifts, groupAName, groupBName, onToggle }: {
  shifts: Record<DayKey, ShiftValue>;
  groupAName: string;
  groupBName: string;
  onToggle: (d: DayKey) => void;
}) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: scale(18), padding: scale(12), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.1)' }}>
      {/* رأس الأيام */}
      <View style={{ flexDirection: 'row-reverse', marginBottom: scale(8) }}>
        <View style={{ width: scale(58) }} />
        {DAYS.map((d) => (
          <Text key={d.key} style={{ flex: 1, fontSize: scale(11), fontWeight: '700', color: 'rgba(196,176,255,0.7)', textAlign: 'center' }}>{d.short}</Text>
        ))}
      </View>

      {/* صفّ قروب A (قابل للنقر) */}
      <ShiftRow name={groupAName} highlight days={DAYS.map((d) => shifts[d.key])} onCell={(i) => onToggle(DAYS[i].key)} />
      {/* صفّ قروب B (معكوس تلقائيًّا — للعرض فقط) */}
      <ShiftRow name={groupBName} highlight={false} days={DAYS.map((d) => (shifts[d.key] === 'morning' ? 'evening' : 'morning'))} />

      <Text style={{ fontSize: scale(10.5), color: 'rgba(196,176,255,0.45)', textAlign: 'center', marginTop: scale(10) }}>
        انقر على أي خانة لتبديلها بين صبح وعصر
      </Text>
    </View>
  );
}

function ShiftRow({ name, days, highlight, onCell }: { name: string; days: ShiftValue[]; highlight?: boolean; onCell?: (i: number) => void }) {
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginVertical: scale(4) }}>
      <Text numberOfLines={1} style={{ width: scale(58), fontSize: scale(12), fontWeight: '800', color: highlight ? '#E8DEFF' : 'rgba(255,255,255,0.6)', textAlign: 'right', paddingLeft: scale(6) }}>{name}</Text>
      {days.map((v, i) => {
        const morning = v === 'morning';
        const cell = (
          <View
            style={{
              flex: 1, marginHorizontal: scale(2), paddingVertical: scale(11), borderRadius: scale(10), alignItems: 'center',
              backgroundColor: morning ? 'rgba(250,204,21,0.16)' : 'rgba(99,102,241,0.22)',
              borderWidth: scale(1), borderColor: morning ? 'rgba(250,204,21,0.45)' : 'rgba(129,140,248,0.5)',
              opacity: highlight === false ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: scale(12), fontWeight: '800', color: morning ? '#FDE68A' : '#C7D2FE' }}>{morning ? 'صبح' : 'عصر'}</Text>
          </View>
        );
        return onCell ? (
          <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => onCell(i)} style={{ flex: 1 }}>{cell}</TouchableOpacity>
        ) : (
          <View key={i} style={{ flex: 1 }}>{cell}</View>
        );
      })}
    </View>
  );
}

// ─── جدول فترات البورد (صفّ واحد قابل للنقر) ───────────────────
function BoardShiftsCard({ boardName, shifts, onToggle }: {
  boardName: string;
  shifts: Record<DayKey, ShiftValue>;
  onToggle: (d: DayKey) => void;
}) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: scale(18), padding: scale(12), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.1)' }}>
      <View style={{ flexDirection: 'row-reverse', marginBottom: scale(8) }}>
        <View style={{ width: scale(58) }} />
        {DAYS.map((d) => (
          <Text key={d.key} style={{ flex: 1, fontSize: scale(11), fontWeight: '700', color: 'rgba(196,176,255,0.7)', textAlign: 'center' }}>{d.short}</Text>
        ))}
      </View>
      <ShiftRow name={boardName} highlight days={DAYS.map((d) => shifts[d.key])} onCell={(i) => onToggle(DAYS[i].key)} />
      <Text style={{ fontSize: scale(10.5), color: 'rgba(196,176,255,0.45)', textAlign: 'center', marginTop: scale(10) }}>
        انقر على أي خانة لتبديلها بين صبح وعصر
      </Text>
    </View>
  );
}

// ─── بطاقة نعم/لا ─────────────────────────────────────────────
function YesNoCard({ value, onChange, yesLabel, noLabel }: {
  value: boolean;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
}) {
  const opt = (isYes: boolean, label: string) => {
    const active = value === isYes;
    return (
      <TouchableOpacity
        onPress={() => onChange(isYes)}
        activeOpacity={0.85}
        style={{
          flex: 1, paddingVertical: scale(20), borderRadius: scale(16), alignItems: 'center',
          flexDirection: 'row-reverse', justifyContent: 'center', gap: scale(8),
          backgroundColor: active ? (isYes ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.16)') : 'rgba(255,255,255,0.06)',
          borderWidth: scale(1.5),
          borderColor: active ? (isYes ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,113,0.65)') : 'rgba(255,255,255,0.12)',
        }}
      >
        <Ionicons
          name={isYes ? 'checkmark-circle' : 'close-circle'}
          size={scale(22)}
          color={active ? (isYes ? '#86EFAC' : '#FCA5A5') : 'rgba(255,255,255,0.4)'}
        />
        <Text style={{ fontSize: scale(15), fontWeight: '800', color: active ? '#F2ECFF' : 'rgba(255,255,255,0.6)' }}>{label}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={{ flexDirection: 'row-reverse', gap: scale(12) }}>
      {opt(true, yesLabel)}
      {opt(false, noLabel)}
    </View>
  );
}

// ─── عنوان فرعيّ داخل صفحة البورد ─────────────────────────────
function SubLabel({ text }: { text: string }) {
  return <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#E8DEFF', textAlign: 'right', marginBottom: scale(10) }}>{text}</Text>;
}

// ─── حقل كتابة حرّ (إجابة/استثناءات) ──────────────────────────
function FreeNote({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginTop: scale(14) }}>
      <Text style={{ fontSize: scale(11), fontWeight: '600', color: 'rgba(196,176,255,0.5)', marginBottom: scale(8), textAlign: 'right' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(200,180,255,0.3)"
        multiline
        style={{
          minHeight: scale(46), maxHeight: scale(120),
          backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: scale(14),
          paddingHorizontal: scale(14), paddingVertical: scale(12),
          fontSize: scale(14), color: 'rgba(255,255,255,0.92)', textAlign: 'right',
          borderWidth: scale(1), borderColor: 'rgba(139,92,246,0.2)',
        }}
      />
    </View>
  );
}

// ─── صفحة البورد كاملة (الحضور + الفترات + الاحتياطي + استثناءات) ──
function StepBoard({ present, onPresent, boardName, shifts, onToggle, inEx, onInEx }: {
  present: boolean; onPresent: (v: boolean) => void;
  boardName: string;
  shifts: Record<DayKey, ShiftValue>; onToggle: (d: DayKey) => void;
  inEx: boolean; onInEx: (v: boolean) => void;
}) {
  return (
    <View style={{ gap: scale(22) }}>
      {/* الحضور */}
      <View>
        <SubLabel text="هل البورد متواجدون هذا الأسبوع؟" />
        <YesNoCard value={present} onChange={onPresent} yesLabel="نعم، متواجدون" noLabel="لا، غير متواجدين" />
      </View>

      {present && (
        <>
          {/* الفترات */}
          <View>
            <SubLabel text="فترات عمل البورد" />
            <BoardShiftsCard boardName={boardName} shifts={shifts} onToggle={onToggle} />
          </View>
          {/* الاحتياطي */}
          <View>
            <SubLabel text="هل يدخل البورد دورة الاحتياطي؟" />
            <YesNoCard value={inEx} onChange={onInEx} yesLabel="نعم، يدخلون" noLabel="لا يدخلون" />
          </View>
        </>
      )}
    </View>
  );
}

// ─── اختيار وضع المتدرّب (مبتدئ / مستقل) مع توضيح صغير ─────────
function ModeChoice({ mode, onChange }: { mode: TraineeMode; onChange: (m: TraineeMode) => void }) {
  const opt = (val: TraineeMode, label: string, sub: string) => {
    const active = mode === val;
    return (
      <TouchableOpacity
        onPress={() => onChange(val)}
        activeOpacity={0.85}
        style={{
          flex: 1, paddingVertical: scale(12), paddingHorizontal: scale(10), borderRadius: scale(14),
          backgroundColor: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
          borderWidth: scale(1.5), borderColor: active ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.12)',
        }}
      >
        <Text style={{ fontSize: scale(14), fontWeight: '800', color: active ? '#F2ECFF' : 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{label}</Text>
        <Text style={{ fontSize: scale(10), color: active ? 'rgba(214,196,255,0.75)' : 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: scale(4), lineHeight: scale(14) }}>{sub}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={{ flexDirection: 'row-reverse', gap: scale(10) }}>
      {opt('beginner', 'Beginner', 'يكون مع الطبيب في العيادة')}
      {opt('independent', 'Independent', 'يوزَّع وحده في العيادة')}
    </View>
  );
}

// ─── بطاقة متدرّب واحد ─────────────────────────────────────────
function TraineeCard({ t, onChange }: { t: TraineeConfig; onChange: (patch: Partial<TraineeConfig>) => void }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: scale(16), padding: scale(14), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.1)', gap: scale(12) }}>
      <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#E8DEFF', textAlign: 'right' }}>{t.name}</Text>
      <ModeChoice mode={t.mode} onChange={(mode) => onChange({ mode })} />
      {t.mode === 'independent' && (
        <>
          <View>
            <SubLabel text="يدخل في توزيع الدليقيتر؟" />
            <YesNoCard value={t.inDelegator} onChange={(v) => onChange({ inDelegator: v })} yesLabel="نعم" noLabel="لا" />
          </View>
          <View>
            <SubLabel text="يدخل في توزيع الاحتياطي؟" />
            <YesNoCard value={t.inReserve} onChange={(v) => onChange({ inReserve: v })} yesLabel="نعم" noLabel="لا" />
          </View>
        </>
      )}
    </View>
  );
}

// ─── صفحة المتدرّبين (كلّ متدرّب بأسئلته + استثناءات) ──────────
function StepTrainees({ trainees, onUpdate }: {
  trainees: TraineeConfig[];
  onUpdate: (id: string, patch: Partial<TraineeConfig>) => void;
}) {
  if (trainees.length === 0) {
    return (
      <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: scale(16), padding: scale(20), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.1)' }}>
        <Text style={{ fontSize: scale(13), color: 'rgba(214,196,255,0.6)', textAlign: 'center', lineHeight: scale(20) }}>
          لا يوجد متدرّبون في عيادتك هذا الأسبوع.
        </Text>
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

// ─── الصفحة الأخيرة: الاستثناءات (أمثلة + حقل كبير) ────────────
function ExampleRow({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: scale(8), marginBottom: scale(8) }}>
      <View style={{ width: scale(5), height: scale(5), borderRadius: scale(3), backgroundColor: 'rgba(167,139,250,0.8)', marginTop: scale(7) }} />
      <Text style={{ flex: 1, fontSize: scale(12.5), color: 'rgba(214,196,255,0.8)', textAlign: 'right', lineHeight: scale(19) }}>{text}</Text>
    </View>
  );
}

function StepExceptions({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: scale(14) }}>
      {/* أمثلة توضيحيّة */}
      <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: scale(16), padding: scale(14), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.1)' }}>
        <Text style={{ fontSize: scale(12), fontWeight: '800', color: 'rgba(214,196,255,0.85)', textAlign: 'right', marginBottom: scale(10) }}>
          أمثلة على ما يمكنك كتابته:
        </Text>
        <ExampleRow text="توزيع الجدول بدون Delegators" />
        <ExampleRow text="د. محمد تفرّغ، أو مرضيّة، أو إجازة" />
        <ExampleRow text="أيام عطلة رسميّة" />
      </View>

      {/* الحقل الكبير — اكتب كل شيء */}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="اكتب أيّ استثناء أو ملاحظة هنا…"
        placeholderTextColor="rgba(200,180,255,0.3)"
        multiline
        textAlignVertical="top"
        style={{
          minHeight: scale(150), maxHeight: scale(260),
          backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: scale(16),
          paddingHorizontal: scale(16), paddingVertical: scale(14),
          fontSize: scale(14), color: 'rgba(255,255,255,0.92)', textAlign: 'right', lineHeight: scale(21),
          borderWidth: scale(1), borderColor: 'rgba(139,92,246,0.25)',
        }}
      />
    </View>
  );
}

// ─── المعاينة: نفس ترتيب جدول الصفحة لكن بكروت/إطارات بيضاء (بلا ألوان) ───
// لكل يوم: عمودا زوج فترات (صباح P1/P2 | مساء P3/P4)، وداخل كل زوج
// صفوف العيادات ثم الدليقيتر (DLG) ثم الاحتياط (EX).
const PAIRS: [Period, Period][] = [[1, 2], [3, 4]];

type Sel = { day: string; id: string } | null;
type CellDoc = { id: string; name: string };

/** يبدّل طبيبين بكامل خاناتهما في يومٍ واحد (تبديل دائمًا صالح، لا يكسر تزاوج الفترات) */
function swapDoctorsInDay(slots: AssignedSlot[], day: string, idA: string, idB: string): AssignedSlot[] {
  if (idA === idB) return slots;
  const docA = slots.find((s) => s.day === day && s.doctor.id === idA)?.doctor;
  const docB = slots.find((s) => s.day === day && s.doctor.id === idB)?.doctor;
  if (!docA || !docB) return slots;
  return slots.map((s) => {
    if (s.day !== day) return s;
    if (s.doctor.id === idA) return { ...s, doctor: docB };
    if (s.doctor.id === idB) return { ...s, doctor: docA };
    return s;
  });
}

function PvCell({ docs, day, sel, onTap }: { docs: CellDoc[]; day: string; sel: Sel; onTap: (day: string, id: string) => void }) {
  return (
    <View style={{ flex: 1, minHeight: scale(26), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.22)', borderRadius: scale(6), paddingVertical: scale(3), paddingHorizontal: scale(3), justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' }}>
      {docs.length > 0 ? (
        docs.map((d, i) => {
          const active = sel?.day === day && sel.id === d.id;
          return (
            <TouchableOpacity
              key={`${d.id}-${i}`}
              activeOpacity={0.7}
              hitSlop={{ top: scale(4), bottom: scale(4), left: scale(2), right: scale(2) }}
              onPress={() => onTap(day, d.id)}
              style={{ borderRadius: scale(4), paddingVertical: scale(1), backgroundColor: active ? 'rgba(139,92,246,0.6)' : 'transparent' }}
            >
              <Text numberOfLines={1} style={{ fontSize: scale(9), fontWeight: '700', color: '#fff', textAlign: 'center' }}>{d.name}</Text>
            </TouchableOpacity>
          );
        })
      ) : (
        <Text style={{ fontSize: scale(9), color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>—</Text>
      )}
    </View>
  );
}

function PvLabel({ text }: { text: string }) {
  return (
    <View style={{ width: scale(34), justifyContent: 'center' }}>
      <Text style={{ fontSize: scale(8.5), fontWeight: '800', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function PvRow({ label, day, left, right, sel, onTap }: { label: string; day: string; left: CellDoc[]; right: CellDoc[]; sel: Sel; onTap: (day: string, id: string) => void }) {
  return (
    <View style={{ flexDirection: 'row-reverse', gap: scale(3), marginBottom: scale(3) }}>
      <PvLabel text={label} />
      <PvCell docs={left} day={day} sel={sel} onTap={onTap} />
      <PvCell docs={right} day={day} sel={sel} onTap={onTap} />
    </View>
  );
}

function PreviewGrid({ slots, absences, clinicCount, sel, onTap }: { slots: AssignedSlot[]; absences: PreviewAbsence[]; clinicCount: number; sel: Sel; onTap: (day: string, id: string) => void }) {
  const pick = (day: string, period: Period, role: AssignedSlot['role'], clinicNum?: number): CellDoc[] =>
    slots
      .filter((s) => s.day === day && s.period === period && s.role === role && (clinicNum == null || s.clinicNumber === clinicNum))
      .map((s) => ({ id: s.doctor.id, name: s.doctor.name }));

  return (
    <View style={{ gap: scale(14) }}>
      {DAYS.map((day) => {
        const daySlots = slots.filter((s) => s.day === day.key);
        const dayAbs = absences.filter((a) => a.day === day.key);
        if (daySlots.length === 0 && dayAbs.length === 0) return null;
        const activePairs = PAIRS.filter(([a, b]) => daySlots.some((s) => s.period === a || s.period === b));
        const hasDlg = daySlots.some((s) => s.role === 'delegator');
        // الاحتياط (EX) على مستوى اليوم — أطباء فريدون بدور ex (الفترة لا تهمّ للعرض)
        const exDocs: CellDoc[] = [];
        const seenEx = new Set<string>();
        for (const s of daySlots) {
          if (s.role !== 'ex' || seenEx.has(s.doctor.id)) continue;
          seenEx.add(s.doctor.id);
          exDocs.push({ id: s.doctor.id, name: s.doctor.name });
        }
        const showExtra = exDocs.length > 0 || dayAbs.length > 0;
        return (
          <View key={day.key} style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: scale(14), padding: scale(12), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.25)' }}>
            <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#fff', textAlign: 'right', marginBottom: scale(10) }}>{day.label}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: scale(8) }}>
              {activePairs.map(([pa, pb]) => (
                <View key={pa} style={{ flex: 1 }}>
                  {/* رؤوس الفترتين */}
                  <View style={{ flexDirection: 'row-reverse', gap: scale(3), marginBottom: scale(5) }}>
                    <PvLabel text="" />
                    <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: scale(9.5), fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>{`P${pa}`}</Text></View>
                    <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: scale(9.5), fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>{`P${pb}`}</Text></View>
                  </View>
                  {/* صفوف العيادات */}
                  {Array.from({ length: clinicCount }).map((_, ci) => {
                    const cn = ci + 1;
                    return <PvRow key={cn} label={`ع${cn}`} day={day.key} sel={sel} onTap={onTap} left={pick(day.key, pa, 'clinic', cn)} right={pick(day.key, pb, 'clinic', cn)} />;
                  })}
                  {hasDlg && <PvRow label="DLG" day={day.key} sel={sel} onTap={onTap} left={pick(day.key, pa, 'delegator')} right={pick(day.key, pb, 'delegator')} />}
                </View>
              ))}
            </View>

            {/* صفّ "إضافي": الاحتياط (EX) + المتغيّبون/المتفرّغون — مثل الجدول الحقيقيّ */}
            {showExtra && (
              <View style={{ marginTop: scale(10), paddingTop: scale(8), borderTopWidth: scale(1), borderTopColor: 'rgba(255,255,255,0.18)' }}>
                <Text style={{ fontSize: scale(9), fontWeight: '800', color: 'rgba(255,255,255,0.55)', textAlign: 'right', marginBottom: scale(5) }}>إضافي / غياب</Text>
                <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(5) }}>
                  {exDocs.map((d) => {
                    const active = sel?.day === day.key && sel.id === d.id;
                    return (
                      <TouchableOpacity key={`ex-${d.id}`} activeOpacity={0.7} onPress={() => onTap(day.key, d.id)} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(3), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.3)', borderRadius: scale(6), paddingVertical: scale(3), paddingHorizontal: scale(6), backgroundColor: active ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.05)' }}>
                        <Text style={{ fontSize: scale(7.5), fontWeight: '800', color: 'rgba(255,255,255,0.5)' }}>EX</Text>
                        <Text style={{ fontSize: scale(9.5), fontWeight: '700', color: '#fff' }}>{d.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {dayAbs.map((a, i) => (
                    <View key={`ab-${i}`} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(3), borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.2)', borderRadius: scale(6), paddingVertical: scale(3), paddingHorizontal: scale(6), backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <Text style={{ fontSize: scale(7.5), fontWeight: '800', color: 'rgba(255,255,255,0.4)' }}>{a.label}</Text>
                      <Text style={{ fontSize: scale(9.5), fontWeight: '700', color: 'rgba(255,255,255,0.65)' }}>{a.doctorName}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function PreviewView({ preview, building, error, onSave, onEdit, hideEdit }: {
  preview: { slots: AssignedSlot[]; absences: PreviewAbsence[]; clinicCount: number; summary: string; warnings: string[] };
  building: boolean;
  error: string | null;
  onSave: (slots: AssignedSlot[]) => void;
  onEdit: () => void;
  hideEdit?: boolean;   // مسار الجات: يُخفي "رجوع للتعديل" (أيقونة المحادثة تكفي)
}) {
  // نسخة قابلة للتعديل + حالة التحديد (نقر طبيب ثم آخر في نفس اليوم → تبديل)
  const [slots, setSlots] = useState<AssignedSlot[]>(preview.slots);
  const [sel, setSel] = useState<Sel>(null);

  // إعادة بناء المعاينة (مثلاً بعد حلّ اسم غامض في الجات) → زامِن الخانات القابلة للتعديل
  useEffect(() => { setSlots(preview.slots); setSel(null); }, [preview.slots]);

  const onTap = (day: string, id: string) => {
    if (!sel || sel.day !== day) { setSel({ day, id }); return; }  // تحديد جديد (أو يوم مختلف)
    if (sel.id === id) { setSel(null); return; }                   // نفس الطبيب → إلغاء
    setSlots((s) => swapDoctorsInDay(s, day, sel.id, id));         // تبديل ثم إلغاء التحديد
    setSel(null);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ paddingHorizontal: scale(22), paddingTop: scale(54), paddingBottom: scale(12) }}>
        <Text style={{ fontSize: scale(20), fontWeight: '800', color: '#F2ECFF', textAlign: 'right' }}>معاينة الجدول</Text>
        <Text style={{ fontSize: scale(12), color: 'rgba(214,196,255,0.7)', textAlign: 'right', marginTop: scale(6), lineHeight: scale(18) }}>{preview.summary}</Text>
        <Text style={{ fontSize: scale(11), color: sel ? '#C4B5FD' : 'rgba(214,196,255,0.5)', textAlign: 'right', marginTop: scale(6) }}>
          {sel ? 'اختر طبيبًا آخر في نفس اليوم لتبديله — أو انقر نفسه للإلغاء' : 'للتبديل: انقر طبيبًا ثم انقر آخر في نفس اليوم'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: scale(16), paddingBottom: scale(20) }} showsVerticalScrollIndicator={false}>
        <PreviewGrid slots={slots} absences={preview.absences} clinicCount={preview.clinicCount} sel={sel} onTap={onTap} />
        {preview.warnings.length > 0 && (
          <View style={{ marginTop: scale(14), backgroundColor: 'rgba(250,204,21,0.08)', borderRadius: scale(12), padding: scale(12), borderWidth: scale(1), borderColor: 'rgba(250,204,21,0.3)' }}>
            <Text style={{ fontSize: scale(12), fontWeight: '700', color: '#FDE68A', textAlign: 'right', marginBottom: scale(6) }}>تنبيهات:</Text>
            {preview.warnings.map((w, i) => (
              <Text key={i} style={{ fontSize: scale(11.5), color: 'rgba(253,230,138,0.85)', textAlign: 'right', lineHeight: scale(18) }}>• {w}</Text>
            ))}
          </View>
        )}
      </ScrollView>

      {error && (
        <Text style={{ paddingHorizontal: scale(22), paddingBottom: scale(6), color: '#FCA5A5', fontSize: scale(12), textAlign: 'right' }}>{error}</Text>
      )}

      <View style={{ flexDirection: 'row-reverse', gap: scale(10), paddingHorizontal: scale(22), paddingTop: scale(10), paddingBottom: Platform.OS === 'ios' ? scale(34) : scale(20) }}>
        <TouchableOpacity
          onPress={building ? undefined : () => onSave(slots)}
          disabled={building}
          activeOpacity={0.85}
          style={{ flex: 1, paddingVertical: scale(14), borderRadius: scale(16), backgroundColor: building ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.85)', alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'center', gap: scale(8) }}
        >
          {building ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#fff' }}>حفظ الجدول</Text>
              <Ionicons name="save" size={scale(18)} color="#fff" />
            </>
          )}
        </TouchableOpacity>
        {!hideEdit && (
          <TouchableOpacity
            onPress={onEdit}
            disabled={building}
            activeOpacity={0.85}
            style={{ paddingVertical: scale(14), paddingHorizontal: scale(20), borderRadius: scale(16), backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' }}
          >
            <Text style={{ fontSize: scale(15), fontWeight: '700', color: 'rgba(255,255,255,0.6)' }}>رجوع للتعديل</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
