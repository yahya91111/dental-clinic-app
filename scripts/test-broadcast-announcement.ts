/* الإبلاغ الحرّ — broadcast_announcement (الليدر فأعلى).
 *  (أ) المركز: يصل كلَّ أعضاء المركز عدا المُرسِل (تعميمٌ من النوع broadcast).
 *  (ب) الشفت: يصل أعضاءَ قروب القائد فقط (عدا المُرسِل)، لا غيرهم.
 *  (ج) الصلاحيّة: طبيبٌ عاديّ → Tool error (للقائد فأعلى فقط). */
import { supabase } from '../lib/supabase';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';
import { getAllGroupMembers } from '../lib/database';

const CID = '10000000-0000-0000-0000-000000000001';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];
const wipe = () => supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'broadcast');
const bcastRecipients = async (msg: string) => {
  const { data } = await supabase.from('notifications').select('recipient_id, body, title').eq('clinic_id', CID).eq('type', 'broadcast');
  return ((data || []) as { recipient_id: string; body: string; title: string }[]).filter((r) => r.body === msg);
};

(async () => {
  try {
    const d = (await loadScheduleData(CID, '2099-01-04')).data!;
    const { data: mem } = await getAllGroupMembers(CID);
    const members = (mem || []) as { doctor_id: string; group_id?: string; work_status?: string }[];
    const allIds = new Set(members.map((m) => m.doctor_id));
    const roster = d.doctors.map((x) => ({ id: x.id, name: x.name, groupKey: x.groupTemplate.key }));

    // اختر قائدًا (الفاعل) من group_a وله قروب
    const ga = d.doctors.find((x) => x.groupTemplate.key === 'group_a' && members.some((m) => m.doctor_id === x.id && m.group_id));
    if (!ga) { console.log('ℹ لا قائد group_a مناسب — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    const leaderGroupId = members.find((m) => m.doctor_id === ga.id)!.group_id!;
    const leaderCtx: Ctx = { clinicId: CID, user: { id: ga.id, name: ga.name, role: 'team_leader' }, roster };

    // ── (أ) المركز ──────────────────────────────────────────────
    await wipe();
    const MSG_A = 'اجتماعٌ غدًا الساعة ٨ صباحًا — اختبار التعميم (مركز).';
    const outA = await dispatchRequestToolV2('broadcast_announcement', { audience: 'center', message: MSG_A, title: 'تعميم' }, leaderCtx);
    check('(أ) الأداة نجحت (مركز)', !outA.startsWith('Tool error'), outA);
    const recA = await bcastRecipients(MSG_A);
    const recAset = new Set(recA.map((r) => r.recipient_id));
    check('(أ) لم يصل المُرسِل نفسه', !recAset.has(ga.id), 'وصل المُرسِل');
    check('(أ) وصل بقيّةَ أعضاء المركز', recAset.size === allIds.size - 1, `وصل ${recAset.size} / المتوقّع ${allIds.size - 1}`);
    check('(أ) كلّ المتلقّين من المركز', [...recAset].every((id) => allIds.has(id)), 'متلقٍّ خارج المركز');
    check('(أ) العنوان «تعميم»', recA.every((r) => r.title === 'تعميم'), recA[0]?.title);

    // ── (ب) الشفت ───────────────────────────────────────────────
    await wipe();
    const groupIds = new Set(members.filter((m) => m.group_id === leaderGroupId).map((m) => m.doctor_id));
    const MSG_B = 'تذكيرٌ لأعضاء الشفت — اختبار التعميم (شفت).';
    const outB = await dispatchRequestToolV2('broadcast_announcement', { audience: 'shift', message: MSG_B }, leaderCtx);
    check('(ب) الأداة نجحت (شفت)', !outB.startsWith('Tool error'), outB);
    const recB = new Set((await bcastRecipients(MSG_B)).map((r) => r.recipient_id));
    check('(ب) لم يصل المُرسِل', !recB.has(ga.id), 'وصل المُرسِل');
    check('(ب) المتلقّون كلُّهم من قروب القائد', [...recB].every((id) => groupIds.has(id)), 'متلقٍّ خارج القروب');
    check('(ب) عددهم = أعضاء القروب عدا القائد', recB.size === groupIds.size - 1, `وصل ${recB.size} / المتوقّع ${groupIds.size - 1}`);

    // ── (ج) الصلاحيّة ───────────────────────────────────────────
    await wipe();
    const doc = d.doctors.find((x) => x.id !== ga.id)!;
    const docCtx: Ctx = { clinicId: CID, user: { id: doc.id, name: doc.name, role: 'doctor' }, roster };
    const outC = await dispatchRequestToolV2('broadcast_announcement', { audience: 'center', message: 'محاولة طبيبٍ عاديّ' }, docCtx);
    check('(ج) الطبيب العاديّ يُرفَض (Tool error)', outC.startsWith('Tool error'), outC);
    const recC = await bcastRecipients('محاولة طبيبٍ عاديّ');
    check('(ج) لم يُرسَل شيءٌ من الطبيب العاديّ', recC.length === 0, `أُرسل ${recC.length}`);
  } finally {
    await wipe();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
