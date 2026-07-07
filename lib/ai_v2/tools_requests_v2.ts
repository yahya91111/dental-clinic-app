// ═══════════════════════════════════════════════════════════════
// AI V2 Requests Tools — يد الذكاء على خوارزميّة الطلبات (إعادة بناء v2)
// ═══════════════════════════════════════════════════════════════
// كلّ أداة wrapper رفيع حول دالّة من requests_v2.ts. مراجع الأطباء بالأرقام
// (doctorIndex) تُترجَم إلى معرّفات في المعالِج عبر ctx.roster. نبنيها أداةً
// أداة مع تحقّق.
//
// إضافة أداة:
//   1. عرّفها في REQUESTS_TOOLS_V2
//   2. أضف case في dispatchRequestToolV2
//   3. حدّث requests_assistant_v2.md
// ═══════════════════════════════════════════════════════════════

import type { V2Tool, V2ToolContext, SwapOffer, AnnounceOffer } from './tools';

/**
 * تنفيذ الإبلاغ بالكود مباشرةً (يستعمله زرّا [الشفت]/[المركز] في الواجهة، وأداة
 * announce_to كذلك). يستثني صاحب الغياب والقادة (وصلهم إشعارهم التلقائيّ).
 */
export async function announceAbsence(params: {
  clinicId: string;
  sender: { id?: string; name?: string };
  audience: 'shift' | 'center';
  message: string;
  /** صاحب الغياب — افتراضيًّا المُرسِل نفسه */
  subjectId?: string;
}): Promise<{ success: boolean; info?: string; error?: string }> {
  const { notifications } = await import('../algorithms/notifications');
  const message = params.message.trim();
  if (!message) return { success: false, error: 'نصّ الإبلاغ فارغ.' };
  const subjectId = params.subjectId ?? params.sender.id;
  let groupId: string | null = null;
  if (params.audience === 'shift') {
    if (subjectId) groupId = await findDoctorGroupId(params.clinicId, subjectId);
    if (!groupId) return { success: false, error: 'تعذّر تحديد الشفت (القروب).' };
  }
  const audienceIds = await notifications.resolveAudience(params.clinicId, params.audience, {
    groupId: groupId ?? undefined,
    excludeId: subjectId,
  });
  // استثنِ القادة — وصلهم إشعارهم التلقائيّ، فلا يُكرَّر
  const leaderIds = new Set(await getTeamLeaderIds(params.clinicId));
  const recipientIds = audienceIds.filter((id) => !leaderIds.has(id));
  if (recipientIds.length === 0) return { success: true, info: 'لا يوجد من يُبلَّغ.' };
  const res = await notifications.broadcast({
    clinicId: params.clinicId, recipientIds,
    senderId: params.sender.id, senderName: params.sender.name,
    title: 'إشعار', body: message,
  });
  return res.success
    ? { success: true, info: `أبلغتُ ${recipientIds.length} ${params.audience === 'center' ? 'في المركز' : 'في الشفت'}.` }
    : { success: false, error: res.error };
}

/**
 * الإبلاغ الحرّ (تعميم/بلاغ من القائد): يرسل نصًّا حرًّا إلى جمهورٍ كاملٍ — shift (قروب
 * القائد) أو center (كلّ المركز) — للعلم. بخلاف إبلاغ الغياب: لا موضوعَ يُستثنى، ولا
 * يُستثنى القادةُ الآخرون (التعميم للجميع)؛ يُستثنى المُرسِل وحده (هو كاتبُه). للقائد فأعلى.
 */
export async function broadcastAnnouncement(params: {
  clinicId: string;
  sender: { id?: string; name?: string };
  audience: 'shift' | 'center';
  message: string;
  title?: string;
}): Promise<{ success: boolean; info?: string; error?: string }> {
  const { notifications } = await import('../algorithms/notifications');
  const message = params.message.trim();
  if (!message) return { success: false, error: 'نصّ التعميم فارغ.' };
  let groupId: string | null = null;
  if (params.audience === 'shift') {
    if (params.sender.id) groupId = await findDoctorGroupId(params.clinicId, params.sender.id);
    if (!groupId) return { success: false, error: 'تعذّر تحديد الشفت (قروب القائد) — حدّد المركز أو الشفت بوضوح.' };
  }
  const recipientIds = await notifications.resolveAudience(params.clinicId, params.audience, {
    groupId: groupId ?? undefined,
    excludeId: params.sender.id, // المُرسِل وحده يُستثنى — التعميم يصل بقيّةَ الجمهور (قادةً وأطبّاء)
  });
  if (recipientIds.length === 0) return { success: true, info: 'لا يوجد من يُبلَّغ بهذا التعميم.' };
  const res = await notifications.broadcast({
    clinicId: params.clinicId, recipientIds,
    senderId: params.sender.id, senderName: params.sender.name,
    title: (params.title || 'تعميم').trim() || 'تعميم', body: message,
  });
  return res.success
    ? { success: true, info: `أرسلتُ التعميم إلى ${recipientIds.length} ${params.audience === 'center' ? 'في المركز' : 'في الشفت'}.` }
    : { success: false, error: res.error };
}

/** القائد فأعلى (نسخة محلّيّة لقرارات التوجيه في الموزّع) */
const LEADER_PLUS_ROLES = new Set(['team_leader', 'coordinator', 'super_admin', 'manager']);
const isLeaderPlusRole = (role: string): boolean => LEADER_PLUS_ROLES.has(role);

/**
 * يحسم استئذانًا مبهمًا (بداية/نهاية) **بالكود مباشرةً** — يستعمله زرّا
 * [بداية الدوام]/[نهاية الدوام] في الواجهة. يستدعي مُرسِل أدوات الطلبات الحقيقيّ
 * بسياقٍ مصغّر (روستر من إدخالٍ واحد)، فيجري منطق التسجيل كاملًا (إشعارات، تغطية،
 * وأزرار تبديل الفترة إن تعارض) بلا جولة نموذجٍ للحلّ. يُرجِع النصّ وأيّ عرضٍ ناتج.
 */
export async function resolvePermissionByCode(params: {
  clinicId: string;
  user: { id: string; name: string; role: string };
  doctorId: string;
  doctorName: string;
  weekStart: string;
  day: string;
  status: 'permission_start' | 'permission_end';
  shift?: 'morning' | 'evening';
}): Promise<{ text: string; swapOffer?: SwapOffer; announceOffer?: AnnounceOffer }> {
  let swapOffer: SwapOffer | undefined;
  let announceOffer: AnnounceOffer | undefined;
  const ctx: V2ToolContext = {
    clinicId: params.clinicId,
    user: params.user,
    roster: [{ id: params.doctorId, name: params.doctorName }],
    onSwapOffer: (o) => { swapOffer = o; },
    onAnnounceOffer: (o) => { announceOffer = o; },
  };
  const raw = await dispatchRequestToolV2('set_schedule_status', {
    doctorIndex: 1, day: params.day, weekStart: params.weekStart,
    status: params.status, ...(params.shift ? { shift: params.shift } : {}),
  }, ctx);
  const text = raw.startsWith(FINAL_MARK) ? raw.slice(FINAL_MARK.length) : raw;
  return { text, swapOffer, announceOffer };
}

/**
 * مسح جدول أسبوعٍ **بالكود** (زرّ [نعم، امسح] بعد عرض التأكيد) — النموذج لا يمسح
 * بنفسه؛ يكتفي بطلب التأكيد (onConfirmOffer)، والمسح الفعليّ يجري هنا عند ضغط القائد.
 */
export async function clearWeekByCode(params: {
  clinicId: string;
  actor: { id: string; role: string };
  weekStart: string;
}): Promise<{ success: boolean; info?: string; error?: string }> {
  const { requestsV2 } = await import('../algorithms/requests_v2');
  const res = await requestsV2.clearWeek(params.actor, params.clinicId, params.weekStart);
  if (!res.success) return { success: false, error: res.error };
  return { success: true, info: `تمّ مسح جدول أسبوع ${params.weekStart} كاملًا.` };
}

type ReserveDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';

/**
 * يضع احتياطيًّا خاصًّا (بورد/متدرّب) في مقعدٍ شاغرٍ من كرت «تغطية نقص — قرارك»
 * **بالكود مباشرةً** — يستعمله زرّ الاسم في الكرت (لا ذكاء، لا كلفة). `closeCard`=true
 * (آخر مقعدٍ) يُغلق الكرت بعد الوضع. يطابق غصنَ الاختيار في cover_gap_with_reserve.
 */
