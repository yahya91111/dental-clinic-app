/* محكُّ غياب عضوِ «زوج الاستضافة» (host couple) — يُعيد إنتاج العطل ثمّ يتحقّق من الحلّ.
 * الحالة (من تجربة المستخدم الحيّة): طبيبٌ يعمل عيادةً في فترةٍ ويستضيف في الأخرى
 * (نفس الشفت). غيابُه + رفضُ الاحتياط («لا أحد») يُنتج: ازدواجَ دورٍ للشريك (عيادة+دليقيتر
 * في الفترة ذاتها) + استضافةً فارغة. الحدّ الجديد المفقود: «لا طبيبٌ عيادةً ودليقيترًا معًا».
 *   set -a; . ./.env; set +a; npx tsx scripts/test-host-couple.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const LEADER = { id: 'leader-test', role: 'team_leader' as const };
const W = '2099-09-27';
let pass = 0; let fail = 0; const fails: string[] = [];
function inv(scn: string, name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; const m = `[${scn}] ${name}${detail ? ' — ' + detail : ''}`; fails.push(m); console.log(`    ❌ ${m}`); }
}
const fn = (s?: string) => (s || '').split(' ')[0];

type R = { id: string; doctor_id: string; doctor_name: string; period: number; clinic_number: number; role: string; status: string; day_of_week: string };
async function rows(day?: string): Promise<R[]> {
  let q = supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', W);
  if (day) q = q.eq('day_of_week', day);
  const { data } = await q; return (data || []) as R[];
}
async function cleanWeek() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W); }
async function build() {
  await cleanWeek();
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d: any) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false } as any).catch((e: any) => console.log('  build err', e?.message));
}
async function setStatus(id: string, name: string, day: string, status: string, shift: Shift = 'morning') {
  return requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: W, day: day as any, doctorId: id, doctorName: name, status: status as any, shift } as any);
}
async function coverExclude(cause?: { day: string; doctorId: string }) {
  const sh = await import('../lib/algorithms/solver_shadow');
  const { withXdayJournal } = await import('../lib/algorithms/requests_v2');
  const run = async () => {
    const c = await sh.applyCoverage({ clinicId: CID, weekStart: W, label: 'زوج' }, { specialReserves: 'exclude' });
    await sh.applyReserveRepay({ clinicId: CID, weekStart: W, label: 'زوج' }, sh.reservePairsFromMoves(c.moves));
    await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: W, label: 'زوج' });
    return c;
  };
  // كالأداة الحقيقيّة: نلفّ التغطية بيوميّات الأثر كي يعكسها الكنسل (يشمل يوم الحدث الآن).
  return cause ? withXdayJournal(CID, W, cause, run) : run();
}
// بصمةُ يومٍ (عيادة/استضافة نشطة + احتياط، باستثناء المتدرّبين) — للكنسل الحرفيّ.
function daySig(all: R[], day: string, trainees: Set<string>): string {
  return all.filter((r) => r.day_of_week === day && !trainees.has(r.doctor_id)
    && ((r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator')) || (r.status === 'extra' && r.period === 0)))
    .map((r) => `${r.status}|${r.role}|p${r.period}|c${r.clinic_number}|${r.doctor_id}`).sort().join('\n');
}

// ── الحدود الصارمة (تشمل الحدّ الجديد) ──
function checkInvariants(scn: string, all: R[], doctors: any[]) {
  const trainee = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
  const board = new Set(doctors.filter((d) => d.groupTemplate?.key === 'board').map((d) => d.id));
  for (const day of DAYS) {
    const dr = all.filter((r) => r.day_of_week === day);
    if (!dr.some((r) => r.status === 'active' && r.period > 0)) continue;
    for (const r of dr.filter((r) => r.status === 'sick_leave' || r.status === 'vacation')) {
      const working = dr.some((w) => w.doctor_id === r.doctor_id && w.status === 'active' && w.period > 0 && (w.role === 'clinic' || w.role === 'delegator'));
      inv(scn, `لا غائبٌ في خانةٍ نشطة (${AR[day]})`, !working, fn(r.doctor_name));
    }
    // ازدواجُ عيادة
    const seat = new Map<string, string[]>();
    for (const r of dr.filter((r) => r.status === 'active' && r.role === 'clinic' && r.period > 0 && r.clinic_number > 0 && !trainee.has(r.doctor_id))) {
      const k = `${r.period}|${r.clinic_number}`; (seat.get(k) ?? seat.set(k, []).get(k)!).push(r.doctor_id);
    }
    for (const [k, ids] of seat) inv(scn, `لا ازدواجَ عيادةٍ (${AR[day]} ${k})`, new Set(ids).size <= 1, `${ids.length}`);
    // استضافةٌ واحدة/فترة
    for (const p of [1, 2, 3, 4]) {
      const dels = [...new Set(dr.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === p && !trainee.has(r.doctor_id) && !board.has(r.doctor_id)).map((r) => r.doctor_id))];
      inv(scn, `استضافةٌ واحدةٌ كحدٍّ أقصى (${AR[day]} ف${p})`, dels.length <= 1, `${dels.length}`);
    }
    // ★ الحدّ الجديد: لا طبيبٌ عيادةً ودليقيترًا في الفترة ذاتها (الازدواج المكتشَف)
    for (const p of [1, 2, 3, 4]) {
      const clinicDocs = new Set(dr.filter((r) => r.status === 'active' && r.role === 'clinic' && r.period === p && r.clinic_number > 0 && !trainee.has(r.doctor_id)).map((r) => r.doctor_id));
      const delDocs = dr.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === p && !trainee.has(r.doctor_id)).map((r) => r.doctor_id);
      for (const d of delDocs) inv(scn, `لا طبيبٌ عيادةً ودليقيترًا معًا (${AR[day]} ف${p})`, !clinicDocs.has(d), fn(doctors.find((x: any) => x.id === d)?.name));
    }
  }
}

// عضو زوج الاستضافة: طبيب بِركةٍ له عيادةٌ نشطةٌ في فترةٍ + استضافةٌ نشطةٌ في الأخرى (نفس النصف).
function coupleMember(dr: R[], half: 0 | 1, pool: Set<string>) {
  const periods = half === 0 ? [1, 2] : [3, 4];
  for (const id of pool) {
    const clinic = dr.find((r) => r.doctor_id === id && r.status === 'active' && r.role === 'clinic' && r.clinic_number > 0 && periods.includes(r.period));
    const host = dr.find((r) => r.doctor_id === id && r.status === 'active' && r.role === 'delegator' && periods.includes(r.period));
    if (clinic && host && clinic.period !== host.period) {
      return { id, clinicP: clinic.period, clinicNum: clinic.clinic_number, hostP: host.period };
    }
  }
  return null;
}

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 2;
  try {
    for (const cc of [2, 3, 4]) {
      console.log(`\n════════ ${cc} عيادات ════════`);
      await supabase.from('schedule_settings').update({ clinic_count: cc }).eq('clinic_id', CID);
      const { data } = await loadScheduleData(CID, W);
      const doctors = data?.doctors ?? [];
      const pool = new Set(doctors.filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d: any) => d.id));
      const nameOf = (id: string) => doctors.find((d: any) => d.id === id)?.name || '';
      await build();
      // ابحث عن يومٍ فيه عضوُ زوجِ استضافةٍ في الصباح
      let found = false;
      for (const day of DAYS) {
        const dr = await rows(day);
        const cm = coupleMember(dr, 0, pool);
        if (!cm) continue;
        found = true;
        const trainees = new Set<string>(doctors.filter((d: any) => d.workStatus === 'trainee').map((d: any) => d.id));
        const baseSig = daySig(await rows(), day, trainees); // بصمةُ اليوم قبل الغياب
        console.log(`\n══ ${cc}ع/${AR[day]}: غياب عضو زوج الاستضافة ${fn(nameOf(cm.id))} (عيادة${cm.clinicNum} ف${cm.clinicP} + استضافة ف${cm.hostP}) ══`);
        await setStatus(cm.id, nameOf(cm.id), day, 'sick_leave', 'morning');
        await coverExclude({ day, doctorId: cm.id });
        const after = await rows();
        checkInvariants(`${cc}ع/${AR[day]}`, after, doctors);
        // اطبع شبكة اليوم للتشخيص
        const ad = after.filter((r) => r.day_of_week === day);
        for (const p of [1, 2]) {
          const clin = ad.filter((r) => r.status === 'active' && r.role === 'clinic' && r.period === p && r.clinic_number > 0).sort((a, b) => a.clinic_number - b.clinic_number);
          const del = ad.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === p);
          console.log(`   ف${p}: عيادات[${clin.map((r) => `ع${r.clinic_number}:${fn(r.doctor_name)}`).join(' | ')}] دليقيتر[${del.map((r) => fn(r.doctor_name)).join(',') || '— فارغ —'}]`);
        }
        // كنسل عودة الغائب — يعكس البصمة المرنة (يعود المُسقِطُ لاستضافته وتزول ترقياتُ الجيران).
        await requestsV2.cancelStatus(LEADER, { clinicId: CID, weekStart: W, day: day as any, doctorId: cm.id, restoreToPrevPlace: true } as any).catch(() => ({}));
        checkInvariants(`${cc}ع/${AR[day]}/كنسل`, await rows(), doctors);
        const back = (await rows(day)).some((r) => r.doctor_id === cm.id && r.status === 'active' && r.period > 0);
        inv(`${cc}ع/${AR[day]}/كنسل`, 'الغائبُ عاد إلى الجدول بعد الكنسل', back);
        // ★ الإرجاع والعدل: بصمةُ اليوم بعد الكنسل = قبل الغياب حرفيًّا (لا استضافةٌ عالقة، العدلُ مُستعاد).
        inv(`${cc}ع/${AR[day]}/كنسل`, 'بصمةُ اليوم عادت للأساس حرفيًّا (إرجاعٌ وعدلٌ تامّ)', daySig(await rows(), day, trainees) === baseSig,
          daySig(await rows(), day, trainees) === baseSig ? '' : 'انحرافٌ عن الأساس');
        // إعادة التوازن بعد الكنسل (المسار الحيّ يستدعيها) يجب ألّا تُفسد مسار الزوج.
        let returnShift: Shift | null = null;
        try { returnShift = await schedule.placementShift({ clinicId: CID, weekStart: W, day: day as any, doctorId: cm.id }); } catch { /* لا مكان */ }
        if (returnShift) await schedule.rebalanceForward({ clinicId: CID, weekStart: W, fromDay: day as any, fromShift: returnShift, today: W } as any).catch(() => {});
        checkInvariants(`${cc}ع/${AR[day]}/كنسل+توازن`, await rows(), doctors);
        break;
      }
      if (!found) console.log('  لا زوجَ استضافةٍ في هذا البناء — تخطّي');
    }
  } finally {
    await cleanWeek();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  console.log(`\n════════ النتيجة: ${pass} حدٌّ سليم / ${fail} خرق ════════`);
  if (fails.length) { console.log('الخروق:'); for (const f of fails) console.log('  • ' + f); }
  else console.log('✅ لا خرق.');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
