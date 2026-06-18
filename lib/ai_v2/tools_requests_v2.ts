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

/** القائد فأعلى (نسخة محلّيّة لقرارات التوجيه في الموزّع) */
const LEADER_PLUS_ROLES = new Set(['team_leader', 'coordinator', 'super_admin', 'manager']);
const isLeaderPlusRole = (role: string): boolean => LEADER_PLUS_ROLES.has(role);

/** وسم تبديل الاستئذان كما تمرّره الواجهة (الجانب same/other يُشتقّ من الخيار). */
export type PermSwapArg = { blocked: number[]; targetPeriod?: number; statusAr: string; leaderIds: string[] };

/**
 * إرسال طلب تبديلٍ لطبيبٍ واحد **بالكود مباشرةً** (يستعمله الموزّع للطبيب الطرف،
 * وزرّ [أرسل طلبًا] للقائد الطرف). يُرجِع سطرًا جاهزًا للعرض.
 */
export async function sendSwapRequestByCode(params: {
  clinicId: string;
  requester: { id: string; name: string };
  weekStart: string;
  day: string;
  targetId: string;
  targetName: string;
  perm?: PermSwapArg;
}): Promise<{ success: boolean; info?: string; error?: string }> {
  const { requestsV2 } = await import('../algorithms/requests_v2');
  const { notifications } = await import('../algorithms/notifications');
  const day = params.day as 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
  const listed = await requestsV2.listSwapTargets({
    clinicId: params.clinicId, weekStart: params.weekStart, day,
    requesterId: params.requester.id, mode: { kind: 'doctor', doctorId: params.targetId },
  });
  if (!listed.success || !listed.targets) return { success: false, error: listed.error };
  const opened = await notifications.openSwapGroup({
    clinicId: params.clinicId, weekStart: params.weekStart, day,
    requesterId: params.requester.id, requesterName: params.requester.name,
    targets: listed.targets,
    ...(params.perm ? { perm: { ...params.perm, side: 'same' as const } } : {}),
  });
  if (!opened.success) return { success: false, error: opened.error };
  return {
    success: true,
    info: `أُرسل طلب التبديل إلى ${params.targetName} ليوم ${DAY_AR[day]} — يتمّ فور موافقته وتصلك النتيجة.`,
  };
}

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
 * إرسال طلب تبديلٍ لمجموعةٍ **بالكود مباشرةً** (أزرار اقتراحات الاستئذان):
 * كلّ الفترة المكمّلة أو كلّ الشفت الآخر، مع استبعاد من يستلم فترةً محجوبةً
 * (التبديل معه لا يحلّ التعارض). يُرجِع سطرًا جاهزًا للعرض.
 */
export async function sendSwapRequestModeByCode(params: {
  clinicId: string;
  requester: { id: string; name: string };
  weekStart: string;
  day: string;
  mode: { kind: 'period'; period: number } | { kind: 'other_shift' };
  excludePeriods?: number[];
  perm?: PermSwapArg;
}): Promise<{ success: boolean; info?: string; error?: string }> {
  const { requestsV2 } = await import('../algorithms/requests_v2');
  const { notifications } = await import('../algorithms/notifications');
  const day = params.day as 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
  const listed = await requestsV2.listSwapTargets({
    clinicId: params.clinicId, weekStart: params.weekStart, day,
    requesterId: params.requester.id, mode: params.mode,
    excludePeriods: params.excludePeriods,
  });
  if (!listed.success || !listed.targets) return { success: false, error: listed.error };
  const opened = await notifications.openSwapGroup({
    clinicId: params.clinicId, weekStart: params.weekStart, day,
    requesterId: params.requester.id, requesterName: params.requester.name,
    targets: listed.targets,
    ...(params.perm
      ? { perm: { ...params.perm, side: params.mode.kind === 'other_shift' ? 'other' as const : 'same' as const } }
      : {}),
  });
  if (!opened.success) return { success: false, error: opened.error };
  const n = listed.targets.length;
  return {
    success: true,
    info: n === 1
      ? `أُرسل طلب التبديل إلى ${listed.targets[0]!.name} ليوم ${DAY_AR[day]} — يتمّ فور موافقته وتصلك النتيجة.`
      : `أُرسل طلب التبديل إلى ${n} من الزملاء ليوم ${DAY_AR[day]} — أوّل موافقٍ يتمّ معه التبديل وتصلك النتيجة.`,
  };
}

