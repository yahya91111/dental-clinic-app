// ═══════════════════════════════════════════════════════════════
// وَسْمُ «يومٍ عدّله القائد يدويًّا» — leader-edited day marks
// ═══════════════════════════════════════════════════════════════
// حين يرتّب القائدُ يومًا بنفسه — تعديلًا يدويًّا مباشرًا على الجدول، أو عبر طلبٍ من
// الذكاء (leader_apply) — نَسِمُ ذلك اليوم. الغرض: حمايةُ ترتيبه من موازنة العدل
// التلقائيّة؛ فإن أرادتِ الموازنةُ تعديلَ يومٍ موسومٍ تُسأل موافقتُه أولًا عبر كرت
// «موازنةُ يومٍ عدّلتَه» (نعم/لا). التغطيةُ الاضطراريّة (غياب) تبقى تلقائيّةً دائمًا —
// لا تُحجَب بالوسم (سلامةُ المرضى أوّلًا).
//
// التخزين: صفٌّ خاملٌ في schedule_slots (period=0, role='leader_lock', status='locked').
// كلُّ قرّاء الجدول يُرشّحون role∈{clinic,delegator} + status='active' + period>0، فلا
// يلتقطه أيٌّ منهم (لا ترحيلَ قاعدةٍ ولا جدولَ جديد). كلُّ الدوالّ تفشل بصمتٍ (الوسم
// تحسينٌ لا يُفشِل أيّ مسار): فقدُ وسمٍ = اليومُ يُوازَن تلقائيًّا (فشلٌ آمن).
// ═══════════════════════════════════════════════════════════════
import { supabase } from '../supabase';
import type { WeekDay } from './schedule';

const LOCK_ROLE = 'leader_lock';
const LOCK_STATUS = 'locked';

/** وَسْمُ يومٍ رتّبه القائد يدويًّا (لا يُكرَّر). تعديلٌ جديد على اليوم يُبطِل أيّ كرت
 *  موافقةٍ سابقٍ له كي نُقرّر من جديد إن لزِم. */
export async function markLeaderEditedDay(args: {
  clinicId: string; weekStart: string; day: WeekDay; byId: string; byName?: string;
}): Promise<void> {
  try {
    const { data } = await supabase.from('schedule_slots').select('id')
      .eq('clinic_id', args.clinicId).eq('week_start', args.weekStart)
      .eq('day_of_week', args.day).eq('role', LOCK_ROLE).limit(1);
    if (!(data && data.length)) {
      await supabase.from('schedule_slots').insert({
        clinic_id: args.clinicId, week_start: args.weekStart, day_of_week: args.day,
        period: 0, clinic_number: 0, doctor_id: args.byId, doctor_name: args.byName ?? 'تعديل القائد',
        role: LOCK_ROLE, status: LOCK_STATUS, source: 'leader',
      });
    }
    // تعديلٌ جديد ⇒ امسح أيّ كرت موافقةٍ بائتٍ لهذا اليوم (قرارٌ جديدٌ إن لزِم).
    const { notifications } = await import('./notifications');
    await notifications.clearRebalanceConsent({ clinicId: args.clinicId, weekStart: args.weekStart, day: args.day });
  } catch { /* الوسم تحسينٌ — لا يُفشِل الحفظ/التعديل */ }
}

/** الأيّامُ التي رتّبها القائدُ يدويًّا في هذا الأسبوع (محميّةٌ من موازنة العدل التلقائيّة). */
export async function loadLeaderEditedDays(args: {
  clinicId: string; weekStart: string;
}): Promise<Set<WeekDay>> {
  try {
    const { data } = await supabase.from('schedule_slots').select('day_of_week')
      .eq('clinic_id', args.clinicId).eq('week_start', args.weekStart).eq('role', LOCK_ROLE);
    return new Set(((data || []) as { day_of_week: WeekDay }[]).map((r) => r.day_of_week));
  } catch { return new Set(); }
}

/** رفعُ الحماية عن يوم (وافق القائدُ على موازنته، أو لم يعد ترتيبُه قائمًا). */
export async function clearLeaderEditedDay(args: {
  clinicId: string; weekStart: string; day: WeekDay;
}): Promise<void> {
  try {
    await supabase.from('schedule_slots').delete()
      .eq('clinic_id', args.clinicId).eq('week_start', args.weekStart)
      .eq('day_of_week', args.day).eq('role', LOCK_ROLE);
  } catch { /* الرفع تحسينٌ — لا يُفشِل المسار */ }
}
