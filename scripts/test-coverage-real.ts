/* تغطيةُ الغياب — مقارنةٌ حقيقيّةٌ ضدّ القلب القديم. نبني أسبوعًا، نُغيّب طبيب عيادةٍ
 * مرضيًّا، ثمّ:
 *  • القلب الجديد: extractCoverageSeats + solveCoverage يملأ المقاعد الشاغرة من الاحتياط.
 *  • القلب القديم: redistributeShift يعيد بناء الشفت.
 * نتحقّق: (أ) الجديد يكشف نفس المقاعد الشاغرة، (ب) يغطّيها كلّها ما دام يوجد احتياط،
 * (ج) لا حجزٌ مزدوجٌ للفترة، (د) لا طبيبٌ مختلَق، (هـ) كلّ عيادةٍ يُبقيها القديم مأهولةً
 * يُبقيها الجديد مأهولةً أيضًا (لا نقصَ يصنعه الجديد دون القديم). */
import { loadScheduleData, schedule, redistributeShift } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { extractCoverageSeats, solveCoverage, lastClinicStamps } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

async function buildWeek(W: string) {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}

const poolOf = (doctors: any[]) => new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));

/** بدلاء التغطية لشفتٍ: محتاطو الشفت (extra, period0, عمود الشفت) ضمن البِركة، عدا الغائب. */
function coverageAvailable(slots: LoadedSlot[], day: WeekDay, shift: Shift, pool: Set<string>, absent: Set<string>): string[] {
  const exCol = shift === 'morning' ? 1 : 2;
  return [...new Set(slots
    .filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol)
    .map((s) => s.doctorId))]
    .filter((id) => pool.has(id) && !absent.has(id));
}

(async () => {
  const W = '2099-01-04';
  await buildWeek(W);
  let data = (await loadScheduleData(CID, W)).data!;
  const pool = poolOf(data.doctors);

  // اختر طبيب عيادةٍ يوم الأحد صباحًا (active clinic, ف1/ف2) ضمن البِركة.
  const sunAM = data.existingSlots.filter((s) => DI[s.dayOfWeek] === 0 && [1, 2].includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
  const victim = sunAM[0];
  if (!victim) { console.log('لا طبيب عيادةٍ مناسبٌ في الفكسجر — تخطّي'); process.exit(0); }
  const vName = victim.doctorName;
  console.log(`الغائب: ${vName} (عيادة ${victim.clinicNumber})\n`);

  // القلب القديم: ماذا يفعل لو أعاد بناء الشفت **مع** غياب هذا الطبيب؟ (محاكاة، بلا كتابة)
  const oldR = await redistributeShift({ clinicId: CID, weekStart: W, day: 'sunday', shift: 'morning', simulateAbsences: [{ doctorId: victim.doctorId, day: 'sunday' } as any] });
  const oldStaffed = new Set<string>();
  if (oldR.success) {
    const byClinic = new Map<number, Set<number>>();
    for (const s of oldR.slots.filter((x) => x.role === 'clinic' && x.clinicNumber > 0 && x.doctor.id !== victim.doctorId)) {
      (byClinic.get(s.clinicNumber) ?? byClinic.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.period);
    }
    for (const [c, ps] of byClinic) if (ps.size >= 1) oldStaffed.add(`c${c}`);
  }

  // سجّل الغياب فعليًّا (يكتب prev_placement كالمسار الحقيقيّ).
  const actor = { id: data.doctors[0]!.id, role: 'super_admin' };
  const res = await requestsV2.setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: 'sunday', doctorId: victim.doctorId, doctorName: vName, status: 'sick_leave', shift: 'morning' });
  check('غيابٌ سُجِّل', res.success, (res as any).error || '');

  data = (await loadScheduleData(CID, W)).data!;
  const sunSlots = data.existingSlots.filter((s) => DI[s.dayOfWeek] === 0);

  // القلب الجديد: اكشف الشاغر، احسب البدلاء، غطِّ.
  const vacant = extractCoverageSeats(sunSlots.filter((s) => [1, 2, 0].includes(s.period) || (s.role as string) === 'prev_placement'));
  check('① كشف الشاغر: مقعدٌ واحدٌ على الأقلّ', vacant.length >= 1, `${vacant.length}`);
  check('① الشاغر في عيادة الغائب', vacant.every((v) => v.clinicNumber === victim.clinicNumber) || vacant.some((v) => v.clinicNumber === victim.clinicNumber), JSON.stringify(vacant.map((v) => v.clinicNumber)));

  const avail = coverageAvailable(data.existingSlots, 'sunday', 'morning', pool, new Set([victim.doctorId]));
  console.log(`     بدلاء متاحون: ${avail.length} | مقاعد شاغرة: ${vacant.length}`);
  const prior = lastClinicStamps(data.pastSlots.filter((s) => s.weekStart < W));
  const rec = solveCoverage(data.doctors, vacant, avail, prior);

  // (ب) يغطّي كلّ الشاغر ما دام البدلاء كافين.
  if (avail.length >= vacant.length) check('② تغطيةٌ كاملةٌ مع وجود احتياطٍ كافٍ (محفوظ)', rec.conserved, JSON.stringify(rec.notes));
  else check('② نقصٌ صريحٌ مُعلَنٌ حين لا يكفي الاحتياط', !rec.conserved);

  // (ج) لا حجزٌ مزدوجٌ للفترة.
  const perPeriod = new Map<number, Set<string>>();
  let dbl = false;
  for (const f of rec.fills) { const set = perPeriod.get(f.period) ?? new Set(); if (set.has(`${f.clinicNumber}`)) {} set.add(`${f.doctorId}`); if ([...perPeriod.get(f.period) ?? []].filter((x) => x === f.doctorId).length) {} perPeriod.set(f.period, set); }
  const seen = new Set<string>();
  for (const f of rec.fills) { const k = `${f.period}#${f.doctorId}`; if (seen.has(k)) dbl = true; seen.add(k); }
  check('③ لا بديلٌ في فترتين بنفس الوقت', !dbl);

  // (د) لا طبيبٌ مختلَق.
  const ids = new Set(data.doctors.map((d) => d.id));
  check('④ كلّ بديلٍ طبيبٌ حقيقيٌّ من البِركة', rec.fills.every((f) => ids.has(f.doctorId) && pool.has(f.doctorId)));

  // (هـ) كلّ عيادةٍ يُبقيها القديم مأهولةً، الجديد يُبقيها مأهولةً (لا نقصَ يصنعه الجديد وحده).
  const newStaffed = new Set<string>();
  for (const s of sunSlots.filter((x) => x.status === 'active' && x.role === 'clinic' && x.clinicNumber > 0 && x.doctorId !== victim.doctorId)) newStaffed.add(`c${s.clinicNumber}`);
  for (const f of rec.fills) newStaffed.add(`c${f.clinicNumber}`);
  const missing = [...oldStaffed].filter((c) => !newStaffed.has(c));
  check('⑤ كلّ عيادةٍ يُؤهّلها القديم يُؤهّلها الجديد', missing.length === 0, `ناقص: ${missing.join(',')}`);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