export async function placeReserveByCode(params: {
  clinicId: string; weekStart: string; day: string;
  clinicNumber: number; period: number; doctorId: string;
  closeCard?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { placeReserveInSeat } = await import('../algorithms/solver_shadow');
    const day = params.day as ReserveDay;
    const pr = await placeReserveInSeat({
      clinicId: params.clinicId, weekStart: params.weekStart, day,
      clinicNumber: params.clinicNumber, period: params.period, doctorId: params.doctorId,
    });
    if (!pr.success) return { success: false, error: pr.reason ?? 'تعذّر وضع الاحتياطيّ.' };
    if (params.closeCard) {
      const { notifications } = await import('../algorithms/notifications');
      await notifications.resolveReserveChoiceV2({ clinicId: params.clinicId, weekStart: params.weekStart, day });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

/**
 * «لا أحد» في كرت «تغطية نقص — قرارك» **بالكود**: لا يُستدعى الاحتياطيّ الخاصّ،
 * ويُكمل المحرّك التغطية من المتاح (تغطية → سداد احتياط → إعادة توازن → إعادة تشكيلٍ
 * رفيعة)، ملفوفةً بيوميّات الأثر كي يعكسها كنسلُ الغياب، ثمّ يُغلق الكرت.
 */
export async function declineReserveChoiceByCode(params: {
  clinicId: string; weekStart: string; day: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const day = params.day as ReserveDay;
    const ws = params.weekStart;
    const { applyCoverage, applyReserveRepay, applyNewHeartRebalance, applyThinReshape, reservePairsFromMoves } = await import('../algorithms/solver_shadow');
    const { notifications } = await import('../algorithms/notifications');
    const { withXdayJournal } = await import('../algorithms/requests_v2');
    const { supabase } = await import('../supabase');
    const { data: pp } = await supabase.from('schedule_slots')
      .select('doctor_id').eq('clinic_id', params.clinicId).eq('week_start', ws)
      .eq('day_of_week', day).eq('role', 'prev_placement');
    const owners = [...new Set(((pp || []) as { doctor_id: string }[]).map((x) => x.doctor_id))];
    const runCov = async () => {
      const c = await applyCoverage({ clinicId: params.clinicId, weekStart: ws, label: 'لا-أحد' }, { specialReserves: 'exclude' });
      await applyReserveRepay({ clinicId: params.clinicId, weekStart: ws, label: 'لا-أحد' }, reservePairsFromMoves(c.moves));
      await applyNewHeartRebalance({ clinicId: params.clinicId, weekStart: ws, label: 'لا-أحد' });
      await applyThinReshape({ clinicId: params.clinicId, weekStart: ws, label: 'لا-أحد' });
      return c;
    };
    if (owners.length === 1) await withXdayJournal(params.clinicId, ws, { day, doctorId: owners[0]! }, runCov);
    else await runCov();
    await notifications.resolveReserveChoiceV2({ clinicId: params.clinicId, weekStart: ws, day });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

// ─── كرت «موازنةُ يومٍ عدّلتَه» (نعم/لا) ───────────────────────────
// «نعم» (approve): اسمح بموازنة هذا اليوم وحده (تبقى بقيّةُ أيّام القائد محميّة)، ثمّ
// ارفع حمايته (وافق ⇒ صار يومًا عاديًّا)، وأبلِغ المتأثّرين بكرت «طرأ تغييرٌ على جدولك».
// «لا» (decline): اتركه كما رتّبه القائد (تبقى الحماية فلا يُعاد السؤال) وأغلِق الكرت.

/** «نعم، وازِن»: طبّق موازنةَ العدل على اليوم الذي عدّله القائد (بعد إذنه). */
export async function approveRebalance(params: {
  clinicId: string; weekStart: string; day: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const day = params.day as ReserveDay;
    const { applyNewHeartRebalance } = await import('../algorithms/solver_shadow');
    const { loadLeaderEditedDays, clearLeaderEditedDay } = await import('../algorithms/leader_marks');
    const { notifications } = await import('../algorithms/notifications');
    const { withSeatChangeDiff } = await import('../algorithms/requests_v2');
    // اسمح بهذا اليوم وحده — تبقى بقيّةُ الأيّام المعدّلة محميّة.
    const allow = await loadLeaderEditedDays({ clinicId: params.clinicId, weekStart: params.weekStart });
    allow.delete(day);
    await withSeatChangeDiff({ clinicId: params.clinicId, weekStart: params.weekStart }, () =>
      applyNewHeartRebalance({ clinicId: params.clinicId, weekStart: params.weekStart, label: 'موافقة-موازنة', protectedDays: allow }));
    await clearLeaderEditedDay({ clinicId: params.clinicId, weekStart: params.weekStart, day });
    await notifications.resolveRebalanceConsent({ clinicId: params.clinicId, weekStart: params.weekStart, day, decision: 'accepted' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

/** «لا، اتركه كما هو»: يبقى اليومُ كما رتّبه القائد؛ أغلِق الكرت (تبقى الحماية). */
export async function declineRebalance(params: {
  clinicId: string; weekStart: string; day: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { notifications } = await import('../algorithms/notifications');
    await notifications.resolveRebalanceConsent({
      clinicId: params.clinicId, weekStart: params.weekStart, day: params.day as ReserveDay, decision: 'rejected',
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
  }
}

/** أيّامُ القائد المحميّة في هذا الأسبوع (للموازنة المُستأذَنة). */
async function protectedDaysFor(clinicId: string, weekStart: string): Promise<Set<ReserveDay>> {
  const { loadLeaderEditedDays } = await import('../algorithms/leader_marks');
  return (await loadLeaderEditedDays({ clinicId, weekStart })) as Set<ReserveDay>;
}

/** أرسِل كرت «موازنةُ يومٍ عدّلتَه» لكلّ قائدٍ عن كلّ يومٍ أجّلتِ الموازنةُ تعديلَه. */
async function askRebalanceConsent(
  clinicId: string, weekStart: string, days: string[], senderId?: string, senderName?: string,
): Promise<void> {
  if (!days.length) return;
  try {
    const { notifications } = await import('../algorithms/notifications');
    const leaderIds = await getTeamLeaderIds(clinicId);
    for (const day of [...new Set(days)]) {
      for (const leaderId of leaderIds) {
        await notifications.notifyRebalanceConsent({
          clinicId, leaderId, weekStart, day: day as ReserveDay, senderId, senderName,
        });
      }
    }
  } catch { /* الكرت تحسينٌ — لا يُفشِل المسار */ }
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const DAY_OFFSET: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

/** تاريخ يومٍ من الأسبوع (weekStart = أحد، YYYY-MM-DD) بصيغة «d/M». */
function dayDate(weekStart: string, day: string): string {
  const off = DAY_OFFSET[day];
  if (off == null || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return '';
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + off);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
/** «الأحد 14/6» — اسم اليوم متبوعًا بتاريخه (يسقط التاريخ بهدوءٍ إن تعذّر). */
function dayWithDate(weekStart: string, day: string): string {
  const dt = dayDate(weekStart, day);
  return dt ? `${DAY_AR[day] || day} ${dt}` : (DAY_AR[day] || day);
}
const STATUS_AR: Record<string, string> = {
  sick_leave: 'مرضية', vacation: 'تفرّغ',
  permission_start: 'استئذان بداية الدوام', permission_end: 'استئذان نهاية الدوام',
  extra: 'احتياط',
};
const WORK_AR: Record<string, string> = {
  active: 'عاديّ', vacation: 'إجازة', light_duty: 'تخفيف', trainee: 'متدرّب',
};

// ─── علامة «النتيجة النهائية» — التأكيد من الكود لا من النموذج ──
// نجاحٌ نصُّه صالح للعرض على المستخدم كما هو: المُشغّل (index.ts) إن وجد كلّ
// نتائج الجولة موسومةً بها عرضها مباشرةً وأنهى — **بلا جولة تأكيدٍ من النموذج**
// (نصف التكلفة). النتائج بلا العلامة (أخطاء، أو نجاحات تحتاج تصرّفًا كسؤال
// «أين يوضَع؟») تعود للنموذج كالمعتاد ليتولّى الموقف.
export const FINAL_MARK = '⟦FINAL⟧';
const final = (text: string) => `${FINAL_MARK}${text}`;

/** «اليوم» (ISO) لمرساة إعادة التوازن من «الآن»: من إدخال الأداة (`today`) للاختبار،
 *  وإلّا تاريخ النظام الحقيقيّ. يجعل العجلةَ توازِن كلّ ما لم يقع بعدُ (أوسع نافذة). */
function todayISOFrom(r: Record<string, unknown>): string {
  if (typeof r.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.today)) return r.today;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * بعد أيّ تغطية: أعد حساب حقائق اليوم (المعادلة من جديد) وحدّث كروت **كلّ**
 * القادة بها — يدعم التغطية الجزئيّة: ما بقي نقصًا يظهر بمرشّحيه الفعليّين
 * المحدَّثين لا البائتين، وما غُطّي كاملًا يسقط (يُغلق الكرت إن لم يبقَ شيء).
 * يُنعِش **كلّ غائبي اليوم** لا المُغطَّى وحده: المُغطّي صار مشغولًا فقد يسقط من
 * اقتراحات غائبٍ آخر في الكرت نفسه (اليوم الواحد قد يجمع أكثر من غائب).
 */
async function refreshCoverageCards(
  clinicId: string,
  weekStart: string,
  day: (typeof DAYS)[number],
  absent: { id: string; name: string },
): Promise<void> {
  try {
    const { requestsV2 } = await import('../algorithms/requests_v2');
    const { notifications } = await import('../algorithms/notifications');
    const briefs = await requestsV2.computeDayCoverageBriefs({ clinicId, weekStart, day });
    const ids = new Set(briefs.map((b) => b.absentId));
    // المُغطَّى نفسه قد لا يبقى له صفّ غياب (استُهلك حفظه) — أدرِجه موجزًا فارغًا
    const all = ids.has(absent.id)
      ? briefs
      : [...briefs, { day, absentId: absent.id, absentName: absent.name, gaps: [], reserves: [] }];
    for (const b of all) {
      await notifications.resolveCoverageV2({
        clinicId, weekStart, day, absentDoctorId: b.absentId,
        covered: { kind: 'fresh', gaps: b.gaps, reserves: b.reserves },
      });
    }
  } catch { /* تحديث الكروت لا يُفشل التغطية */ }
}

// ─── تعريفات الأدوات (تنمو مع كلّ قدرة) ────────────────────────
export const REQUESTS_TOOLS_V2: V2Tool[] = [
  {
    name: 'set_schedule_status',
    description:
      'يجعل طبيبًا في يومٍ: مرضية/تفرّغ/استئذان(بداية/نهاية)/احتياط. يُطبَّق فورًا على ' +
      'أسبوع محفوظ أو فارغ. الطبيب لنفسه؛ الليدر لأيّ أحد. مرّر day بقيمة إنجليزيّة لليوم ' +
      'المقصود في هذا الأسبوع — لا تتركه فارغًا ولا تسأل عن الأسبوع.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string', description: 'بداية الأسبوع (أحد) YYYY-MM-DD.' },
        day: { type: 'string', enum: [...DAYS], description: 'يوم العمل (إنجليزيّة).' },
        doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة.' },
        status: {
          type: 'string',
          enum: ['sick_leave', 'vacation', 'permission_start', 'permission_end', 'permission', 'extra'],
          description:
            'استئذانٌ ولم يحدّد المستخدم بدايةً أو نهايةً؟ مرّر `permission` (المبهم) — ' +
            'النظام يسأل بزرَّين ويسجّل بنفسه. حدّد `permission_start`/`permission_end` فقط ' +
            'حين يذكر المستخدم النوع صراحةً.',
        },
        shift: {
          type: 'string', enum: ['morning', 'evening'],
          description:
            'شفت الطبيب. مرّره **إن ذكره المستخدم** (عصر/مساء=evening، صباح=morning) — مهمّ ' +
            'كي تُوضع علامة الغياب في جهة EX الصحيحة حين لا يكون الطبيب منسَّبًا بعد. وإن لم ' +
            'يُذكر فاتركه (يُستنتج من مكانه الفعليّ). لا تسأل عنه.',
        },
      },
      required: ['weekStart', 'day', 'doctorIndex', 'status'],
    },
  },
  {
    name: 'request_swap',
    description:
      'يرسل **طلب تبديل** (تبادل مراكز يومٍ كامل — كلٌّ يستلم مكان الآخر بكلّ ما فيه) ' +
      'إلى: طبيبٍ باسمه (target=doctor مع doctorIndex)، أو كلّ أطبّاء فترةٍ (target=period ' +
      'مع period)، أو كلّ الشفت الآخر (target=other_shift). يصل المستلمين إشعارٌ ' +
      'بموافق/رفض؛ أوّل موافقٍ يُنفَّذ معه فورًا وتُسحب البقيّة. الطالب هو المستخدم نفسه ' +
      'دائمًا. الصلاحيّة ٢٤ ساعة أو دخول اليوم. ' +
      'لأكثرِ من يوم (مثلًا الثلاثاء والأربعاء والخميس) مرّر days بكلّ الأيّام — يصل كرتٌ ' +
      'واحدٌ للمستلم يوافق/يرفض كلَّ يومٍ على حدة.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS], description: 'ليومٍ واحد (أو استعمل days لأكثرِ من يوم).' },
        days: { type: 'array', items: { type: 'string', enum: [...DAYS] }, description: 'لأكثرِ من يوم: كلُّ الأيّام المطلوبة. يتقدّم على day.' },
        target: { type: 'string', enum: ['doctor', 'period', 'other_shift'] },
        doctorIndex: { type: 'integer', description: 'فقط لو target=doctor.' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'فقط لو target=period.' },
      },
      required: ['weekStart', 'target'],
    },
  },
  {
    name: 'swap_request_status',
    description:
      'حالة طلبات التبديل المفتوحة للمستخدم («شصار على طلبي؟»): كم رفض، كم بقي، ' +
      'من وافق، أو انتهت المهلة.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancel_swap_request',
    description:
      'يلغي طلب تبديلٍ معلّقًا للمستخدم (قبل أن يوافق أحد). مرّر اليوم إن سمّاه.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS], description: 'إن سمّاه المستخدم.' },
      },
      required: ['weekStart'],
    },
  },
  {
    name: 'announce_to',
    description:
      'يُبلِغ جمهورًا بغياب الطبيب للعلم فقط: shift (قروب الطبيب) أو center (الجميع). ' +
      'يُستثنى القادة (وصلهم إشعارهم) والطبيب نفسه. استدعِها بعد اختيار الطبيب «الشفت» ' +
      'أو «المركز» (لا تستدعِها مع «لا داعي»).',
    input_schema: {
      type: 'object',
      properties: {
        audience: { type: 'string', enum: ['shift', 'center'], description: 'الشفت أو المركز.' },
        message: { type: 'string', description: 'نصّ الإبلاغ بالعربيّة.' },
        subjectDoctorIndex: {
          type: 'integer',
          description: 'صاحب الغياب (لتحديد قروبه عند shift، ويُستثنى). افتراضيًّا الطالب نفسه.',
        },
      },
      required: ['audience', 'message'],
    },
  },
  {
    name: 'broadcast_announcement',
    description:
      'تعميمٌ/بلاغٌ حرٌّ من القائد إلى جمهور: shift (قروب القائد) أو center (كلّ المركز). ' +
      'للقائد فأعلى فقط، للعلم. **لا تستدعِها إلّا بعد أن يؤكّد القائدُ النصَّ النهائيّ والجمهور** ' +
      '— التعميم يصل الجميع ولا يُسترجَع. إن أراد صياغةً أحسن فاعرض عليه نسخةً مُعادة الصياغة ' +
      'واسأله: أُرسِل هذه أم نصَّك كما هو؟ ثمّ أرسِل ما يختاره. `message` هو النصّ النهائيّ الذي يُرسَل.',
    input_schema: {
      type: 'object',
      properties: {
        audience: { type: 'string', enum: ['shift', 'center'], description: 'الشفت (قروب القائد) أو المركز (الجميع).' },
        message: { type: 'string', description: 'نصّ التعميم النهائيّ بالعربيّة (كما أقرّه القائد).' },
        title: { type: 'string', description: 'عنوان قصير اختياريّ (افتراضيًّا «تعميم»).' },
      },
      required: ['audience', 'message'],
    },
  },
  {
    name: 'cancel_schedule_status',
    description:
      'يلغي حالة طبيبٍ ليومٍ (يُزيل المرضية/التفرّغ/الاستئذان/الاحتياط) ويُعيده إلى ' +
      'مكانه في العيادة. الطبيب لنفسه؛ الليدر لأيّ أحد. **اليوم مبهم** (لم يسمِّه ' +
      'المستخدم)؟ اترك `day` فارغًا ومرّر `statusType` (نوع ما يريد إلغاءه) — النظام ' +
      'يقرأ حالاته الحقيقيّة ويسأل بالأيّام الصحيحة، أو يُلغي مباشرةً إن كان يومًا واحدًا.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS], description: 'اليوم — اتركه فارغًا إن لم يسمِّه المستخدم.' },
        doctorIndex: { type: 'integer' },
        statusType: {
          type: 'string', enum: ['permission', 'sick_leave', 'vacation'],
          description: 'نوع الحالة المُلغاة حين يكون اليوم مبهمًا: استئذان/مرضية/تفرّغ.',
        },
      },
      required: ['weekStart', 'doctorIndex'],
    },
  },
  {
    name: 'move_schedule_status',
    description:
      'ينقل حالة طبيبٍ من يومٍ إلى آخر (إلغاء المصدر + تسجيل الوجهة) **بإشعارٍ واحدٍ** ' +
      'للقائد. للطلبات المركّبة من نوع «ألغِ كذا اليوم الفلانيّ واجعله اليوم الفلانيّ». ' +
      'يشمل **تغيير النوع** (مثلًا: مرضية الأربعاء ← استئذان الثلاثاء). الطبيب لنفسه؛ ' +
      'الليدر لأيّ أحد. اترك `toStatus` فارغًا لنقل **نفس نوع المصدر** كما هو. الوجهة ' +
      'استئذانٌ بلا بداية/نهاية؟ مرّر `toStatus:"permission"` — النظام يسأل بزرَّين. لم ' +
      'يُسمَّ يوم المصدر وله أكثر من حالة؟ اترك `fromDay` فارغًا — النظام يسأل.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        doctorIndex: { type: 'integer' },
        fromDay: { type: 'string', enum: [...DAYS], description: 'يوم المصدر (يُلغى) — فارغٌ إن لم يُسمَّ وله أكثر من حالة.' },
        toDay: { type: 'string', enum: [...DAYS], description: 'يوم الوجهة (يُسجَّل).' },
        toStatus: {
          type: 'string', enum: ['permission', 'permission_start', 'permission_end', 'sick_leave', 'vacation'],
          description: 'نوع الوجهة — فارغٌ = نفس نوع المصدر.',
        },
        shift: { type: 'string', enum: ['morning', 'evening'], description: 'لتحديد خانة EX للوجهة عند اللزوم.' },
      },
      required: ['weekStart', 'doctorIndex', 'toDay'],
    },
  },
  {
    name: 'place_in_clinic',
    description:
      'يضع طبيبًا في عيادة وفتراتٍ محدّدة (العكس: من غياب إلى داخل العيادة). الطبيب ' +
      'لنفسه؛ الليدر لأيّ مكان. يرفض المحرّك وضعه في عيادتين بنفس الفترة. ' +
      '**انسخ رقم العيادة والفترات من كلام المستخدم حرفيًّا — لا تخمّن**؛ إن لم يحدّد ' +
      'الفترات أو التبس المكان فاسأله سطرًا واحدًا قبل النداء.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndex: { type: 'integer' },
        clinicNumber: { type: 'integer', description: 'رقم العيادة (1+).' },
        periods: {
          type: 'array', items: { type: 'integer', enum: [1, 2, 3, 4] },
          description: 'الفترات (مثلًا [3,4] مساء كامل، أو [4] فترة واحدة).',
        },
      },
      required: ['weekStart', 'day', 'doctorIndex', 'clinicNumber', 'periods'],
    },
  },
  {
    name: 'cover_gap_with_reserve',
    description:
      'يحسم كرت «تغطية نقص — قرارك»: بقي مقعدٌ شاغرٌ والمتاح احتياطيًّا **خاصّ** (بورد/' +
      'متدرّب) لا يُوضع تلقائيًّا. إمّا تختار احتياطيًّا (doctorIndex + العيادة/الفترة من ' +
      'الكرت) فيُوضع، أو decline=true فيُكمل المحرّك التغطية بلا استدعاء أحدٍ منهم. الليدر ' +
      'فأعلى. **انسخ اليوم والعيادة والفترة من الكرت حرفيًّا — لا تخمّن.**',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        decline: { type: 'boolean', description: 'true = لا تستدعِ أحدًا (يكمل المحرّك بلا الاحتياطيّ الخاصّ).' },
        doctorIndex: { type: 'integer', description: 'رقم الاحتياطيّ المختار — مطلوبٌ إن لم يكن decline.' },
        clinicNumber: { type: 'integer', description: 'رقم العيادة الشاغرة (من الكرت).' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'الفترة الشاغرة (من الكرت).' },
      },
      required: ['weekStart', 'day'],
    },
  },
  {
    name: 'clear_week',
    description:
      'يطلب مسح جدول أسبوعٍ كاملًا (كلّ الخانات والحالات). الليدر فأعلى. استدعِها متى ' +
      'طلب المستخدم مسح الجدول — **النظام يعرض تأكيدًا بزرّين [نعم، امسح][تراجع] وينفّذ ' +
      'المسح بنفسه**. لا تمسح نصًّا ولا تطلب التأكيد بنفسك ولا تَعِد بأنّ المسح تمّ.',
    input_schema: {
      type: 'object',
      properties: { weekStart: { type: 'string' } },
      required: ['weekStart'],
    },
  },
  {
    name: 'set_clinic_count',
    description: 'يغيّر عدد عيادات العيادة (يؤثّر على الحاليّ والقادم بلا إعادة توزيع). الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: { count: { type: 'integer', description: 'عدد العيادات الجديد (1+).' } },
      required: ['count'],
    },
  },
  {
    name: 'move_doctor_group',
    description: 'ينقل طبيبًا إلى قروب آخر (A/B/البورد). يؤثّر على الجداول القادمة. الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: {
        doctorIndex: { type: 'integer' },
        toGroup: { type: 'string', enum: ['group_a', 'group_b', 'board'], description: 'القروب الهدف.' },
      },
      required: ['doctorIndex', 'toGroup'],
    },
  },
  {
    name: 'set_group_status',
    description:
      'يغيّر حالة طبيبٍ في قروبه: عاديّ/إجازة/تخفيف/متدرّب. للمتدرّب يمكن تحديد مدرّبه ' +
      '(supervisorIndex). الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: {
        doctorIndex: { type: 'integer' },
        workStatus: { type: 'string', enum: ['active', 'vacation', 'light_duty', 'trainee'] },
        supervisorIndex: { type: 'integer', description: 'رقم المدرّب — فقط لو workStatus=trainee.' },
      },
      required: ['doctorIndex', 'workStatus'],
    },
  },
  {
    name: 'leader_apply',
    description:
      'أداةُ الليدر الشاملة: ينفّذ أمرًا أو أكثر على جدول يومٍ **مباشرةً وبلا قيود** — ' +
      'لأيّ طبيب (عاديّ/تخفيف/بورد/متدرّب/ظلّ، حتى المستثنى أو الغائب بعد إلغاء حالته). ' +
      'العمليّات في `operations` تُطبَّق **بالترتيب** (كلٌّ ترى أثر سابقتها) دفعةً واحدة. ' +
      'أنواع op: `place` (ضعه في عيادة+فترات) · `delegator` (اجعله دليقيتر) · `set_status` ' +
      '(مرضية/تفرّغ/استئذان بداية/نهاية/احتياط — والاحتياط = أخرجه من العيادة واجعله ' +
      'احتياطيًّا) · `cancel_status` (أزِل حالة) · `swap` (بدّل طبيبَين أو أكثر) · ' +
      '`attach_trainee` (ألحِق متدرّبًا بمدرّب). **النقل بين يومَين** = `cancel_status` ثمّ ' +
      '`set_status` في الدفعة نفسها. القائد فأعلى فقط. **انسخ الأرقام والعيادات والفترات ' +
      'من كلام المستخدم حرفيًّا — لا تخمّن**؛ والاستئذان حدّد بدايةً أو نهايةً صراحةً.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string', description: 'بداية الأسبوع (أحد) YYYY-MM-DD.' },
        operations: {
          type: 'array',
          description: 'العمليّات بالترتيب — تُطبَّق واحدةً تلو الأخرى.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: ['place', 'delegator', 'set_status', 'cancel_status', 'swap', 'attach_trainee'],
                description: 'نوع العمليّة.',
              },
              day: { type: 'string', enum: [...DAYS], description: 'يوم العمل (لكلّ العمليّات).' },
              doctorIndex: { type: 'integer', description: 'الطبيب المقصود (place/delegator/set_status/cancel_status).' },
              clinicNumber: { type: 'integer', description: 'op=place: رقم العيادة.' },
              periods: { type: 'array', items: { type: 'integer', enum: [1, 2, 3, 4] }, description: 'op=place: الفترات.' },
              period: { type: 'integer', enum: [1, 2, 3, 4], description: 'op=delegator: الفترة (اتركها إن لم تُذكر).' },
              status: { type: 'string', enum: ['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'], description: 'op=set_status. extra = أخرجه واجعله احتياطًا.' },
              shift: { type: 'string', enum: ['morning', 'evening'], description: 'op=set_status: الشفت عند اللزوم لخانة EX.' },
              statusType: { type: 'string', enum: ['permission', 'sick_leave', 'vacation'], description: 'op=cancel_status: نوع المُلغى حين يكون اليوم مبهمًا (اختياريّ).' },
              doctorIndexes: { type: 'array', items: { type: 'integer' }, description: 'op=swap: أرقام الأطباء (تسلسليّ، كلٌّ يأخذ مكان التالي).' },
              scope: { type: 'string', enum: ['day', 'shift', 'period'], description: 'op=swap: افتراضيًّا day.' },
              traineeDoctorIndex: { type: 'integer', description: 'op=attach_trainee: المتدرّب.' },
              supervisorDoctorIndex: { type: 'integer', description: 'op=attach_trainee: المدرّب.' },
            },
            required: ['op'],
          },
        },
      },
      required: ['weekStart', 'operations'],
    },
  },
  {
    name: 'add_doctor_to_schedule',
    description:
      'يُدخِل طبيبًا **أُضيف حديثًا إلى قروبه** ضمن جدول هذا الأسبوع: يُعيد توزيع الأيّام ' +
      'من يومٍ محدّد فصاعدًا بالعدد الجديد (عيادات/دليقيتر/احتياط/فترات) بتوزيعٍ عادل، مع ' +
      'مراعاة مَن عمل سابقًا — والأيّامُ السابقةُ لا تُمسّ. الليدر فأعلى. **حدّد يوم البداية:** ' +
      'اليومَ إن كان الطلب قبل بدء شفت اليوم، وإلّا الغد؛ وإن لم تتأكّد متى بالضبط فاسأل ' +
      'القائد قبل التنفيذ. (يجب أن يكون الطبيب مُضافًا لقروبه أوّلًا عبر إدارة القائمة.)',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS], description: 'يوم البداية لإعادة التوزيع (منه حتى نهاية الأسبوع).' },
        doctorIndex: { type: 'integer', description: 'رقم الطبيب المُضاف (للتأكيد في الرسالة، اختياريّ).' },
      },
      required: ['weekStart', 'day'],
    },
  },
  {
    name: 'replace_doctor_in_schedule',
    description:
      'استبدالٌ **حرفيّ**: يجعل طبيبًا يداوم مكان آخرَ بالضبط (نفس العيادة/الفترة/الدور/الاحتياط) ' +
      'من يومٍ فصاعدًا — **بلا إعادة توزيع**. «خلِّ د١ مكان د٢» أو «شيل د٢ وخلِّ مكانه د١». ' +
      'الليدر فأعلى. حدّد يوم البداية (اليوم إن قبل الشفت وإلّا الغد؛ اسأل إن لم تتأكّد). ' +
      'إن كان دائمًا (الخارج غادر المركز) مرّر permanent=true فيُحدَّث القروبُ أيضًا.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS], description: 'يوم بداية الاستبدال.' },
        outDoctorIndex: { type: 'integer', description: 'الطبيب الذي يُستبدَل (يخرج).' },
        inDoctorIndex: { type: 'integer', description: 'الطبيب البديل (يأخذ مكانه حرفيًّا).' },
        permanent: { type: 'boolean', description: 'true = دائم: الخارج يغادر القائمة والبديل يحلّ في قروبه.' },
      },
      required: ['weekStart', 'day', 'outDoctorIndex', 'inDoctorIndex'],
    },
  },
  {
    name: 'remove_doctor_from_schedule',
    description:
      'يحذف طبيبًا من الجدول ويُعيد توزيعَ الباقين **بعدلٍ** من يومٍ فصاعدًا (الأيّامُ السابقةُ ' +
      'لا تُمسّ). «احذف د فلان من الجدول». الليدر فأعلى. حدّد يوم البداية (اليوم/الغد؛ اسأل إن ' +
      'لم تتأكّد). دائمٌ (غادر المركز) → permanent=true فيُزال من قروبه ولا يظهر مستقبلًا؛ ' +
      'وإلّا فهذا الأسبوع فقط. (لاستبدالٍ مباشرٍ بوافدٍ استعمل replace_doctor_in_schedule.)',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS], description: 'يوم بداية إعادة التوزيع.' },
        doctorIndex: { type: 'integer', description: 'الطبيب المحذوف.' },
        permanent: { type: 'boolean', description: 'true = دائم (يُزال من القروب)، false = هذا الأسبوع فقط.' },
      },
      required: ['weekStart', 'day', 'doctorIndex'],
    },
  },
  {
    name: 'promote_trainee_independent',
    description:
      'يحوّل متدرّبًا ظلًّا (مبتدئًا) إلى **مستقلّ** أثناء الأسبوع ويُعيد توزيعَه كوافدٍ جديد من ' +
      'يومٍ فصاعدًا (يدخل عجلاتِ التوزيع كطبيبٍ عاديّ). «خلِّ د فلان بعيادة لوحده» (وهو ظلّ). ' +
      'الليدر فأعلى. حدّد يوم البداية (اليوم/الغد؛ اسأل إن لم تتأكّد).',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS], description: 'يوم بداية إعادة التوزيع.' },
        doctorIndex: { type: 'integer', description: 'المتدرّب المُرقَّى.' },
      },
      required: ['weekStart', 'day', 'doctorIndex'],
    },
  },
];

