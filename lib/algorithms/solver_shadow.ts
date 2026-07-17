// ═══════════════════════════════════════════════════════════════
// مُطبِّقات القلب الجديد — محرّكُ التفاعل الوحيد (كتابة على الجدول)
//
// بعد كلّ حدثٍ حيّ (غياب/استئذان/عودة/إلغاء) يكتب القلبُ الجديد قرارَه على الجدول
// مباشرةً: تغطيةُ الغياب (عيادة + بورد)، سدادُ الاحتياط داخل الأسبوع، امتصاصُ الدليقيتر،
// إعادةُ التشكيل الرفيع، والتغطيةُ العكسيّة عند الإلغاء. لا مفتاح ولا وضعُ ظلّ بعد
// التوحيد النهائيّ: المُطبِّقات تعمل دائمًا على أيّ عيادة، ولا ترمي أبدًا (لا تُفشل المسار
// الحيّ). العجلةُ القديمة (createWheels/distributeShiftWheel) تبقى للبناء فقط.
// ═══════════════════════════════════════════════════════════════
import { loadScheduleData } from './schedule';
import { supabase } from '../supabase';
import type { WeekDay, LoadedSlot } from './schedule';
import {
  extractHeavySeats, lastHeavyStamps, solveLookahead,
  extractReserveSeats, lastRestStamps, solveHeavyRecency, lastSoloStamps,
  extractCoverageSeats, solveCoverage, lastClinicStamps, lastBoardStamps,
} from './solver';
import type { HeavySeat, CoverageSeat } from './solver';

// القلبُ الجديد هو محرّكُ التفاعل الوحيد (لا مفتاح، لا فرعَ قديم/جديد): كلّ مُطبِّقٍ
// يعمل دائمًا على أيّ عيادة. أُزيل new_heart_config ووضعُ الظلّ مع التوحيد النهائيّ —
// لا عودةَ نظيفةٌ للعجلة القديمة في التفاعل (العجلةُ للبناء فقط)؛ التراجعُ عبر الإصدارات.

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
// مؤشّرُ «اليوم» داخلَ الأسبوع (0=الأحد) من فرقِ التاريخ ISO — لقفلِ الأيّامِ الماضية: أيُّ
// يومٍ مؤشّرُه < todayIdx مضى وانتهى فلا يُحرَّك (يبقى تاريخًا للحداثةِ فقط). بلا today ⇒ -1 (بلا قفل).
const todayIndexOf = (weekStart: string, today?: string): number =>
  today ? Math.round((Date.parse(today) - Date.parse(weekStart)) / 86400000) : -1;

/**
 * يطبّق تغطية الغياب (كتابة) لبِركتين: العاديّة (غير البورد) والبورد. لكلٍّ بِركتُه
 * واحتياطُه وحداثتُه: مقعد العيادة الشاغر يُملأ من احتياط البِركة العاديّة (الأطولُ راحةً)،
 * ومقعد البورد الشاغر يُملأ من احتياط البورد (الأقدمُ دخولًا). يَكتب خانةً نشطةً للمغطّي
 * ويُزيل صفّ احتياطه. idempotent (المغطَّى لا يُكشف شاغرًا)، لا بديل؟ نقصٌ صريح، لا يرمي.
 */
export async function applyCoverage(
  args: { clinicId: string; weekStart: string; label: string; today?: string },
  opts?: { specialReserves?: 'ask' | 'use' | 'exclude' },
): Promise<{ filled: number; shortages: number; pending: PendingReserveChoice[]; moves: CoverageMove[]; shortageSeats: { day: WeekDay; clinicNumber: number; period: number }[] }> {
  // كيف نتعامل مع الاحتياطيّ **الخاصّ** (بورد/متدرّب) — ثلاث حالات:
  //  • ask (الافتراضيّ، المسار الحيّ): لا يُوضع تلقائيًّا، يُسجَّل pending ليُسأل القائد.
  //  • use (محكّ المقارنة، أو «استدعِه»): يُوضع تلقائيًّا كالعاديّ.
  //  • exclude («لا أحد»/الرفض): لا يُوضع ولا يُسأل — نُكمل بالمصادر الأخرى كأنّه غير موجود.
  const special = opts?.specialReserves ?? 'ask';
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { filled: 0, shortages: 0, pending: [], moves: [], shortageSeats: [] };
    const doctors = data.doctors;
    const todayIdx = todayIndexOf(args.weekStart, args.today); // قفلُ الماضي: لا تغطيةَ على يومٍ مضى وانتهى
    const isPast = (day: string) => todayIdx >= 0 && (DAY_IDX[day] ?? 99) < todayIdx;
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
    // مقاعدُ عيادةٍ شاغرةٌ تعذّر ملؤها (نقصٌ حقيقيّ مُواجِهٌ للمرضى) — لكرت «يوجد فترة فارغة».
    const shortageSeats: { day: WeekDay; clinicNumber: number; period: number }[] = [];
    // استضافاتٌ أُسقِطت لأنّ شاغلها سُحب «منفردًا» للعيادة — تحاول المرحلةُ الثانية إعادة
    // إسنادها لجسدٍ حرٍّ (نماذج مرنة + لجنة) قبل تركها فارغة.
    const droppedHosts: { day: WeekDay; period: number; absentId?: string }[] = [];
    const tagKind: Record<string, CoverageMove['kind']> = { '': 'reserve', '·دليقيتر': 'delegator', '·تخفيف': 'light_duty' };

    for (const sc of scopes) {
      for (const day of DAY_OF) {
        if (isPast(day)) continue; // يومٌ مضى وانتهى — لا يُغطّى
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
            if (delRows.length) await supabase.from('schedule_slots').delete().in('id', delRows.map((dr) => dr.id));
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
            for (const v of vacant) shortageSeats.push({ day, clinicNumber: v.clinicNumber, period: v.period });
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
          if (isPast(day)) continue; // يومٌ مضى وانتهى — لا تُغطّى استضافتُه
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
            if (isPast(day)) continue; // يومٌ مضى وانتهى — لا تُعاد محاذاةُ ظلّه
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
              if (tNow.length) await supabase.from('schedule_slots').delete().in('id', tNow.map((r) => r.id));
              if (supNow.length) await supabase.from('schedule_slots').insert(supNow.map((r) => ({
                clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
                period: r.period, clinic_number: r.clinicNumber,
                doctor_id: tId, doctor_name: t.name, role: r.role, status: 'active', source: 'request',
              })));
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

    return { filled, shortages, pending, moves, shortageSeats };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART COVER] تعذّر:', e instanceof Error ? e.message : e);
    return { filled: 0, shortages: 0, pending: [], moves: [], shortageSeats: [] };
  }
}

