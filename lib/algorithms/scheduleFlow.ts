// ═══════════════════════════════════════════════════════════════
// scheduleFlow — منطقُ إنشاءِ الجدولِ المشتركُ (بلا واجهة)
// ───────────────────────────────────────────────────────────────
// مصدرٌ واحدٌ لِـ collect→parse→build→save يستعملُه **المكانان** بلا فرع:
//   • صفحةُ إنشاءِ الجدول (components/ScheduleWizard — WizardContent)
//   • كرتُ المعالجِ داخلَ المحادثة (components/ScheduleWizardCard)
// فأيُّ تعديلٍ على تحويلِ المدخلات/البناء/الحفظ يسري على الاثنين معًا.
// ═══════════════════════════════════════════════════════════════

import { getDoctorGroups } from '../database';
import { getTemplateByName } from './groupTemplates';
import {
  schedule, loadDoctorRoster, WEEK_DAYS,
  type AssignedSlot, type ScheduleBuildInput, type WeekDay, type PreviewAbsence,
} from './schedule';
import {
  parseExceptions,
  type ParsedExceptions, type RosterEntry, type ResolvedClarification,
} from '../ai_v2/parseExceptions';

// ─── الأنواع (كانت محليّة في ScheduleWizard؛ نُقلت هنا ليتشاركها الطرفان) ───
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

export const ALL_MORNING: Record<DayKey, ShiftValue> = {
  sunday: 'morning', monday: 'morning', tuesday: 'morning', wednesday: 'morning', thursday: 'morning',
};

// ─── تواريخ (مثبَّتةٌ على الأحد) ───────────────────────────────
export function snapToSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // getDay: 0 = الأحد
  return x;
}
export function nextWeekSunday(): Date {
  const s = snapToSunday(new Date());
  s.setDate(s.getDate() + 7);
  return s;
}
export function thisWeekSunday(): Date {
  return snapToSunday(new Date());
}
export function formatYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ─── دمجُ حلولِ الأسماءِ الغامضة (من كروت التوضيح) في التفسير ───
export function applyResolved(parsed: ParsedExceptions, resolved: ResolvedClarification[]): ParsedExceptions {
  if (!resolved.length) return parsed;
  const extraAbsences = [...parsed.extraAbsences];
  const extraPermissions = [...parsed.extraPermissions];
  for (const r of resolved) {
    if (r.clar.kind === 'absence') {
      extraAbsences.push({ doctorId: r.doctorId, day: r.day, scope: r.clar.scope ?? 'full', status: r.clar.status ?? 'vacation' });
    } else {
      extraPermissions.push({ doctorId: r.doctorId, day: r.day, kind: r.clar.permKind ?? 'end' });
    }
  }
  return { ...parsed, extraAbsences, extraPermissions };
}

// ─── تحويلُ نتيجةِ الاستبيانِ إلى مدخلِ الخوارزمية ───
// الاستثناءاتُ الحرّةُ لا تُمرَّرُ هنا خامًا — تُفسَّرُ أوّلًا (parsed).
export function resultToBuildInput(
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
    holidayDays: parsed?.holidayDays,
    delegatorEnabled: parsed?.delegatorEnabled,
    delegatorGroups: parsed?.delegatorGroups,
    extraAbsences: parsed?.extraAbsences,
    extraPermissions: parsed?.extraPermissions,
    extraShifts: parsed?.extraShifts,
    dryRun,
  };
}

// ─── تحميلُ روستر العيادة (أسماء + قروب كلّ طبيب + المتدرّبون + أسماء القروبات) ───
export interface WizardRoster {
  roster: RosterEntry[];
  groupKeyById: Map<string, string>;
  trainees: TraineeConfig[];
  groupNames: { a: string; b: string; board: string };
}
export async function loadWizardRoster(clinicId: string): Promise<WizardRoster> {
  const out: WizardRoster = {
    roster: [], groupKeyById: new Map(), trainees: [],
    groupNames: { a: 'قروب A', b: 'قروب B', board: 'البورد' },
  };
  const { data: groups } = await getDoctorGroups(clinicId);
  if (groups) {
    for (const g of groups) {
      const key = getTemplateByName(g.name)?.key;
      if (key === 'group_a') out.groupNames.a = g.name;
      if (key === 'group_b') out.groupNames.b = g.name;
      if (key === 'board') out.groupNames.board = g.name;
    }
  }
  const { doctors } = await loadDoctorRoster(clinicId);
  if (doctors) {
    out.roster = doctors.map((d) => ({ id: d.id, name: d.name }));
    out.groupKeyById = new Map(doctors.map((d) => [d.id, d.groupTemplate.key]));
    out.trainees = doctors
      .filter((d) => d.workStatus === 'trainee')
      .map((d) => ({ id: d.id, name: d.name, mode: 'beginner' as TraineeMode, inDelegator: false, inReserve: false }));
  }
  return out;
}