// ─── تعريض الأدوات حسب الدور ────────────────────────────────────
// الطلبات للجميع: أدوات الطلب الذاتيّ/التبديل/الإبلاغ مشتركةٌ بين الطبيب والليدر.
// الليدر يزيد فوقها أداتَه الشاملة (السلطة) + الأدوات الإداريّة + كرت الاحتياط.
// الموزّع واحدٌ يخدم الجميع ويفرض الصلاحيّة لكلّ أداة على حدة.
const SHARED_TOOL_NAMES = new Set([
  'set_schedule_status', 'cancel_schedule_status', 'move_schedule_status', 'place_in_clinic',
  'request_swap', 'swap_request_status', 'cancel_swap_request', 'announce_to',
]);
const LEADER_EXTRA_TOOL_NAMES = new Set([
  'leader_apply', 'clear_week', 'set_clinic_count', 'move_doctor_group', 'set_group_status',
  'cover_gap_with_reserve', 'add_doctor_to_schedule', 'replace_doctor_in_schedule',
  'remove_doctor_from_schedule', 'promote_trainee_independent', 'broadcast_announcement',
]);
export function requestsToolsForRole(role: string): V2Tool[] {
  const allowed = isLeaderPlusRole(role)
    ? new Set([...SHARED_TOOL_NAMES, ...LEADER_EXTRA_TOOL_NAMES])
    : SHARED_TOOL_NAMES;
  return REQUESTS_TOOLS_V2.filter((t) => allowed.has(t.name));
}

// ─── أدوات مساعدة ──────────────────────────────────────────────
type Resolved = { id: string; name: string };
function resolveDoctor(ctx: V2ToolContext, n: unknown): Resolved | null {
  const list = ctx.roster ?? [];
  const i = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (!Number.isInteger(i) || i < 1 || i > list.length) return null;
  const d = list[i - 1]!;
  return { id: d.id, name: d.name };
}

const isDay = (d: unknown): d is (typeof DAYS)[number] =>
  typeof d === 'string' && (DAYS as readonly string[]).includes(d);

// ─── عزلُ أثرِ إضافةِ طبيبٍ/ترقيةِ متدرّبٍ على الشفتِ الذي لا يعملُه الوافد ───
// إعادةُ البناءِ من يومٍ تُعيدُ توزيعَ **كلا الشفتين**، فتعجلاتُ العدلِ المشتركةُ قد تُزحزحُ
// الشفتَ الآخرَ (غيرَ ذي الصلةِ بالوافد) بلا فائدة. الحلُّ: بعدَ البناءِ نُعيدُ خاناتِ ذلك
// الشفتِ إلى أصلِها (لقطةٌ قبلَ البناء) — فلا يتغيّرُ ولا تصلُه إشعاراتُ «تغيّرَ جدولُك»
// (تُحسَبُ من الحالةِ بعدَ exec داخلَ طبقةِ الفرق). شفتُ الوافدِ يبقى بترتيبِ البناءِ الجديد.
type ShiftSnapRow = {
  day_of_week: string; period: number; clinic_number: number;
  doctor_id: string; doctor_name: string; role: string; status: string; source?: string | null;
};
// النصفُ: 0=صباح (ف١،٢) / 1=مساء (ف٣،٤). الاحتياطُ period=0 يُصنَّفُ بعمودِه (1=صباح، 2=مساء).
const halfOfSlot = (period: number, clinicNumber: number): 0 | 1 =>
  period === 0 ? (clinicNumber === 2 ? 1 : 0) : (period <= 2 ? 0 : 1);