/**
 * يضع احتياطيًّا خاصًّا (بورد/متدرّب) اختاره القائد في مقعدٍ شاغرٍ محدّد — مسار «القبول»
 * لكرت السؤال. يكتب خانة عيادةٍ نشطةً ويُزيل صفّ احتياطه ذلك اليوم. آمن: لا يضع إن
 * كان المقعد مأهولًا أصلًا. يُرجِع ما إن وُضع.
 */
export async function placeReserveInSeat(args: {
  clinicId: string; weekStart: string; day: WeekDay;
  clinicNumber: number; period: number; doctorId: string;
}): Promise<{ success: boolean; reason?: string }> {
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
    else {
      const delRows = dayRows.filter((s) => s.doctorId === args.doctorId && s.status === 'active' && s.role === 'delegator' && periods.includes(s.period));
      if (delRows.length) await supabase.from('schedule_slots').delete().in('id', delRows.map((dr) => dr.id));
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
 * يطبّق فعليًّا تحسينات القلب الجديد للدليقيتر (كتابة). كلّ تعديلٍ = **مبادلة دورين** بين
 * طبيبين حاضرين في الشفت نفسه (الجديد يقول: مقعد الدليقيتر الأحقّ به Y لا Z → نبادل خانات
 * Z و Y في ذلك الشفت). آمن: لا يرمي أبدًا، ويُرجِع ما طبّقه.
 */
export async function applyNewHeartRebalance(args: { clinicId: string; weekStart: string; label: string; protectedDays?: Set<WeekDay>; today?: string }): Promise<{ applied: number; deferred: WeekDay[] }> {
  // أيّامٌ أرادتِ الموازنةُ تعديلَها لكنّها محميّةٌ (رتّبها القائدُ يدويًّا) — نؤجّلها
  // ونُرجِعها كي يُسأل القائدُ موافقتَه (كرت «موازنةُ يومٍ عدّلتَه») قبل المساس بترتيبه.
  const deferred = new Set<WeekDay>();
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { applied: 0, deferred: [] };
    const doctors = data.doctors;
    // قفلُ الماضي: أيُّ يومٍ مضى وانتهى يبقى تاريخًا للحداثةِ فقط — مقفلٌ (eligible=شاغلُه) فلا يتحرّك.
    const todayIdx = todayIndexOf(args.weekStart, args.today);
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    // قروبُ كلِّ طبيب (group_a/group_b/board) — لعزلِ موازنةِ الدليقيترِ داخلَ القروبِ الواحد.
    const groupOf = new Map(doctors.map((d) => [d.id, d.groupTemplate.key]));
    // المتدرّبون (ظلال): قد يرثون صفَّ استضافةٍ من مدرّبٍ مُرقًّى. لا يُعَدُّ مقعدَ استضافةٍ
    // حقيقيًّا يُعاد إسنادُه — وإلّا رآه الحلّالُ «مفتوحًا» (المتدرّب خارج البِركة) فبادله
    // بطبيبٍ نشطٍ وأفسد الجدول. نُسقِط أيّ مقعدٍ شاغلُه متدرّبٌ من إعادة التوازن.
    const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    const all: LoadedSlot[] = [...data.pastSlots, ...data.existingSlots];

    const delSeats: HeavySeat[] = [];
    for (const day of DAY_OF) {
      const dayRows = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day]);
      const locked = todayIdx >= 0 && (DAY_IDX[day] ?? 99) < todayIdx; // يومٌ مضى وانتهى — مقفل
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
          if (locked) { seat.eligible = [seat.current]; delSeats.push(seat); continue; } // يومٌ مضى — مقفلٌ (حداثةٌ فقط)
          if (permBlocked.size) seat.eligible = seat.eligible.filter((id) => id === seat.current || !permBlocked.has(id));
          // أقصِ المتدرّبين (ظلال) والمنفردين (مشغولون الفترتين) من أهليّة الاستضافة.
          seat.eligible = seat.eligible.filter((id) => id === seat.current || (!traineeIds.has(id) && !soloDocs.has(id)));
          // اعزلِ القروبات (قرارُ المستخدم): دورُ الدليقيترِ يدورُ داخلَ قروبِ شاغلِه فقط — إضافةُ
          // طبيبٍ (أو ترقيةُ متدرّبٍ لمستقلّ) لقروبٍ لا تُحرّكُ أطباءَ القروبِ الآخرِ ولو عملوا نفسَ الشفت
          // (تفضيلُ شفتٍ ثابت/نقلُ شفت). المقعدُ يبقى لشاغلِه إن لم يكن في قروبه بديلٌ مؤهَّل.
          const curGroup = groupOf.get(seat.current);
          seat.eligible = seat.eligible.filter((id) => id === seat.current || groupOf.get(id) === curGroup);
          delSeats.push(seat);
        }
      }
    }
    delSeats.sort((a, b) => a.stamp.localeCompare(b.stamp));
    if (delSeats.length === 0) return { applied: 0, deferred: [] };
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
      if (todayIdx >= 0 && dayIdx < todayIdx) continue; // دفاعٌ إضافيّ: يومٌ مضى وانتهى لا يُمَسّ
      // يومٌ عدّله القائدُ يدويًّا: لا تمسّه موازنةُ العدل — أجِّلْه واسأل موافقتَه أولًا.
      if (args.protectedDays?.has(day)) { deferred.add(day); continue; }
      const periods = half === 0 ? [1, 2] : [3, 4];
      // مبادلةٌ نظيفة: كلٌّ من Z و Y حاضرٌ بخاناتٍ نشطةٍ في هذا الشفت → نتبادل بالمعرّف.
      const zRows = data.existingSlots.filter((s) => s.doctorId === Z && s.dayOfWeek === day && periods.includes(s.period) && s.status === 'active');
      const yRows = data.existingSlots.filter((s) => s.doctorId === Y && s.dayOfWeek === day && periods.includes(s.period) && s.status === 'active');
      if (zRows.length === 0 || yRows.length === 0) continue; // ليست مبادلةً نظيفة → نتركها (أمان)
      const yName = doctors.find((d) => d.id === Y)?.name ?? Y;
      const zName = doctors.find((d) => d.id === Z)?.name ?? Z;
      await supabase.from('schedule_slots').update({ doctor_id: Y, doctor_name: yName }).in('id', zRows.map((r) => r.id));
      await supabase.from('schedule_slots').update({ doctor_id: Z, doctor_name: zName }).in('id', yRows.map((r) => r.id));
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
            if (tOld.length) await supabase.from('schedule_slots').delete().in('id', tOld.map((o) => o.id));
            if (supNow.length) await supabase.from('schedule_slots').insert(supNow.map((r) => ({
              clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: dy,
              period: r.period, clinic_number: r.clinicNumber,
              doctor_id: t.id, doctor_name: t.name, role: r.role, status: 'active', source: 'request',
            })));
          }
        }
      }
    }
    if (applied === 0) console.log(`[NEW-HEART APPLY · ${args.label}] لا تحسينات — يوافق القديم.`);
    return { applied, deferred: [...deferred] };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART APPLY] تعذّر التطبيق:', e instanceof Error ? e.message : e);
    return { applied: 0, deferred: [...deferred] };
  }
}

