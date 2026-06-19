// ═══════════════════════════════════════════════════════════════
// مُسجِّل الظلّ — المرحلة ج، الخطوة ١ (الأكثر أمانًا)
//
// يُدمَج القلب الجديد في المسار الحيّ **بلا تطبيق**: عند كلّ إعادة توازنٍ حقيقيّة
// (بعد استئذان/عودة)، يحسب ما **سيقرّره** القلب الجديد على الجدول الحاليّ ويُسجّله
// بجانب القديم. لا يكتب شيئًا، ولا يرمي استثناءً، ويعمل **فقط** خلف علمٍ وعلى عيادة
// الاختبار. هكذا نقارن القلبين في الإنتاج بأمانٍ قبل أيّ تحويلٍ فعليّ.
// ═══════════════════════════════════════════════════════════════
import { loadScheduleData } from './schedule';
import { supabase } from '../supabase';
import type { WeekDay, LoadedSlot } from './schedule';
import {
  extractHeavySeats, extractReserveSeats, lastHeavyStamps, lastRestStamps,
  solveLookahead, solveHeavyRecency,
} from './solver';
import type { HeavySeat } from './solver';

// علمان منفصلان (مطفأان افتراضيًّا، يُقرآن لحظيًّا) + قصرٌ على عيادة الاختبار (أمانٌ مزدوج).
//  • SHADOW: يسجّل القرار فقط (لا كتابة).      • APPLY: يطبّق فعلًا (كتابة) — أخطر، علمٌ مستقلّ.
const shadowEnabled = () => process.env.NEW_HEART_SHADOW === '1';
const applyEnabled = () => process.env.NEW_HEART_APPLY === '1';
const TEST_CLINIC = '10000000-0000-0000-0000-000000000001';
const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const DAY_OF: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

/**
 * يُسجّل (بالظلّ) ما سيفعله القلب الجديد على جدول (عيادة + أسبوع) الحاليّ — دون كتابة.
 * آمنٌ بالكامل: لا يرمي، ولا يعمل إلا خلف العلم وعلى عيادة الاختبار. يُستدعى بجانب
 * rebalanceForward القديم.
 */
export async function shadowRebalanceLog(args: { clinicId: string; weekStart: string; label: string }): Promise<void> {
  if (!shadowEnabled() || args.clinicId !== TEST_CLINIC) return;
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return;
    const doctors = data.doctors;
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const all: LoadedSlot[] = [...data.pastSlots, ...data.existingSlots];

    // ① الدليقيتر (نظر-للأمام): هل يقترح القلب الجديد تغييرًا على الحاليّ؟
    const delSeats: HeavySeat[] = [];
    for (const day of Object.keys(DAY_IDX) as WeekDay[]) {
      const ss = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day] && [1, 2].includes(s.period));
      delSeats.push(...extractHeavySeats(ss, poolIds));
    }
    delSeats.sort((a, b) => a.stamp.localeCompare(b.stamp));
    const delPrior = lastHeavyStamps(all.filter((s) => s.weekStart < args.weekStart));
    const del = delSeats.length ? solveLookahead(doctors, delSeats, delPrior) : null;

    // ② الاحتياط (حداثة): هل يقترح إعادة قسمةٍ للراحة؟
    const rest = lastRestStamps(all.filter((s) => s.weekStart < args.weekStart));
    let exTouch = 0; let exTotal = 0;
    for (const day of Object.keys(DAY_IDX) as WeekDay[]) for (const h of [0, 1]) {
      const ss = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day] && (s.status === 'extra' ? s.clinicNumber === (h === 0 ? 1 : 2) : (h === 0 ? [1, 2] : [3, 4]).includes(s.period)));
      const seats = extractReserveSeats(ss, poolIds);
      if (!seats.length) continue;
      exTotal += seats.length;
      exTouch += solveHeavyRecency(doctors, rest, seats).assignments.length;
    }

    const delN = del?.assignments.length ?? 0;
    const verdict = (delN === 0 && exTouch === 0) ? 'يوافق القلب القديم تمامًا' : `يقترح تعديلًا (دليقيتر:${delN} احتياط:${exTouch})`;
    // eslint-disable-next-line no-console
    console.log(`[NEW-HEART SHADOW · ${args.label}] أسبوع ${args.weekStart}: ${verdict}` +
      (del ? ` · حِمل ${del.maxLoadBefore}→${del.maxLoadAfter} · أهليّة=${del.eligibilityRespected ? '✓' : '✗'} · محفوظ=${del.conserved ? '✓' : '✗'}` : '') +
      (delN ? ` · تغييرات الدليقيتر: ${del!.assignments.map((a) => `${a.from}→${a.to}`).join('، ')}` : ''));
  } catch (e) {
    // لا نُفشل المسار الحيّ أبدًا — الظلّ تشخيصٌ فقط.
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART SHADOW] تعذّر الحساب:', e instanceof Error ? e.message : e);
  }
}