/**
 * تنفيذ تبديلٍ مباشرٍ **بالكود** (زرّ [بدّل مباشرة] للقائد الطرف): تبادل مراكز
 * كامل، مع علم القادة تلقائيًّا إن كان بين شفتين.
 */
export async function directSwapByCode(params: {
  clinicId: string;
  actor: { id: string; role: string };
  weekStart: string;
  day: string;
  targetId: string;
  targetName: string;
  actorName: string;
}): Promise<{ success: boolean; info?: string; error?: string }> {
  const { requestsV2 } = await import('../algorithms/requests_v2');
  const day = params.day as 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
  const res = await requestsV2.swapFullPositions(params.actor, {
    clinicId: params.clinicId, weekStart: params.weekStart, day,
    aId: params.actor.id, bId: params.targetId,
  });
  if (!res.success) return { success: false, error: res.error };
  {
    const { notifications } = await import('../algorithms/notifications');
    if (res.crossShift) {
      await notifications.notifyLeadersCrossShiftSwap({
        clinicId: params.clinicId, day,
        aName: params.actorName, bName: params.targetName,
        excludeIds: [params.actor.id, params.targetId],
      });
    }
    // زال تعارض استئذانٍ بهذا التبديل؟ كروت «استئذان يحتاج ترتيبًا» تُغلَق
    await notifications.resolvePermissionAlertV2({
      clinicId: params.clinicId, weekStart: params.weekStart, day,
      doctorIds: [params.actor.id, params.targetId],
    });
    // طلبات تبديلٍ معلّقة مسّها هذا التبديل → تُبطَل ويُبلَّغ أصحابها
    await notifications.invalidateSwapsTouching({
      weekStart: params.weekStart, day,
      doctorIds: [params.actor.id, params.targetId],
    });
  }
  return { success: true, info: `تمّ التبديل بينك وبين ${params.targetName} يوم ${DAY_AR[day]}.` };
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

/**
 * إبلاغ طرفَي تبديلٍ نفّذه القائد (زرّ [أبلغهما]) — إشعار علمٍ لكلٍّ منهما.
 */
export async function notifySwappedPair(params: {
  clinicId: string;
  sender: { id?: string; name?: string };
  day: string;
  a: { id: string; name: string };
  b: { id: string; name: string };
}): Promise<{ success: boolean; info?: string; error?: string }> {
  const { notifications } = await import('../algorithms/notifications');
  const day = params.day as 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
  const dayAr = DAY_AR[day] || params.day;
  const tell = async (to: { id: string; name: string }, other: { name: string }) =>
    notifications.broadcast({
      clinicId: params.clinicId, recipientIds: [to.id],
      senderId: params.sender.id, senderName: params.sender.name,
      title: 'تبديل', body: `بُدّلت مع ${other.name} يوم ${dayAr} — كلٌّ استلم مكان الآخر.`,
    });
  const r1 = await tell(params.a, params.b);
  const r2 = await tell(params.b, params.a);
  if (!r1.success && !r2.success) return { success: false, error: r1.error || r2.error };
  return { success: true, info: 'أُبلغ الطرفان بالتبديل.' };
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
const REQUESTS_TOOLS_V2_ALL: V2Tool[] = [
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
    name: 'swap_doctors',
    description:
      'يبدّل خانات طبيبين أو أكثر (تسلسل دائريّ). النطاق الافتراضيّ اليوم كامل — لا ' +
      'تسأل عن الشفت/الفترة إلّا إن حدّدها المستخدم صراحةً. الليدر يبدّل آخرين فوريًّا. ' +
      '(تبديل الطبيب لنفسه يحتاج موافقة الآخر — يأتي مع وحدة الإشعارات.)',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndexes: {
          type: 'array', items: { type: 'integer' },
          description: 'أرقام الأطباء مرتّبين؛ كلٌّ يأخذ مكان التالي.',
        },
        scope: { type: 'string', enum: ['day', 'shift', 'period'], description: 'افتراضيًّا day.' },
        shift: { type: 'string', enum: ['morning', 'evening'], description: 'فقط لو scope=shift.' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'فقط لو scope=period.' },
      },
      required: ['weekStart', 'day', 'doctorIndexes'],
    },
  },
  {
    name: 'request_swap',
    description:
      'يرسل **طلب تبديل** (تبادل مراكز يومٍ كامل — كلٌّ يستلم مكان الآخر بكلّ ما فيه) ' +
      'إلى: طبيبٍ باسمه (target=doctor مع doctorIndex)، أو كلّ أطبّاء فترةٍ (target=period ' +
      'مع period)، أو كلّ الشفت الآخر (target=other_shift). يصل المستلمين إشعارٌ ' +
      'بموافق/رفض؛ أوّل موافقٍ يُنفَّذ معه فورًا وتُسحب البقيّة. الطالب هو المستخدم نفسه ' +
      'دائمًا. الصلاحيّة ٢٤ ساعة أو دخول اليوم.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        target: { type: 'string', enum: ['doctor', 'period', 'other_shift'] },
        doctorIndex: { type: 'integer', description: 'فقط لو target=doctor.' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'فقط لو target=period.' },
      },
      required: ['weekStart', 'day', 'target'],
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
    name: 'set_delegator',
    description:
      'يجعل طبيبًا دليقيترًا في يومٍ ما **بدل الدليقيتر الحاليّ** (المحرّك يُزيحه ويبقي ' +
      'له خاناته الأخرى). الفترة تلقائيّة (فترة الدليقيتر التي يكون الطبيب فارغًا فيها) — ' +
      'لا تمرّر period إلّا إن سمّاها المستخدم. لطلبٍ مثل «اجعلنا دليقيترز بدل الموجودين»: ' +
      'نداء لكلّ طبيب — هذا **ليس تبديلًا** ولا يحتاج موافقة أحد. الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndex: { type: 'integer' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'فقط إن سمّاها المستخدم.' },
      },
      required: ['weekStart', 'day', 'doctorIndex'],
    },
  },
  {
    name: 'attach_trainee',
    description:
      'يُلحق متدرّبًا **احتياطيًّا** بمدرّبٍ آخر لذلك اليوم فقط: يُوضع اسمه مع المدرّب ' +
      'في خاناته نفسها (عيادة/دليقيتر) ويُرفَع من صفّ الاحتياط. لا يغيّر مدرّبه الدائم. ' +
      'الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        traineeDoctorIndex: { type: 'integer', description: 'رقم المتدرّب الاحتياطيّ.' },
        supervisorDoctorIndex: { type: 'integer', description: 'رقم المدرّب الذي يُلحَق به.' },
      },
      required: ['weekStart', 'day', 'traineeDoctorIndex', 'supervisorDoctorIndex'],
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
];