// امتصاصُ الاحتياطيّ (راحة) — نظيرُ امتصاصِ الدليقيتر لكن على محورِ الراحة، بالحداثةِ
// المحضة (الغياب = راحة عبر lastRestStamps). «تحسّنٌ صارمٌ فقط»: صفرُ عبثٍ على أسبوعٍ عادلٍ
// أصلًا — العجلةُ توازنُه غالبًا فلا يتحرّك إلّا حين يوجد أحقُّ بالراحةِ فعلًا. التطبيق =
// مبادلةُ (احتياطي↔عيادة): مَن حقُّه الراحةُ أكثرَ (أقدمُ راحةً) يأخذ الاحتياطيّ، والشاغلُ
// الحاليُّ ينزلُ للعيادة. **حمايةُ الظلال**: نستثني مشرفي المتدرّبين من التحريك تمامًا
// (متلقّيًا أو مُنازَلًا) كي لا نُيتّمَ ظلًّا بنقلِ عملِ مشرفِه — نُبقيهم مكانهم (تحفّظٌ آمن).
export async function applyReserveAbsorption(args: { clinicId: string; weekStart: string; label: string; protectedDays?: Set<WeekDay>; today?: string }): Promise<{ applied: number; deferred: WeekDay[] }> {
  const deferred = new Set<WeekDay>();
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { applied: 0, deferred: [] };
    const doctors = data.doctors;
    const todayIdx = todayIndexOf(args.weekStart, args.today); // قفلُ الماضي
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const groupOf = new Map(doctors.map((d) => [d.id, d.groupTemplate.key]));
    const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    // مشرفو المتدرّبين (لهم ظلٌّ يتبعهم): يُستثنون من التحريك حمايةً للظلّ.
    const supervisorIds = new Set(doctors.filter((d) => d.workStatus === 'trainee' && d.supervisorDoctorId).map((d) => d.supervisorDoctorId as string));
    const all: LoadedSlot[] = [...data.pastSlots, ...data.existingSlots];
    const restPrior = lastRestStamps(all.filter((s) => s.weekStart < args.weekStart));

    // مقاعدُ الاحتياطِ لكلّ شفت (نصف): الحاضرون = عاملو الفترتين + محتاطو عمود الشفت.
    const exSeats: HeavySeat[] = [];
    for (const day of DAY_OF) {
      const dayRows = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day]);
      const locked = todayIdx >= 0 && (DAY_IDX[day] ?? 99) < todayIdx; // يومٌ مضى وانتهى — مقفل
      for (const half of [0, 1] as const) {
        const periods = half === 0 ? [1, 2] : [3, 4];
        const exCol = half === 0 ? 1 : 2;
        const ss = dayRows.filter((s) => (s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol) || (s.status === 'active' && periods.includes(s.period)));
        const seats = extractReserveSeats(ss, poolIds);
        for (const seat of seats) {
          if (traineeIds.has(seat.current)) continue; // ظلٌّ لا يحمل راحةً في العجلة
          if (locked) { seat.eligible = [seat.current]; exSeats.push(seat); continue; } // يومٌ مضى — مقفلٌ (حداثةٌ فقط)
          // اعزلِ القروبات + استثنِ المتدرّبين والمشرفين من أهليّة تلقّي الراحة.
          const curGroup = groupOf.get(seat.current);
          seat.eligible = seat.eligible.filter((id) => id === seat.current || (groupOf.get(id) === curGroup && !traineeIds.has(id) && !supervisorIds.has(id)));
          exSeats.push(seat);
        }
      }
    }
    exSeats.sort((a, b) => a.stamp.localeCompare(b.stamp));
    if (exSeats.length === 0) return { applied: 0, deferred: [] };
    const rec = solveHeavyRecency(doctors, restPrior, exSeats);

    // نُطبّق القرارَ **بفرقِ المجموعات لكلّ شفت** (لا مقعدًا مقعدًا): إعادةُ التعيينِ قد تكون
    // سلسلةً (أ→مقعدِ ب، ب→مقعدِ جـ)، فنحسب لكلّ شفت مَن يجب أن يرتاح (NEW) ومَن يرتاح الآن
    // (CUR)، ونُزاوج «صاعدًا للراحة» (كان يعمل) مع «نازلًا للعيادة» (كان يرتاح) → مبادلاتُ
    // احتياطي↔عيادة نظيفةٌ تُحقّق التوزيعَ الكامل في تمريرةٍ واحدةٍ (idempotent).
    const assignOf = new Map((rec.fullAssignment ?? []).map((fa) => [fa.seatId, fa.doctorId]));
    const byShift = new Map<string, HeavySeat[]>();
    for (const seat of exSeats) { const a = byShift.get(seat.stamp) ?? []; a.push(seat); byShift.set(seat.stamp, a); }
    let applied = 0;
    for (const [stamp, seats] of byShift) {
      const CUR = seats.map((s) => s.current);
      const NEW = seats.map((s) => assignOf.get(s.id) ?? s.current);
      const curSet = new Set(CUR); const newSet = new Set(NEW);
      const addRest = NEW.filter((id) => !curSet.has(id)); // يعملُ الآن ويجب أن يرتاح
      const remRest = CUR.filter((id) => !newSet.has(id)); // يرتاحُ الآن ويجب أن يعمل
      if (addRest.length === 0) continue;
      const parts = stamp.split('#'); const dayIdx = Number(parts[1]); const half = Number(parts[2]);
      const day = DAY_OF[dayIdx]; if (!day) continue;
      if (todayIdx >= 0 && dayIdx < todayIdx) continue; // دفاعٌ إضافيّ: يومٌ مضى وانتهى لا يُمَسّ
      if (args.protectedDays?.has(day)) { deferred.add(day); continue; } // يومٌ عدّله القائد — أجّلْ
      const periods = half === 0 ? [1, 2] : [3, 4];
      const exCol = half === 0 ? 1 : 2;
      const n = Math.min(addRest.length, remRest.length);
      for (let i = 0; i < n; i++) {
        const Y = addRest[i]!; // يصعدُ للراحة (كان يعمل عيادة)
        const Z = remRest[i]!; // ينزلُ للعيادة (كان يرتاح)
        if (supervisorIds.has(Y) || supervisorIds.has(Z)) continue; // حمايةُ الظلّ — لا نُحرّك مشرفًا
        // مبادلةٌ نظيفة فقط: Z محتاطٌ خالص (لا عيادةَ له)، وY يعملُ عيادةً نشطةً ولا احتياطَ له.
        const zEx = data.existingSlots.filter((s) => s.doctorId === Z && DAY_IDX[s.dayOfWeek] === dayIdx && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
        const zClinic = data.existingSlots.filter((s) => s.doctorId === Z && DAY_IDX[s.dayOfWeek] === dayIdx && s.status === 'active' && periods.includes(s.period));
        const yClinic = data.existingSlots.filter((s) => s.doctorId === Y && DAY_IDX[s.dayOfWeek] === dayIdx && s.status === 'active' && s.role === 'clinic' && periods.includes(s.period));
        const yEx = data.existingSlots.filter((s) => s.doctorId === Y && DAY_IDX[s.dayOfWeek] === dayIdx && s.status === 'extra' && s.period === 0);
        if (zEx.length === 0 || zClinic.length > 0 || yClinic.length === 0 || yEx.length > 0) continue; // ليست نظيفة → اترك (أمان)
        const yName = doctors.find((d) => d.id === Y)?.name ?? Y;
        const zName = doctors.find((d) => d.id === Z)?.name ?? Z;
        await supabase.from('schedule_slots').update({ doctor_id: Y, doctor_name: yName }).in('id', zEx.map((r) => r.id));
        await supabase.from('schedule_slots').update({ doctor_id: Z, doctor_name: zName }).in('id', yClinic.map((r) => r.id));
        applied++;
        // eslint-disable-next-line no-console
        console.log(`[RESERVE-ABSORB · ${args.label}] راحة→${yName} ⇄ عيادة→${zName} (${day}/${half === 0 ? 'ص' : 'م'})`);
      }
    }
    if (applied === 0) console.log(`[RESERVE-ABSORB · ${args.label}] لا تحسينات — عادلٌ أصلًا.`);
    return { applied, deferred: [...deferred] };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[RESERVE-ABSORB] تعذّر التطبيق:', e instanceof Error ? e.message : e);
    return { applied: 0, deferred: [...deferred] };
  }
}

