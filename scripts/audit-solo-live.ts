/* ج٢ — تدقيقُ ظلٍّ للمحرّك الحيّ (للقراءة): غيابُ طبيبٍ واحدٍ عدّةَ أيّامٍ متتالية —
 * من يحمل «الانفراد» كلَّ يوم؟ هل يتركّز على شخصٍ واحد؟ وهل يُعوَّض براحةٍ (احتياط)؟
 * لا يكتب شيئًا دائمًا — يبني، يقيس، ثمّ يُعيد البناء (يُرمَّم في النهاية). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];
const DAY_AR: Record<string, string> = { sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };

async function buildWeek() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, traineeModes: tm } as Parameters<typeof schedule.build>[0];
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}

/** المنفردون في نصف الصباح (ف١،٢) ليومٍ ما: طبيبٌ نشطٌ في عيادةٍ في الفترتين معًا. */
function solosOfDay(slots: { dayOfWeek: string; doctorId: string; doctorName: string; clinicNumber: number; period: number; role: string; status: string }[], day: string): { id: string; name: string; clinic: number }[] {
  const rows = slots.filter((s) => s.dayOfWeek === day && s.status === 'active' && s.role === 'clinic' && (s.period === 1 || s.period === 2) && s.clinicNumber > 0);
  const byDocClinic = new Map<string, Set<number>>();
  const nameOf = new Map<string, string>();
  for (const s of rows) { const k = `${s.doctorId}|${s.clinicNumber}`; const e = byDocClinic.get(k) ?? new Set(); e.add(s.period); byDocClinic.set(k, e); nameOf.set(s.doctorId, s.doctorName); }
  const out: { id: string; name: string; clinic: number }[] = [];
  for (const [k, ps] of byDocClinic) if (ps.has(1) && ps.has(2)) { const [id, c] = k.split('|'); out.push({ id: id!, name: nameOf.get(id!)!, clinic: Number(c) }); }
  return out;
}

(async () => {
  try {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
    const d = (await loadScheduleData(CID, W)).data!;
    const roster = d.doctors.map((x) => ({ id: x.id, name: x.name, groupKey: x.groupTemplate.key }));
    const idx = (id: string) => roster.findIndex((r) => r.id === id) + 1;

    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday'];
    // طبيبُ عيادةٍ صباحيّ (group_a) نشطٌ في الفترة ٢ كلَّ الأيّام — نُغيّبه أربعةَ أيّامٍ متتالية.
    const morn = d.existingSlots.filter((s) => s.status === 'active' && s.role === 'clinic' && s.period === 2 && s.dayOfWeek === 'sunday');
    const pool = new Set(d.doctors.filter((x) => x.groupTemplate.key !== 'board' && x.workStatus !== 'trainee' && x.workStatus !== 'light_duty').map((x) => x.id));
    const victim = morn.find((s) => pool.has(s.doctorId));
    if (!victim) { console.log('ℹ لا ضحيّة مناسبة — تخطّي.'); return; }
    const vId = victim.doctorId; const vName = victim.doctorName;
    const ctx: Ctx = { clinicId: CID, user: { id: vId, name: vName, role: 'doctor' }, roster };

    console.log(`\nالضحيّة: ${vName} — غيابٌ مرضيٌّ ${DAYS.map((x) => DAY_AR[x]).join('، ')}\n`);
    const soloCount = new Map<string, number>();
    const restDays = new Map<string, number>();
    for (const day of DAYS) {
      await dispatchRequestToolV2('set_schedule_status', { doctorIndex: idx(vId), day, status: 'sick_leave', weekStart: W }, ctx);
      const after = (await loadScheduleData(CID, W)).data!.existingSlots;
      const solos = solosOfDay(after, day);
      for (const s of solos) soloCount.set(s.name, (soloCount.get(s.name) ?? 0) + 1);
      // راحاتُ اليوم (احتياط صباحيّ غير الضحيّة)
      const rests = [...new Set(after.filter((s) => s.dayOfWeek === day && s.status === 'extra' && s.clinicNumber === 1 && s.doctorId !== vId).map((s) => s.doctorName))];
      for (const r of rests) restDays.set(r, (restDays.get(r) ?? 0) + 1);
      console.log(`${DAY_AR[day]}: منفردون=[${solos.map((s) => `${s.name.split(' ')[0]}@ع${s.clinic}`).join('، ') || '—'}] · راحات=[${rests.map((r) => r.split(' ')[0]).join('، ') || '—'}]`);
    }
    console.log('\n— تركيز الانفراد عبر الأيّام —');
    const sc = [...soloCount.entries()].sort((a, b) => b[1] - a[1]);
    if (!sc.length) console.log('  لا انفرادَ تكوّن (التغطية بالاحتياط استوعبت الغياب).');
    for (const [n, c] of sc) console.log(`  ${n}: ${c} مرّة${restDays.get(n) ? ` · راحات=${restDays.get(n)}` : ' · بلا راحة'}`);
    const maxSolo = sc.length ? sc[0]![1] : 0;
    const total = [...soloCount.values()].reduce((a, b) => a + b, 0);
    console.log(`\nالخلاصة: مجموع الانفرادات=${total} · أقصى تركيزٍ على شخص=${maxSolo} · عددُ مَن حملوه=${sc.length}`);
    console.log(maxSolo > 1 && sc.length === 1 ? '⚠ تركيزٌ على شخصٍ واحد (مرشّحٌ للتدوير إن وُجد فائض).' : 'ℹ موزّعٌ أو مُجبَر/مُستوعَب.');
  } finally {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