async function snapshotActiveExtra(clinicId: string, weekStart: string, days: readonly string[]): Promise<ShiftSnapRow[]> {
  const { supabase } = await import('../supabase');
  const { data } = await supabase
    .from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role, status, source')
    .eq('clinic_id', clinicId).eq('week_start', weekStart)
    .in('day_of_week', [...days]).in('status', ['active', 'extra']);
  return (data || []) as ShiftSnapRow[];
}

async function preserveUnaffectedShift(
  clinicId: string, weekStart: string, days: readonly string[],
  newDoctorId: string, snap: ShiftSnapRow[],
): Promise<void> {
  const { supabase } = await import('../supabase');
  const sig = (rows: ShiftSnapRow[]) =>
    rows.map((s) => `${s.period}|${s.clinic_number}|${s.role}|${s.status}|${s.doctor_id}`).sort().join(',');
  for (const day of days) {
    const { data: buildRows } = await supabase
      .from('schedule_slots')
      .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role, status, source')
      .eq('clinic_id', clinicId).eq('week_start', weekStart)
      .eq('day_of_week', day).in('status', ['active', 'extra']);
    const build = (buildRows || []) as ShiftSnapRow[];
    // نصفُ الوافدِ اليوم (من خاناتِه بعدَ البناء) — إن غابَ نُعيدُ اليومَ كاملًا لأصله.
    const hisHalves = new Set(build.filter((s) => s.doctor_id === newDoctorId).map((s) => halfOfSlot(s.period, s.clinic_number)));
    const snapDay = snap.filter((s) => s.day_of_week === day);
    const snapOther = snapDay.filter((s) => !hisHalves.has(halfOfSlot(s.period, s.clinic_number)));
    const otherDocs = new Set(snapOther.map((s) => s.doctor_id));
    // نُبقي نصفَ الوافدِ من البناء، ونُسقِطُ منه أيَّ طبيبٍ من الشفتِ الآخرِ نُقِلَ إليه خطأً (تفادي التكرار).
    const keepBuild = build.filter((s) => hisHalves.has(halfOfSlot(s.period, s.clinic_number)) && !otherDocs.has(s.doctor_id));
    const desired = [...keepBuild, ...snapOther];
    if (sig(build) === sig(desired)) continue; // البناءُ لم يمسَّ الشفتَ الآخرَ — لا كتابة.
    await supabase.from('schedule_slots').delete()
      .eq('clinic_id', clinicId).eq('week_start', weekStart)
      .eq('day_of_week', day).in('status', ['active', 'extra']);
    if (desired.length) {
      await supabase.from('schedule_slots').insert(desired.map((s) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: s.day_of_week,
        period: s.period, clinic_number: s.clinic_number,
        doctor_id: s.doctor_id, doctor_name: s.doctor_name,
        role: s.role, status: s.status, source: s.source ?? 'ai',
      })));
    }
  }
}

function actorOf(ctx: V2ToolContext): { id: string; role: string } | null {
  return ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null;
}

function senderOf(ctx: V2ToolContext): { id?: string; name?: string } {
  return { id: ctx.user?.id, name: ctx.user?.name };
}

/** كلّ معرّفات القادة في العيادة (لإشعار العلم التلقائيّ) */
async function getTeamLeaderIds(clinicId: string): Promise<string[]> {
  const { supabase } = await import('../supabase');
  const { data } = await supabase
    .from('doctors')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('role', 'team_leader');
  return ((data as { id: string }[] | null) || []).map((r) => r.id).filter(Boolean);
}

/** قروب الطبيب الحاليّ (group_id) من عضويّاته */
async function findDoctorGroupId(clinicId: string, doctorId: string): Promise<string | null> {
  const { getAllGroupMembers } = await import('../database');
  const { data } = await getAllGroupMembers(clinicId);
  const m = (data || []).find((x: { doctor_id: string }) => x.doctor_id === doctorId);
  return (m as { group_id?: string } | undefined)?.group_id ?? null;
}

/** معرّف قروب القالب (group_a/group_b/board) في هذه العيادة */
async function resolveGroupId(clinicId: string, templateKey: string): Promise<string | null> {
  const { getDoctorGroups } = await import('../database');
  const { getTemplateByName } = await import('../algorithms/groupTemplates');
  const { data } = await getDoctorGroups(clinicId);
  const g = (data || []).find((x: { name: string }) => getTemplateByName(x.name)?.key === templateKey);
  return (g as { id?: string } | undefined)?.id ?? null;
}

// ─── طبقة الفرق: الأدوات التي تُغيّر الجدول تُلَفّ بكرت «طرأ تغييرٌ على جدولك» ──
// قاعدةُ المستخدم: أيُّ تغييرٍ لمكان الطبيب (عيادة/احتياط/دليقيتر) أو حالته يصله إشعار —
// فحتى عمليّاتُ القائمة (إضافة/استبدال/حذف/ترقية) تُلَفّ، فيُعلَم كلُّ مَن تأثّر موضعُه.
const SEAT_CHANGE_TOOLS = new Set([
  'set_schedule_status', 'cancel_schedule_status', 'move_schedule_status',
  'place_in_clinic', 'leader_apply', 'cover_gap_with_reserve',
  'add_doctor_to_schedule', 'replace_doctor_in_schedule',
  'remove_doctor_from_schedule', 'promote_trainee_independent',
]);

/** مجموعة الكتم لطبقة الفرق: «${actorId}|${weekStart}|${day}» لكلّ يومٍ تصرّف فيه الفاعل
 *  (يعلم تغييرَه بنفسه ذلك اليوم). نجمع القيم اليوميّة: day/toDay/fromDay/days[]/operations[].day. */
function seatChangeSuppress(actorId: string, r: Record<string, unknown>, weekStart: string): Set<string> {
  const out = new Set<string>();
  const add = (d: unknown) => { if (typeof d === 'string' && d) out.add(`${actorId}|${weekStart}|${d}`); };
  add(r.day); add(r.toDay); add(r.fromDay);
  if (Array.isArray(r.days)) for (const d of r.days) add(d);
  if (Array.isArray(r.operations)) for (const op of r.operations) {
    if (op && typeof op === 'object') add((op as Record<string, unknown>).day);
  }
  return out;
}