// ─── إطفاء النقص من الطلبات (مؤقّت) ────────────────────────────
// التغطية تنتقل إلى خوارزميّة الجدول. لا نحذف شيئًا — نُخفي أدوات النقص من
// النموذج ونوقف توليد كروت التغطية. أعِد المفتاح إلى true لاسترجاع السلوك القديم.
export const REQUESTS_TOOLS_V2: V2Tool[] = REQUESTS_TOOLS_V2_ALL;

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
  const { requestsV2 } = await import('../algorithms/requests_v2');

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
        // الطلب العامّ يعمل لهذا الأسبوع دائمًا ولو كان اليوم قد مضى — لا قيود على
        // الماضي. الأسبوع القادم/الماضي فقط حين يسمّيه المستخدم صراحةً (يمرّره النموذج).
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
            // زال تعارضُ استئذانٍ سابقٍ بهذا التسجيل/التحويل (استئذان→مرضية، أو
            // بداية→نهاية بلا تعارض)؟ الفاحص يعيد الحساب من الجدول الحيّ ويغلق
            // كروت «استئذان يحتاج ترتيبًا» التي زال سببها فقط — فلا كرت أحمر بائت.
            await notifications.resolvePermissionAlertV2({
              clinicId: ctx.clinicId, weekStart: wsEff, day: r.day, doctorIds: [doc.id],
            });
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
            // كروت التغطية (النقص) انتقلت إلى خوارزميّة الجدول. يبقى هنا إشعار العلم
            // وكرت «تحديد المكان» (عند تحويل غيابٍ مُغطًّى إلى استئذان).
            for (const leaderId of leaders) {
              // تحويل مرضيّةٍ/تفرّغٍ مُغطًّى إلى استئذان: كرتُ «تحديد المكان» يحلّ
              // محلّ إشعار العلم (إشعار واحد للحدث) — القائد يفتح الكرت ويأمر فيُنفَّذ.
              if (perm?.covered) {
                await notifications.alertLeaderPlacement({
                  clinicId: ctx.clinicId, leaderId,
                  weekStart: wsEff, day: r.day,
                  doctorId: doc.id, doctorName: doc.name,
                  converted: true,
                  customBody: leaderId === doc.id
                    ? `حوّلتَ ${perm.convertedFromAr || 'حالتك'} إلى ${STATUS_AR[status]} يوم ${DAY_AR[r.day]} ومكانك السابق مُغطًّى — حدّد أين تعود.`
                    : `حوّل ${doc.name} ${perm.convertedFromAr || 'حالته'} إلى ${STATUS_AR[status]} يوم ${DAY_AR[r.day]} ومكانه السابق مُغطًّى — حدّد مكانه.`,
                  senderId: doc.id, senderName: doc.name,
                });
                continue;
              }
              if (leaderId !== actor.id) {
                // علم الاستئذان يحمل نتيجة التبديل التلقائيّ الصامت (المحرّك نفّذه):
                // «تمّ تبديله مع فلان» أو «لا بديل يغطّي فترته» — إشعارٌ واحدٌ للعلم.
                let note = '';
                if (perm && (status === 'permission_start' || status === 'permission_end')) {
                  const sw = perm.swap;
                  if (sw && 'withName' in sw) note = ` — وتمّ تبديله مع ${sw.withName}${sw.delegatorGap ? '، وبقيت فترة دليقيتر فارغة' : ''}`;
                  else if (sw && 'none' in sw) {
                    note = sw.reason === 'delegator_left'
                      ? ' — ودوره دليقيتر تلك الفترة بلا بديل'
                      : ' — ولا يوجد بديلٌ يغطّي فترته';
                  }
                }
                await notifications.notifyLeaderOfRequest({
                  clinicId: ctx.clinicId, leaderId,
                  senderId: doc.id, senderName: doc.name,
                  summary: `${STATUS_AR[status]} يوم ${dayWithDate(wsEff, r.day)}${note}`,
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

        // ترتيب تعويض النقص (الجديد): غيابٌ كاملٌ (مرضية/تفرّغ) أخرج الطبيب من عيادته
        // → خوارزميّة الجدول تُرتّب تعويض الشفت، ويصل القائدَ كرت [نفّذ] بالفرق.
        // الفرق محسوبٌ في الكود (لا يُكشَف «إعادة التوزيع» — سرّيّة الآليّة).
        if (status === 'sick_leave' || status === 'vacation') {
          try {
            const { schedule } = await import('../algorithms/schedule');
            const { notifications } = await import('../algorithms/notifications');
            const prop = await schedule.proposeCoverageForAbsence({
              clinicId: ctx.clinicId, weekStart: wsEff, day: r.day, absentDoctorId: doc.id,
            });
            if (prop) {
              const slotsData = prop.slots.map((s) => ({
                clinicNumber: s.clinicNumber, period: s.period, role: s.role,
                doctorId: s.doctor.id, doctorName: s.doctor.name,
              }));
              for (const leaderId of await getTeamLeaderIds(ctx.clinicId)) {
                await notifications.notifyCoverageFill({
                  clinicId: ctx.clinicId, leaderId, weekStart: wsEff,
                  day: r.day, shift: prop.shift, absentNames: prop.absentNames,
                  diff: prop.diff, slots: slotsData,
                });
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[coverage-fill] failed', e instanceof Error ? e.message : e);
          }
        }

        // ظلٌّ استأذن → نُقل إلى الاحتياط وحده (لا تعارض ولا أزرار) — رسالة خاصّة
        if (perm?.shadowToReserve) {
          return final(actor.id === doc.id
            ? `سُجّل ${STATUS_AR[status]} لك يوم ${DAY_AR[r.day]} — ونُقلتَ إلى الاحتياط ` +
              'ذلك اليوم. عند إلغاء الاستئذان تعود إلى جانب مدرّبك تلقائيًّا.'
            : `تمّ: ${STATUS_AR[status]} لـ${doc.name} يوم ${DAY_AR[r.day]} — ونُقل إلى ` +
              'الاحتياط ذلك اليوم. عند الإلغاء يعود إلى جانب مدرّبه تلقائيًّا.');
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
        if (actor.id === doc.id && ABSENCE.includes(status)) {
          ctx.onAnnounceOffer?.({
            weekStart: wsEff, day: r.day,
            message: `${doc.name} ${STATUS_AR[status]} يوم ${DAY_AR[r.day]}.`,
            subjectId: doc.id, subjectName: doc.name,
          });
        }
        return final(base);
      }

      case 'swap_doctors': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const idxs = Array.isArray(r.doctorIndexes) ? r.doctorIndexes : [];
        const docs = idxs.map((n) => resolveDoctor(ctx, n)).filter((d): d is Resolved => d != null);
        if (docs.length < 2) return 'Tool error: التبديل يحتاج طبيبين صالحين على الأقلّ.';
        const wsEff = String(r.weekStart);
        const actorIsParty = docs.some((d) => d.id === actor.id);

        // القرار حتميّ — الطالب أحد طرفَي تبديلٍ ثنائيّ:
        //  • طبيب → يفتح طلب تبديلٍ تلقائيًّا (موافقة الآخر بالإشعارات).
        //  • قائد → سؤال أزرارٍ من الكود: [أرسل طلبًا] أم [بدّل مباشرة]؟
        if (actorIsParty && docs.length === 2) {
          const other = docs.find((d) => d.id !== actor.id)!;
          if (isLeaderPlusRole(actor.role)) {
            ctx.onSwapOffer?.({
              kind: 'ask_mode', weekStart: wsEff, day: r.day,
              target: { id: other.id, name: other.name },
            });
            return final(
              `أنت طرفٌ في التبديل مع ${other.name} يوم ${DAY_AR[r.day]} — اختر من ` +
              'الأزرار: إرسال طلبٍ لموافقته، أو تنفيذٌ مباشر.',
            );
          }
          const sent = await sendSwapRequestByCode({
            clinicId: ctx.clinicId,
            requester: { id: actor.id, name: ctx.user?.name || '' },
            weekStart: wsEff, day: r.day,
            targetId: other.id, targetName: other.name,
          });
          return sent.success ? final(sent.info || 'أُرسل الطلب.') : `Tool error: ${sent.error}`;
        }

        // غير القائد لا يبدّل آخرين ولا جماعيًّا — له طلبٌ ثنائيٌّ لنفسه فقط.
        if (!isLeaderPlusRole(actor.role)) {
          return 'Tool error: يمكنك طلب تبديلٍ بينك وبين زميلٍ واحدٍ فقط — التبديل بين الآخرين أو الجماعيّ للقائد.';
        }

        // القائد يبدّل آخرين: تبديلٌ ثنائيّ كامل اليوم = تبادل مراكز كامل (يشمل
        // الاحتياط)، ثمّ عرض «هل تُبلَّغان؟» أزرارًا. غير ذلك (٣+ أو نطاق فترة/شفت)
        // يبقى تسلسلًا دائريًّا للخانات كما هو.
        const scoped = r.scope === 'shift' || r.scope === 'period';
        if (docs.length === 2 && !scoped) {
          const res = await requestsV2.swapFullPositions(actor, {
            clinicId: ctx.clinicId, weekStart: wsEff, day: r.day,
            aId: docs[0]!.id, bId: docs[1]!.id,
          });
          if (!res.success) return `Tool error: ${res.error}`;
          {
            const { notifications } = await import('../algorithms/notifications');
            if (res.crossShift) {
              await notifications.notifyLeadersCrossShiftSwap({
                clinicId: ctx.clinicId, day: r.day,
                aName: docs[0]!.name, bName: docs[1]!.name,
                excludeIds: [actor.id, docs[0]!.id, docs[1]!.id],
              });
            }
            // زال تعارض استئذانٍ بهذا التبديل؟ كروت «استئذان يحتاج ترتيبًا» تُغلَق
            await notifications.resolvePermissionAlertV2({
              clinicId: ctx.clinicId, weekStart: wsEff, day: r.day,
              doctorIds: [docs[0]!.id, docs[1]!.id],
            });
            // طلبات تبديلٍ معلّقة مسّها هذا التبديل → تُبطَل ويُبلَّغ أصحابها
            await notifications.invalidateSwapsTouching({
              weekStart: wsEff, day: r.day,
              doctorIds: [docs[0]!.id, docs[1]!.id],
            });
          }
          ctx.onSwapOffer?.({
            kind: 'offer_notify', weekStart: wsEff, day: r.day,
            a: { id: docs[0]!.id, name: docs[0]!.name },
            b: { id: docs[1]!.id, name: docs[1]!.name },
          });
          return final(`تمّ التبديل بين ${docs[0]!.name} و${docs[1]!.name} يوم ${DAY_AR[r.day]}.`);
        }
        const scope =
          r.scope === 'shift'
            ? { kind: 'shift' as const, shift: (r.shift === 'evening' ? 'evening' : 'morning') as 'morning' | 'evening' }
            : r.scope === 'period'
              ? { kind: 'period' as const, period: Number(r.period) }
              : { kind: 'day' as const };
        const res = await requestsV2.swapInSchedule(actor, {
          clinicId: ctx.clinicId, weekStart: wsEff, day: r.day,
          doctorIds: docs.map((d) => d.id), scope,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        {
          // طلبات تبديلٍ معلّقة مسّها هذا التبديل → تُبطَل ويُبلَّغ أصحابها
          const { notifications } = await import('../algorithms/notifications');
          await notifications.invalidateSwapsTouching({
            weekStart: wsEff, day: r.day, doctorIds: docs.map((d) => d.id),
          });
        }
        return final(`تمّ التبديل بين: ${docs.map((d) => d.name).join('، ')} يوم ${DAY_AR[r.day]}.`);
      }

      case 'request_swap': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const wsEff = String(r.weekStart);
        let mode: { kind: 'doctor'; doctorId: string } | { kind: 'period'; period: number } | { kind: 'other_shift' };
        if (r.target === 'doctor') {
          const doc = resolveDoctor(ctx, r.doctorIndex);
          if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
          if (doc.id === actor.id) return 'Tool error: لا تبديل بين الطبيب ونفسه.';
          mode = { kind: 'doctor', doctorId: doc.id };
        } else if (r.target === 'period') {
          const p = Number(r.period);
          if (![1, 2, 3, 4].includes(p)) return 'Tool error: الفترة غير صالحة.';
          mode = { kind: 'period', period: p };
        } else {
          mode = { kind: 'other_shift' };
        }
        const listed = await requestsV2.listSwapTargets({
          clinicId: ctx.clinicId, weekStart: wsEff, day: r.day,
          requesterId: actor.id, mode,
        });
        if (!listed.success || !listed.targets) return `Tool error: ${listed.error}`;
        const { notifications } = await import('../algorithms/notifications');
        const opened = await notifications.openSwapGroup({
          clinicId: ctx.clinicId, weekStart: wsEff, day: r.day,
          requesterId: actor.id, requesterName: ctx.user?.name || '',
          targets: listed.targets,
        });
        if (!opened.success) return `Tool error: ${opened.error}`;
        const n = opened.count || 0;
        return final(
          n === 1
            ? `أُرسل طلب التبديل إلى ${listed.targets[0]!.name} ليوم ${DAY_AR[r.day]} — يتمّ فور موافقته وتصلك النتيجة.`
            : `أُرسل طلب التبديل إلى ${n} من الأطبّاء ليوم ${DAY_AR[r.day]} — أوّل من يوافق يتمّ التبديل معه فورًا وتصلك النتيجة.`,
        );
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

        let autoReturned = false;
        if (res.covered && returnShift) {
          try {
            const { schedule } = await import('../algorithms/schedule');
            autoReturned = await schedule.redistributeOnReturn({
              clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day, shift: returnShift,
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[return-redistribute] failed', e instanceof Error ? e.message : e);
          }
        }

        // عودة الطبيب غيّرت يومه (سواءٌ أُعيد ترتيب الشفت أو عاد لمقعدٍ فارغ) →
        // وازِن مستقبل الأسبوع (والأسابيع المبنيّة بعده) صامتًا، واكتب ما تغيّر فقط — **بلا إشعار**.
        if (returnShift && (autoReturned || res.restored)) {
          try {
            const { schedule } = await import('../algorithms/schedule');
            await schedule.rebalanceForward({
              clinicId: ctx.clinicId, weekStart: String(r.weekStart), fromDay: r.day, fromShift: returnShift,
            });
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
          // أُلغي استئذانٌ متعارض؟ كروت «استئذان يحتاج ترتيبًا» تُغلَق تلقائيًّا
          await notifications.resolvePermissionAlertV2({
            clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
            doctorIds: [doc.id],
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
          const rc = res as {
            permissionCanceled?: boolean; returnedToReserve?: boolean;
            shadowReturned?: boolean; shadowSupervisorAbsent?: boolean; returnedShadows?: string[];
          };
          const fate = rc.permissionCanceled
            ? 'أُزيلت علامة الاستئذان ومكانه في الجدول كما هو'
            : rc.returnedToReserve
              ? 'أُزيلت العلامة وبقي احتياطًا كما كان'
              : rc.shadowReturned
                ? 'عاد إلى جانب مدرّبه'
                : rc.shadowSupervisorAbsent
                  ? 'مدرّبه غائبٌ فبقي في الاحتياط'
                  : autoReturned
                    ? 'عاد إلى الجدول وانتظم الشفت تلقائيًّا'
                    : res.covered && res.restored
                    ? 'أُعيد إلى بعض خاناته وبعضُها مشغول — حدّد مكان الباقي'
                    : res.covered
                      ? 'مكانه مُغطًّى — حدّد أين يوضَع'
                      : res.restored
                        ? `عاد إلى مكانه${rc.returnedShadows?.length ? ` ومعه ظلُّه ${rc.returnedShadows.join(' و')}` : ''}`
                        : 'لم يكن منسَّبًا في العيادة';
          const leaders = await getTeamLeaderIds(ctx.clinicId);
          for (const leaderId of leaders) {
            // الإلغاء (وأيُّ انعكاسٍ تلقائيّ) = إشعار علمٍ للقائد فقط — لا كرت ولا
            // تدخّل. المحرّك يعيد الترتيب وحده؛ القائد يُبلَّغ بالمصير لا غير.
            if (leaderId !== actor.id) {
              await notifications.notifyLeaderOfRequest({
                clinicId: ctx.clinicId, leaderId,
                senderId: doc.id, senderName: doc.name,
                summary: `إلغاء ${statusAr} يوم ${DAY_AR[r.day]} — ${fate}`,
                weekStart: String(r.weekStart), day: r.day,
                standalone: true, // الإلغاء حدثٌ مميَّز — لا يُدمَج في إشعار التسجيل فيختفي
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
          permissionCanceled?: boolean; returnedToReserve?: boolean;
          shadowReturned?: boolean; shadowSupervisorAbsent?: boolean; returnedShadows?: string[];
        };
        // إلغاء استئذان: الطبيب في عيادته أصلًا — تُزال العلامة فقط، لا «إرجاع»
        if (rcf.permissionCanceled) {
          return final(`تمّ إلغاء استئذان ${doc.name} يوم ${DAY_AR[r.day]} — أُزيلت العلامة ومكانه في الجدول كما هو.`);
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
        // مكانه كان مُغطًّى → أُعيد ترتيب الشفت تلقائيًّا فعاد إلى الجدول (لا كرت).
        if (autoReturned) {
          return final(cancelBase + ` عاد ${doc.name} إلى الجدول وانتظم الشفت تلقائيًّا — أُبلغ القادة للعلم.`);
        }
        // مُغطًّى لكن تعذّر الترتيب التلقائيّ (لا وصفة محفوظة مثلًا) — أبلِغ بصدق.
        if (res.covered) {
          return final(cancelBase + ' مكانه السابق مُغطًّى وتعذّر الترتيب التلقائيّ — أُبلغ القادة.');
        }
        // كن صادقًا: لا تدّعِ الإرجاع إن لم يوجد مكانٌ محفوظ (لم يكن منسَّبًا وقت الغياب).
        return final(res.restored
          ? cancelBase.replace('.', ' وإرجاعه إلى مكانه في العيادة' +
              `${rcf.returnedShadows?.length ? ` — وعاد معه ظلُّه ${rcf.returnedShadows.join(' و')}` : ''}.`)
          : cancelBase + ' (لا مكان محفوظ لإرجاعه — لم يكن منسَّبًا في العيادة وقت الغياب.)');
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

      case 'set_delegator': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const res = await requestsV2.placeAsDelegator(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, doctorName: doc.name,
          period: r.period != null ? Number(r.period) : undefined,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        return final(`تمّ: ${doc.name} دليقيتر يوم ${DAY_AR[r.day]} (الفترة ${res.period})` +
          (res.replaced ? ` بدل ${res.replaced}.` : '.'));
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

      case 'attach_trainee': {
        const trainee = resolveDoctor(ctx, r.traineeDoctorIndex);
        const sup = resolveDoctor(ctx, r.supervisorDoctorIndex);
        if (!trainee || !sup) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const res = await requestsV2.attachTraineeForDay(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          traineeId: trainee.id, traineeName: trainee.name,
          supervisorId: sup.id, supervisorName: sup.name,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        // إبلاغ المدرّب المكلَّف (للعلم): سيكون معه متدرّب في عيادته هذا اليوم
        const { notifications } = await import('../algorithms/notifications');
        const sender = senderOf(ctx);
        await notifications.notifyTraineeAttached({
          clinicId: ctx.clinicId, supervisorId: sup.id,
          traineeName: trainee.name, day: r.day, weekStart: String(r.weekStart),
          senderId: sender.id, senderName: sender.name,
        });
        return final(`تمّ: ${trainee.name} مع ${sup.name} يوم ${DAY_AR[r.day]} (لهذا اليوم فقط)، ووصله إشعارٌ بذلك.`);
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

      default:
        return `Tool error: أداة طلبات غير معروفة "${name}".`;
    }
  } catch (e) {
    return `Tool error: ${e instanceof Error ? e.message : 'خطأ غير متوقّع.'}`;
  }
}
