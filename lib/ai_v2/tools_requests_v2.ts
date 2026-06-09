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

import type { V2Tool, V2ToolContext } from './tools';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const STATUS_AR: Record<string, string> = {
  sick_leave: 'مرضية', vacation: 'تفرّغ',
  permission_start: 'استئذان بداية الدوام', permission_end: 'استئذان نهاية الدوام',
  extra: 'احتياط',
};

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
          enum: ['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'],
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
      'مكانه في العيادة. الطبيب لنفسه؛ الليدر لأيّ أحد.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndex: { type: 'integer' },
      },
      required: ['weekStart', 'day', 'doctorIndex'],
    },
  },
  {
    name: 'place_in_clinic',
    description:
      'يضع طبيبًا في عيادة وفتراتٍ محدّدة (العكس: من غياب إلى داخل العيادة). الطبيب ' +
      'لنفسه؛ الليدر لأيّ مكان. يرفض المحرّك وضعه في عيادتين بنفس الفترة.',
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
    name: 'cover_gap',
    description:
      'يغطّي نقصًا نتج عن غياب طبيب: يضع المُغطّي في مكان النقص (عيادة برقمها أو الدليقيتر) ' +
      'و**المحرّك يحسب الفترة الصحيحة تلقائيًّا** — لا تذكر الفترات ولا تخمّنها. استعملها ' +
      '(لا place_in_clinic) لتنفيذ حلول كرت التغطية. للتناوب على الدليقيتر: استدعِها لكلّ ' +
      'مُغطٍّ فيؤخذ في فترته الفارغة. الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        absentDoctorIndex: { type: 'integer', description: 'رقم الطبيب الغائب صاحب النقص.' },
        locationKind: { type: 'string', enum: ['delegator', 'clinic'], description: 'مكان النقص.' },
        clinicNumber: { type: 'integer', description: 'رقم العيادة — فقط لو locationKind=clinic.' },
        coverDoctorIndex: { type: 'integer', description: 'رقم الطبيب المُغطّي.' },
      },
      required: ['weekStart', 'day', 'absentDoctorIndex', 'locationKind', 'coverDoctorIndex'],
    },
  },
  {
    name: 'apply_coverage_option',
    description:
      'ينفّذ **خيار تغطيةٍ كاملًا بكلّ نقلاته** لنقصٍ مركّب (عيادة + دليقيتر). استعملها حين ' +
      'يختار القائد «الخيار الأول/الثاني». الخيار A: طبيبٌ يحلّ محلّ الغائب كاملًا (مرّر ' +
      'coverDoctorIndex للمُغطّي). الخيار B: زميل الغائب يستلم عيادته وعيادةٌ أخرى تتولّى ' +
      'الدليقيتر بالتناوب (مرّر delegatorClinicNumber). المحرّك يطبّق كلّ الخطوات. الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        absentDoctorIndex: { type: 'integer', description: 'رقم الطبيب الغائب صاحب النقص.' },
        option: { type: 'string', enum: ['A', 'B'], description: 'A=الخيار الأول، B=الخيار الثاني.' },
        coverDoctorIndex: { type: 'integer', description: 'المُغطّي — للخيار A فقط.' },
        delegatorClinicNumber: { type: 'integer', description: 'العيادة التي تتولّى الدليقيتر — للخيار B فقط.' },
      },
      required: ['weekStart', 'day', 'absentDoctorIndex', 'option'],
    },
  },
  {
    name: 'clear_week',
    description:
      'يمسح جدول أسبوعٍ كاملًا (كلّ الخانات والحالات). لا رجعة فيه. الليدر فأعلى. ' +
      'لا تستدعِها إلّا بعد تأكيد المستخدم صراحةً.',
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
        if (!['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'].includes(status)) {
          return 'Tool error: الحالة غير صالحة.';
        }
        const shift = r.shift === 'evening' ? 'evening' : 'morning';
        const res = await requestsV2.setScheduleStatus(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, doctorName: doc.name,
          status: status as 'sick_leave' | 'vacation' | 'permission_start' | 'permission_end' | 'extra',
          shift,
        });
        if (!res.success) return `Tool error: ${res.error}`;

        // إشعار القائد عند الغياب — واحد لكلّ قائد، يستثني الفاعل:
        //  • إشعار العلم (طلب جديد) يصل **دائمًا** — سجلٌّ في صفحة الإشعارات.
        //  • وكرت التغطية في الأوربّ **يُجمَع** لكلّ أيّام غياب الطبيب نفسه في الأسبوع
        //    في كرتٍ واحد (طبيّة ٣ أيّام = كرتٌ واحد، يومًا بيوم). اليوم بلا نقص يُذكَر
        //    «مغطّى» إن انضمّ لكرتٍ فيه نقص، ووحده لا يُنشئ كرتًا.
        const ABSENCE = ['sick_leave', 'vacation', 'permission_start', 'permission_end'];
        if (ABSENCE.includes(status)) {
          try {
            const { notifications } = await import('../algorithms/notifications');
            const leaders = (await getTeamLeaderIds(ctx.clinicId)).filter((id) => id !== actor.id);
            const brief = await requestsV2.computeCoverageBrief({
              clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
              doctorId: doc.id, doctorName: doc.name,
            });
            const dayHasGap = !!brief && brief.gaps.length > 0;
            const dayBrief = brief ?? { day: r.day, absentName: doc.name, gaps: [], reserves: [] };
            for (const leaderId of leaders) {
              await notifications.notifyLeaderOfRequest({
                clinicId: ctx.clinicId, leaderId,
                senderId: doc.id, senderName: doc.name,
                summary: `${STATUS_AR[status]} يوم ${DAY_AR[r.day]}`,
                weekStart: String(r.weekStart), day: r.day,
              });
              await notifications.upsertLeaderCoverage({
                clinicId: ctx.clinicId, leaderId,
                weekStart: String(r.weekStart), day: r.day,
                absentDoctorId: doc.id, absentDoctorName: doc.name,
                dayBrief, dayHasGap,
                senderId: doc.id, senderName: doc.name,
              });
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[notify-leader] failed', e instanceof Error ? e.message : e);
          }
        }

        // غياب الطبيب لنفسه → ذكِّر الذكاء حتميًّا بسؤال الإبلاغ (لا تعتمد على البرومبت وحده)
        const base = `تمّ: ${STATUS_AR[status]} لـ${doc.name} يوم ${DAY_AR[r.day]} (${r.weekStart}).`;
        if (actor.id === doc.id && ABSENCE.includes(status)) {
          return base + ' الآن اسأل المستخدم سطرًا واحدًا: «هل تُبلَّغ الجهات؟ [الشفت] [المركز]' +
            ' [لا داعي]» — وعند اختياره الشفت/المركز نفّذ announce_to.';
        }
        return base;
      }

      case 'swap_doctors': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const idxs = Array.isArray(r.doctorIndexes) ? r.doctorIndexes : [];
        const docs = idxs.map((n) => resolveDoctor(ctx, n)).filter((d): d is Resolved => d != null);
        if (docs.length < 2) return 'Tool error: التبديل يحتاج طبيبين صالحين على الأقلّ.';
        // القرار حتميّ: إن كان الطالب أحد طرفَي تبديلٍ ثنائيّ → يحتاج موافقة الآخر،
        // وهذه تأتي مع وحدة الإشعارات (لم نُعِد بناءها بعد). غير ذلك → فوريّ.
        const actorIsParty = docs.some((d) => d.id === actor.id);
        if (actorIsParty && docs.length === 2) {
          return 'تبديلك مع زميلك يحتاج موافقته — هذه الميزة قيد البناء (وحدة الإشعارات).';
        }
        const scope =
          r.scope === 'shift'
            ? { kind: 'shift' as const, shift: (r.shift === 'evening' ? 'evening' : 'morning') as 'morning' | 'evening' }
            : r.scope === 'period'
              ? { kind: 'period' as const, period: Number(r.period) }
              : { kind: 'day' as const };
        const res = await requestsV2.swapInSchedule(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorIds: docs.map((d) => d.id), scope,
        });
        return res.success
          ? `تمّ التبديل بين: ${docs.map((d) => d.name).join('، ')} يوم ${DAY_AR[r.day]}.`
          : `Tool error: ${res.error}`;
      }

      case 'cancel_schedule_status': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        // إلغاء الحالة يُرجِع الطبيب دائمًا إلى مكانه المحفوظ (التغطية مؤجَّلة، فلا
        // حاجة لقرار الذكاء الآن — الإرجاع هو السلوك المطلوب).
        const res = await requestsV2.cancelStatus(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, restoreToPrevPlace: true,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        // كن صادقًا: لا تدّعِ الإرجاع إن لم يوجد مكانٌ محفوظ (لم يكن منسَّبًا وقت الغياب).
        return res.restored
          ? `تمّ إلغاء حالة ${doc.name} يوم ${DAY_AR[r.day]} وإرجاعه إلى مكانه في العيادة.`
          : `تمّ إلغاء حالة ${doc.name} يوم ${DAY_AR[r.day]}. (لا مكان محفوظ لإرجاعه — لم يكن منسَّبًا في العيادة وقت الغياب.)`;
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
        return res.success
          ? `تمّ وضع ${doc.name} في عيادة ${r.clinicNumber} (الفترات ${periods.join('، ')}) يوم ${DAY_AR[r.day]}.`
          : `Tool error: ${res.error}`;
      }

      case 'announce_to': {
        const { notifications } = await import('../algorithms/notifications');
        const sender = senderOf(ctx);
        const audience = r.audience === 'center' ? 'center' : 'shift';
        const message = String(r.message || '').trim();
        if (!message) return 'Tool error: نصّ الإبلاغ فارغ.';
        const subject = r.subjectDoctorIndex != null ? resolveDoctor(ctx, r.subjectDoctorIndex) : null;
        let groupId: string | null = null;
        if (audience === 'shift') {
          const subjId = subject?.id ?? sender.id;
          if (subjId) groupId = await findDoctorGroupId(ctx.clinicId, subjId);
          if (!groupId) return 'Tool error: تعذّر تحديد الشفت (القروب).';
        }
        const audienceIds = await notifications.resolveAudience(ctx.clinicId, audience, {
          groupId: groupId ?? undefined,
          excludeId: subject?.id ?? sender.id,
        });
        // استثنِ القادة — وصلهم إشعارهم التلقائيّ، فلا يُكرَّر
        const leaderIds = new Set(await getTeamLeaderIds(ctx.clinicId));
        const recipientIds = audienceIds.filter((id) => !leaderIds.has(id));
        if (recipientIds.length === 0) return 'لا يوجد من يُبلَّغ.';
        const res = await notifications.broadcast({
          clinicId: ctx.clinicId, recipientIds,
          senderId: sender.id, senderName: sender.name,
          title: 'إشعار', body: message,
        });
        return res.success
          ? `أبلغتُ ${recipientIds.length} ${audience === 'center' ? 'في المركز' : 'في الشفت'}.`
          : `Tool error: ${res.error}`;
      }

      case 'cover_gap': {
        const absent = resolveDoctor(ctx, r.absentDoctorIndex);
        const cover = resolveDoctor(ctx, r.coverDoctorIndex);
        if (!absent || !cover) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const kind = r.locationKind === 'clinic' ? 'clinic' : 'delegator';
        const target =
          kind === 'clinic'
            ? { kind: 'clinic' as const, clinicNumber: Number(r.clinicNumber) }
            : { kind: 'delegator' as const };
        const res = await requestsV2.coverGap(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          absentDoctorId: absent.id, target,
          coverDoctorId: cover.id, coverDoctorName: cover.name,
        });
        return res.success
          ? `تمّت التغطية: ${cover.name} ${kind === 'clinic' ? `في عيادة ${r.clinicNumber}` : 'دليقيتر'} مكان ${absent.name} يوم ${DAY_AR[r.day]}.`
          : `Tool error: ${res.error}`;
      }

      case 'apply_coverage_option': {
        const absent = resolveDoctor(ctx, r.absentDoctorIndex);
        if (!absent) return 'Tool error: رقم الطبيب الغائب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const option = r.option === 'B' ? 'B' : 'A';
        const cover = option === 'A' ? resolveDoctor(ctx, r.coverDoctorIndex) : null;
        if (option === 'A' && !cover) return 'Tool error: مرّر coverDoctorIndex للخيار الأول.';
        if (option === 'B' && r.delegatorClinicNumber == null) return 'Tool error: مرّر delegatorClinicNumber للخيار الثاني.';
        const res = await requestsV2.applyCoverageOption(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          absentDoctorId: absent.id, option,
          coverDoctorId: cover?.id, coverDoctorName: cover?.name,
          delegatorClinicNumber: option === 'B' ? Number(r.delegatorClinicNumber) : undefined,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        return option === 'A'
          ? `تمّ الخيار الأول: ${cover!.name} غطّى ${absent.name} (عيادته + الدليقيتر) وأُعيد توزيع عيادته.`
          : `تمّ الخيار الثاني: استُلمت عيادة ${absent.name} كاملة، وتولّت عيادة ${r.delegatorClinicNumber} الدليقيتر بالتناوب.`;
      }

      case 'clear_week': {
        const res = await requestsV2.clearWeek(actor, ctx.clinicId, String(r.weekStart));
        return res.success ? `تمّ مسح جدول أسبوع ${r.weekStart} كاملًا.` : `Tool error: ${res.error}`;
      }

      case 'set_clinic_count': {
        const res = await requestsV2.setClinicCount(actor, ctx.clinicId, Number(r.count));
        return res.success ? `تمّ ضبط عدد العيادات على ${r.count}.` : `Tool error: ${res.error}`;
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
        return res.success ? `تمّ نقل ${doc.name} إلى القروب الجديد.` : `Tool error: ${res.error}`;
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
        return res.success ? `تمّ ضبط حالة ${doc.name} على ${ws}.` : `Tool error: ${res.error}`;
      }

      default:
        return `Tool error: أداة طلبات غير معروفة "${name}".`;
    }
  } catch (e) {
    return `Tool error: ${e instanceof Error ? e.message : 'خطأ غير متوقّع.'}`;
  }
}