// ─── الموزّع ───────────────────────────────────────────────────
export async function dispatchRequestToolV2(
  name: string,
  input: unknown,
  ctx: V2ToolContext,
): Promise<string> {
  if (!ctx.clinicId) return 'Tool error: لا توجد عيادة مرتبطة بالمستخدم الحالي.';
  const actor = actorOf(ctx);
  if (!actor) return 'Tool error: لا يوجد مستخدم لتحديد الصلاحيّة.';
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const reqMod = await import('../algorithms/requests_v2');
  const { requestsV2 } = reqMod;

  const exec = async (): Promise<string> => {
  try {
    switch (name) {
      case 'set_schedule_status': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) {
          return 'Tool error: مرّر day بقيمة إنجليزيّة (sunday/monday/tuesday/wednesday/' +
            'thursday) لليوم المقصود في هذا الأسبوع — لا تتركه فارغًا ولا تسأل عن الأسبوع.';
        }
        const status = String(r.status);
        // استئذانٌ مبهم (بلا بداية/نهاية) → لا نسجّل؛ المحرّك يسأل بزرَّين من الكود،
        // والضغط يسجّل مباشرةً عبر resolvePermissionByCode (بلا جولة نموذجٍ للحلّ).
        if (status === 'permission') {
          ctx.onSwapOffer?.({
            kind: 'permission_clarify', weekStart: String(r.weekStart), day: r.day,
            doctorId: doc.id, doctorName: doc.name,
            ...(r.shift === 'evening' || r.shift === 'morning' ? { shift: r.shift } : {}),
          });
          return final(`استئذانُ ${doc.name} يوم ${DAY_AR[r.day]}: بدايةَ الدوام أم نهايتَه؟ اختر من الزرّين.`);
        }
        if (!['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'].includes(status)) {
          return 'Tool error: الحالة غير صالحة.';
        }
        const shift = r.shift === 'evening' ? 'evening' : 'morning';
        // قيدُ الزمن (يُفرَض في setScheduleStatus): غياب/استئذان/تفرّغ لليوم أو المستقبل فقط
        // — لا لماضٍ. الأسبوع القادم حين يسمّيه المستخدم صراحةً (يمرّره النموذج).
        const wsEff = String(r.weekStart);
        const res = await requestsV2.setScheduleStatus(actor, {
          clinicId: ctx.clinicId, weekStart: wsEff, day: r.day,
          doctorId: doc.id, doctorName: doc.name,
          status: status as 'sick_leave' | 'vacation' | 'permission_start' | 'permission_end' | 'extra',
          shift,
        });
        if (!res.success) return `Tool error: ${res.error}`;

        // نفس الحالة مسجّلة أصلًا → تذكيرٌ بالتكرار، بلا إشعاراتٍ جديدة للقادة
        if ((res as { duplicate?: boolean }).duplicate) {
          return final(
            `تنبيه: ${STATUS_AR[status]} لـ${doc.name} يوم ${DAY_AR[r.day]} مسجّلٌ ` +
            'مسبقًا — الطلب مكرّر ولم يتغيّر شيء.',
          );
        }

        // إشعار القائد عند الغياب — واحد لكلّ قائد:
        //  • إشعار العلم (طلب جديد) يصل **دائمًا** — سجلٌّ في صفحة الإشعارات —
        //    ويُستثنى منه الفاعل فقط (لا يُبلَّغ القائد بطلبه هو).
        //  • وكرت التغطية في الأوربّ **يُجمَع** لكلّ أيّام غياب الطبيب نفسه في الأسبوع
        //    في كرتٍ واحد (طبيّة ٣ أيّام = كرتٌ واحد، يومًا بيوم). اليوم بلا نقص يُذكَر
        //    «مغطّى» إن انضمّ لكرتٍ فيه نقص، ووحده لا يُنشئ كرتًا.
        //  • كرت التغطية يصل **حتى للقائد الغائب نفسه**: غيابه نقصٌ كغياب أيّ طبيب،
        //    وعليه أن يرى النقص والحلول.
        //  • «احتياط» (قائد فقط — المحرّك يرفضه من غيره) يُخرج الطبيب من عيادته فعلًا،
        //    فيُعامَل غيابًا كاملًا: إشعار العلم وكرت التغطية كالمرضية بالضبط.
        const ABSENCE = ['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'];
        const perm = (res as { permission?: import('../algorithms/requests_v2').PermissionInfo }).permission;
        if (ABSENCE.includes(status)) {
          try {
            const { notifications } = await import('../algorithms/notifications');
            // استئذانٌ ناجح = الطبيب داخل عيادته (التحويل من مرضية ونحوها يُعيده إلى
            // مكانه أوّلًا أو يفشل) → يومُ غيابه السابق لم يعد نقصًا. أسقِطه من كروت
            // كلّ القادة صراحةً — تحديث الكرت وحده لا يطال كرتًا خارج نافذة التجميع.
            if (status === 'permission_start' || status === 'permission_end') {
              await notifications.resolveCoverageV2({
                clinicId: ctx.clinicId, weekStart: wsEff, day: r.day,
                absentDoctorId: doc.id, covered: { kind: 'all' },
              });
            }
            const leaders = await getTeamLeaderIds(ctx.clinicId);
            // كروت التغطية (النقص) انتقلت إلى خوارزميّة الجدول. وتحويلُ غيابٍ مُغطًّى إلى
            // استئذانٍ لم يعد يُنشئ كرت «تحديد المكان»: المحرّك يُعيد إجلاس العائد تلقائيًّا
            // (تغطيةٌ عكسيّة في requests_v2)، فيكفي إشعار العلم كأيّ استئذان.
            for (const leaderId of leaders) {
              if (leaderId !== actor.id && !ctx.suppressLeaderInfo) {
                // إشعار علمٍ واحدٌ للقائد بتسجيل الحالة (تفاصيل نتيجة التبديل/التغطية
                // التلقائيّة يتولّاها الأورب لاحقًا — لا تُذيَّل هنا).
                await notifications.notifyLeaderOfRequest({
                  clinicId: ctx.clinicId, leaderId,
                  senderId: doc.id, senderName: doc.name,
                  summary: `${STATUS_AR[status]} يوم ${dayWithDate(wsEff, r.day)}`,
                  weekStart: wsEff, day: r.day,
                  // غيابٌ كامل (مرضية/تفرّغ) يُرتّب المحرّك تعويضه → القائد يُطّلع على الجدول
                  scheduleChanged: ABSENCE.includes(status),
                });
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[notify-leader] failed', e instanceof Error ? e.message : e);
          }
        }

        // استئذانٌ بدّل مقعداً (تبديلٌ تلقائيّ) → وازِن **من الآن** (أوّل شفتٍ لم يقع بعدُ،
        // يشمل أيّام هذا الأسبوع قبل الحدث) عبر الأسابيع المبنيّة، صامتًا وفرقاً فقط.
        if ((status === 'permission_start' || status === 'permission_end')
          && perm?.swap && 'withName' in perm.swap) {
          try {
            const { schedule } = await import('../algorithms/schedule');
            const { withXdayJournal } = await import('../algorithms/requests_v2');
            // الشفت الفعليّ كما صحّحه المحرّك من مكان الطبيب (وإلّا ما طلبه الذكاء).
            const fromShift = (res as { effShift?: 'morning' | 'evening' }).effShift ?? shift;
            const rDay = String(r.day) as 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
            // أيّامُ القائد المحميّة (عدّلها يدويًّا) لا تمسّها موازنةُ العدل — تُؤجَّل وتُستأذَن.
            const protectedDays = await protectedDaysFor(ctx.clinicId, wsEff);
            // نلفّ الموازنة بيوميّاتٍ تلتقط امتصاصها في الأيّام البعيدة، فيعكسها الكنسل بدقّة.
            const rbf = await withXdayJournal(ctx.clinicId, wsEff, { day: rDay, doctorId: doc.id }, () =>
              schedule.rebalanceForward({
                clinicId: ctx.clinicId, weekStart: wsEff, fromDay: rDay, fromShift,
                today: todayISOFrom(r), protectedDays,
              }));
            // القلب الجديد مدموجٌ داخل rebalanceForward نفسه (قلبٌ واحد) — لا استدعاءَ منفصلٌ هنا.
            // أيّامٌ أرادتِ الموازنةُ تعديلَها لكنّها محميّة → استأذِن القائدَ (كرت «موازنةُ يومٍ عدّلتَه»).
            await askRebalanceConsent(ctx.clinicId, wsEff, rbf?.deferred ?? [], doc.id, doc.name);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[rebalance-forward perm] failed', e instanceof Error ? e.message : e);
          }
        }

        // ترتيب تعويض النقص (الجديد): غيابٌ كاملٌ (مرضية/تفرّغ) أخرج الطبيب من عيادته
        // → خوارزميّة الجدول تُرتّب تعويض الشفت، ويصل القائدَ كرت [نفّذ] بالفرق.
        // الفرق محسوبٌ في الكود (لا يُكشَف «إعادة التوزيع» — سرّيّة الآليّة).
        if (status === 'sick_leave' || status === 'vacation') {
          try {
            const { loadScheduleData } = await import('../algorithms/schedule');
            const { notifications } = await import('../algorithms/notifications');
            const { applyCoverage, applyNewHeartRebalance, applyReserveRepay, applyThinReshape, reservePairsFromMoves } = await import('../algorithms/solver_shadow');
            const { withXdayJournal } = await import('../algorithms/requests_v2');
            // القلبُ الجديد يغطّي الغيابَ تلقائيًّا (بلا كرت موافقة) + امتصاص الدليقيتر. القائد
            // وصله إشعار العلم أصلًا (scheduleChanged) فيرى الجدول. استثناء: الاحتياطيّ **الخاصّ**
            // (بورد/متدرّب) لا يُوضع تلقائيًّا — يُرجِعه التغطية pending، فنرسل كرت سؤالٍ للقائد.
            {
              // أيّامُ القائد المحميّة (عدّلها يدويًّا): التغطيةُ تلقائيّةٌ دائمًا (سلامةُ المرضى)،
              // لكنّ موازنةَ العدل لا تمسّها — تُؤجَّل وتُستأذَن (كرت «موازنةُ يومٍ عدّلتَه»).
              const protectedDays = await protectedDaysFor(ctx.clinicId, wsEff);
              let deferredRebal: string[] = [];
              // نلفّ التغطية+الامتصاص بيوميّات الأثر البعيد كي يعكسها كنسلُ الغياب بدقّة
              // (يومُ الغياب نفسه يملكه إرجاع المكان المحفوظ؛ اليوميّات للأيّام البعيدة).
              const cov = await withXdayJournal(ctx.clinicId, wsEff, { day: String(r.day), doctorId: doc.id }, async () => {
                const c = await applyCoverage({ clinicId: ctx.clinicId, weekStart: wsEff, label: 'مرضية' });
                // سدادُ الاحتياط داخل الأسبوع (محور الاحتياط) قبل امتصاص الدليقيتر.
                await applyReserveRepay({ clinicId: ctx.clinicId, weekStart: wsEff, label: 'مرضية' }, reservePairsFromMoves(c.moves));
                const rb = await applyNewHeartRebalance({ clinicId: ctx.clinicId, weekStart: wsEff, label: 'مرضية', protectedDays });
                deferredRebal = rb.deferred;
                // الحالة الرفيعة (D=M+1): أعِد تشكيلَ الشفت إلى منفردين + مضيفٍ مكرّس (لا زوجَ استضافة).
                await applyThinReshape({ clinicId: ctx.clinicId, weekStart: wsEff, label: 'مرضية' });
                return c;
              });
              // أيّامٌ أرادتِ الموازنةُ تعديلَها لكنّها محميّة → استأذِن القائدَ.
              await askRebalanceConsent(ctx.clinicId, wsEff, deferredRebal, doc.id, doc.name);
              if (cov.pending.length) {
                const sd = (await loadScheduleData(ctx.clinicId, wsEff)).data;
                const docById = new Map((sd?.doctors ?? []).map((d) => [d.id, d]));
                const kindOf = (id: string): 'board' | 'trainee' =>
                  docById.get(id)?.groupTemplate.key === 'board' ? 'board' : 'trainee';
                const byDay = new Map<string, typeof cov.pending>();
                for (const p of cov.pending) {
                  const arr = byDay.get(p.day) ?? []; arr.push(p); byDay.set(p.day, arr);
                }
                const leaderIds = await getTeamLeaderIds(ctx.clinicId);
                for (const [pday, entries] of byDay) {
                  const seats = entries.map((e) => ({ clinicNumber: e.clinicNumber, period: e.period }));
                  const candIds = [...new Set(entries.flatMap((e) => e.candidateIds))];
                  const candidates = candIds.map((id) => ({ doctorId: id, doctorName: docById.get(id)?.name ?? id, kind: kindOf(id) }));
                  const absentNames = [...new Set(entries.map((e) => e.absentName))];
                  for (const leaderId of leaderIds) {
                    await notifications.notifyLeaderReserveChoice({
                      clinicId: ctx.clinicId, leaderId, weekStart: wsEff,
                      day: pday as typeof r.day, seats, candidates, absentNames,
                    });
                  }
                }
              }
              // نقصٌ حقيقيّ تعذّر ملؤه (عيادةٌ بلا طبيب) → كرت «يوجد فترة فارغة» لكلّ قائد
              // (لكلٍّ نسخته، يختفي عمّن اطّلع وحده). للعلم فقط — لا قرارَ فيه.
              if (cov.shortageSeats.length) {
                const leaderIds = await getTeamLeaderIds(ctx.clinicId);
                for (const leaderId of leaderIds) {
                  await notifications.notifyShortage({
                    clinicId: ctx.clinicId, leaderId, weekStart: wsEff,
                    seats: cov.shortageSeats, senderId: doc.id, senderName: doc.name,
                  });
                }
              }
              // إبلاغ الأطباء المتأثّرين بالتعويض تتولّاه طبقةُ الفرق (كرت «طرأ تغييرٌ
              // على جدولك») التي تلفّ الموزّع — فلا إشعارَ يدويٌّ هنا.
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[coverage-fill] failed', e instanceof Error ? e.message : e);
          }
        }

        // ظلٌّ استأذن → يظهر غائبًا بسببه في خانة الاحتياط (لا تغطية ولا أزرار) — رسالة خاصّة
        if (perm?.shadowToReserve) {
          return final(actor.id === doc.id
            ? `سُجّل ${STATUS_AR[status]} لك يوم ${DAY_AR[r.day]} — أنت ظلٌّ لمدرّبك فلا يحتاج ` +
              'تغطية؛ يظهر اسمُك في الاحتياط بعلامتك ومدرّبك في مكانه. عند الإلغاء تعود إلى جانبه تلقائيًّا.'
            : `تمّ: ${STATUS_AR[status]} لـ${doc.name} يوم ${DAY_AR[r.day]} — ظلٌّ لمدرّبه فلا تغطية؛ ` +
              'يظهر في الاحتياط بعلامته ومدرّبه في مكانه. عند الإلغاء يعود إلى جانبه تلقائيًّا.');
        }
        // تحويلٌ ومكانه مُغطًّى → صار مستأذنًا بلا مركز، والقادة وصلهم كرت تحديد المكان
        if (perm?.covered) {
          return final(actor.id === doc.id
            ? `تمّ التحويل إلى ${STATUS_AR[status]} يوم ${DAY_AR[r.day]} — مكانك السابق ` +
              'مُغطًّى، وسيحدّد القائد أين تعود.'
            : `تمّ التحويل إلى ${STATUS_AR[status]} لـ${doc.name} يوم ${DAY_AR[r.day]} — ` +
              'مكانه السابق مُغطًّى، حدّد مكانه من كرت الذكاء.');
        }

        // غياب الطبيب لنفسه → سؤال الإبلاغ صار **أزرارًا من الكود** (الواجهة تعرض
        // [الشفت][المركز][لا داعي] وتنفّذ الضغط مباشرةً) — النموذج لا يسأل ولا ينفّذ،
        // والنتيجة نهائيّة: الكود يعرض التأكيد والأزرار تحته بلا جولة نموذج.
        const keptPermAr = (res as { keptPermissionAr?: string }).keptPermissionAr;
        const backShadows = (res as { returnedShadows?: string[] }).returnedShadows;
        // نتيجة التبديل التلقائيّ الصامت (استئذانٌ متعارض): المحرّك بدّل الفترة فعلًا — نُخبر فقط.
        let permSwapAr = '';
        if (perm && (status === 'permission_start' || status === 'permission_end')) {
          const sw = perm.swap;
          const self = actor.id === doc.id;
          if (sw && 'withName' in sw) {
            const gap = sw.delegatorGap ? '، وبقيت فترة دليقيتر فارغة وأُبلغ القائد' : '';
            permSwapAr = self
              ? ` — وبُدّلت فترتك مع ${sw.withName} تلقائيًّا${gap}`
              : ` — وبُدّلت فترته مع ${sw.withName}${gap}`;
            // إبلاغ الشريك المبدَّل تتولّاه طبقةُ الفرق (كرت «طرأ تغييرٌ على جدولك»).
          } else if (sw && 'none' in sw) {
            permSwapAr = sw.reason === 'delegator_left'
              ? (self ? ' — ودورك دليقيتر تلك الفترة، تُركت شاغرة وأُبلغ القائد' : ' — ودوره دليقيتر تلك الفترة بلا بديل')
              : (self ? ' — ولا زميل متاح لتبديل فترتك، وأُبلغ القائد' : ' — ولا بديل يغطّي فترته');
          }
        }
        const base = `تمّ: ${STATUS_AR[status]} لـ${doc.name} يوم ${DAY_AR[r.day]} (${wsEff})` +
          `${perm?.wasReserve ? ` — ${perm.wasReserveNoteAr || 'لا يزال احتياطًا ولن يُستدعى وقتَ استئذانه'}` : ''}` +
          `${keptPermAr ? ` — وهو ${keptPermAr}` : ''}` +
          `${permSwapAr}` +
          `${backShadows?.length ? ` — وعاد معه ظلُّه ${backShadows.join(' و')}` : ''}.`;
        // عرضُ الإبلاغ يقرّره المحرّكُ هنا (مصدرٌ واحد): يُطلَق لأيّ غيابٍ/استئذانٍ بصرف النظر
        // عن الفاعل (الطبيبُ لنفسه أو القائدُ عن غيره يدويًّا/ذكاءً) — والحالاتُ التي لا إبلاغ
        // لها (ظلّ/مُغطًّى/مكرّر) رجعت مبكّرًا قبل هذه النقطة. الاحتياط (extra) لا إبلاغ له.
        if (['sick_leave', 'vacation', 'permission_start', 'permission_end'].includes(status)) {
          ctx.onAnnounceOffer?.({
            weekStart: wsEff, day: r.day,
            message: `${doc.name} ${STATUS_AR[status]} يوم ${DAY_AR[r.day]}.`,
            subjectId: doc.id, subjectName: doc.name,
          });
        }
        return final(base);
      }

      case 'request_swap': {
        const wsEff = String(r.weekStart);
        // يومٌ واحد (day) أو أكثر (days) — نوحّدها في قائمةٍ ونُسقط المكرّر وغير الصالح.
        const rawDays: string[] = Array.isArray(r.days) && r.days.length ? r.days.map(String)
          : (r.day ? [String(r.day)] : []);
        const daysList = [...new Set(rawDays)].filter((d) => isDay(d)) as (typeof DAYS)[number][];
        if (daysList.length === 0) return 'Tool error: لا يوم صالح للطلب.';

        let mode: { kind: 'doctor'; doctorId: string } | { kind: 'period'; period: number } | { kind: 'other_shift' };
        let docName = '';
        if (r.target === 'doctor') {
          const doc = resolveDoctor(ctx, r.doctorIndex);
          if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
          if (doc.id === actor.id) return 'Tool error: لا تبديل بين الطبيب ونفسه.';
          mode = { kind: 'doctor', doctorId: doc.id };
          docName = doc.name;
        } else if (r.target === 'period') {
          const p = Number(r.period);
          if (![1, 2, 3, 4].includes(p)) return 'Tool error: الفترة غير صالحة.';
          mode = { kind: 'period', period: p };
        } else {
          mode = { kind: 'other_shift' };
        }
        // نطاقُ الطلب + وسمُه للصياغة («تبديل عام مع الشفت/الفترة …»).
        const scope: 'person' | 'period' | 'shift' =
          r.target === 'doctor' ? 'person' : r.target === 'period' ? 'period' : 'shift';
        const PERIOD_ORD: Record<number, string> = { 1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة' };
        const scopeLabel = scope === 'period' ? `الفترة ${PERIOD_ORD[Number(r.period)] || ''}`.trim() : undefined;

        // الأهدافُ تُحسبُ لكلِّ يومٍ على حدة (التوفّر يختلفُ بحسبِ اليوم).
        const targetsByDay: Partial<Record<(typeof DAYS)[number], { id: string; name: string }[]>> = {};
        let lastErr = '';
        for (const day of daysList) {
          const listed = await requestsV2.listSwapTargets({
            clinicId: ctx.clinicId, weekStart: wsEff, day, requesterId: actor.id, mode,
          });
          if (listed.success && listed.targets && listed.targets.length) targetsByDay[day] = listed.targets;
          else if (listed.error) lastErr = listed.error;
        }
        if (Object.keys(targetsByDay).length === 0) {
          return `Tool error: ${lastErr || 'لا زميل متاحٌ للتبديل في الأيّام المطلوبة.'}`;
        }

        const { notifications } = await import('../algorithms/notifications');
        const opened = await notifications.openSwapGroup({
          clinicId: ctx.clinicId, weekStart: wsEff, days: daysList,
          requesterId: actor.id, requesterName: ctx.user?.name || '',
          targets: [], targetsByDay, scope, scopeLabel,
        });
        if (!opened.success) return `Tool error: ${opened.error}`;

        const sent = (opened.sentDays && opened.sentDays.length ? opened.sentDays : daysList);
        const daysAr = sent.map((d) => DAY_AR[d]).join(' و');
        const dayPhrase = sent.length === 1 ? `يوم ${daysAr}` : `أيّام ${daysAr}`;
        const targetPhrase = scope === 'person'
          ? `إلى ${docName}`
          : `تبديلٍ عامٍّ (مع ${scope === 'shift' ? 'الشفت' : scopeLabel})`;
        const tail = scope === 'person'
          ? 'يتمّ فور موافقته وتصلك النتيجة.'
          : 'أوّل من يوافق (لكلّ يوم) يتمّ التبديل معه فورًا وتصلك النتيجة.';
        return final(`أُرسل طلب ${scope === 'person' ? 'التبديل' : ''} ${targetPhrase} ${dayPhrase} — ${tail}`.replace(/\s+/g, ' ').trim());
      }

      case 'swap_request_status': {
        const { notifications } = await import('../algorithms/notifications');
        const { groups } = await notifications.swapGroupsStatus({ requesterId: actor.id });
        if (groups.length === 0) return final('لا طلبات تبديلٍ مفتوحة لك.');
        const lines = groups.map((g) => {
          const dayAr = DAY_AR[g.day] || g.day;
          if (g.acceptedBy) return `يوم ${dayAr}: وافق ${g.acceptedBy} — تمّ التبديل.`;
          if (g.expired || g.pending === 0) {
            return g.rejected > 0
              ? `يوم ${dayAr}: اعتذر الجميع (${g.rejected} من ${g.total}) — لم يتمّ.`
              : `يوم ${dayAr}: انتهت المهلة دون ردّ.`;
          }
          return `يوم ${dayAr}: رفض ${g.rejected}، باقي ${g.pending} لم يردّوا بعد.`;
        });
        return final(lines.join('\n'));
      }

      case 'cancel_swap_request': {
        const { notifications } = await import('../algorithms/notifications');
        const res = await notifications.cancelSwapGroup({
          requesterId: actor.id, weekStart: String(r.weekStart),
          day: isDay(r.day) ? r.day : undefined,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        const days = (res.canceledDays || []).map((d) => DAY_AR[d] || d).join('، ');
        return final(`أُلغي طلب التبديل${days ? ` (يوم ${days})` : ''}.`);
      }

      case 'cancel_schedule_status': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        // يومٌ مبهم → النظام يقرأ حالاته الحقيقيّة من القاعدة ويعرض الأيّام الصحيحة
        // (بدل تخمين الذكاء). يومٌ واحدٌ من النوع → إلغاءٌ مباشر؛ أكثر → سؤالٌ بالأقواس (كرت).
        if (!isDay(r.day)) {
          const { requestsV2 } = await import('../algorithms/requests_v2');
          const cands = await requestsV2.listDoctorStatuses({
            clinicId: ctx.clinicId, weekStart: String(r.weekStart), doctorId: doc.id,
          });
          const tf = r.statusType;
          const ofType = (s: string) =>
            tf === 'permission' ? (s === 'permission_start' || s === 'permission_end')
              : tf === 'sick_leave' ? s === 'sick_leave'
                : tf === 'vacation' ? s === 'vacation' : true;
          const matches = cands.filter((c) => ofType(c.status));
          const tAr = tf === 'permission' ? 'استئذان' : tf === 'sick_leave' ? 'مرضيّة'
            : tf === 'vacation' ? 'تفرّغ' : 'حالة';
          if (matches.length === 0) return final(`لا ${tAr} مسجّلة لـ${doc.name} هذا الأسبوع لإلغائها.`);
          if (matches.length > 1) {
            const opts = matches.map((m) => `[${DAY_AR[m.day]}]`).join(' ');
            return final(`لـ${doc.name} ${tAr} في أكثر من يوم — أيّ يوم تلغي؟ ${opts}`);
          }
          r.day = matches[0].day;
        }
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        // التقِط شفت المكان المحفوظ **قبل** الإلغاء (cancelStatus يمسح prev_placement)
        let returnShift: 'morning' | 'evening' | null = null;
        try {
          const { schedule } = await import('../algorithms/schedule');
          returnShift = await schedule.placementShift({
            clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day, doctorId: doc.id,
          });
        } catch { /* غيابٌ بلا مكان → لا انعكاس */ }

        // إن لم يُغطَّ مكانه → يعود إليه تلقائيًّا. وإن غُطّي → نعيد ترتيب شفته
        // تلقائيًّا فتُرفع التغطية ويعود هو (لا كرت ولا تدخّل قائد — إشعار علمٍ فقط).
        const res = await requestsV2.cancelStatus(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, restoreToPrevPlace: true,
        });
        if (!res.success) return `Tool error: ${res.error}`;

        // عودة الطبيب (غيابٍ مُغطًّى أو استئذانٍ بدّل مقعدًا): الاستردادُ الجراحيّ تمّ داخل
        // cancelStatus (والعالم-المتغيّر بـapplyReturn) — لا عجلةَ قديمة هنا، القلبُ الجديد
        // هو المحرّك الوحيد. إن استُرِدّ المكان نوازِن **من الآن** (أوّل شفتٍ لم يقع بعدُ، يشمل
        // أيّام هذا الأسبوع قبل الحدث) عبر الأسابيع المبنيّة، صامتًا وفرقاً فقط — **بلا إشعار**.
        if (returnShift && res.restored) {
          try {
            const { schedule } = await import('../algorithms/schedule');
            await schedule.rebalanceForward({
              clinicId: ctx.clinicId, weekStart: String(r.weekStart), fromDay: r.day, fromShift: returnShift,
              today: todayISOFrom(r),
            });
            // القلب الجديد مدموجٌ داخل rebalanceForward نفسه (قلبٌ واحد) — لا استدعاءَ منفصلٌ هنا.
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[rebalance-forward] failed', e instanceof Error ? e.message : e);
          }
        }

        // الغياب لم يعد قائمًا → أسقِط هذا اليوم من كروت النقص عند **كلّ** القادة،
        // وأبلِغ القادة (عدا الفاعل) تلقائيًّا بالإلغاء وبمصير مكانه.
        try {
          const { notifications } = await import('../algorithms/notifications');
          await notifications.resolveCoverageV2({
            clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
            absentDoctorId: doc.id, covered: { kind: 'all' },
          });
          // وعروض تبديل الفترة المعلّقة وُجدت بسبب هذا الاستئذان فقط → اكنسها معه
          // (وافق زميلٌ فعلًا؟ cancelSwapGroup يُرجِع فشلًا ولا يكنس — التبديل تمّ).
          if ((res as { permissionCanceled?: boolean }).permissionCanceled) {
            await notifications.cancelSwapGroup({
              requesterId: doc.id, weekStart: String(r.weekStart), day: r.day,
            });
          }
          // العائد صار متاحًا → أنعِش كروت بقيّة غائبي اليوم كي يظهر مرشّحًا لهم
          // (كما يفعل مسار تسجيل الغياب تمامًا — وإلّا بقيت اقتراحاتهم بائتةً بلا العائد).
          await refreshCoverageCards(ctx.clinicId, String(r.weekStart), r.day, { id: doc.id, name: doc.name });
          const statusAr = (STATUS_AR as Record<string, string>)[String(res.canceledStatus)] || 'الحالة';
          const leaders = await getTeamLeaderIds(ctx.clinicId);
          for (const leaderId of leaders) {
            // الإلغاء (وأيُّ انعكاسٍ تلقائيّ) = إشعار علمٍ للقائد فقط — لا كرت ولا
            // تدخّل. المحرّك يعيد الترتيب وحده؛ القائد يُبلَّغ بالمصير لا غير.
            if (leaderId !== actor.id && !ctx.suppressLeaderInfo) {
              await notifications.notifyLeaderOfRequest({
                clinicId: ctx.clinicId, leaderId,
                senderId: doc.id, senderName: doc.name,
                summary: `إلغاء ${statusAr} يوم ${dayWithDate(String(r.weekStart), r.day)}`,
                weekStart: String(r.weekStart), day: r.day,
                kind: 'cancel', // إلغاءٌ — يُجمَع مع إلغاءٍ آخر فقط، ولا يمحو إشعارَ التسجيل
                // الإلغاء أعاد ترتيب الجدول (عودة/رفع تغطية) → القائد يُطّلع عليه
                scheduleChanged: !!((res as { covered?: boolean }).covered || (res as { restored?: boolean }).restored),
              });
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log('[notify-cancel] failed', e instanceof Error ? e.message : e);
        }

        // إلغاءُ أيّ طلبٍ → اسأل صاحبَه (طبيبًا كان أو قائدًا) مَن يُبلِغ: أزرار
        // [الشفت][المركز][لا داعي] من الكود (القادة وصلهم إشعارهم التلقائيّ، فيُستثنون).
        {
          const stAr = (STATUS_AR as Record<string, string>)[String(res.canceledStatus)] || 'الطلب';
          ctx.onAnnounceOffer?.({
            weekStart: String(r.weekStart), day: r.day,
            message: `إلغاء ${stAr} ${doc.name} يوم ${DAY_AR[r.day]}.`,
            subjectId: doc.id, subjectName: doc.name,
          });
        }

        const rcf = res as {
          permissionCanceled?: boolean; permSwapReverted?: boolean; permSwapRecompute?: boolean; returnedToReserve?: boolean;
          shadowReturned?: boolean; shadowSupervisorAbsent?: boolean; returnedShadows?: string[];
        };
        // إلغاء استئذان: إن لم يكن بدّل مقعداً → تُزال العلامة فقط. وإن بدّل → يعود إلى
        // مقعده: عكسٌ حرفيّ (عالمٌ ثابت) أو إعادة حسابٍ للشفت (مُضيف/عالمٌ متغيّر).
        if (rcf.permissionCanceled) {
          return final(rcf.permSwapReverted || rcf.permSwapRecompute
            ? `تمّ إلغاء استئذان ${doc.name} يوم ${DAY_AR[r.day]} — وعاد إلى مقعده${rcf.permSwapRecompute ? ' وأُعيد ترتيب الشفت' : ''}.`
            : `تمّ إلغاء استئذان ${doc.name} يوم ${DAY_AR[r.day]} — أُزيلت العلامة ومكانه في الجدول كما هو.`);
        }
        if (rcf.returnedToReserve) {
          return final(`تمّ إلغاء استئذان ${doc.name} يوم ${DAY_AR[r.day]} — يبقى احتياطًا كما كان.`);
        }
        if (rcf.shadowReturned) {
          return final(`تمّ الإلغاء — عاد ${doc.name} إلى جانب مدرّبه في العيادة.`);
        }
        if (rcf.shadowSupervisorAbsent) {
          return final(`تمّ الإلغاء — مدرّبه غائبٌ هذا اليوم فبقي ${doc.name} في الاحتياط، ويعود معه عند عودته.`);
        }

        const cancelBase = `تمّ إلغاء حالة ${doc.name} يوم ${DAY_AR[r.day]}.`;
        // مكانه السابق مُغطًّى ولا مقعدَ محفوظًا يُستردّ (كان احتياطًا) — أبلِغ بصدق، يحدّد القائد مكانه.
        if (res.covered) {
          return final(cancelBase + ' مكانه السابق مُغطًّى وتعذّر الترتيب التلقائيّ — أُبلغ القادة.');
        }
        // كن صادقًا: لا تدّعِ الإرجاع إن لم يوجد مكانٌ محفوظ (لم يكن منسَّبًا وقت الغياب).
        return final(res.restored
          ? cancelBase.replace('.', ' وإرجاعه إلى مكانه في العيادة' +
              `${rcf.returnedShadows?.length ? ` — وعاد معه ظلُّه ${rcf.returnedShadows.join(' و')}` : ''}.`)
          : cancelBase + ' (لا مكان محفوظ لإرجاعه — لم يكن منسَّبًا في العيادة وقت الغياب.)');
      }

      case 'move_schedule_status': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.toDay)) return 'Tool error: يوم الوجهة غير صالح.';
        const wsEff = String(r.weekStart);
        const { requestsV2 } = await import('../algorithms/requests_v2');

        // المصدر من القاعدة (لا تخمين). يوم المصدر: مُسمّى أو يُستنتَج/يُسأل بكرت.
        const cands = await requestsV2.listDoctorStatuses({
          clinicId: ctx.clinicId, weekStart: wsEff, doctorId: doc.id,
        });
        let fromDay: (typeof DAYS)[number] | null = isDay(r.fromDay) ? r.fromDay : null;
        if (!fromDay) {
          const days = Array.from(new Set(cands.map((c) => c.day)));
          if (days.length === 0) return final(`لا حالة مسجّلة لـ${doc.name} هذا الأسبوع لنقلها.`);
          if (days.length > 1) {
            const opts = days.map((d) => `[${DAY_AR[d]}]`).join(' ');
            return final(`لـ${doc.name} حالاتٌ في أكثر من يوم — أيّ يومٍ تنقل؟ ${opts}`);
          }
          fromDay = days[0];
        }
        const srcStatus = cands.find((c) => c.day === fromDay)?.status;
        if (!srcStatus) return final(`لا حالة لـ${doc.name} يوم ${DAY_AR[fromDay]} لنقلها.`);

        // الوجهة: المُمرَّرة أو نفس نوع المصدر. وجهةٌ استئذانٌ مبهمة (`permission`):
        //  • المصدر استئذانٌ أصلًا → احفظ نوعه (بداية/نهاية) — نقلٌ لنفس الحالة بلا سؤال.
        //  • المصدر مرضية/تفرّغ (تغيير نوعٍ إلى استئذان) → اسأل بداية/نهاية بكرت.
        let toStatus = typeof r.toStatus === 'string' && r.toStatus ? r.toStatus : srcStatus;
        if (toStatus === 'permission') {
          if (srcStatus === 'permission_start' || srcStatus === 'permission_end') toStatus = srcStatus;
          else return final(`استئذانُ ${doc.name} يوم ${DAY_AR[r.toDay]}: بدايةَ الدوام أم نهايتَه؟ [بداية الدوام] [نهاية الدوام]`);
        }
        if (!['sick_leave', 'vacation', 'permission_start', 'permission_end'].includes(toStatus)) {
          return 'Tool error: نوع الوجهة غير صالح.';
        }
        if (fromDay === r.toDay && toStatus === srcStatus) {
          return final(`${STATUS_AR[srcStatus]} ${doc.name} يوم ${DAY_AR[fromDay]} كما هي — لا نقل.`);
        }

        // إلغاء المصدر ثمّ تسجيل الوجهة بإشعارٍ **مكتوم** (لا إشعارَي علمٍ منفصلَين ولا
        // أزرار إبلاغ) — يُعاد استعمال منطق الإلغاء/التسجيل كاملًا (تبديل، تغطية…).
        const subCtx: V2ToolContext = { ...ctx, suppressLeaderInfo: true, onAnnounceOffer: undefined };
        const cancelRaw = await dispatchRequestToolV2('cancel_schedule_status', {
          weekStart: wsEff, day: fromDay, doctorIndex: r.doctorIndex,
        }, subCtx);
        if (!cancelRaw.startsWith(FINAL_MARK)) return cancelRaw;
        const setRaw = await dispatchRequestToolV2('set_schedule_status', {
          weekStart: wsEff, day: r.toDay, doctorIndex: r.doctorIndex, status: toStatus,
          ...(r.shift === 'evening' || r.shift === 'morning' ? { shift: r.shift } : {}),
        }, subCtx);
        if (!setRaw.startsWith(FINAL_MARK)) return setRaw;

        // إشعارٌ واحدٌ مجمّع للقادة (عدا الفاعل) — حدثُ نقلٍ واحد.
        try {
          const { notifications } = await import('../algorithms/notifications');
          for (const leaderId of await getTeamLeaderIds(ctx.clinicId)) {
            if (leaderId !== actor.id) {
              await notifications.notifyLeaderOfRequest({
                clinicId: ctx.clinicId, leaderId, senderId: doc.id, senderName: doc.name,
                summary: `نقل ${doc.name}: ${STATUS_AR[srcStatus]} ${DAY_AR[fromDay]} → ${STATUS_AR[toStatus]} يوم ${dayWithDate(wsEff, r.toDay)}`,
                weekStart: wsEff, day: r.toDay, kind: 'move', scheduleChanged: true,
              });
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log('[notify-move] failed', e instanceof Error ? e.message : e);
        }

        return final(`تمّ النقل: ${doc.name} — ${STATUS_AR[srcStatus]} ${DAY_AR[fromDay]} أصبحت ${STATUS_AR[toStatus]} ${DAY_AR[r.toDay]}.`);
      }

      case 'place_in_clinic': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const periods = Array.isArray(r.periods)
          ? r.periods.filter((p): p is number => Number.isInteger(p) && p >= 1 && p <= 4) : [];
        const res = await requestsV2.placeInClinic(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, doctorName: doc.name,
          clinicNumber: Number(r.clinicNumber), periods,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        // وُضع العائد فعليًّا → أغلِق كروت «عودة تحتاج مكانًا» المطابقة عند كلّ القادة
        try {
          const { notifications } = await import('../algorithms/notifications');
          await notifications.resolvePlacementV2({
            clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day, doctorId: doc.id,
          });
        } catch { /* إغلاق الكروت تحسينٌ */ }
        const moved = (res.displaced || [])
          .map((d) => `أُزيح ${d.name} من الفترة ${d.periods.join('، ')} (بقيت له خاناته الأخرى)`)
          .join('، و');
        const permNote = (res as { permissionNoteAr?: string }).permissionNoteAr;
        return final(`تمّ وضع ${doc.name} في عيادة ${r.clinicNumber} (الفترات ${periods.join('، ')}) ` +
          `يوم ${DAY_AR[r.day]}${permNote ? ` — ${permNote}` : ''}.${moved ? ` و${moved}.` : ''}`);
      }

      case 'cover_gap_with_reserve': {
        // قرارٌ للقائد فأعلى — كرت السؤال لا يصل غيرهم، ولا يُحسَم استدعاء احتياطيٍّ خاصّ بطبيب.
        if (!isLeaderPlusRole(actor.role)) return 'Tool error: حسمُ تغطية النقص باستدعاء احتياطيٍّ للقائد فأعلى.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const ws = String(r.weekStart);
        if (r.decline) {
          // «لا أحد»: لا يُستدعى الاحتياطيّ الخاصّ — والمحرّك يتكفّل بالتغطية من المتاح
          // (نفسُ منطق زرّ «لا أحد» في الكرت — declineReserveChoiceByCode بالكود).
          const res = await declineReserveChoiceByCode({ clinicId: ctx.clinicId, weekStart: ws, day: r.day });
          if (!res.success) return `Tool error: ${res.error ?? 'تعذّر إكمال التغطية.'}`;
          return final(`تمّ — لن نستدعي أحدًا، وسأتكفّل أنا بترتيب التغطية يوم ${DAY_AR[r.day]}.`);
        }
        const pick = resolveDoctor(ctx, r.doctorIndex);
        if (!pick) return 'Tool error: رقم الطبيب غير صالح.';
        const cNum = Number(r.clinicNumber); const per = Number(r.period);
        if (!Number.isInteger(cNum) || cNum < 1 || ![1, 2, 3, 4].includes(per)) return 'Tool error: حدّد العيادة والفترة من الكرت.';
        // نفسُ مسار زرّ الاسم في الكرت (placeReserveByCode) — وضعٌ ثمّ إغلاق الكرت.
        const pr = await placeReserveByCode({ clinicId: ctx.clinicId, weekStart: ws, day: r.day, clinicNumber: cNum, period: per, doctorId: pick.id, closeCard: true });
        if (!pr.success) return `Tool error: تعذّر وضع الاحتياطيّ (${pr.error ?? ''}).`;
        // إبلاغ الاحتياطيّ المختار بمقعده الجديد تتولّاه طبقةُ الفرق (كرت «طرأ تغييرٌ على جدولك»).
        return final(`تمّ: ${pick.name} يغطّي عيادة ${cNum} الفترة ${per} يوم ${DAY_AR[r.day]}.`);
      }

      case 'announce_to': {
        const res = await announceAbsence({
          clinicId: ctx.clinicId,
          sender: senderOf(ctx),
          audience: r.audience === 'center' ? 'center' : 'shift',
          message: String(r.message || ''),
          subjectId: r.subjectDoctorIndex != null
            ? resolveDoctor(ctx, r.subjectDoctorIndex)?.id
            : undefined,
        });
        return res.success ? final(res.info || 'تمّ الإبلاغ.') : `Tool error: ${res.error}`;
      }

      case 'broadcast_announcement': {
        if (!isLeaderPlusRole(actor.role)) return 'Tool error: التعميم للقائد فأعلى فقط.';
        const res = await broadcastAnnouncement({
          clinicId: ctx.clinicId,
          sender: senderOf(ctx),
          audience: r.audience === 'center' ? 'center' : 'shift',
          message: String(r.message || ''),
          title: r.title != null ? String(r.title) : undefined,
        });
        return res.success ? final(res.info || 'تمّ إرسال التعميم.') : `Tool error: ${res.error}`;
      }

      case 'clear_week': {
        // لا نمسح مباشرةً — تأكيدٌ حتميّ بالكود: الواجهة تعرض [نعم، امسح][تراجع]
        // وتنفّذ المسح عبر clearWeekByCode عند التأكيد (لا مسحٌ مفاجئ من النموذج).
        ctx.onConfirmOffer?.({
          kind: 'clear_week', weekStart: String(r.weekStart),
          message: `سيُمسح جدول أسبوع ${r.weekStart} كاملًا.`,
        });
        return final(`سيُمسح جدول أسبوع ${r.weekStart} كاملًا — هل أنت متأكّد؟`);
      }

      case 'set_clinic_count': {
        const res = await requestsV2.setClinicCount(actor, ctx.clinicId, Number(r.count));
        return res.success ? final(`تمّ ضبط عدد العيادات على ${r.count}.`) : `Tool error: ${res.error}`;
      }

      case 'move_doctor_group': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        const toKey = String(r.toGroup);
        if (!['group_a', 'group_b', 'board'].includes(toKey)) return 'Tool error: القروب الهدف غير صالح.';
        const fromGroupId = await findDoctorGroupId(ctx.clinicId, doc.id);
        const toGroupId = await resolveGroupId(ctx.clinicId, toKey);
        if (!toGroupId) return 'Tool error: القروب الهدف غير موجود في العيادة.';
        const res = await requestsV2.moveDoctorGroup(actor, doc.id, doc.name, fromGroupId, toGroupId);
        return res.success ? final(`تمّ نقل ${doc.name} إلى القروب الجديد.`) : `Tool error: ${res.error}`;
      }

      case 'set_group_status': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        const ws = String(r.workStatus);
        if (!['active', 'vacation', 'light_duty', 'trainee'].includes(ws)) return 'Tool error: الحالة غير صالحة.';
        const groupId = await findDoctorGroupId(ctx.clinicId, doc.id);
        if (!groupId) return 'Tool error: لا يوجد قروب لهذا الطبيب.';
        const supervisor = ws === 'trainee' ? resolveDoctor(ctx, r.supervisorIndex) : null;
        const res = await requestsV2.setDoctorGroupStatus(actor, groupId, doc.id, ws, supervisor?.id ?? null);
        return res.success ? final(`تمّ ضبط حالة ${doc.name}: ${WORK_AR[ws]}.`) : `Tool error: ${res.error}`;
      }

      case 'add_doctor_to_schedule': {
        // إدخالُ طبيبٍ أُضيف لقروبه: إعادةُ بناءٍ جزئيّة من اليوم المحدّد بالوصفة المحفوظة
        // والقائمة الحاليّة (تضمّ الطبيب الجديد تلقائيًّا). الأيّامُ السابقةُ لا تُمسّ.
        if (!isLeaderPlusRole(actor.role)) return 'Tool error: إضافةُ طبيبٍ للجدول للقائد فأعلى.';
        if (!isDay(r.day)) return 'Tool error: حدّد يوم البداية (اليوم/الغد/يومًا محدّدًا).';
        const ws2 = String(r.weekStart);
        const { schedule } = await import('../algorithms/schedule');
        const recipe = await schedule.loadBuildConfig(ctx.clinicId, ws2);
        if (!recipe) return 'Tool error: لا توجد وصفة بناءٍ محفوظة لهذا الأسبوع — أعِد بناء الجدول أوّلًا.';
        const who = resolveDoctor(ctx, r.doctorIndex);
        // لقطةٌ قبلَ البناء لاستعادةِ شفتِ من لا علاقةَ له بالوافد (عزلُ الأثر).
        const orderA = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
        const daysFromA = orderA.slice(orderA.indexOf(r.day));
        const snapA = who ? await snapshotActiveExtra(ctx.clinicId, ws2, daysFromA) : [];
        const built = await schedule.build({
          ...recipe, clinicId: ctx.clinicId, weekStart: ws2, fromDay: r.day, dryRun: false,
        } as Parameters<typeof schedule.build>[0]);
        if (!built.success) return `Tool error: ${built.summary || (built.errors || []).join('، ') || 'تعذّرت إعادة التوزيع.'}`;
        // أعِد شفتَ من لم يُضَف إلى أصله: لا تغييرَ ولا إشعارَ لأطبائه.
        if (who) await preserveUnaffectedShift(ctx.clinicId, ws2, daysFromA, who.id, snapA);
        return final(`تمّ — أُدخِل ${who ? who.name : 'الطبيب الجديد'} من يوم ${DAY_AR[r.day]}، وأُعيد توزيعُ شفتِه بعدلٍ (الشفتُ الآخرُ والأيّامُ السابقةُ كما هي).`);
      }

      case 'replace_doctor_in_schedule': {
        // استبدالٌ حرفيّ: د(in) يأخذ خانات د(out) نفسها من اليوم المحدّد — بلا إعادة توزيع.
        if (!isLeaderPlusRole(actor.role)) return 'Tool error: الاستبدال للقائد فأعلى.';
        const day = r.day;
        if (!isDay(day)) return 'Tool error: حدّد يوم البداية (اليوم/الغد/يومًا محدّدًا).';
        const outD = resolveDoctor(ctx, r.outDoctorIndex);
        const inD = resolveDoctor(ctx, r.inDoctorIndex);
        if (!outD || !inD) return 'Tool error: رقم الطبيب غير صالح.';
        if (outD.id === inD.id) return 'Tool error: لا يصحّ استبدال الطبيب بنفسه.';
        const ws2 = String(r.weekStart);
        const rep = await reqMod.replaceDoctorLiteral({ clinicId: ctx.clinicId, weekStart: ws2, fromDay: day, outId: outD.id, inId: inD.id, inName: inD.name });
        if (r.permanent) {
          const { supabase } = await import('../supabase');
          const outGid = await findDoctorGroupId(ctx.clinicId, outD.id);
          const inGid = await findDoctorGroupId(ctx.clinicId, inD.id);
          if (outGid && inGid && outGid !== inGid) await requestsV2.moveDoctorGroup(actor, inD.id, inD.name, inGid, outGid);
          if (outGid) await supabase.from('doctor_group_members').delete().eq('doctor_id', outD.id).eq('group_id', outGid);
        }
        return final(`تمّ — ${inD.name} حلّ مكان ${outD.name} حرفيًّا من يوم ${DAY_AR[day]} (${rep.replaced} خانة)${r.permanent ? ' · ودائمًا في القائمة' : ''}.`);
      }

      case 'remove_doctor_from_schedule': {
        // حذفٌ + إعادةُ توزيعٍ عادلة من اليوم المحدّد (الأيّامُ السابقةُ لا تُمسّ).
        if (!isLeaderPlusRole(actor.role)) return 'Tool error: الحذف للقائد فأعلى.';
        const day = r.day;
        if (!isDay(day)) return 'Tool error: حدّد يوم البداية (اليوم/الغد/يومًا محدّدًا).';
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        const ws2 = String(r.weekStart);
        const { schedule } = await import('../algorithms/schedule');
        const recipe = await schedule.loadBuildConfig(ctx.clinicId, ws2);
        if (!recipe) return 'Tool error: لا توجد وصفة بناءٍ محفوظة لهذا الأسبوع — أعِد بناء الجدول أوّلًا.';
        const order = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
        const daysFrom = order.slice(order.indexOf(day));
        let recipeForBuild: typeof recipe = recipe;
        if (r.permanent) {
          // غادر المركز: أزِله من قروبه فلا يظهر في الأسابيع القادمة، ثمّ أعِد البناء (N−1).
          const { supabase } = await import('../supabase');
          const gid = await findDoctorGroupId(ctx.clinicId, doc.id);
          if (gid) await supabase.from('doctor_group_members').delete().eq('doctor_id', doc.id).eq('group_id', gid);
        } else {
          // هذا الأسبوع فقط: علّمه غائبًا للأيّام من البداية في الوصفة (يُستثنى من البناء)، واحفظها.
          const extra = daysFrom.map((d) => ({ doctorId: doc.id, day: d, scope: 'full' as const, status: 'vacation' as const }));
          recipeForBuild = { ...recipe, extraAbsences: [...((recipe as { extraAbsences?: unknown[] }).extraAbsences as { doctorId: string; day: string; scope: string; status?: string }[] || []), ...extra] } as typeof recipe;
          await schedule.saveBuildConfig({ ...recipeForBuild, clinicId: ctx.clinicId, weekStart: ws2, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
        }
        const built = await schedule.build({ ...recipeForBuild, clinicId: ctx.clinicId, weekStart: ws2, fromDay: day, dryRun: false } as Parameters<typeof schedule.build>[0]);
        if (!built.success) return `Tool error: ${built.summary || (built.errors || []).join('، ') || 'تعذّرت إعادة التوزيع.'}`;
        return final(`تمّ — حُذف ${doc.name} وأُعيد توزيعُ الباقين بعدلٍ من يوم ${DAY_AR[day]}${r.permanent ? ' · وأُزيل من القائمة (الأسابيع القادمة بلا اسمه)' : ' (هذا الأسبوع فقط)'}.`);
      }

      case 'promote_trainee_independent': {
        // ترقيةُ متدرّبٍ ظلٍّ إلى مستقلّ ثمّ إعادةُ توزيعه كوافدٍ جديد من اليوم المحدّد.
        if (!isLeaderPlusRole(actor.role)) return 'Tool error: الترقية للقائد فأعلى.';
        const day = r.day;
        if (!isDay(day)) return 'Tool error: حدّد يوم البداية (اليوم/الغد/يومًا محدّدًا).';
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        const ws2 = String(r.weekStart);
        const { schedule } = await import('../algorithms/schedule');
        const recipe = await schedule.loadBuildConfig(ctx.clinicId, ws2);
        if (!recipe) return 'Tool error: لا توجد وصفة بناءٍ محفوظة لهذا الأسبوع — أعِد بناء الجدول أوّلًا.';
        const tm = { ...((recipe as { traineeModes?: Record<string, string> }).traineeModes || {}), [doc.id]: 'independent' as const };
        const newRecipe = { ...recipe, traineeModes: tm } as typeof recipe;
        await schedule.saveBuildConfig({ ...newRecipe, clinicId: ctx.clinicId, weekStart: ws2, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
        // لقطةٌ قبلَ البناء لعزلِ الأثر عن شفتِ من لا علاقةَ له بالمُرقَّى.
        const orderP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
        const daysFromP = orderP.slice(orderP.indexOf(day));
        const snapP = await snapshotActiveExtra(ctx.clinicId, ws2, daysFromP);
        const built = await schedule.build({ ...newRecipe, clinicId: ctx.clinicId, weekStart: ws2, fromDay: day, dryRun: false } as Parameters<typeof schedule.build>[0]);
        if (!built.success) return `Tool error: ${built.summary || (built.errors || []).join('، ') || 'تعذّرت إعادة التوزيع.'}`;
        await preserveUnaffectedShift(ctx.clinicId, ws2, daysFromP, doc.id, snapP);
        return final(`تمّ — ${doc.name} صار مستقلًّا وأُعيد توزيعُ شفتِه من يوم ${DAY_AR[day]} (الشفتُ الآخرُ كما هو).`);
      }

      case 'leader_apply': {
        if (!isLeaderPlusRole(actor.role)) return 'Tool error: أداة الليدر الشاملة للقائد فأعلى.';
        const ws = String(r.weekStart);
        const ops = Array.isArray(r.operations) ? (r.operations as Record<string, unknown>[]) : [];
        if (!ops.length) return 'Tool error: لا توجد عمليّات للتنفيذ.';
        const done: string[] = [];
        const failed: string[] = [];
        const editedDays = new Set<string>(); // أيّامٌ رتّبها القائدُ بنجاح → تُوسَم لحمايتها من موازنة العدل
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i] || {};
          const kind = String(op.op || '');
          const tag = `[${i + 1}]`;
          const day = isDay(op.day) ? op.day : undefined;
          let opDay: string | undefined = day; // يومُ العمليّة (قد يُحدَّد داخليًّا — cancel_status)
          const doneBefore = done.length;
          try {
            if (kind === 'place') {
              const doc = resolveDoctor(ctx, op.doctorIndex);
              if (!doc) { failed.push(`${tag} رقم طبيب غير صالح`); continue; }
              if (!day) { failed.push(`${tag} اليوم مفقود`); continue; }
              const periods = Array.isArray(op.periods)
                ? op.periods.filter((p): p is number => Number.isInteger(p) && p >= 1 && p <= 4) : [];
              const res = await requestsV2.placeInClinic(actor, {
                clinicId: ctx.clinicId, weekStart: ws, day, doctorId: doc.id, doctorName: doc.name,
                clinicNumber: Number(op.clinicNumber), periods,
              });
              if (!res.success) { failed.push(`${tag} ${doc.name}: ${res.error}`); continue; }
              done.push(`${doc.name} → عيادة ${op.clinicNumber} (ف${periods.join('،')}) ${DAY_AR[day]}`);
            } else if (kind === 'delegator') {
              const doc = resolveDoctor(ctx, op.doctorIndex);
              if (!doc) { failed.push(`${tag} رقم طبيب غير صالح`); continue; }
              if (!day) { failed.push(`${tag} اليوم مفقود`); continue; }
              const res = await requestsV2.placeAsDelegator(actor, {
                clinicId: ctx.clinicId, weekStart: ws, day, doctorId: doc.id, doctorName: doc.name,
                period: op.period != null ? Number(op.period) : undefined,
              });
              if (!res.success) { failed.push(`${tag} ${doc.name}: ${res.error}`); continue; }
              done.push(`${doc.name} دليقيتر (ف${res.period}) ${DAY_AR[day]}`);
            } else if (kind === 'set_status') {
              const doc = resolveDoctor(ctx, op.doctorIndex);
              if (!doc) { failed.push(`${tag} رقم طبيب غير صالح`); continue; }
              if (!day) { failed.push(`${tag} اليوم مفقود`); continue; }
              const status = String(op.status);
              if (!['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'].includes(status)) {
                failed.push(`${tag} ${doc.name}: حالة غير صالحة (حدّد بداية/نهاية الاستئذان)`); continue;
              }
              const shift = op.shift === 'evening' ? 'evening' : 'morning';
              const res = await requestsV2.setScheduleStatus(actor, {
                clinicId: ctx.clinicId, weekStart: ws, day, doctorId: doc.id, doctorName: doc.name,
                status: status as 'sick_leave' | 'vacation' | 'permission_start' | 'permission_end' | 'extra', shift,
              });
              if (!res.success) { failed.push(`${tag} ${doc.name}: ${res.error}`); continue; }
              done.push(`${doc.name} ${STATUS_AR[status]} ${DAY_AR[day]}`);
            } else if (kind === 'cancel_status') {
              const doc = resolveDoctor(ctx, op.doctorIndex);
              if (!doc) { failed.push(`${tag} رقم طبيب غير صالح`); continue; }
              let cday = day;
              if (!cday) {
                const cands = await requestsV2.listDoctorStatuses({ clinicId: ctx.clinicId, weekStart: ws, doctorId: doc.id });
                const tf = op.statusType;
                const ofType = (s: string) =>
                  tf === 'permission' ? (s === 'permission_start' || s === 'permission_end')
                    : tf === 'sick_leave' ? s === 'sick_leave'
                      : tf === 'vacation' ? s === 'vacation' : true;
                const matches = cands.filter((c) => ofType(c.status));
                if (matches.length === 1) cday = matches[0].day;
                else { failed.push(`${tag} ${doc.name}: حدّد اليوم${matches.length > 1 ? ` (${matches.map((m) => DAY_AR[m.day]).join('، ')})` : ''}`); continue; }
              }
              const res = await requestsV2.cancelStatus(actor, {
                clinicId: ctx.clinicId, weekStart: ws, day: cday, doctorId: doc.id, restoreToPrevPlace: true,
              });
              if (!res.success) { failed.push(`${tag} ${doc.name}: ${res.error}`); continue; }
              opDay = cday; // يومُ الإلغاء (قد يكون استُنبط) — لوسمِ التعديل
              done.push(`إلغاء حالة ${doc.name} ${DAY_AR[cday]}`);
            } else if (kind === 'swap') {
              if (!day) { failed.push(`${tag} اليوم مفقود`); continue; }
              const idxs = Array.isArray(op.doctorIndexes) ? op.doctorIndexes : [];
              const docs = idxs.map((n) => resolveDoctor(ctx, n)).filter((d): d is Resolved => d != null);
              if (docs.length < 2) { failed.push(`${tag} التبديل يحتاج طبيبَين صالحَين`); continue; }
              const scoped = op.scope === 'shift' || op.scope === 'period';
              if (docs.length === 2 && !scoped) {
                const res = await requestsV2.swapFullPositions(actor, {
                  clinicId: ctx.clinicId, weekStart: ws, day, aId: docs[0]!.id, bId: docs[1]!.id,
                });
                if (!res.success) { failed.push(`${tag} ${res.error}`); continue; }
              } else {
                const scope = op.scope === 'shift'
                  ? { kind: 'shift' as const, shift: (op.shift === 'evening' ? 'evening' : 'morning') as 'morning' | 'evening' }
                  : op.scope === 'period'
                    ? { kind: 'period' as const, period: Number(op.period) }
                    : { kind: 'day' as const };
                const res = await requestsV2.swapInSchedule(actor, {
                  clinicId: ctx.clinicId, weekStart: ws, day, doctorIds: docs.map((d) => d.id), scope,
                });
                if (!res.success) { failed.push(`${tag} ${res.error}`); continue; }
              }
              done.push(`تبديل ${docs.map((d) => d.name).join(' ⇄ ')} ${DAY_AR[day]}`);
            } else if (kind === 'attach_trainee') {
              const trainee = resolveDoctor(ctx, op.traineeDoctorIndex);
              const sup = resolveDoctor(ctx, op.supervisorDoctorIndex);
              if (!trainee || !sup) { failed.push(`${tag} رقم طبيب غير صالح`); continue; }
              if (!day) { failed.push(`${tag} اليوم مفقود`); continue; }
              const res = await requestsV2.attachTraineeForDay(actor, {
                clinicId: ctx.clinicId, weekStart: ws, day, traineeId: trainee.id, traineeName: trainee.name,
                supervisorId: sup.id, supervisorName: sup.name,
              });
              if (!res.success) { failed.push(`${tag} ${res.error}`); continue; }
              done.push(`${trainee.name} مع ${sup.name} ${DAY_AR[day]}`);
            } else {
              failed.push(`${tag} عمليّة غير معروفة "${kind}"`);
            }
          } catch (e) {
            failed.push(`${tag} ${e instanceof Error ? e.message : 'خطأ'}`);
          }
          if (done.length > doneBefore && opDay) editedDays.add(opDay);
        }
        // وَسْمُ الأيّام التي رتّبها القائدُ يدويًّا (عبر الذكاء) → تُحمى من موازنة العدل
        // التلقائيّة؛ تُستأذَن قبل تعديلها (كرت «موازنةُ يومٍ عدّلتَه»). الوسمُ تحسينٌ لا يُفشِل.
        if (editedDays.size) {
          const { markLeaderEditedDay } = await import('../algorithms/leader_marks');
          for (const d of editedDays) {
            await markLeaderEditedDay({ clinicId: ctx.clinicId, weekStart: ws, day: d as ReserveDay, byId: actor.id, byName: ctx.user?.name });
          }
        }
        // لا إشعار لبقيّة القادة عن التعديل المباشر — الأورب يتولّى ذلك لاحقًا.
        const parts: string[] = [];
        if (done.length) parts.push(`✅ نُفِّذ (${done.length}): ${done.join(' · ')}`);
        if (failed.length) parts.push(`⚠️ تعذّر (${failed.length}): ${failed.join(' · ')}`);
        return final(parts.join('\n') || 'لا تغيير.');
      }

      default:
        return `Tool error: أداة طلبات غير معروفة "${name}".`;
    }
  } catch (e) {
    return `Tool error: ${e instanceof Error ? e.message : 'خطأ غير متوقّع.'}`;
  }
  };

  // أداةٌ تُغيّر الجدول → لُفّها بطبقة الفرق: كلّ طبيبٍ تغيّر موضعُه يصله كرت «طرأ تغييرٌ
  // على جدولك» (الفاعل يُستثنى من يومه الذي تصرّف فيه). غير المؤثّرة تجري كما هي.
  const ws = String(r.weekStart || '');
  if (SEAT_CHANGE_TOOLS.has(name) && ws) {
    return await reqMod.withSeatChangeDiff(
      {
        clinicId: ctx.clinicId, weekStart: ws,
        senderId: actor.id, senderName: ctx.user?.name ?? undefined,
        suppress: seatChangeSuppress(actor.id, r, ws),
      },
      exec,
    );
  }
  return await exec();
}
