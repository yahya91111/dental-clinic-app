// سكربت تجريبيّ: يسجّل غيابًا مرضيًّا ويولّد كروت التغطية للقادة — لرؤية تصميم الكروت الجديد.
//   • د. محمد احمد  → مرضية يوم الخميس
//   • د. شهد         → مرضية يوم الأربعاء والخميس
// يحاكي مسار أداة set_schedule_status بالضبط: تسجيل الحالة + موجزات اليوم + كرت التغطية + إشعار العلم.
//
// تشغيل:  npx tsx --env-file=.env scripts/seed-sick-leave.ts
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { notifications } from '../lib/algorithms/notifications';

type WeekDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
const DAY_AR: Record<WeekDay, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};

/** أحد الأسبوع الحاليّ (نفس منطق التطبيق) — مفتاح week_start. */
function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Doc = { id: string; name: string; role: string; clinic_id: string };

async function findDoctor(nameLike: string): Promise<Doc> {
  const { data } = await supabase
    .from('doctors')
    .select('id,name,role,clinic_id')
    .ilike('name', `%${nameLike}%`);
  const rows = (data || []) as Doc[];
  if (rows.length === 0) throw new Error(`لا يوجد طبيب باسمٍ يشبه «${nameLike}»`);
  if (rows.length > 1) {
    console.warn(`⚠ عدّة مطابقات لـ«${nameLike}»: ${rows.map((r) => r.name).join('، ')} — سآخذ الأوّل.`);
  }
  return rows[0];
}

async function teamLeaders(clinicId: string): Promise<string[]> {
  const { data } = await supabase
    .from('doctors')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('role', 'team_leader');
  return ((data || []) as { id: string }[]).map((r) => r.id).filter(Boolean);
}

async function makeSick(doc: Doc, day: WeekDay, weekStart: string) {
  const leaders = await teamLeaders(doc.clinic_id);
  if (leaders.length === 0) {
    console.error(`✗ ${doc.name} ${DAY_AR[day]}: لا يوجد قائدٌ في العيادة لتنفيذ الإجراء — تخطّيت.`);
    return;
  }
  const actor = { id: leaders[0], role: 'team_leader' };

  // ١) تسجيل المرضية (يصحّح الشفت من مكان الطبيب الفعليّ في الجدول)
  const res = await requestsV2.setScheduleStatus(actor, {
    clinicId: doc.clinic_id, weekStart, day,
    doctorId: doc.id, doctorName: doc.name, status: 'sick_leave', shift: 'morning',
  });
  if (!res.success) { console.error(`✗ ${doc.name} ${DAY_AR[day]}: ${res.error}`); return; }
  const duplicate = !!(res as { duplicate?: boolean }).duplicate;

  // ٢) موجزات اليوم — تُحسب بعد الغياب، فمرشّحوها تستثني كلّ غائبي اليوم (شهد لن تظهر
  //    مرشّحةً متى كانت مريضةً، والعكس). نحسبها دائمًا ولو كانت الحالة مكرّرة لنُنعش الكروت.
  const briefs = await requestsV2.computeDayCoverageBriefs({ clinicId: doc.clinic_id, weekStart, day });

  // ٣) أنعِش كروت بقيّة الغائبين في نفس اليوم بمرشّحيهم المحدَّثين (هذا الغائب لم يعد
  //    مرشّحًا لتغطيتهم) — الخطوة التي تمنع الاقتراح البائت. (نفس مسار أداة set_schedule_status.)
  for (const b of briefs) {
    if (b.absentId === doc.id) continue;
    await notifications.resolveCoverageV2({
      clinicId: doc.clinic_id, weekStart, day,
      absentDoctorId: b.absentId,
      covered: { kind: 'fresh', gaps: b.gaps, reserves: b.reserves },
    });
  }

  const mine = briefs.find((b) => b.absentId === doc.id)
    ?? { day, absentId: doc.id, absentName: doc.name, gaps: [], reserves: [] };
  const dayHasGap = (mine.gaps?.length ?? 0) > 0;

  // ٤) لكلّ قائد: إشعار العلم (لغير الفاعل، ولا يُكرَّر إن كانت الحالة مسجّلةً سابقًا).
  //    التغطية لم تعد تُجمَع في كرت gap_alert — انتقلت إلى بناء الجدول (coverage_fill).
  for (const leaderId of leaders) {
    if (!duplicate && leaderId !== actor.id) {
      await notifications.notifyLeaderOfRequest({
        clinicId: doc.clinic_id, leaderId,
        senderId: doc.id, senderName: doc.name,
        summary: `مرضية يوم ${DAY_AR[day]}`, weekStart, day,
      });
    }
  }
  const tag = duplicate ? '(مسجّلة مسبقًا — أُنعشت الكروت)' : '';
  console.log(`✓ ${doc.name} ${DAY_AR[day]}: مرضية — نقص تغطية: ${dayHasGap ? 'نعم' : 'لا (يُذكَر مغطًّى)'} — قادة: ${leaders.length} ${tag}`);
}

async function main() {
  const ws = currentSunday();
  console.log('═══ تسجيل مرضيّات تجريبيّة ═══');
  console.log('الأسبوع (week_start):', ws, '\n');

  const mohammed = await findDoctor('محمد احمد');
  const shahad = await findDoctor('شهد');
  console.log('الطبيبان:', mohammed.name, '|', shahad.name, '\n');

  await makeSick(mohammed, 'thursday', ws);
  await makeSick(shahad, 'wednesday', ws);
  await makeSick(shahad, 'thursday', ws);

  console.log('\nتمّ. افتح تبويب الجرس عند القائد لرؤية كروت التغطية بالتصميم الجديد.');
}

main().catch((e) => { console.error(e); process.exit(1); });