// امتصاصُ الانفراد — محورٌ مستقلٌّ (قرارُ المستخدم: للانفرادِ حسبتُه، لا يُدمَج مع الدليقيتر).
// بالحداثةِ المحضة عبر lastSoloStamps، «تحسّنٌ صارمٌ فقط» (صفرُ عبثٍ على أسبوعٍ عادل أصلًا).
// التطبيقُ **تسليمٌ غيرُ متناظر** (لا مبادلةَ هويّة): صفّا العيادةِ المنفردةِ (فترتان) ينتقلان
// للأحقِّ بالانفرادِ Y، وصفُّ Y المقترِنُ الواحدُ ينتقلُ للمنفرِدِ الحاليِّ X — فيصيرُ X مقترنًا
// (فترة) وY منفردًا (فترتان)، وهو عينُ نقلِ الحمل. **الظلُّ يتبعُ مشرفَه كأنّهما شخصٌ واحد**:
// حين يتحرّكُ مشرفٌ (مانحًا أو متلقّيًا) يُعاد إلصاقُ ظلِّه بموضعِه النهائيّ (كامتصاصِ الدليقيتر
// تمامًا)؛ ومقعدُ ظلٍّ متدرّبٍ نفسُه لا يُنقَل (يتبعُ مشرفَه لا العكس).
export async function applySoloAbsorption(args: { clinicId: string; weekStart: string; label: string; protectedDays?: Set<WeekDay>; today?: string }): Promise<{ applied: number; deferred: WeekDay[] }> {
  const deferred = new Set<WeekDay>();
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { applied: 0, deferred: [] };
    const doctors = data.doctors;
    const todayIdx = todayIndexOf(args.weekStart, args.today); // قفلُ الماضي
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const groupOf = new Map(doctors.map((d) => [d.id, d.groupTemplate.key]));
    const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    // مشرفو المتدرّبين يُحرَّكون عاديًّا ثمّ يُلصَقُ ظلُّهم بموضعهم النهائيّ (كتلةُ الظلّ أسفلَه).
    const all: LoadedSlot[] = [...data.pastSlots, ...data.existingSlots];
    const soloPrior = lastSoloStamps(all.filter((s) => s.weekStart < args.weekStart));

    // مقاعدُ الانفرادِ لكلّ شفت (نصف). المؤهَّلون لتلقّي الانفراد = **المقترِنون** (يعملون
    // صفَّ عيادةٍ واحدًا في النصف) فالتسليمُ نظيفٌ (منفرِدٌ فترتان ⇄ مقترِنٌ فترة).
    const soloSeats: HeavySeat[] = [];
    for (const day of DAY_OF) {
      const dayRows = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day]);
      const locked = todayIdx >= 0 && (DAY_IDX[day] ?? 99) < todayIdx; // يومٌ مضى وانتهى — مقفل
      for (const half of [0, 1] as const) {
        const periods = half === 0 ? [1, 2] : [3, 4];
        const ss = dayRows.filter((s) => periods.includes(s.period));
        const seats = extractHeavySeats(ss, poolIds).filter((s) => s.kind === 'solo');
        if (seats.length === 0) continue;
        // المقترِنون: أطبّاءُ عيادةٍ نشطون لهم **صفُّ عيادةٍ واحد** في هذا النصف.
        const clinicRows = ss.filter((s) => s.status === 'active' && s.role === 'clinic' && s.clinicNumber > 0);
        const rowCount = new Map<string, number>();
        for (const r of clinicRows) rowCount.set(r.doctorId, (rowCount.get(r.doctorId) ?? 0) + 1);
        const pairedDocs = [...rowCount].filter(([, n]) => n === 1).map(([id]) => id);
        for (const seat of seats) {
          if (traineeIds.has(seat.current)) continue; // مقعدُ ظلٍّ متدرّب — لا يُنقَل (يتبعُ مشرفَه)
          if (locked) { seat.eligible = [seat.current]; soloSeats.push(seat); continue; } // يومٌ مضى — مقفلٌ (حداثةٌ فقط)
          const curGroup = groupOf.get(seat.current);
          // الأهليّة = المقترِنون في قروبِ الشاغلِ ضمن البِركة (يستثني البورد/المتدرّب/التخفيف).
          // المشرفون مسموحون (يتلقّون الانفراد ويتبعُهم ظلُّهم).
          seat.eligible = [seat.current, ...pairedDocs].filter((id, i, a) => a.indexOf(id) === i)
            .filter((id) => id === seat.current || (groupOf.get(id) === curGroup && poolIds.has(id)));
          soloSeats.push(seat);
        }
      }
    }
    soloSeats.sort((a, b) => a.stamp.localeCompare(b.stamp));
    if (soloSeats.length === 0) return { applied: 0, deferred: [] };
    const rec = solveHeavyRecency(doctors, soloPrior, soloSeats);
    const assignOf = new Map((rec.fullAssignment ?? []).map((fa) => [fa.seatId, fa.doctorId]));

    // تطبيقٌ مقعدًا مقعدًا (آمنٌ للتسليمِ غيرِ المتناظر): مجموعتا «المنفردون» و«المقترِنون»
    // منفصلتان في الشفت الواحد (المنفرِدُ فترتان، المقترِنُ فترة) فلا يُلمَسُ صفٌّ مرّتين.
    let applied = 0;
    // المشرفون الذين مسّتهم مبادلةٌ (يوم|مُعرّف) — نُلصِقُ ظلالَهم بموضعهم النهائيّ بعد الكلّ.
    const touched = new Set<string>();
    for (const seat of soloSeats) {
      const X = seat.current; const Y = assignOf.get(seat.id) ?? X;
      if (X === Y) continue; // لا تغيير (عادلٌ أو مقفل)
      const parts = seat.stamp.split('#'); const dayIdx = Number(parts[1]); const half = Number(parts[2]);
      const day = DAY_OF[dayIdx]; if (!day) continue;
      if (todayIdx >= 0 && dayIdx < todayIdx) continue; // دفاعٌ إضافيّ: يومٌ مضى وانتهى لا يُمَسّ
      if (args.protectedDays?.has(day)) { deferred.add(day); continue; } // يومٌ عدّله القائد — أجّلْ
      const periods = half === 0 ? [1, 2] : [3, 4];
      // تسليمٌ نظيفٌ فقط: X منفرِدٌ (صفّا عيادةٍ نشطان في **عيادةٍ واحدة**)، وY مقترِنٌ (صفٌّ واحد).
      // نطلبُ أيضًا ألّا يحملَ أيٌّ منهما دورًا آخرَ في النصف (دليقيتر/احتياط) كي لا يتكدّسَ دورانِ على واحد.
      const xAll = data.existingSlots.filter((s) => s.doctorId === X && DAY_IDX[s.dayOfWeek] === dayIdx && ((s.status === 'active' && periods.includes(s.period)) || (s.status === 'extra' && s.period === 0 && s.clinicNumber === (half === 0 ? 1 : 2))));
      const yAll = data.existingSlots.filter((s) => s.doctorId === Y && DAY_IDX[s.dayOfWeek] === dayIdx && ((s.status === 'active' && periods.includes(s.period)) || (s.status === 'extra' && s.period === 0 && s.clinicNumber === (half === 0 ? 1 : 2))));
      const xRows = xAll.filter((s) => s.status === 'active' && s.role === 'clinic');
      const yRows = yAll.filter((s) => s.status === 'active' && s.role === 'clinic');
      if (xRows.length !== 2 || xAll.length !== 2 || yRows.length !== 1 || yAll.length !== 1) continue; // ليس تسليمًا نظيفًا → اترك (أمان)
      if (new Set(xRows.map((r) => r.clinicNumber)).size !== 1) continue; // صفّا X ليسا عيادةً واحدة → ليس انفرادًا
      const yName = doctors.find((d) => d.id === Y)?.name ?? Y;
      const xName = doctors.find((d) => d.id === X)?.name ?? X;
      await supabase.from('schedule_slots').update({ doctor_id: Y, doctor_name: yName }).in('id', xRows.map((r) => r.id)); // العيادةُ المنفردةُ (فترتان) ← Y
      await supabase.from('schedule_slots').update({ doctor_id: X, doctor_name: xName }).in('id', yRows.map((r) => r.id)); // صفُّ Y المقترِنُ (فترة) ← X
      touched.add(`${day}|${X}`); touched.add(`${day}|${Y}`);
      applied++;
      // eslint-disable-next-line no-console
      console.log(`[SOLO-ABSORB · ${args.label}] انفراد→${yName} ⇄ اقتران→${xName} (${day}/${half === 0 ? 'ص' : 'م'})`);
    }

    // الظلُّ يتبعُ مشرفَه (كأنّهما شخصٌ واحد): بعد **كلّ** المبادلات نُعيد إلصاقَ ظلِّ كلِّ مشرفٍ
    // مسّته مبادلةٌ بموضعِ مشرفِه **النهائيّ** (عيادة/فترة/دور). المحاذاةُ للحالة النهائيّة أمتنُ من
    // تتبّعٍ جزئيّ. (منطقٌ مطابقٌ لامتصاصِ الدليقيتر applyNewHeartRebalance — مُجرَّب.)
    if (touched.size) {
      const inScope = (s: LoadedSlot) => s.period > 0 && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator');
      const keysIn = (rows: LoadedSlot[], id: string, dy: string) =>
        rows.filter((r) => r.doctorId === id && r.dayOfWeek === dy && inScope(r)).map((r) => `${r.period}|${r.clinicNumber}|${r.role}`);
      const { data: after } = await loadScheduleData(args.clinicId, args.weekStart);
      if (after) {
        for (const key of touched) {
          const [dy, supId] = key.split('|');
          if (!dy || !supId) continue;
          // الظلّ: متدرّبٌ خاناتُه **قبل** المبادلات طابقت خانات مشرفه تمامًا (data قبل الكتابة).
          const shadows = doctors.filter((d) => {
            if (d.workStatus !== 'trainee' || d.supervisorDoctorId !== supId) return false;
            const tk = keysIn(data.existingSlots, d.id, dy);
            const sk = new Set(keysIn(data.existingSlots, supId, dy));
            return tk.length > 0 && tk.length === sk.size && tk.every((k) => sk.has(k));
          });
          for (const t of shadows) {
            const supNow = after.existingSlots.filter((r) => r.doctorId === supId && r.dayOfWeek === dy && inScope(r));
            const tOld = after.existingSlots.filter((r) => r.doctorId === t.id && r.dayOfWeek === dy && inScope(r));
            if (tOld.length) await supabase.from('schedule_slots').delete().in('id', tOld.map((o) => o.id));
            if (supNow.length) await supabase.from('schedule_slots').insert(supNow.map((r) => ({
              clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: dy,
              period: r.period, clinic_number: r.clinicNumber,
              doctor_id: t.id, doctor_name: t.name, role: r.role, status: 'active', source: 'request',
            })));
          }
        }
      }
    }
    if (applied === 0) console.log(`[SOLO-ABSORB · ${args.label}] لا تحسينات — عادلٌ أصلًا.`);
    return { applied, deferred: [...deferred] };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[SOLO-ABSORB] تعذّر التطبيق:', e instanceof Error ? e.message : e);
    return { applied: 0, deferred: [...deferred] };
  }
}

