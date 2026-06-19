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
import { newHeartConfig } from './new_heart_config';
import type { WeekDay, LoadedSlot } from './schedule';
import {
  extractHeavySeats, extractReserveSeats, lastHeavyStamps, lastRestStamps,
  solveLookahead, solveHeavyRecency,
  extractCoverageSeats, solveCoverage, lastClinicStamps, lastBoardStamps,
} from './solver';
import type { HeavySeat } from './solver';

// المفتاح من new_heart_config (يعمل على Expo Go) — مع تجاوزٍ بيئيٍّ للسكربتات/الخادم.
//  • shadow/apply: يسجّل القرار.   • apply فقط: يكتب فعلًا.
const envMode = (): 'off' | 'shadow' | 'apply' | null =>
  process.env.NEW_HEART_APPLY === '1' ? 'apply'
    : process.env.NEW_HEART_SHADOW === '1' ? 'shadow'
      : (process.env.NEW_HEART_APPLY === '0' || process.env.NEW_HEART_SHADOW === '0') ? 'off' : null;
const mode = () => envMode() ?? newHeartConfig.mode;
const clinicAllowed = (id: string) => newHeartConfig.clinics === null || newHeartConfig.clinics.includes(id);
const shadowEnabled = (id: string) => mode() !== 'off' && clinicAllowed(id);
const applyEnabled = (id: string) => mode() === 'apply' && clinicAllowed(id);

/** هل القلب الجديد هو الكاتب الوحيد لهذه العيادة؟ (وضع apply) — تستعمله rebalanceForward
 *  لتخطّي حلقتها السببيّة القديمة فلا يتنازع كاتبان. */
export function isApplyMode(clinicId: string): boolean { return applyEnabled(clinicId); }
const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const DAY_OF: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

/**
 * يُسجّل (بالظلّ) ما سيفعله القلب الجديد على جدول (عيادة + أسبوع) الحاليّ — دون كتابة.
 * آمنٌ بالكامل: لا يرمي، ولا يعمل إلا خلف العلم وعلى عيادة الاختبار. يُستدعى بجانب
 * rebalanceForward القديم.
 */
export async function shadowRebalanceLog(args: { clinicId: string; weekStart: string; label: string }): Promise<void> {
  if (!shadowEnabled(args.clinicId)) return;
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
 * يطبّق تغطية الغياب (كتابة) لبِركتين: العاديّة (غير البورد) والبورد. لكلٍّ بِركتُه
 * واحتياطُه وحداثتُه: مقعد العيادة الشاغر يُملأ من احتياط البِركة العاديّة (الأطولُ راحةً)،
 * ومقعد البورد الشاغر يُملأ من احتياط البورد (الأقدمُ دخولًا). يَكتب خانةً نشطةً للمغطّي
 * ويُزيل صفّ احتياطه. idempotent (المغطَّى لا يُكشف شاغرًا)، لا بديل؟ نقصٌ صريح، لا يرمي.
 */
export async function applyCoverage(args: { clinicId: string; weekStart: string; label: string }): Promise<{ filled: number; shortages: number }> {
  if (!applyEnabled(args.clinicId)) return { filled: 0, shortages: 0 };
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { filled: 0, shortages: 0 };
    const doctors = data.doctors;
    const history = [...data.pastSlots, ...data.existingSlots].filter((s) => s.weekStart < args.weekStart);
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const boardIds = new Set(doctors.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id));
    // بِركتان: العاديّة (حداثة آخر عمل) والبورد (حداثة آخر دخولٍ للعيادة). كلٌّ يُغطّي
    // مقاعدَ غياب بِركته فقط من احتياط بِركته فقط — فلا يملأ عاديٌّ مقعدَ بورد ولا العكس.
    const scopes = [
      { name: 'COVER', pool: poolIds, prior: lastClinicStamps(history), mine: (id: string) => !boardIds.has(id) },
      { name: 'BOARD', pool: boardIds, prior: lastBoardStamps(history, boardIds), mine: (id: string) => boardIds.has(id) },
    ];
    let filled = 0; let shortages = 0;

    for (const sc of scopes) {
      for (const day of DAY_OF) {
        for (const half of [0, 1] as const) {
          const periods = half === 0 ? [1, 2] : [3, 4];
          const exCol = half === 0 ? 1 : 2;
          const dayRows = data.existingSlots.filter((s) => s.dayOfWeek === day);
          const shiftView = dayRows.filter((s) =>
            (s.status === 'active' && s.role === 'clinic' && periods.includes(s.period))
            || ((s.role as string) === 'prev_placement' && s.status === 'active' && periods.includes(s.period)));
          const vacant = extractCoverageSeats(shiftView).filter((v) => sc.mine(v.absentId));
          if (vacant.length === 0) continue;
          const availIds = [...new Set(dayRows
            .filter((s) => s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol)
            .map((s) => s.doctorId))].filter((id) => sc.pool.has(id));
          const rec = solveCoverage(doctors, vacant, availIds, sc.prior);
          const removedEx = new Set<string>();
          for (const f of rec.fills) {
            const name = doctors.find((d) => d.id === f.doctorId)?.name ?? f.doctorId;
            if (!removedEx.has(f.doctorId)) {
              const exRow = dayRows.find((s) => s.doctorId === f.doctorId && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
              if (exRow) await supabase.from('schedule_slots').delete().eq('id', exRow.id);
              removedEx.add(f.doctorId);
            }
            await supabase.from('schedule_slots').insert({
              clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
              period: f.period, clinic_number: f.clinicNumber,
              doctor_id: f.doctorId, doctor_name: name, role: 'clinic', status: 'active', source: 'request',
            });
            filled++;
            // eslint-disable-next-line no-console
            console.log(`[NEW-HEART ${sc.name} · ${args.label}] ${name} → عيادة ${f.clinicNumber} (${day}/${half === 0 ? 'ص' : 'م'} ف${f.period})`);
          }
          if (!rec.conserved) {
            shortages += vacant.length - rec.fills.length;
            // eslint-disable-next-line no-console
            console.log(`[NEW-HEART ${sc.name} · ${args.label}] نقصٌ: ${vacant.length - rec.fills.length} مقعدٌ بلا بديلٍ (${day}/${half === 0 ? 'ص' : 'م'})`);
          }
        }
      }
    }
    return { filled, shortages };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART COVER] تعذّر:', e instanceof Error ? e.message : e);
    return { filled: 0, shortages: 0 };
  }
}

