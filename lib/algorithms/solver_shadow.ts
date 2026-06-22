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
import type { HeavySeat, CoverageSeat } from './solver';

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

/** مقعدٌ شاغرٌ مصدرُه الوحيد احتياطيٌّ **خاصّ** (بورد/متدرّب) — لا يُوضع تلقائيًّا، بل
 *  يُسأل القائد ويختار. ينتظر النقصُ ردَّه (لا مراحل تغطيةٍ لاحقة قبل القرار). */
export type PendingReserveChoice = {
  day: WeekDay; half: 0 | 1; clinicNumber: number; period: number;
  seatId: string; absentId: string; absentName: string;
  scope: 'COVER' | 'BOARD'; candidateIds: string[];
};

/** طبيبٌ تحرّك مقعدُه نتيجة التغطية — لإبلاغه. kind: نزل من الاحتياط/الدليقيتر/التخفيف
 *  أو شريكٌ صار ينفرد على فترةٍ إضافيّة. */
export type CoverageMove = {
  doctorId: string; day: WeekDay; clinicNumber: number; period: number;
  kind: 'reserve' | 'delegator' | 'light_duty' | 'partner_solo';
  absentId?: string; // الغائب صاحبُ المقعد المُغطَّى — لمحور سداد الاحتياط داخل الأسبوع
};
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
export async function applyCoverage(
  args: { clinicId: string; weekStart: string; label: string },
  opts?: { specialReserves?: 'ask' | 'use' | 'exclude' },
): Promise<{ filled: number; shortages: number; pending: PendingReserveChoice[]; moves: CoverageMove[] }> {
  // كيف نتعامل مع الاحتياطيّ **الخاصّ** (بورد/متدرّب) — ثلاث حالات:
  //  • ask (الافتراضيّ، المسار الحيّ): لا يُوضع تلقائيًّا، يُسجَّل pending ليُسأل القائد.
  //  • use (محكّ المقارنة، أو «استدعِه»): يُوضع تلقائيًّا كالعاديّ.
  //  • exclude («لا أحد»/الرفض): لا يُوضع ولا يُسأل — نُكمل بالمصادر الأخرى كأنّه غير موجود.
  const special = opts?.specialReserves ?? 'ask';
  if (!applyEnabled(args.clinicId)) return { filled: 0, shortages: 0, pending: [], moves: [] };
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { filled: 0, shortages: 0, pending: [], moves: [] };
    const doctors = data.doctors;
    const history = [...data.pastSlots, ...data.existingSlots].filter((s) => s.weekStart < args.weekStart);
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const boardIds = new Set(doctors.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id));
    // تخفيف العمل: يقدر على **الفترة الأولى فقط** (ف١/ف٣) — مصدرُ تغطيةٍ لها عند الحاجة.
    const lightDutyIds = new Set(doctors.filter((d) => d.workStatus === 'light_duty').map((d) => d.id));
    const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    // ظلال المتدرّبين (beginner): مَن خاناتُه (عيادة/استضافة) **تطابق مشرفه تمامًا** في كلّ
    // شفتٍ يعمله = ظلٌّ حقيقيّ (لا مستقلّ — المستقلّ خاناتُه تخالف مشرفه فيُستثنى). نستثني
    // الظلَّ من «هل الفترة بها دليقيتر» (ظلٌّ ليس تغطيةً حقيقيّة)، ونُعيد محاذاته لمشرفه بعد
    // التغطية (يتبعه للعيادة لو صار منفردًا، فلا يبقى دليقيترًا وحده).
    const inScopeRC = (s: LoadedSlot) => s.period > 0 && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator');
    const keysRC = (rows: LoadedSlot[], id: string, dy: string, ps: number[]) =>
      rows.filter((r) => r.doctorId === id && r.dayOfWeek === dy && ps.includes(r.period) && inScopeRC(r)).map((r) => `${r.period}|${r.clinicNumber}|${r.role}`);
    const shadowTraineeIds = new Set<string>();
    for (const t of doctors.filter((d) => d.workStatus === 'trainee' && d.supervisorDoctorId)) {
      const supId = t.supervisorDoctorId!;
      let mirrors = false; let mismatched = false;
      for (const day of DAY_OF) for (const half of [0, 1] as const) {
        const periods = half === 0 ? [1, 2] : [3, 4];
        const tk = keysRC(data.existingSlots, t.id, day, periods);
        if (!tk.length) continue;
        const sk = new Set(keysRC(data.existingSlots, supId, day, periods));
        if (tk.length === sk.size && tk.every((k) => sk.has(k))) mirrors = true; else mismatched = true;
      }
      if (mirrors && !mismatched) shadowTraineeIds.add(t.id);
    }
    // بِركتان: العاديّة (حداثة آخر عمل) والبورد (حداثة آخر دخولٍ للعيادة). كلٌّ يُغطّي
    // مقاعدَ غياب بِركته فقط من احتياط بِركته فقط — فلا يملأ عاديٌّ مقعدَ بورد ولا العكس.
    const scopes = [
      { name: 'COVER', pool: poolIds, prior: lastClinicStamps(history), mine: (id: string) => !boardIds.has(id) },
      { name: 'BOARD', pool: boardIds, prior: lastBoardStamps(history, boardIds), mine: (id: string) => boardIds.has(id) },
    ];
    let filled = 0; let shortages = 0;
    const pending: PendingReserveChoice[] = [];
    const moves: CoverageMove[] = [];
    // استضافاتٌ أُسقِطت لأنّ شاغلها سُحب «منفردًا» للعيادة — تحاول المرحلةُ الثانية إعادة
    // إسنادها لجسدٍ حرٍّ (نماذج مرنة + لجنة) قبل تركها فارغة.
    const droppedHosts: { day: WeekDay; period: number; absentId?: string }[] = [];
    const tagKind: Record<string, CoverageMove['kind']> = { '': 'reserve', '·دليقيتر': 'delegator', '·تخفيف': 'light_duty' };

    for (const sc of scopes) {
      for (const day of DAY_OF) {
        for (const half of [0, 1] as const) {
          const periods = half === 0 ? [1, 2] : [3, 4];
          const exCol = half === 0 ? 1 : 2;
          const dayRows = data.existingSlots.filter((s) => s.dayOfWeek === day);
          const shiftView = dayRows.filter((s) =>
            (s.status === 'active' && s.role === 'clinic' && periods.includes(s.period))
            || ((s.role as string) === 'prev_placement' && s.status === 'active' && periods.includes(s.period)));
          let vacant: CoverageSeat[] = extractCoverageSeats(shiftView).filter((v) => sc.mine(v.absentId));
          if (vacant.length === 0) continue;

          const inClinic = new Set(dayRows.filter((s) => s.status === 'active' && s.role === 'clinic' && periods.includes(s.period)).map((s) => s.doctorId));
          // يُزيل صفَّ مصدرِ المغطّي: احتياطٌ (extra) أو دليقيتر — أيّهما وُجد (اكتشافٌ تلقائيّ).
          const removeSource = async (docId: string): Promise<void> => {
            const exRow = dayRows.find((s) => s.doctorId === docId && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
            if (exRow) { await supabase.from('schedule_slots').delete().eq('id', exRow.id); return; }
            const delRows = dayRows.filter((s) => s.doctorId === docId && s.status === 'active' && s.role === 'delegator' && periods.includes(s.period));
            for (const dr of delRows) await supabase.from('schedule_slots').delete().eq('id', dr.id);
          };
          // يحلّ مجموعةَ مقاعدٍ ببدلاء، يكتب، ويُرجِع مقاعدَ مُلئت. لا يمسّ غيرها.
          const fillWith = async (avail: string[], seats: CoverageSeat[], tag: string): Promise<Set<string>> => {
            const done = new Set<string>();
            if (avail.length === 0 || seats.length === 0) return done;
            const absentBySeat = new Map(seats.map((s) => [s.id, s.absentId]));
            const rec = solveCoverage(doctors, seats, avail, sc.prior);
            const removed = new Set<string>();
            for (const f of rec.fills) {
              const name = doctors.find((d) => d.id === f.doctorId)?.name ?? f.doctorId;
              if (!removed.has(f.doctorId)) { await removeSource(f.doctorId); removed.add(f.doctorId); }
              await supabase.from('schedule_slots').insert({
                clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
                period: f.period, clinic_number: f.clinicNumber,
                doctor_id: f.doctorId, doctor_name: name, role: 'clinic', status: 'active', source: 'request',
              });
              filled++; done.add(f.seatId);
              moves.push({ doctorId: f.doctorId, day, clinicNumber: f.clinicNumber, period: f.period, kind: tagKind[tag] ?? 'reserve', absentId: absentBySeat.get(f.seatId) });
              // eslint-disable-next-line no-console
              console.log(`[NEW-HEART ${sc.name}${tag} · ${args.label}] ${name} → عيادة ${f.clinicNumber} (${day}/${half === 0 ? 'ص' : 'م'} ف${f.period})`);
            }
            return done;
          };

          // مرحلة ١: الاحتياط (المصدر المفضّل — المستريح).
          const exIds = [...new Set(dayRows.filter((s) => s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))];
          const isSpecial = (id: string) => boardIds.has(id) || traineeIds.has(id);
          // يُملأ تلقائيًّا: احتياطيّ بِركة النطاق. الخاصّ (بورد/متدرّب) يدخل الملء التلقائيّ
          // فقط في حالة use؛ في ask/exclude لا يُملأ هنا.
          const autoReserves = exIds.filter((id) => sc.pool.has(id) && (special === 'use' || !isSpecial(id)));
          let done = await fillWith(autoReserves, vacant, '');
          vacant = vacant.filter((v) => !done.has(v.id));

          // الاحتياطيّ **الخاصّ** (بورد لنطاق البورد، متدرّب لنطاق التغطية) في حالة ask →
          // لا يُوضع تلقائيًّا: يُسجّل للسؤال، والنقص ينتظر ردّ القائد فنتخطّى مراحل ٢‑٤.
          if (vacant.length && special === 'ask') {
            const specialCands = exIds.filter((id) => sc.name === 'BOARD' ? boardIds.has(id) : traineeIds.has(id));
            if (specialCands.length) {
              for (const seat of vacant) pending.push({
                day, half, clinicNumber: seat.clinicNumber, period: seat.period,
                seatId: seat.id, absentId: seat.absentId,
                absentName: doctors.find((d) => d.id === seat.absentId)?.name ?? seat.absentId,
                scope: sc.name as 'COVER' | 'BOARD', candidateIds: specialCands,
              });
              continue; // النقص ينتظر القائد — لا مراحل ٢‑٤ قبل قراره
            }
          }

          if (vacant.length && sc.name === 'COVER') {
            // مرحلة ٢: الدليقيتر **المنفرد** من البِركة (الفائض الحقيقيّ) يَنزِل للعيادة (٧→٦ على ٣).
            const soloDelegs = [...new Set(dayRows.filter((s) => s.status === 'active' && s.role === 'delegator' && periods.includes(s.period)).map((s) => s.doctorId))]
              .filter((id) => sc.pool.has(id) && !inClinic.has(id));
            done = await fillWith(soloDelegs, vacant, '·دليقيتر');
            vacant = vacant.filter((v) => !done.has(v.id));

            // مرحلة ٣: تخفيف العمل — يغطّي **الفترة الأولى فقط (ف١/ف٣)** من فائضه (دليقيتر/احتياط).
            const firstP = vacant.filter((v) => v.period === 1 || v.period === 3);
            if (firstP.length) {
              const ldBodies = [...new Set(dayRows.filter((s) =>
                ((s.status === 'active' && s.role === 'delegator' && periods.includes(s.period))
                  || (s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol)))
                .map((s) => s.doctorId))].filter((id) => lightDutyIds.has(id) && !inClinic.has(id));
              done = await fillWith(ldBodies, firstP, '·تخفيف');
              vacant = vacant.filter((v) => !done.has(v.id));
            }
          }

          // مرحلة ٤ (الملاذ الأخير): شريكُ العيادة الباقي يصير **منفرداً** يغطّي الفترة الشاغرة
          //   حين لا فائض. يشمل تخفيف العمل (يغطّي فترته الثانية اضطرارًا — بإذن المستخدم).
          //   لا يُمسّ مقعدُ الشريك (يبقى)، نضيف له خانةً في الفترة الشاغرة فقط. لا شريك (انفرادٌ
          //   غائبٌ، فترتان شاغرتان)؟ نقصٌ صريح.
          if (vacant.length) {
            const stillVacant: CoverageSeat[] = [];
            for (const seat of vacant) {
              const partner = dayRows.find((s) => s.status === 'active' && s.role === 'clinic'
                && s.clinicNumber === seat.clinicNumber && periods.includes(s.period) && s.period !== seat.period
                && !traineeIds.has(s.doctorId) && sc.mine(s.doctorId));
              if (!partner) { stillVacant.push(seat); continue; }
              await supabase.from('schedule_slots').insert({
                clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
                period: seat.period, clinic_number: seat.clinicNumber,
                doctor_id: partner.doctorId, doctor_name: partner.doctorName, role: 'clinic', status: 'active', source: 'request',
              });
              filled++;
              moves.push({ doctorId: partner.doctorId, day, clinicNumber: seat.clinicNumber, period: seat.period, kind: 'partner_solo', absentId: seat.absentId });
              // eslint-disable-next-line no-console
              console.log(`[NEW-HEART ${sc.name}·منفرد · ${args.label}] ${partner.doctorName} → عيادة ${seat.clinicNumber} (${day}/${half === 0 ? 'ص' : 'م'} ف${seat.period}) منفردًا`);
              // الشريك صار يغطّي العيادة في فترتَي الشفت → لا يصلح مُستضيفًا فيه. أسقِط أيّ
              // دورِ استضافةٍ له في هذا الشفت كي لا يصير عيادةً ودليقيترًا في الفترة ذاتها
              // (الازدواج المكتشَف في غياب عضو زوج الاستضافة). المقعد المُفرَّغ تتولّاه
              // المرحلةُ الثانية (تغطية الدليقيتر) — تملؤه إن توفّر جسدٌ، وإلّا يسقط (ثانويّ).
              for (const dh of dayRows.filter((s) => s.doctorId === partner.doctorId && s.status === 'active' && s.role === 'delegator' && periods.includes(s.period))) {
                await supabase.from('schedule_slots').delete().eq('id', dh.id);
                droppedHosts.push({ day, period: dh.period, absentId: seat.absentId });
                // eslint-disable-next-line no-console
                console.log(`[NEW-HEART ${sc.name}·منفرد·أسقط-استضافة · ${args.label}] ${partner.doctorName} ترك استضافة ف${dh.period} (يغطّي العيادة منفردًا)`);
              }
            }
            vacant = stillVacant;
          }

          if (vacant.length) {
            shortages += vacant.length;
            // eslint-disable-next-line no-console
            console.log(`[NEW-HEART ${sc.name} · ${args.label}] نقصٌ: ${vacant.length} مقعدٌ بلا بديلٍ (${day}/${half === 0 ? 'ص' : 'م'})`);
          }
        }
      }
    }

    // ── المرحلة الثانية: تغطية **الدليقيتر** الغائب (مقعده رقمُ عيادةٍ = 0 فتتخطّاه
    // تغطيةُ العيادة). نعيد التحميل لحالةٍ دقيقة (الاحتياط المستهلَك في تغطية العيادة
    // اختفى)، ونملأ مقعد الدليقيتر الشاغر من احتياطٍ متاحٍ (دورٌ مساعد: لا احتياط؟ نتركه).
    try {
      const { data: d2 } = await loadScheduleData(args.clinicId, args.weekStart);
      if (d2) {
        const delRecency = lastHeavyStamps(history); // حداثة الدليقيتر (آخر دور) لاختيار البديل عدلًا
        for (const day of DAY_OF) {
          for (const half of [0, 1] as const) {
            const periods = half === 0 ? [1, 2] : [3, 4];
            const exCol = half === 0 ? 1 : 2;
            const rows = d2.existingSlots.filter((s) => s.dayOfWeek === day);
            // الفتراتُ التي بها دليقيترٌ **حقيقيّ** نشطٌ أصلًا (مُغطّاة) — نتخطّاها. نستثني
            // ظلَّ المتدرّب: وجودُه وحدَه لا يعني أنّ الاستضافةَ مُغطّاة (لا يُحسَب تغطيةً).
            const hasDeleg = new Set(rows.filter((s) => s.status === 'active' && s.role === 'delegator' && periods.includes(s.period) && !shadowTraineeIds.has(s.doctorId)).map((s) => s.period));
            // طلبُ الاستضافة الشاغر: (أ) استضافةُ الغائب (prev_placement, رقم عيادة صفر،
            // طبيب بِركة)، (ب) استضافةٌ أُسقِطت لمّا سُحب شاغلُها «منفردًا» للعيادة. الفترة →
            // معرّفُ الغائب صاحبِ الحدث (لمحور السداد).
            const demand = new Map<number, string | undefined>();
            for (const s of rows.filter((s) => (s.role as string) === 'prev_placement' && s.status === 'active'
              && s.clinicNumber === 0 && periods.includes(s.period) && poolIds.has(s.doctorId))) {
              if (!hasDeleg.has(s.period)) demand.set(s.period, s.doctorId);
            }
            for (const d of droppedHosts) {
              if (d.day === day && periods.includes(d.period) && !hasDeleg.has(d.period) && !demand.has(d.period)) demand.set(d.period, d.absentId);
            }
            if (demand.size === 0) continue;
            // المرشّحون (نماذجٌ مرنة، اللجنةُ = حداثةُ الدور تختار الأعدل): كلُّ طبيبِ بِركةٍ
            // **حاضرٍ في الشفت وحرٍّ في الفترة** — إمّا محتاطٌ مستريح، أو طبيبُ عيادةِ فترةٍ
            // واحدةٍ يستضيف فترته الحرّة (= «يستضيف زميلٌ مجاورٌ فترته»). لا يُكسَر مقعدُ عيادة.
            const presentShift = new Set<string>(
              rows.filter((s) => poolIds.has(s.doctorId)
                && ((s.status === 'active' && s.role === 'clinic' && periods.includes(s.period))
                  || (s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol)))
                .map((s) => s.doctorId));
            const sickVac = new Set(rows.filter((s) => s.period === 0 && (s.status === 'sick_leave' || s.status === 'vacation')).map((s) => s.doctorId));
            const permBlock = (id: string, P: number): boolean => rows.some((s) => s.doctorId === id && s.period === 0
              && ((s.status === 'permission_start' && P === (half === 0 ? 1 : 3)) || (s.status === 'permission_end' && P === (half === 0 ? 2 : 4)))
              && (s.clinicNumber === exCol || s.clinicNumber === 0));
            const used = new Set<string>();
            for (const P of [...demand.keys()].sort((a, b) => a - b)) {
              // حرٌّ في P: لا خانةَ نشطةً (عيادة/استضافة) له فيها، وليس غائبًا/محجوبًا، ولم يُستعمَل.
              const occAtP = new Set(rows.filter((s) => s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator') && s.period === P).map((s) => s.doctorId));
              const cands = [...presentShift].filter((id) => !occAtP.has(id) && !used.has(id) && !sickVac.has(id) && !permBlock(id, P))
                .sort((a, b) => (delRecency.get(a) ?? '').localeCompare(delRecency.get(b) ?? ''));
              const pick = cands[0];
              if (!pick) continue; // لا جسدَ حرّ → تبقى فارغةً (الاستضافةُ دورٌ مساعد، لا نقصٌ حرج)
              used.add(pick);
              const name = d2.doctors.find((d) => d.id === pick)?.name ?? pick;
              const ex = rows.find((s) => s.doctorId === pick && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
              if (ex) await supabase.from('schedule_slots').delete().eq('id', ex.id);
              await supabase.from('schedule_slots').insert({
                clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
                period: P, clinic_number: 0,
                doctor_id: pick, doctor_name: name, role: 'delegator', status: 'active', source: 'request',
              });
              filled++;
              moves.push({ doctorId: pick, day, clinicNumber: 0, period: P, kind: 'delegator', absentId: demand.get(P) });
              // eslint-disable-next-line no-console
              console.log(`[NEW-HEART COVER·دليقيتر${ex ? '' : '·مجاور'} · ${args.label}] ${name} → دليقيتر (${day}/${half === 0 ? 'ص' : 'م'} ف${P})${ex ? '' : ' (فترته الحرّة)'}`);
            }
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[NEW-HEART COVER·دليقيتر] تعذّر:', e instanceof Error ? e.message : e);
    }

    // ── محاذاةُ ظلال المتدرّبين (beginner) بعد التغطية: الظلُّ يتبع مشرفه إلى خاناته
    // **النهائيّة**. مشرفٌ صار منفردًا (عيادةَ الفترتين) → ظلُّه ينزل للعيادة بدل أن يبقى
    // دليقيترًا وحده (لا يجوز). مشرفٌ بلا خانةٍ في الشفت → يُزال ظلُّه فيه. آمنٌ: المستقلّون
    // مُستثنَون (ليسوا في shadowTraineeIds)، وإن طابق الظلُّ مشرفه أصلًا فلا تغيير.
    try {
      const { data: fin } = await loadScheduleData(args.clinicId, args.weekStart);
      if (fin) {
        for (const tId of shadowTraineeIds) {
          const t = doctors.find((d) => d.id === tId)!;
          const supId = t.supervisorDoctorId!;
          for (const day of DAY_OF) {
            for (const half of [0, 1] as const) {
              const periods = half === 0 ? [1, 2] : [3, 4];
              // ظلٌّ حقيقيّ لهذا الشفت قبل التغطية؟ (خاناتُه طابقت مشرفه) — وإلّا نتركه.
              const tk0 = keysRC(data.existingSlots, tId, day, periods);
              const sk0 = new Set(keysRC(data.existingSlots, supId, day, periods));
              if (!tk0.length || tk0.length !== sk0.size || !tk0.every((k) => sk0.has(k))) continue;
              const supNow = fin.existingSlots.filter((r) => r.doctorId === supId && r.dayOfWeek === day && periods.includes(r.period) && inScopeRC(r));
              const tNow = fin.existingSlots.filter((r) => r.doctorId === tId && r.dayOfWeek === day && periods.includes(r.period) && inScopeRC(r));
              const want = supNow.map((r) => `${r.period}|${r.clinicNumber}|${r.role}`).sort();
              const have = tNow.map((r) => `${r.period}|${r.clinicNumber}|${r.role}`).sort();
              if (want.length === have.length && want.every((k, i) => k === have[i])) continue; // مطابقٌ — لا شيء
              for (const r of tNow) await supabase.from('schedule_slots').delete().eq('id', r.id);
              for (const r of supNow) await supabase.from('schedule_slots').insert({
                clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
                period: r.period, clinic_number: r.clinicNumber,
                doctor_id: tId, doctor_name: t.name, role: r.role, status: 'active', source: 'request',
              });
              // eslint-disable-next-line no-console
              console.log(`[NEW-HEART COVER·ظلّ-يحاذي · ${args.label}] ${t.name} يتبع ${doctors.find((d) => d.id === supId)?.name ?? supId} (${day}/${half === 0 ? 'ص' : 'م'})`);
            }
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[NEW-HEART COVER·ظلّ] تعذّر:', e instanceof Error ? e.message : e);
    }

    return { filled, shortages, pending, moves };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART COVER] تعذّر:', e instanceof Error ? e.message : e);
    return { filled: 0, shortages: 0, pending: [], moves: [] };
  }
}

/**
 * يضع احتياطيًّا خاصًّا (بورد/متدرّب) اختاره القائد في مقعدٍ شاغرٍ محدّد — مسار «القبول»
 * لكرت السؤال. يكتب خانة عيادةٍ نشطةً ويُزيل صفّ احتياطه ذلك اليوم. آمن: لا يضع إن
 * كان المقعد مأهولًا أصلًا، ولا يعمل إلا في وضع apply. يُرجِع ما إن وُضع.
 */
export async function placeReserveInSeat(args: {
  clinicId: string; weekStart: string; day: WeekDay;
  clinicNumber: number; period: number; doctorId: string;
}): Promise<{ success: boolean; reason?: string }> {
  if (!applyEnabled(args.clinicId)) return { success: false, reason: 'not_apply' };
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { success: false, reason: 'no_data' };
    const dayRows = data.existingSlots.filter((s) => s.dayOfWeek === args.day);
    // المقعد مأهولٌ أصلًا؟ لا نُكرّر (idempotent).
    const taken = dayRows.some((s) => s.status === 'active' && s.role === 'clinic'
      && s.clinicNumber === args.clinicNumber && s.period === args.period);
    if (taken) return { success: false, reason: 'seat_taken' };
    const name = data.doctors.find((d) => d.id === args.doctorId)?.name ?? args.doctorId;
    const exCol = args.period <= 2 ? 1 : 2;
    const periods = exCol === 1 ? [1, 2] : [3, 4];
    // أزِل صفّ احتياطه (extra) أو دوره دليقيترًا في هذا الشفت — أيّهما وُجد.
    const exRow = dayRows.find((s) => s.doctorId === args.doctorId && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
    if (exRow) await supabase.from('schedule_slots').delete().eq('id', exRow.id);
    else for (const dr of dayRows.filter((s) => s.doctorId === args.doctorId && s.status === 'active' && s.role === 'delegator' && periods.includes(s.period))) {
      await supabase.from('schedule_slots').delete().eq('id', dr.id);
    }
    await supabase.from('schedule_slots').insert({
      clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: args.day,
      period: args.period, clinic_number: args.clinicNumber,
      doctor_id: args.doctorId, doctor_name: name, role: 'clinic', status: 'active', source: 'request',
    });
    // eslint-disable-next-line no-console
    console.log(`[NEW-HEART RESERVE-PICK] ${name} → عيادة ${args.clinicNumber} (${args.day} ف${args.period}) بأمر القائد`);
    return { success: true };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART RESERVE-PICK] تعذّر:', e instanceof Error ? e.message : e);
    return { success: false, reason: 'error' };
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
    // المتدرّبون (ظلال): قد يرثون صفَّ استضافةٍ من مدرّبٍ مُرقًّى. لا يُعَدُّ مقعدَ استضافةٍ
    // حقيقيًّا يُعاد إسنادُه — وإلّا رآه الحلّالُ «مفتوحًا» (المتدرّب خارج البِركة) فبادله
    // بطبيبٍ نشطٍ وأفسد الجدول. نُسقِط أيّ مقعدٍ شاغلُه متدرّبٌ من إعادة التوازن.
    const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    const all: LoadedSlot[] = [...data.pastSlots, ...data.existingSlots];

    const delSeats: HeavySeat[] = [];
    for (const day of DAY_OF) {
      const dayRows = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day]);
      // **النصفان معًا** (صباح ف١،٢ ومساء ف٣،٤) — المساءُ كالصباح تمامًا. كلُّ نصفٍ بختمٍ مستقلّ.
      for (const half of [0, 1] as const) {
        const periods = half === 0 ? [1, 2] : [3, 4];
        const exCol = half === 0 ? 1 : 2;
        // محجوبون باستئذانٍ في هذا النصف (عمود ١ صباحًا / ٢ مساءً): المضيفُ يعمل فترتَي نصفه،
        // فمن حُجبت إحدى فترتيه لا يصلح مضيفًا — نستبعده من أهليّة المقعد كي لا تنقُض الموازنةُ حلَّ
        // الاستئذان. (نُبقي الشاغل الحاليّ احترازًا من أهليّةٍ فارغة.)
        const permBlocked = new Set(dayRows
          .filter((s) => s.period === 0 && s.clinicNumber === exCol && (s.status === 'permission_start' || s.status === 'permission_end'))
          .map((s) => s.doctorId));
        const ss = dayRows.filter((s) => periods.includes(s.period));
        const seats = extractHeavySeats(ss, poolIds);
        // **المحاورُ مستقلّة** (قرارُ المستخدم): نوازن الدليقيترَ **وحده** هنا، فلا نُدخِل مقاعدَ
        // المنفرِد في الحِمل (له حسبتُه المستقلّة، يتركّز مُجبَرًا عند الشحّ). والمنفرِدُ في هذا النصف
        // يعمل العيادةَ في الفترتين فلا يصلح مضيفًا — نُقصيه من أهليّة الاستضافة كي لا يزدوج الدور.
        const soloDocs = new Set(seats.filter((s) => s.kind === 'solo').map((s) => s.current));
        for (const seat of seats) {
          if (seat.kind !== 'delegator') continue; // المنفرِد محورٌ مستقلّ — لا يُوازَن مع الدليقيتر
          if (traineeIds.has(seat.current)) continue; // مقعدُ ظلٍّ متدرّب — لا يُعاد إسنادُه
          if (permBlocked.size) seat.eligible = seat.eligible.filter((id) => id === seat.current || !permBlocked.has(id));
          // أقصِ المتدرّبين (ظلال) والمنفردين (مشغولون الفترتين) من أهليّة الاستضافة.
          seat.eligible = seat.eligible.filter((id) => id === seat.current || (!traineeIds.has(id) && !soloDocs.has(id)));
          delSeats.push(seat);
        }
      }
    }
    delSeats.sort((a, b) => a.stamp.localeCompare(b.stamp));
    if (delSeats.length === 0) return { applied: 0 };
    const rec = solveLookahead(doctors, delSeats, lastHeavyStamps(all.filter((s) => s.weekStart < args.weekStart)));

    let applied = 0;
    // المدرّبون الذين مسّتهم مبادلةٌ (يوم|مُعرّف) — نُعيد محاذاة ظلالهم لموضعهم النهائيّ بعد الكلّ.
    const touched = new Set<string>();
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
      touched.add(`${day}|${Z}`); touched.add(`${day}|${Y}`);

      applied++;
      // eslint-disable-next-line no-console
      console.log(`[NEW-HEART APPLY · ${args.label}] بادل ${zName} ⇄ ${yName} (${day}/${half === 0 ? 'ص' : 'م'})`);
    }

    // الظلّ يتبع مشرفه: بعد **كلّ** المبادلات نُعيد محاذاة ظلّ كلّ مدرّبٍ مسّته مبادلةٌ
    // إلى موضع مدرّبه **النهائيّ** (عيادة/فترة/دور). المحاذاة للحالة النهائيّة أمتنُ من
    // تتبّعٍ جزئيٍّ لكلّ مبادلة (الذي تخلّف عنه الظلّ حين تعدّدت المبادلات أو اختلف الدور).
    if (touched.size) {
      const inScope = (s: LoadedSlot) => s.period > 0 && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator');
      const keysIn = (rows: LoadedSlot[], id: string, dy: string) =>
        rows.filter((r) => r.doctorId === id && r.dayOfWeek === dy && inScope(r)).map((r) => `${r.period}|${r.clinicNumber}|${r.role}`);
      const { data: after } = await loadScheduleData(args.clinicId, args.weekStart);
      if (after) {
        for (const key of touched) {
          const [dy, supId] = key.split('|');
          if (!dy || !supId) continue;
          // الظلّ: متدرّبٌ خاناتُه **قبل** المبادلات طابقت خانات مدرّبه تمامًا (data قبل الكتابة).
          const shadows = doctors.filter((d) => {
            if (d.workStatus !== 'trainee' || d.supervisorDoctorId !== supId) return false;
            const tk = keysIn(data.existingSlots, d.id, dy);
            const sk = new Set(keysIn(data.existingSlots, supId, dy));
            return tk.length > 0 && tk.length === sk.size && tk.every((k) => sk.has(k));
          });
          for (const t of shadows) {
            const supNow = after.existingSlots.filter((r) => r.doctorId === supId && r.dayOfWeek === dy && inScope(r));
            const tOld = after.existingSlots.filter((r) => r.doctorId === t.id && r.dayOfWeek === dy && inScope(r));
            for (const o of tOld) await supabase.from('schedule_slots').delete().eq('id', o.id);
            for (const r of supNow) await supabase.from('schedule_slots').insert({
              clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: dy,
              period: r.period, clinic_number: r.clinicNumber,
              doctor_id: t.id, doctor_name: t.name, role: r.role, status: 'active', source: 'request',
            });
          }
        }
      }
    }
    if (applied === 0) console.log(`[NEW-HEART APPLY · ${args.label}] لا تحسينات — يوافق القديم.`);
    return { applied };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART APPLY] تعذّر التطبيق:', e instanceof Error ? e.message : e);
    return { applied: 0 };
  }
}

type RepayRow = { id: string; doctor_id: string; doctor_name: string; period: number; clinic_number: number; role: string; status: string; day_of_week: string };
async function loadRepayWeek(clinicId: string, weekStart: string): Promise<RepayRow[]> {
  const { data } = await supabase.from('schedule_slots')
    .select('id, doctor_id, doctor_name, period, clinic_number, role, status, day_of_week')
    .eq('clinic_id', clinicId).eq('week_start', weekStart);
  return (data || []) as RepayRow[];
}

/**
 * سدادُ الاحتياط داخل الأسبوع (محور الاحتياط — توأمُ امتصاص الدليقيتر). حين يُغطّي
 * احتياطيٌّ R غيابَ A فيخسر راحته، نبحث في الأسبوع **قَبْليًّا أوّلًا ثمّ أماميًّا** (نسبةً
 * ليوم الغياب) عن يومٍ فيه: A له دورُ احتياطٍ (راحة) في الشفت، و R يعمل عيادةً في نفس
 * الشفت → نبادل بالمعرّف: A يعمل خانةَ R (يدفع)، و R يأخذ دورَ الاحتياط (يستردّ راحته).
 * تعذّر (نفد احتياطُ A أو خارج النافذة)؟ **خيار ج**: خسارةٌ مقبولةٌ تُسجَّل بلا تدوير.
 * آمن: خلف العلم فقط، لا يرمي، مبادلةٌ نظيفة. يُرجِع مَن سُدِّد لهم كي لا يُدفَعوا لمؤخّرة
 * عجلة الاحتياط أيضًا (خيار أ — تفادي العقوبة المزدوجة).
 */
export async function applyReserveRepay(
  args: { clinicId: string; weekStart: string; label: string },
  pairs: { coverer: string; owner: string; exCol: number; coverDay: string }[],
): Promise<{ repaid: number; accepted: number; repaidAbsent: string[] }> {
  const repaidAbsent: string[] = [];
  if (!applyEnabled(args.clinicId) || pairs.length === 0) return { repaid: 0, accepted: 0, repaidAbsent };
  // أزواجٌ فريدة (مُغطٍّ+غائب+شفت) — لا نسدّد المُغطّيَ نفسه مرّتين لنفس الغياب.
  const seen = new Set<string>();
  const uniq = pairs.filter((p) => {
    if (!p.owner || p.owner === p.coverer) return false;
    const k = `${p.coverer}|${p.owner}|${p.exCol}`; if (seen.has(k)) return false; seen.add(k); return true;
  });
  let repaid = 0; let accepted = 0;
  try {
    for (const { coverer, owner, exCol, coverDay } of uniq) {
      const periods = exCol === 1 ? [1, 2] : [3, 4];
      // ترتيب الأيّام: قَبْليّ (اليوم-١ → بداية الأسبوع) ثمّ أماميّ (اليوم+١ → نهايته).
      const di = DAY_IDX[coverDay] ?? 0;
      const order: string[] = [];
      for (let i = di - 1; i >= 0; i--) order.push(DAY_OF[i]!);
      for (let i = di + 1; i < DAY_OF.length; i++) order.push(DAY_OF[i]!);

      const week = await loadRepayWeek(args.clinicId, args.weekStart);
      let did = false;
      for (const d2 of order) {
        const rowsD = week.filter((r) => r.day_of_week === d2);
        const ownerEx = rowsD.find((r) => r.doctor_id === owner && r.status === 'extra' && r.period === 0 && r.clinic_number === exCol);
        if (!ownerEx) continue;                                   // A لا يرتاح هذا اليوم/الشفت
        const ownerBusy = rowsD.some((r) => r.doctor_id === owner && r.status === 'active' && periods.includes(r.period) && (r.role === 'clinic' || r.role === 'delegator'));
        if (ownerBusy) continue;                                  // A يعمل أصلًا هذا الشفت → لا يأخذ مقعدًا
        const covererClinic = rowsD.filter((r) => r.doctor_id === coverer && r.status === 'active' && r.role === 'clinic' && periods.includes(r.period));
        if (covererClinic.length === 0) continue;                 // R لا يعمل عيادةً هذا الشفت → لا مقعد يُعطى
        const ownerName = ownerEx.doctor_name; const covererName = covererClinic[0]!.doctor_name;
        // المبادلة: مقعدُ R → A، ودورُ احتياط A → R.
        for (const r of covererClinic) await supabase.from('schedule_slots').update({ doctor_id: owner, doctor_name: ownerName }).eq('id', r.id);
        await supabase.from('schedule_slots').update({ doctor_id: coverer, doctor_name: covererName }).eq('id', ownerEx.id);
        repaid++; did = true; repaidAbsent.push(owner);
        const pre = di > DAY_IDX[d2]! ? 'قَبْليّ' : 'أماميّ';
        // eslint-disable-next-line no-console
        console.log(`[RESERVE-REPAY · ${args.label}] ${covererName} يرتاح ${d2} [${pre}] بدل ${ownerName} (شفت ${exCol === 1 ? 'ص' : 'م'}).`);
        break;
      }
      if (!did) {
        accepted++;
        // eslint-disable-next-line no-console
        console.log(`[RESERVE-REPAY · ${args.label}] [ج] خسارةُ راحةٍ مقبولةٌ — لا نافذةَ سدادٍ للمُغطّي (الغائبُ بلا احتياطٍ في الأسبوع).`);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[RESERVE-REPAY] تعذّر السداد:', e instanceof Error ? e.message : e);
  }
  return { repaid, accepted, repaidAbsent };
}

/** يشتقّ أزواجَ السداد من حركات التغطية: المُغطّي خسر راحتَه/تحمّل عبئًا إضافيًّا، والغائب
 *  (absentId) مَدينٌ له. يشمل: احتياطيًّا/دليقيترًا نزل للعيادة، **والمنفرِدَ** (شريكٌ سُحب
 *  ليُغطّي العيادةَ منفردًا — عبءٌ إضافيٌّ يستحقّ تعويضًا على محور الاحتياط). الشفت من الفترة. */
export function reservePairsFromMoves(moves: CoverageMove[]): { coverer: string; owner: string; exCol: number; coverDay: string }[] {
  return moves
    .filter((m) => (m.kind === 'reserve' || m.kind === 'delegator' || m.kind === 'partner_solo') && !!m.absentId)
    .map((m) => ({ coverer: m.doctorId, owner: m.absentId as string, exCol: m.period <= 2 ? 1 : 2, coverDay: m.day }));
}
