/* ج٢ — حسمُ محوري «الاحتياط بالأقدميّة» و«تدوير البورد» (طويلا الأمد): يبنيهما قلبُ
 * البناء (العجلة) عبر الأسابيع لا التفاعل. نبني ٦ أسابيع متتالية ونقيس التوزيع:
 *  • راحة الاحتياط: كم يومًا ارتاح (extra) كلُّ طبيبِ بِركة → الفرق (max-min) يجب أن يكون صغيرًا.
 *  • الاستضافة (دليقيتر): توزيعُها على البِركة → فرقٌ صغير.
 *  • تدوير البورد: استضافةُ كلِّ بورديٍّ → فرقٌ صغير.
 * فرقٌ ≤ ٢ عبر ٦ أسابيع = تدويرٌ عادلٌ (المحور مُدارٌ في البناء). للقراءة، يُرمّم في النهاية. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18', '2099-01-25', '2099-02-01', '2099-02-08'];

async function buildWeek(W: string) {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, traineeModes: tm } as Parameters<typeof schedule.build>[0];
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}
const spread = (m: Map<string, number>) => { const v = [...m.values()]; return v.length ? Math.max(...v) - Math.min(...v) : 0; };
const dump = (title: string, m: Map<string, number>, nameOf: Map<string, string>) => {
  console.log(`\n${title} (فرق=${spread(m)}):`);
  for (const [id, c] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${(nameOf.get(id) || id).padEnd(22)} ${c}`);
};

(async () => {
  try {
    for (const W of WEEKS) { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W); await buildWeek(W); }
    const d0 = (await loadScheduleData(CID, WEEKS[0]!)).data!;
    const nameOf = new Map(d0.doctors.map((x) => [x.id, x.name]));
    const groupOf = new Map(d0.doctors.map((x) => [x.id, x.groupTemplate.key]));
    const statusOf = new Map(d0.doctors.map((x) => [x.id, x.workStatus]));
    const isBoard = new Set(d0.doctors.filter((x) => x.groupTemplate.key === 'board').map((x) => x.id));
    const pool = new Set(d0.doctors.filter((x) => x.groupTemplate.key !== 'board' && x.workStatus !== 'trainee' && x.workStatus !== 'light_duty').map((x) => x.id));

    const rest = new Map<string, number>();   // أيّام الاحتياط (extra)
    const host = new Map<string, number>();    // أيّام الاستضافة (delegator)
    const clinicD = new Map<string, number>(); // أيّام العيادة (تحديدُ الشفت الفعليّ للطبيب)
    const boardHost = new Map<string, number>();
    for (const id of pool) { rest.set(id, 0); host.set(id, 0); clinicD.set(id, 0); }
    for (const id of isBoard) boardHost.set(id, 0);

    for (const W of WEEKS) {
      const slots = (await loadScheduleData(CID, W)).data!.existingSlots;
      const seenRest = new Set<string>(), seenHost = new Set<string>(), seenClin = new Set<string>();
      for (const s of slots) {
        if (s.status === 'extra' && pool.has(s.doctorId)) { const k = `${s.doctorId}|${s.dayOfWeek}`; if (!seenRest.has(k)) { seenRest.add(k); rest.set(s.doctorId, (rest.get(s.doctorId) ?? 0) + 1); } }
        if (s.status === 'active' && s.role === 'clinic' && s.clinicNumber > 0 && pool.has(s.doctorId)) { const k = `${s.doctorId}|${s.dayOfWeek}`; if (!seenClin.has(k)) { seenClin.add(k); clinicD.set(s.doctorId, (clinicD.get(s.doctorId) ?? 0) + 1); } }
        if (s.status === 'active' && s.role === 'delegator') {
          const k = `${s.doctorId}|${s.dayOfWeek}|${s.period <= 2 ? 'ص' : 'م'}`;
          if (seenHost.has(k)) continue; seenHost.add(k);
          if (pool.has(s.doctorId)) host.set(s.doctorId, (host.get(s.doctorId) ?? 0) + 1);
          if (isBoard.has(s.doctorId)) boardHost.set(s.doctorId, (boardHost.get(s.doctorId) ?? 0) + 1);
        }
      }
    }
    // الشفتُ الفعليّ لكلّ طبيبٍ = مجموعتُه؛ نقيس التوزيع **داخل كلّ شفت** بين مشاركيه فقط.
    console.log(`\n════ تدويرُ البناء عبر ${WEEKS.length} أسابيع — داخل كلّ شفت ════`);
    let worst = 0;
    for (const g of ['group_a', 'group_b'] as const) {
      const ids = [...pool].filter((id) => groupOf.get(id) === g && ((rest.get(id) ?? 0) + (host.get(id) ?? 0) + (clinicD.get(id) ?? 0)) > 0);
      const sub = (m: Map<string, number>) => new Map(ids.map((id) => [id, m.get(id) ?? 0]));
      const rs = spread(sub(rest)), hs = spread(sub(host)), bp = ids.map((id) => (rest.get(id) ?? 0) + (host.get(id) ?? 0) + (clinicD.get(id) ?? 0));
      worst = Math.max(worst, rs, hs);
      console.log(`\n— شفت ${g} (${ids.length} طبيبًا مشاركًا) —`);
      for (const id of ids.sort((a, b) => (rest.get(b)! - rest.get(a)!))) console.log(`  ${(nameOf.get(id) || id).padEnd(20)} راحة=${rest.get(id)} · استضافة=${host.get(id)} · عيادة=${clinicD.get(id)} · مجموع=${(rest.get(id) ?? 0) + (host.get(id) ?? 0) + (clinicD.get(id) ?? 0)}`);
      console.log(`  ↳ فرق الراحة=${rs} · فرق الاستضافة=${hs} · مجموعُ الأيّام [${Math.min(...bp)}..${Math.max(...bp)}]`);
    }
    console.log(`\nتدوير البورد (استضافة): فرق=${spread(boardHost)} — [${[...boardHost.values()].join('، ')}] (بورد all_morning خارج عجلة الاستضافة عمدًا)`);
    console.log(`\nالحُكم: أسوأُ فرقٍ داخل شفتٍ (راحة/استضافة)=${worst}`);
    console.log(worst <= 1 ? '✅ تدويرٌ عادلٌ داخل كلّ شفت — محورا الاحتياط والاستضافة يديرهما البناءُ بعدل (لا فجوة).' : '⚠ فرقٌ داخل شفت — يستحقّ نظرًا.');
  } finally {
    for (const W of WEEKS) { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W); await buildWeek(W); }
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