/**
 * C1 — يطبّق فعليًّا تحسينات القلب الجديد للدليقيتر (كتابة)، خلف علم `NEW_HEART_APPLY=1`
 * وعيادة الاختبار فقط. كلّ تعديلٍ = **مبادلة دورين** بين طبيبين حاضرين في الشفت نفسه
 * (الجديد يقول: مقعد الدليقيتر الأحقّ به Y لا Z → نبادل خانات Z و Y في ذلك الشفت).
 * آمن: لا يعمل إلا خلف العلم، لا يرمي أبدًا، ويُرجِع ما طبّقه. القديم يبقى كما هو.
 */
export async function applyNewHeartRebalance(args: { clinicId: string; weekStart: string; label: string }): Promise<{ applied: number }> {
  if (!applyEnabled(args.clinicId)) return { applied: 0 };
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

      // الظلّ يتبع مشرفه: المتدرّب المبتدئ يلازم موضع مدرّبه (نفس عيادته/فترته/دوره).
      // بعد المبادلة صار Z في موضع yRows وY في موضع zRows → ننقل ظلّ كلٍّ معه، وإلّا
      // بقي الظلّ في مكانٍ صار لطبيبٍ آخر (هو ما حدث: ظلّ يحيى تخلّف يوم الأحد).
      const moveShadow = async (supId: string, fromRows: LoadedSlot[], toRows: LoadedSlot[]): Promise<number> => {
        const fromKeys = new Set(fromRows.map((r) => `${r.clinicNumber}#${r.period}#${r.role}`));
        const shadows = data.existingSlots.filter((s) => {
          const dd = doctors.find((d) => d.id === s.doctorId);
          return dd?.workStatus === 'trainee' && dd.supervisorDoctorId === supId
            && s.dayOfWeek === day && periods.includes(s.period) && s.status === 'active'
            && fromKeys.has(`${s.clinicNumber}#${s.period}#${s.role}`);
        });
        for (const sh of shadows) {
          const tgt = toRows.find((t) => t.period === sh.period) ?? toRows[0];
          if (!tgt) continue;
          await supabase.from('schedule_slots').update({ clinic_number: tgt.clinicNumber, role: tgt.role }).eq('id', sh.id);
        }
        return shadows.length;
      };
      const movedShadows = (await moveShadow(Z, zRows, yRows)) + (await moveShadow(Y, yRows, zRows));

      applied++;
      // eslint-disable-next-line no-console
      console.log(`[NEW-HEART APPLY · ${args.label}] بادل ${zName} ⇄ ${yName} (${day}/${half === 0 ? 'ص' : 'م'})`
        + (movedShadows ? ` · تبعه ${movedShadows} ظلّ` : ''));
    }
    if (applied === 0) console.log(`[NEW-HEART APPLY · ${args.label}] لا تحسينات — يوافق القديم.`);
    return { applied };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART APPLY] تعذّر التطبيق:', e instanceof Error ? e.message : e);
    return { applied: 0 };
  }
}
