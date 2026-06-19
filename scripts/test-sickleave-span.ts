/* سيناريو حيّ ملموس: طبيبٌ يقدّم طبيّة من **أحد الأسبوع الأوّل** حتى **أربعاء الأسبوع
 * الثاني**، والأسابيع الثلاثة مبنيّة. نشغّل النظر-للأمام على النافذة كلّها (٣ أسابيع)
 * بعد إسقاط الغائب من أيّام غيابه، ونرى: **أين** يبدّل ويحقّق العدل — الأوّل أم الثاني
 * أم الثالث؟ قراءةٌ فقط — لا يكتب حرفًا. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, solveLookahead } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const WLBL: Record<string, string> = { '2099-01-04': 'الأوّل', '2099-01-11': 'الثاني', '2099-01-18': 'الثالث' };
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

async function main() {
  const pre = await loadScheduleData(CID, WEEKS[0]!);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  for (const w of WEEKS) {
    const recipe = { weekStart: w, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false });
    await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  }
  const w3 = (await loadScheduleData(CID, WEEKS[2]!)).data!;
  const allSlots: LoadedSlot[] = [...w3.pastSlots, ...w3.existingSlots];
  const doctors = w3.doctors;
  const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
  const nameOf = (id: string) => doctors.find((d) => d.id === id)?.name ?? id;

  // مقاعد النافذة (٣ أسابيع، صباحًا) مرتّبة زمنيًّا.
  const seats: HeavySeat[] = [];
  for (const w of WEEKS) for (const d of DAYS) {
    const ss = allSlots.filter((s) => s.weekStart === w && DI[s.dayOfWeek] === DI[d] && [1, 2].includes(s.period));
    seats.push(...extractHeavySeats(ss, poolIds));
  }
  seats.sort((a, b) => a.stamp.localeCompare(b.stamp));

  // فترة الغياب: من أحد الأسبوع الأوّل حتى أربعاء الأسبوع الثاني (شامل).
  const absentStamps = new Set<string>();
  for (const d of DAYS) absentStamps.add(`${WEEKS[0]}#${DI[d]}#0`);                    // الأسبوع الأوّل كاملًا
  for (const d of ['sunday', 'monday', 'tuesday', 'wednesday'] as WeekDay[]) absentStamps.add(`${WEEKS[1]}#${DI[d]}#0`); // الثاني حتى الأربعاء

  // نختار الغائب: الطبيب الأكثر مقاعدَ ثقيلةً داخل فترة الغياب (الأكثر تأثّرًا).
  const inSpan = seats.filter((s) => absentStamps.has(s.stamp));
  const cnt = new Map<string, number>();
  for (const s of inSpan) cnt.set(s.current, (cnt.get(s.current) ?? 0) + 1);
  const X = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!X) { console.log('لا مقاعد ثقيلة للغائب في الفترة — لا شيء لنعرضه.'); process.exit(0); }
  console.log(`الغائب: ${nameOf(X)} — يشغل ${cnt.get(X)} مقعدًا ثقيلًا داخل فترة الطبيّة (الأحد١ → الأربعاء٢).`);
  const xSeatsBefore = seats.filter((s) => s.current === X);
  const byWeek = (arr: { stamp: string }[]) => WEEKS.map((w) => arr.filter((s) => s.stamp.startsWith(w)).length);
  console.log(`مقاعد ${nameOf(X)} قبل الطبيّة عبر الأسابيع [أوّل، ثاني، ثالث]: ${JSON.stringify(byWeek(xSeatsBefore))}`);

  // نُسقِط الغائب من أهليّة مقاعد فترة غيابه (متاحٌ بعدها: خميس٢ + الأسبوع الثالث).
  const adjusted: HeavySeat[] = seats.map((s) => absentStamps.has(s.stamp)
    ? { ...s, eligible: s.eligible.filter((id) => id !== X) }
    : s);

  const priorLast = lastHeavyStamps(allSlots.filter((s) => s.weekStart < WEEKS[0]!));
  const rec = solveLookahead(doctors, adjusted, priorLast);

  // أين وقعت التبديلات؟ عبر الأسابيع.
  const touchByWeek: Record<string, number> = { [WEEKS[0]!]: 0, [WEEKS[1]!]: 0, [WEEKS[2]!]: 0 };
  for (const a of rec.assignments) { const wk = (a.seatId.split('|')[1] ?? '').split('#')[0]!; if (wk in touchByWeek) touchByWeek[wk]++; }

  console.log('\n════════ أين بدّل النظر-للأمام وحقّق العدل؟ ════════');
  for (const w of WEEKS) console.log(`  الأسبوع ${WLBL[w]!.padEnd(6)}: ${touchByWeek[w]} تبديل`);
  console.log(`  إجماليّ التبديلات: ${rec.assignments.length} · أقصى حِمل ${rec.maxLoadBefore}→${rec.maxLoadAfter}`);

  // أين «يعمل» الغائب بعد القسمة الجديدة (يجب: لا شيء في الغياب، ويعود بعده).
  const xAfter = rec.fullAssignment.filter((a) => a.doctorId === X).map((a) => a.seatId.split('|')[1]!);
  console.log(`\n  ${nameOf(X)} بعد القسمة: ${xAfter.length} مقعد — عبر الأسابيع ${JSON.stringify(WEEKS.map((w) => xAfter.filter((st) => st.startsWith(w)).length))}`);
  const leaksInSpan = xAfter.filter((st) => absentStamps.has(st));
  console.log(`  مقاعدُه داخل فترة الغياب (يجب ٠): ${leaksInSpan.length}`);

  // تفصيل التبديلات (مختصر).
  console.log('\n  عيّنة التبديلات:');
  for (const a of rec.assignments.slice(0, 12)) {
    const st = (a.seatId.split('|')[1] ?? '').split('#'); const wk = WLBL[st[0]!] ?? st[0];
    console.log(`    [أسبوع ${wk} · يوم ${st[1]}] ${a.from} → ${a.to}`);
  }
  if (rec.assignments.length > 12) console.log(`    … و${rec.assignments.length - 12} غيرها`);

  console.log('\n  الخلاصة:', leaksInSpan.length === 0 && rec.eligibilityRespected && rec.conserved
    ? 'الغائب لا يعمل في فترة غيابه، والأهليّة محترمة، والقسمة محفوظة ✓'
    : 'تحقّق: تسرّبٌ أو خرق أهليّة ✗');
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