/**
 * C1 — يطبّق فعليًّا تحسينات القلب الجديد للدليقيتر (كتابة)، خلف علم `NEW_HEART_APPLY=1`
 * وعيادة الاختبار فقط. كلّ تعديلٍ = **مبادلة دورين** بين طبيبين حاضرين في الشفت نفسه
 * (الجديد يقول: مقعد الدليقيتر الأحقّ به Y لا Z → نبادل خانات Z و Y في ذلك الشفت).
 * آمن: لا يعمل إلا خلف العلم، لا يرمي أبدًا، ويُرجِع ما طبّقه. القديم يبقى كما هو.
 */
export async function applyNewHeartRebalance(args: { clinicId: string; weekStart: string; label: string }): Promise<{ applied: number }> {
  if (!applyEnabled() || args.clinicId !== TEST_CLINIC) return { applied: 0 };
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { applied: 0 };
    const doctors = data.doctors;
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const all: LoadedSlot[] = [...data.pastSlots, ...data.existingSlots];

    const delSeats: HeavySeat[] = [];
    for (const day of DAY_OF) {
      const ss = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day] && [1, 2].includes(s.period));
      delSeats.push(...extractHeavySeats(ss, poolIds));
    }
    delSeats.sort((a, b) => a.stamp.localeCompare(b.stamp));
    if (delSeats.length === 0) return { applied: 0 };
    const rec = solveLookahead(doctors, delSeats, lastHeavyStamps(all.filter((s) => s.weekStart < args.weekStart)));

    let applied = 0;
    for (const fa of rec.fullAssignment) {
      const seat = delSeats.find((s) => s.id === fa.seatId)!;
      const Z = seat.current; const Y = fa.doctorId;
      if (Z === Y) continue; // لا تغيير
      // الشفت: من الختم week#dayIdx#half.
      const parts = seat.stamp.split('#'); const dayIdx = Number(parts[1]); const half = Number(parts[2]);
      const day = DAY_OF[dayIdx]; if (!day) continue;
      const periods = half === 0 ? [1, 2] : [3, 4];
      // مبادلةٌ نظيفة: كلٌّ من Z و Y حاضرٌ بخاناتٍ نشطةٍ في هذا الشفت → نتبادل بالمعرّف.
      const zRows = data.existingSlots.filter((s) => s.doctorId === Z && s.dayOfWeek === day && periods.includes(s.period) && s.status === 'active');
      const yRows = data.existingSlots.filter((s) => s.doctorId === Y && s.dayOfWeek === day && periods.includes(s.period) && s.status === 'active');
      if (zRows.length === 0 || yRows.length === 0) continue; // ليست مبادلةً نظيفة → نتركها (أمان)
      const yName = doctors.find((d) => d.id === Y)?.name ?? Y;
      const zName = doctors.find((d) => d.id === Z)?.name ?? Z;
      for (const r of zRows) await supabase.from('schedule_slots').update({ doctor_id: Y, doctor_name: yName }).eq('id', r.id);
      for (const r of yRows) await supabase.from('schedule_slots').update({ doctor_id: Z, doctor_name: zName }).eq('id', r.id);
      applied++;
      // eslint-disable-next-line no-console
      console.log(`[NEW-HEART APPLY · ${args.label}] بادل ${zName} ⇄ ${yName} (${day}/${half === 0 ? 'ص' : 'م'})`);
    }
    if (applied === 0) console.log(`[NEW-HEART APPLY · ${args.label}] لا تحسينات — يوافق القديم.`);
    return { applied };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART APPLY] تعذّر التطبيق:', e instanceof Error ? e.message : e);
    return { applied: 0 };
  }
}
