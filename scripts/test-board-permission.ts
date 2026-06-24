/* استئذان/غياب البورد: طبيبا البورد يتقاسمان عيادتهما (ف أولى/ثانية).
 *  • كلاهما بداية → كلاهما الفترة الثانية معًا، والأولى تُغطّى بأيّ طبيب (لا بورد متاح).
 *  • كلاهما نهاية → كلاهما الأولى معًا، والثانية تُغطّى.
 *  • واحدٌ يستأذن فقط → الاثنان يغطّيان الفترتين بأنفسهما (لا عاديّ).
 *  • واحدٌ مرضيّة → الآخر يبقى، وفترةُ الغائب تُغطّى بأيّ طبيب.
 *  والبورد لا يخرج من عيادته، ولا يُسحَب لتبديل استئذانِ طبيبٍ عاديّ. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { setScheduleStatus, cancelStatus } from '../lib/algorithms/requests_v2';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + d); } };

async function build() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false });
}

type Ctx = { day: WeekDay; cn: number; pA: number; pB: number; bFirst: string; bSecond: string; boardIds: Set<string>; traineeIds: Set<string>; byId: Map<string, any> };
async function freshPair(): Promise<Ctx | null> {
  await build();
  const data = (await loadScheduleData(CID, W)).data!;
  const byId = new Map(data.doctors.map((d) => [d.id, d]));
  const boardIds = new Set(data.doctors.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id));
  const traineeIds = new Set(data.doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
  for (const day of DAYS) for (let c = 1; c <= 3; c++) for (const [pA, pB] of [[1, 2], [3, 4]]) {
    const a = data.existingSlots.find((s) => s.dayOfWeek === day && s.clinicNumber === c && s.period === pA && s.status === 'active' && s.role === 'clinic' && boardIds.has(s.doctorId));
    const b = data.existingSlots.find((s) => s.dayOfWeek === day && s.clinicNumber === c && s.period === pB && s.status === 'active' && s.role === 'clinic' && boardIds.has(s.doctorId));
    if (a && b && a.doctorId !== b.doctorId) return { day, cn: c, pA, pB, bFirst: a.doctorId, bSecond: b.doctorId, boardIds, traineeIds, byId };
  }
  return null;
}
const occ = (rows: any[], ctx: Ctx, p: number) => rows.filter((s) => s.dayOfWeek === ctx.day && s.clinicNumber === ctx.cn && s.period === p && s.status === 'active' && s.role === 'clinic').map((s) => s.doctorId);
const actorOf = (data: any) => ({ id: data.doctors[0].id, role: 'super_admin' });

(async () => {
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  try {
    // ── كلاهما بداية ──
    let ctx = await freshPair();
    if (!ctx) { console.log('لا زوجَ بورد — تخطّي'); process.exit(0); }
    let actor = actorOf((await loadScheduleData(CID, W)).data!);
    for (const id of [ctx.bFirst, ctx.bSecond]) await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: ctx.day, doctorId: id, doctorName: ctx.byId.get(id).name, status: 'permission_start', shift: ctx.pA <= 2 ? 'morning' : 'evening' });
    let rows = (await loadScheduleData(CID, W)).data!.existingSlots;
    let second = occ(rows, ctx, ctx.pB); let first = occ(rows, ctx, ctx.pA);
    check('[بداية×٢] كلا البوردَين في الفترة الثانية معًا', second.includes(ctx.bFirst) && second.includes(ctx.bSecond), JSON.stringify(second.map((i) => ctx!.byId.get(i)?.name)));
    check('[بداية×٢] الفترة الأولى مُغطّاة بطبيبٍ غير بورد (لا فارغة)', first.length === 1 && !ctx.boardIds.has(first[0]) && !ctx.traineeIds.has(first[0]), JSON.stringify(first.map((i) => ctx!.byId.get(i)?.name)));

    // ── كلاهما نهاية ──
    ctx = await freshPair(); actor = actorOf((await loadScheduleData(CID, W)).data!);
    for (const id of [ctx!.bFirst, ctx!.bSecond]) await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: ctx!.day, doctorId: id, doctorName: ctx!.byId.get(id).name, status: 'permission_end', shift: ctx!.pA <= 2 ? 'morning' : 'evening' });
    rows = (await loadScheduleData(CID, W)).data!.existingSlots;
    first = occ(rows, ctx!, ctx!.pA); second = occ(rows, ctx!, ctx!.pB);
    check('[نهاية×٢] كلا البوردَين في الفترة الأولى معًا', first.includes(ctx!.bFirst) && first.includes(ctx!.bSecond), JSON.stringify(first.map((i) => ctx!.byId.get(i)?.name)));
    check('[نهاية×٢] الفترة الثانية مُغطّاة بطبيبٍ غير بورد (تصحيحك)', second.length === 1 && !ctx!.boardIds.has(second[0]) && !ctx!.traineeIds.has(second[0]), JSON.stringify(second.map((i) => ctx!.byId.get(i)?.name)));

    // ── واحدٌ يستأذن فقط (بداية) ──
    ctx = await freshPair(); actor = actorOf((await loadScheduleData(CID, W)).data!);
    await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: ctx!.day, doctorId: ctx!.bFirst, doctorName: ctx!.byId.get(ctx!.bFirst).name, status: 'permission_start', shift: ctx!.pA <= 2 ? 'morning' : 'evening' });
    rows = (await loadScheduleData(CID, W)).data!.existingSlots;
    first = occ(rows, ctx!, ctx!.pA); second = occ(rows, ctx!, ctx!.pB);
    check('[بداية×١] الفترتان مأهولتان بالبوردَين أنفسهما (لا عاديّ)', first.length === 1 && second.length === 1 && ctx!.boardIds.has(first[0]) && ctx!.boardIds.has(second[0]), `ف${ctx!.pA}=${first.map((i)=>ctx!.byId.get(i)?.name)} ف${ctx!.pB}=${second.map((i)=>ctx!.byId.get(i)?.name)}`);

    // ── واحدٌ مرضيّة ──
    ctx = await freshPair(); actor = actorOf((await loadScheduleData(CID, W)).data!);
    await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: ctx!.day, doctorId: ctx!.bFirst, doctorName: ctx!.byId.get(ctx!.bFirst).name, status: 'sick_leave', shift: ctx!.pA <= 2 ? 'morning' : 'evening' });
    rows = (await loadScheduleData(CID, W)).data!.existingSlots;
    first = occ(rows, ctx!, ctx!.pA); second = occ(rows, ctx!, ctx!.pB);
    const sickIn = rows.some((s) => s.dayOfWeek === ctx!.day && s.doctorId === ctx!.bFirst && s.status === 'active' && s.role === 'clinic');
    check('[مرضيّة×١] المريض خرج من العيادة', !sickIn);
    check('[مرضيّة×١] الآخر باقٍ في فترته', second.includes(ctx!.bSecond) || first.includes(ctx!.bSecond));
    check('[مرضيّة×١] فترةُ الغائب مُغطّاة بطبيبٍ غير بورد', first.length === 1 && !ctx!.boardIds.has(first[0]) && !ctx!.traineeIds.has(first[0]), JSON.stringify(first.map((i) => ctx!.byId.get(i)?.name)));

    // ── الإلغاء يعيد الانقسام الأصليّ + المُغطّي للاحتياط ──
    ctx = await freshPair(); actor = actorOf((await loadScheduleData(CID, W)).data!);
    const sh: Shift = ctx!.pA <= 2 ? 'morning' : 'evening';
    const exCol = ctx!.pA <= 2 ? 1 : 2;
    for (const id of [ctx!.bFirst, ctx!.bSecond]) await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: ctx!.day, doctorId: id, doctorName: ctx!.byId.get(id).name, status: 'permission_start', shift: sh });
    rows = (await loadScheduleData(CID, W)).data!.existingSlots;
    const coverId = occ(rows, ctx!, ctx!.pA).find((i) => !ctx!.boardIds.has(i)); // العاديّ الذي غطّى ف الأولى
    for (const id of [ctx!.bSecond, ctx!.bFirst]) await cancelStatus(actor, { clinicId: CID, weekStart: W, day: ctx!.day, doctorId: id, restoreToPrevPlace: true });
    rows = (await loadScheduleData(CID, W)).data!.existingSlots;
    first = occ(rows, ctx!, ctx!.pA); second = occ(rows, ctx!, ctx!.pB);
    check('[إلغاء] عاد الانقسام: بوردٌ في الأولى وآخرُ في الثانية', first.length === 1 && second.length === 1 && ctx!.boardIds.has(first[0]) && ctx!.boardIds.has(second[0]) && first[0] !== second[0], `ف${ctx!.pA}=${first.map((i)=>ctx!.byId.get(i)?.name)} ف${ctx!.pB}=${second.map((i)=>ctx!.byId.get(i)?.name)}`);
    const coverBack = !coverId || rows.some((s) => s.dayOfWeek === ctx!.day && s.doctorId === coverId && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
    check('[إلغاء] المُغطّي العاديّ عاد احتياطًا', coverBack, `cover=${coverId ? ctx!.byId.get(coverId)?.name : '—'}`);
    const prevLeft = rows.some((s) => s.dayOfWeek === ctx!.day && s.clinicNumber === ctx!.cn && s.role === 'prev_placement' && ctx!.boardIds.has(s.doctorId));
    check('[إلغاء] لا حفظَ (prev_placement) متبقٍّ للبورد', !prevLeft);
  } finally {
    await build();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