/**
 * إعادةُ تشكيلٍ للشكل الرفيع (D=M+1): حين يهبط عددُ الحاضرين في شفتٍ إلى M+1 لـM عيادة
 * (بمرضيّة/تفرّغٍ وسطَ الأسبوع تُنزل العدد من فوق)، نُعيد اشتقاقَ الشفت إلى الشكل القانونيّ
 * — **M منفرد-عيادة + ١ منفرد-دليقيتر** (الكلُّ يعمل الفترتين) — بدل ترك زوجِ استضافةٍ أو
 * نصفِ زوجٍ أو عيادةٍ فارغة. يحفظ الاستمراريّة (كلٌّ يبقى في عيادته ما أمكن)، ويختار المضيفَ
 * بعدلِ حداثة الاستضافة (الأقدمُ عهدًا بها أحقُّ). تخفيفُ العمل يُعامَل عاديًّا هنا (الفترتان،
 * كقاعدة الحالة الرفيعة). آمنٌ: لا يرمي، يعمل فقط حين present == M+1 والشكلُ غيرُ مثاليّ.
 */
export async function applyThinReshape(args: { clinicId: string; weekStart: string; label: string; today?: string }): Promise<{ reshaped: number }> {
  try {
    const { data } = await loadScheduleData(args.clinicId, args.weekStart);
    if (!data) return { reshaped: 0 };
    const todayIdx = todayIndexOf(args.weekStart, args.today); // قفلُ الماضي
    const M = data.clinicCount;
    if (!M || M < 1) return { reshaped: 0 };
    const doctors = data.doctors;
    const history = [...data.pastSlots, ...data.existingSlots].filter((s) => s.weekStart < args.weekStart);
    const delRecency = lastHeavyStamps(history); // حداثة آخر استضافة (الأقدم = الأحقّ)
    const boardIds = new Set(doctors.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id));
    const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    const isReg = (id: string) => !boardIds.has(id) && !traineeIds.has(id);
    const nameOf = (id: string) => doctors.find((d) => d.id === id)?.name ?? id;
    let reshaped = 0;
    for (const day of DAY_OF) {
      if (todayIdx >= 0 && (DAY_IDX[day] ?? 99) < todayIdx) continue; // يومٌ مضى وانتهى — لا يُشكَّل
      for (const half of [0, 1] as const) {
        const periods = half === 0 ? [1, 2] : [3, 4];
        const rows = data.existingSlots.filter((s) => s.dayOfWeek === day && s.status === 'active'
          && periods.includes(s.period) && (s.role === 'clinic' || s.role === 'delegator') && isReg(s.doctorId));
        const present = [...new Set(rows.map((s) => s.doctorId))];
        if (present.length !== M + 1) continue; // الحالةُ الرفيعةُ فقط (طبيبٌ زائدٌ واحد)
        const clinicSeatsOf = (id: string) => rows.filter((s) => s.doctorId === id && s.role === 'clinic' && s.clinicNumber > 0);
        const delSeatsOf = (id: string) => rows.filter((s) => s.doctorId === id && s.role === 'delegator');
        const isSolo = (id: string) => { const c = clinicSeatsOf(id); return c.length === 2 && c[0]!.clinicNumber === c[1]!.clinicNumber && delSeatsOf(id).length === 0; };
        const isHost = (id: string) => delSeatsOf(id).length === 2 && clinicSeatsOf(id).length === 0;
        if (present.filter(isSolo).length === M && present.filter(isHost).length === 1) continue; // مثاليٌّ أصلًا
        // المضيف = الأحقُّ (أقدمُ حداثةَ استضافة). أيُّ طبيبٍ يصلح؛ الباقون M يغطّون M عيادةً دائمًا.
        const host = [...present].sort((a, b) => (delRecency.get(a) ?? '').localeCompare(delRecency.get(b) ?? '') || a.localeCompare(b))[0]!;
        const rest = present.filter((id) => id !== host);
        const clinics = Array.from({ length: M }, (_, i) => i + 1);
        const soloOfClinic = new Map<number, string>(); const used = new Set<string>();
        for (const c of clinics) { // ① استمراريّة: شاغلٌ حاليٌّ للعيادة يبقى فيها
          const cand = rest.find((id) => !used.has(id) && clinicSeatsOf(id).some((s) => s.clinicNumber === c));
          if (cand) { soloOfClinic.set(c, cand); used.add(cand); }
        }
        for (const c of clinics) { // ② عياداتٌ بلا شاغلٍ مُسنَد → أيُّ متبقٍّ (يملأ الفراغ)
          if (soloOfClinic.has(c)) continue;
          const cand = rest.find((id) => !used.has(id));
          if (cand) { soloOfClinic.set(c, cand); used.add(cand); }
        }
        if (soloOfClinic.size !== M || used.size !== M) continue; // أمان: إسنادٌ غيرُ مكتمل
        const inserts: Record<string, unknown>[] = [];
        for (const [c, id] of soloOfClinic) for (const p of periods) inserts.push({
          clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
          period: p, clinic_number: c, doctor_id: id, doctor_name: nameOf(id), role: 'clinic', status: 'active', source: 'request',
        });
        for (const p of periods) inserts.push({
          clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: day,
          period: p, clinic_number: 0, doctor_id: host, doctor_name: nameOf(host), role: 'delegator', status: 'active', source: 'request',
        });
        if (rows.length) await supabase.from('schedule_slots').delete().in('id', rows.map((s) => s.id));
        await supabase.from('schedule_slots').insert(inserts);
        reshaped++;
        // eslint-disable-next-line no-console
        console.log(`[NEW-HEART THIN-RESHAPE · ${args.label}] ${day}/${half === 0 ? 'ص' : 'م'}: ${[...soloOfClinic].map(([c, id]) => `ع${c}:${nameOf(id).split(' ')[0]}`).join('، ')} · دليقيتر:${nameOf(host).split(' ')[0]}`);
      }
    }
    return { reshaped };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART THIN-RESHAPE] تعذّر:', e instanceof Error ? e.message : e);
    return { reshaped: 0 };
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
 * آمن: لا يرمي، مبادلةٌ نظيفة. يُرجِع مَن سُدِّد لهم كي لا يُدفَعوا لمؤخّرة
 * عجلة الاحتياط أيضًا (خيار أ — تفادي العقوبة المزدوجة).
 */