// ─── تفسيرُ الاستثناءاتِ الحرّة (الذكاء يترجمها) ───
export async function parseResultExceptions(r: WizardResult, roster: RosterEntry[]): Promise<ParsedExceptions> {
  return parseExceptions(r.exceptions || '', roster);
}

// ─── بناءُ معاينةٍ (dryRun) من نتيجةِ الاستبيان + تفسيرِ الاستثناءات ───
export type FlowPreview = {
  slots: AssignedSlot[];
  absences: PreviewAbsence[];
  clinicCount: number;
  summary: string;
  warnings: string[];
};
export async function buildPreview(
  r: WizardResult,
  clinicId: string,
  parsed: ParsedExceptions,
  resolved: ResolvedClarification[] = [],
): Promise<{ ok: boolean; preview?: FlowPreview; error?: string }> {
  try {
    const merged = applyResolved(parsed, resolved);
    const res = await schedule.build(resultToBuildInput(r, clinicId, true, merged));
    if (res.success && res.previewSlots) {
      const warnings = [
        ...parsed.unresolved.map((u) => `لم يُطبَّق تلقائيًّا: ${u}`),
        ...res.warnings,
      ];
      return {
        ok: true,
        preview: {
          slots: res.previewSlots,
          absences: res.previewAbsences ?? [],
          clinicCount: res.clinicCount ?? 1,
          summary: res.summary,
          warnings,
        },
      };
    }
    return { ok: false, error: res.errors[0] || res.summary || 'تعذّر بناء الجدول.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

// ─── حفظُ خانات المعاينة (بعد أيّ تبديلٍ يدويّ) + علامات الاستئذان/الغياب + وصفة البناء ───
export async function saveSchedule(
  r: WizardResult,
  clinicId: string,
  finalSlots: AssignedSlot[],
  roster: RosterEntry[],
  groupKeyById: Map<string, string>,
  parsed: ParsedExceptions | null,
  resolved: ResolvedClarification[] = [],
): Promise<{ success: boolean; error?: string }> {
  try {
    const nameById = new Map(roster.map((d) => [d.id, d.name]));
    const merged = parsed ? applyResolved(parsed, resolved) : null;
    // خانة EX الصحيحة حسب شفت الطبيب ذلك اليوم: 1=صباح، 2=مساء.
    // الأولوية لنقل الشفت (extraShift)، ثم قروب الطبيب مع خطّة الشفتات.
    const exCell = (doctorId: string, day: WeekDay): number => {
      const ov = (merged?.extraShifts || []).find((s) => s.doctorId === doctorId && s.day === day);
      let shift: ShiftValue;
      if (ov) shift = ov.shift;
      else {
        const key = groupKeyById.get(doctorId);
        const aShift = r.aShiftPlan[day as DayKey];
        if (key === 'group_b') shift = aShift === 'morning' ? 'evening' : 'morning';
        else if (key === 'board') shift = r.board.shiftPlan[day as DayKey];
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
    const absences = (merged?.extraAbsences || []).map((a) => ({
      doctorId: a.doctorId,
      doctorName: nameById.get(a.doctorId) || '',
      day: a.day,
      status: (a.status === 'sick_leave' ? 'sick_leave' : 'vacation') as 'sick_leave' | 'vacation',
      clinicNumber: exCell(a.doctorId, a.day),
    }));
    const buildInput = resultToBuildInput(r, clinicId, false, merged ?? undefined);
    const res = await schedule.saveSlots(clinicId, r.weekStart, finalSlots, permissions, absences, buildInput.aShiftPlan, buildInput.boardConfig);
    if (!res.success) return { success: false, error: res.error || 'تعذّر حفظ الجدول.' };
    // احفظ «وصفة البناء» (غير قاتل: فشلُه لا يمنع الحفظ)
    await schedule.saveBuildConfig(buildInput);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}
