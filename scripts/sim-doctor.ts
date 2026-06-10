// محاكاة هاتفٍ آخر: طبيبٌ يقدّم طلبًا عبر **نفس المسار الحقيقيّ** (الموزّع → المحرّك
// → إشعارات القائد → تريغر الدفع في قاعدة البيانات) — فيصلك الإشعار على هاتفك.
//
// أمثلة:
//   npx tsx --env-file=.env scripts/sim-doctor.ts "أحمد" sick_leave monday
//   npx tsx --env-file=.env scripts/sim-doctor.ts "أحمد" vacation tuesday 2026-06-07
//   npx tsx --env-file=.env scripts/sim-doctor.ts "أحمد" cancel monday
//
// الحالات: sick_leave | vacation | permission_start | permission_end | extra | cancel
// اليوم:   sunday..thursday (أو بالعربيّة: الأحد..الخميس)
// الأسبوع: اختياريّ YYYY-MM-DD (افتراضيًّا أحدُ الأسبوع الحاليّ)

import { supabase } from '../lib/supabase';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

const DAY_MAP: Record<string, string> = {
  sunday: 'sunday', monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday', thursday: 'thursday',
  'الأحد': 'sunday', 'الاحد': 'sunday', 'الاثنين': 'monday', 'الإثنين': 'monday',
  'الثلاثاء': 'tuesday', 'الأربعاء': 'wednesday', 'الاربعاء': 'wednesday', 'الخميس': 'thursday',
};
const STATUSES = ['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'];

/** أحدُ الأسبوع الحاليّ بالتاريخ المحلّيّ */
function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const [name, action, dayArg, weekArg, shiftArg] = process.argv.slice(2);
  if (!name || !action || !dayArg) {
    console.log('الاستعمال: sim-doctor.ts <اسم الطبيب> <الحالة|cancel> <اليوم> [الأسبوع] [morning|evening]');
    process.exit(1);
  }
  const day = DAY_MAP[dayArg.toLowerCase()] ?? DAY_MAP[dayArg];
  if (!day) { console.log('يوم غير صالح:', dayArg); process.exit(1); }
  if (action !== 'cancel' && !STATUSES.includes(action)) {
    console.log('حالة غير صالحة:', action, '— المتاح:', STATUSES.join(' | '), '| cancel');
    process.exit(1);
  }
  const weekStart = weekArg || currentSunday();

  // ابحث عن الطبيب «المُحاكى» (صاحب الهاتف الآخر)
  const { data: docs } = await supabase
    .from('doctors')
    .select('id, name, role, clinic_id')
    .ilike('name', `%${name}%`);
  const rows = (docs || []) as { id: string; name: string; role: string; clinic_id: string }[];
  if (!rows.length) { console.log('لا طبيب يطابق:', name); process.exit(1); }
  if (rows.length > 1) {
    console.log('أكثر من طبيب يطابق — حدّد الاسم أكثر:');
    rows.forEach((d) => console.log(`  • ${d.name} (${d.role})`));
    process.exit(1);
  }
  const doc = rows[0]!;
  console.log(`🎭 أتقمّص: ${doc.name} (${doc.role}) — عيادة ${doc.clinic_id.slice(0, 8)}`);

  // دفتر الأطباء (لترجمة doctorIndex → id كما تفعل الواجهة)
  const { data: all } = await supabase
    .from('doctors')
    .select('id, name')
    .eq('clinic_id', doc.clinic_id)
    .order('name');
  const roster = ((all || []) as { id: string; name: string }[]).map((d) => ({ id: d.id, name: d.name }));
  const doctorIndex = roster.findIndex((d) => d.id === doc.id) + 1;

  const ctx = {
    clinicId: doc.clinic_id,
    user: { id: doc.id, name: doc.name, role: doc.role, clinicId: doc.clinic_id },
    roster,
  };

  const tool = action === 'cancel' ? 'cancel_schedule_status' : 'set_schedule_status';
  const input: Record<string, unknown> = { weekStart, day, doctorIndex };
  if (action !== 'cancel') {
    input.status = action;
    if (shiftArg === 'morning' || shiftArg === 'evening') input.shift = shiftArg;
  }

  console.log(`📨 ${tool} → ${JSON.stringify({ weekStart, day, status: action })}`);
  const result = await dispatchRequestToolV2(tool, input, ctx as never);
  console.log(`\n✅ نتيجة المحرّك:\n${result}`);
  console.log('\n(إن كنتَ قائد الفريق فستصلك الآن إشعارات «طلب جديد» وكرت التغطية على هاتفك.)');
}

main().catch((e) => { console.error(e); process.exit(1); });