export async function applyReserveRepay(
  args: { clinicId: string; weekStart: string; label: string; today?: string },
  pairs: { coverer: string; owner: string; exCol: number; coverDay: string }[],
): Promise<{ repaid: number; accepted: number; repaidAbsent: string[] }> {
  const repaidAbsent: string[] = [];
  if (pairs.length === 0) return { repaid: 0, accepted: 0, repaidAbsent };
  // أزواجٌ فريدة (مُغطٍّ+غائب+شفت) — لا نسدّد المُغطّيَ نفسه مرّتين لنفس الغياب.
  const seen = new Set<string>();
  const uniq = pairs.filter((p) => {
    if (!p.owner || p.owner === p.coverer) return false;
    const k = `${p.coverer}|${p.owner}|${p.exCol}`; if (seen.has(k)) return false; seen.add(k); return true;
  });
  let repaid = 0; let accepted = 0;
  // قفلُ الماضي: البحثُ القَبْليّ لا ينزلُ تحتَ «اليوم» — لا نسدّدُ الراحةَ بيومٍ مضى وانتهى.
  const todayIdx = todayIndexOf(args.weekStart, args.today);
  const floorIdx = todayIdx >= 0 ? todayIdx : 0;
  try {
    for (const { coverer, owner, exCol, coverDay } of uniq) {
      const periods = exCol === 1 ? [1, 2] : [3, 4];
      // ترتيب الأيّام: قَبْليّ (اليوم-١ → «اليوم» فقط، لا أبعد) ثمّ أماميّ (اليوم+١ → نهايته).
      const di = DAY_IDX[coverDay] ?? 0;
      const order: string[] = [];
      for (let i = di - 1; i >= floorIdx; i--) order.push(DAY_OF[i]!);
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
        await supabase.from('schedule_slots').update({ doctor_id: owner, doctor_name: ownerName }).in('id', covererClinic.map((r) => r.id));
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

/**
 * التغطيةُ العكسيّةُ الجراحيّة — طيُّ الاتّجاه العكسيّ في القلب الجديد (بديلُ عجلةِ العودةِ
 * القديمة المُزالة). حين يعود طبيبٌ (أُلغيت حالتُه) وتعذّر العكسُ الحرفيّ
 * لأنّ **العالم تغيّر** (مقاعدُه شغلها مَن لم يُتوقَّع)، نعيده **بأقلّ لمسٍ** بدل إعادة بناء
 * الشفت من الوصفة (التي تجلب الطاقمَ كلَّه وقد تُسقِط العائدَ نفسه):
 *   ① العائدُ يستردّ مقاعده (prevSeats) بالقوّة (يُزيح شاغلَها).
 *   ② مقاعدُ العائد الأخرى في الشفت (نزولٌ سابق) تُخلى → شاغرة.
 *   ③ المُزاحون بلا مقعدٍ آخر = أجسادٌ حرّة.
 *   ④ تُملأ المقاعدُ المُخلاة بالأجساد الحرّة (حداثةً) ثمّ احتياطِ الشفت — لا اختراعَ طبيب.
 *   ⑤ الأجسادُ الحرّةُ المتبقّية (مُغطٍّ خالصٌ تحرّر) → احتياط (لا تُترك معلّقة).
 * شفتٌ واحد (تُستنتَج فتراتُه من prevSeats). آمن: apply فقط، لا يرمي، idempotent (إن كان
 * العائدُ في مقاعده أصلًا فلا تغيير). ظلال المتدرّبين تُعالَج في طبقة الاستدعاء (mirrorShadows).
 */
export async function applyReturn(args: {
  clinicId: string; weekStart: string; day: WeekDay; label: string;
  returnerId: string;
  prevSeats: { period: number; clinicNumber: number }[];
  today?: string;
}): Promise<{ reclaimed: number; refilled: number; reserved: number; shortages: number; touched: string[] }> {
  const touchedSet = new Set<string>();
  const z = { reclaimed: 0, refilled: 0, reserved: 0, shortages: 0, touched: [] as string[] };
  if (!args.prevSeats.length) return z;
  // قفلُ الماضي: يومٌ مضى وانتهى لا تُعادُ عليه العودةُ (لا نُعيدُ كتابةَ ما حدث فعلًا).
  const rtIdx = todayIndexOf(args.weekStart, args.today);
  if (rtIdx >= 0 && (DAY_IDX[args.day] ?? 99) < rtIdx) return z;
  try {
    const { clinicId, weekStart, day, returnerId, prevSeats } = args;
    const periods = prevSeats.some((s) => [1, 2].includes(s.period)) ? [1, 2] : [3, 4];
    const exCol = periods[0] === 1 ? 1 : 2;
    const reload = async () => (await loadScheduleData(clinicId, weekStart)).data;
    let data = await reload(); if (!data) return z;
    const doctors = data.doctors;
    const nameOf = (id: string) => doctors.find((d) => d.id === id)?.name ?? id;
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const history = [...data.pastSlots, ...data.existingSlots].filter((s) => s.weekStart < weekStart);
    const delRecency = lastHeavyStamps(history);
    const clinicRecency = lastClinicStamps(history);
    const rowsNow = () => data!.existingSlots.filter((s) => s.dayOfWeek === day);
    const hasSeatInShift = (id: string) => rowsNow().some((s) => s.doctorId === id && s.status === 'active'
      && (s.role === 'clinic' || s.role === 'delegator') && periods.includes(s.period));
    // محجوبٌ في الفترة P؟ (غائبٌ مرضيًّا/تفرّغًا، أو استئذانٌ يحجبها) — لا يصلح بديلًا.
    const blockedAtP = (id: string, P: number) => rowsNow().some((s) => s.doctorId === id && s.period === 0
      && ((s.status === 'sick_leave' || s.status === 'vacation')
        || (s.status === 'permission_start' && P === periods[0]) || (s.status === 'permission_end' && P === periods[1])));

    // ① الاستردادُ بالقوّة: العائدُ يأخذ كلَّ مقعدٍ من prevSeats. نُخلي المقعدَ **تمامًا**
    // (الشاغلُ + أيُّ ظلٍّ يطابقه — قد يحوي طبيبًا وظلَّه صفّين) ثمّ نضع العائدَ صفًّا
    // واحدًا → لا حجزَ مزدوج بالبناء. الشاغلُ غيرُ المتدرّب = المُزاح (يُعاد امتصاصُه)؛
    // الظلال تُحذف هنا، وتُعيد محاذاتَها طبقةُ الإلغاء (mirrorShadows) لموضع مدرّبها النهائيّ.
    const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    const displaced = new Set<string>();
    for (const ps of prevSeats) {
      const role = ps.clinicNumber === 0 ? 'delegator' : 'clinic';
      const here = rowsNow().filter((s) => s.status === 'active' && s.role === role && s.period === ps.period && s.clinicNumber === ps.clinicNumber);
      if (here.length === 1 && here[0]!.doctorId === returnerId) continue; // العائدُ وحدَه أصلًا → لا لمس
      for (const r of here) {
        if (r.doctorId !== returnerId && !traineeIds.has(r.doctorId)) { displaced.add(r.doctorId); touchedSet.add(r.doctorId); }
      }
      if (here.length) await supabase.from('schedule_slots').delete().in('id', here.map((r) => r.id));
      await supabase.from('schedule_slots').insert({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: ps.period, clinic_number: ps.clinicNumber,
        doctor_id: returnerId, doctor_name: nameOf(returnerId), role, status: 'active', source: 'request',
      });
      touchedSet.add(returnerId);
      z.reclaimed++;
    }
    data = await reload(); if (!data) return z;

    // ② إخلاءُ مقاعد العائد الأخرى في الشفت (نزولٌ سابق) → شاغرة.
    const vacated: { period: number; clinicNumber: number; role: string }[] = [];
    const vacatedRows = rowsNow().filter((s) => s.doctorId === returnerId && s.status === 'active'
      && (s.role === 'clinic' || s.role === 'delegator') && periods.includes(s.period)
      && !prevSeats.some((ps) => ps.period === s.period && ps.clinicNumber === s.clinicNumber));
    for (const r of vacatedRows) vacated.push({ period: r.period, clinicNumber: r.clinicNumber, role: r.role });
    if (vacatedRows.length) await supabase.from('schedule_slots').delete().in('id', vacatedRows.map((r) => r.id));
    data = await reload(); if (!data) return z;

    // ③ الأجسادُ الحرّة = المُزاحون بلا مقعدٍ نشطٍ آخر في الشفت.
    const free = [...displaced].filter((id) => !hasSeatInShift(id));

    // ④ املأِ المقاعدَ المُخلاة: أجسادٌ حرّة (مُزاحون) ثمّ احتياطُ الشفت، بحداثةٍ عادلة، غير المحجوبين.
    for (const v of vacated) {
      const recency = v.clinicNumber === 0 ? delRecency : clinicRecency;
      const exIds = [...new Set(rowsNow().filter((s) => s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))];
      const cands = [...new Set([...free, ...exIds])]
        .filter((id) => poolIds.has(id) && !blockedAtP(id, v.period)
          && !rowsNow().some((s) => s.doctorId === id && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator') && s.period === v.period))
        .sort((a, b) => (recency.get(a) ?? '').localeCompare(recency.get(b) ?? ''));
      const pick = cands[0];
      if (!pick) { z.shortages++; continue; } // لا جسدَ → يبقى شاغرًا (نقص صريح، لا اختراع)
      const ex = rowsNow().find((s) => s.doctorId === pick && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
      if (ex) await supabase.from('schedule_slots').delete().eq('id', ex.id);
      await supabase.from('schedule_slots').insert({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: v.period, clinic_number: v.clinicNumber,
        doctor_id: pick, doctor_name: nameOf(pick), role: v.role, status: 'active', source: 'request',
      });
      z.refilled++; touchedSet.add(pick);
      const fi = free.indexOf(pick); if (fi >= 0) free.splice(fi, 1);
      data = await reload(); if (!data) return z;
    }

    // ⑤ الأجسادُ الحرّةُ المتبقّية → احتياط (لا تُترك معلّقة).
    const reserveInserts: Record<string, unknown>[] = [];
    for (const id of free) {
      if (hasSeatInShift(id) || rowsNow().some((s) => s.doctorId === id && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol)) continue;
      reserveInserts.push({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: 0, clinic_number: exCol,
        doctor_id: id, doctor_name: nameOf(id), role: 'clinic', status: 'extra', source: 'request',
      });
      z.reserved++; touchedSet.add(id);
    }
    if (reserveInserts.length) await supabase.from('schedule_slots').insert(reserveInserts);
    z.touched = [...touchedSet];
    // eslint-disable-next-line no-console
    console.log(`[NEW-HEART RETURN · ${args.label}] ${nameOf(returnerId)} استردّ ${z.reclaimed} · مُلئ ${z.refilled} · احتياط ${z.reserved}${z.shortages ? ' · نقص ' + z.shortages : ''}`);
    return z;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[NEW-HEART RETURN] تعذّر:', e instanceof Error ? e.message : e);
    return z;
  }
}
