// ═══════════════════════════════════════════════════════════════
// مُسجِّل الظلّ — المرحلة ج، الخطوة ١ (الأكثر أمانًا)
//
// يُدمَج القلب الجديد في المسار الحيّ **بلا تطبيق**: عند كلّ إعادة توازنٍ حقيقيّة
// (بعد استئذان/عودة)، يحسب ما **سيقرّره** القلب الجديد على الجدول الحاليّ ويُسجّله
// بجانب القديم. لا يكتب شيئًا، ولا يرمي استثناءً، ويعمل **فقط** خلف علمٍ وعلى عيادة
// الاختبار. هكذا نقارن القلبين في الإنتاج بأمانٍ قبل أيّ تحويلٍ فعليّ.
// ═══════════════════════════════════════════════════════════════
import { loadScheduleData } from './schedule';
import type { WeekDay, LoadedSlot } from './schedule';
import {
  extractHeavySeats, extractReserveSeats, lastHeavyStamps, lastRestStamps,
  solveLookahead, solveHeavyRecency,
} from './solver';
import type { HeavySeat } from './solver';

// علمٌ صريح (مطفأٌ افتراضيًّا، يُقرأ لحظيًّا) + قصرٌ على عيادة الاختبار (أمانٌ مزدوج).
const shadowEnabled = () => process.env.NEW_HEART_SHADOW === '1';
const TEST_CLINIC = '10000000-0000-0000-0000-000000000001';
const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

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
