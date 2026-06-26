/* ج١ — أمانُ إعادة البناء الجزئيّة (fromDay): إعادةُ بناءٍ جزئيّةٌ **بلا تغيير القائمة**
 * يجب أن تُنتج أسبوعًا **مطابقًا تمامًا** للبناء الكامل — وهذا يُثبت أنّ تغذية الأيّام
 * السابقة كتاريخٍ تُموضِع العجلةَ بدقّة (محاذاةٌ صحيحة، لا انحراف). نختبر لكلّ يومِ بداية:
 *  (أ) الأيّام السابقة لـfromDay لم تُمسّ.
 *  (ب) الأيّام من fromDay مطابقةٌ للبناء الكامل (نفس التوزيع). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, WEEK_DAYS } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

function recipe(fromDay?: string) {
  const aShiftPlan = Object.fromEntries(WEEK_DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  return { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, ...(fromDay ? { fromDay } : {}) } as Parameters<typeof schedule.build>[0];
}
async function buildFull() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  await schedule.build({ ...recipe(), traineeModes: tm, dryRun: false } as Parameters<typeof schedule.build>[0]);
}
async function buildFrom(fromDay: string) {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  return schedule.build({ ...recipe(fromDay), traineeModes: tm, dryRun: false } as Parameters<typeof schedule.build>[0]);
}
/** بصمةُ يومٍ: صفوفُ البناء (نشط عيادة/دليقيتر + احتياط) مرتّبة. */
async function daySig(): Promise<Map<string, string>> {
  const slots = (await loadScheduleData(CID, W)).data!.existingSlots
    .filter((s) => (s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')) || s.status === 'extra');
  const byDay = new Map<string, string[]>();
  for (const s of slots) {
    const k = `${s.period}|${s.clinicNumber}|${s.role}|${s.status}|${s.doctorId}`;
    (byDay.get(s.dayOfWeek) ?? byDay.set(s.dayOfWeek, []).get(s.dayOfWeek)!).push(k);
  }
  const out = new Map<string, string>();
  for (const [day, arr] of byDay) out.set(day, arr.sort().join(' ; '));
  return out;
}

(async () => {
  try {
    for (const fromDay of ['monday', 'tuesday', 'wednesday', 'thursday']) {
      await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
      await buildFull();
      const full = await daySig();
      const r = await buildFrom(fromDay);
      const after = await daySig();
      const fi = WEEK_DAYS.indexOf(fromDay as typeof WEEK_DAYS[number]);
      const before = WEEK_DAYS.slice(0, fi), reb = WEEK_DAYS.slice(fi);
      check(`[${fromDay}] البناء الجزئيّ نجح`, r.success, r.summary);
      const untouched = before.every((d) => (full.get(d) ?? '') === (after.get(d) ?? ''));
      check(`[${fromDay}] الأيّام السابقة (${before.join('،') || '—'}) لم تُمسّ`, untouched,
        before.find((d) => (full.get(d) ?? '') !== (after.get(d) ?? '')) || '');
      const same = reb.every((d) => (full.get(d) ?? '') === (after.get(d) ?? ''));
      const diffDay = reb.find((d) => (full.get(d) ?? '') !== (after.get(d) ?? ''));
      check(`[${fromDay}] الأيّام المُعادة (${reb.join('،')}) مطابقةٌ للبناء الكامل`, same,
        diffDay ? `${diffDay}\n  full=${full.get(diffDay)}\n  part=${after.get(diffDay)}` : '');
    }
  } finally {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildFull();
    await schedule.saveBuildConfig({ ...recipe(), dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
