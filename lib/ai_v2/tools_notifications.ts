// ═══════════════════════════════════════════════════════════════
// AI V2 Notifications Tools — يد الذكاء على محرّك الإشعارات (notifications.ts)
// ═══════════════════════════════════════════════════════════════
// نمط مطابق لـ tools_requests.ts: كل أداة wrapper حول دالّة من
// lib/algorithms/notifications.ts. مراجع الأطباء بالأرقام (doctorIndex)
// تُترجَم عبر ctx.roster.
//
// ما يستدعيه الذكاء (الجانب المُرسِل): إرسال طلب تغطية، الإبلاغ بالشفت/المركز،
// التصعيد للّيدر، وطلب موافقة تبديل. أمّا القبول/الرفض (نقر الكرت) والإبلاغ
// التلقائيّ للّيدر فيُربطان في الواجهة لاحقًا مباشرةً بالمحرّك.
//
// إضافة أداة:
//   1. عرّفها في NOTIFICATION_TOOLS
//   2. أضف case في dispatchNotificationTool
//   3. حدّث notifications_assistant.md ليعرفها الذكاء
// ═══════════════════════════════════════════════════════════════

import type { V2Tool, V2ToolContext } from './tools';
import { supabase } from '../supabase';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};

// ─── تعريفات الأدوات ───────────────────────────────────────────
export const NOTIFICATION_TOOLS: V2Tool[] = [
  {
    name: 'send_coverage_request',
    description:
      'يُرسل طلب تغطية لنقصٍ. stage=same_shift (الافتراضيّ): زملاء الفترة الأخرى من ' +
      'نفس الشفت. stage=other_shift (التصعيد بعد فشل نفس الشفت): زملاء الشفت الآخر ' +
      '(تبديل لليوم كامل). يُستثنى طبيب التخفيف والمُستأذِن في فترة النقص. يبقى 24 ' +
      'ساعة؛ أوّل موافقة تُطبّق التبديل وتُلغي الباقي. بعد موافقة الطبيب على الإرسال.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string', description: 'بداية الأسبوع (أحد) YYYY-MM-DD.' },
        day: { type: 'string', enum: [...DAYS] },
        clinicNumber: { type: 'integer', description: 'عيادة النقص.' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'فترة النقص.' },
        shift: { type: 'string', enum: ['morning', 'evening'], description: 'شفت النقص.' },
        absentDoctorIndex: { type: 'integer', description: 'رقم الطبيب الغائب صاحب الفترة.' },
        stage: {
          type: 'string', enum: ['same_shift', 'other_shift'],
          description: 'same_shift افتراضيًّا؛ other_shift للتصعيد بعد رفض نفس الشفت.',
        },
      },
      required: ['weekStart', 'day', 'clinicNumber', 'period', 'shift', 'absentDoctorIndex'],
    },
  },
  {
    name: 'announce_to',
    description:
      'يُبلِغ جمهورًا بحدثٍ للعلم فقط: الشفت (قروب الطبيب) أو المركز (الجميع). ' +
      'استدعِها بعد اختيار المستخدم «الشفت» أو «المركز» (لا تستدعِها مع «لا داعي»).',
    input_schema: {
      type: 'object',
      properties: {
        audience: { type: 'string', enum: ['shift', 'center'], description: 'الشفت أو المركز.' },
        message: { type: 'string', description: 'نصّ الإبلاغ بالعربيّة.' },
        subjectDoctorIndex: {
          type: 'integer',
          description: 'الطبيب صاحب الحدث (لتحديد قروبه عند audience=shift، ويُستثنى من المُبلَّغين).',
        },
      },
      required: ['audience', 'message'],
    },
  },
  {
    name: 'alert_leader_gap',
    description:
      'يصعّد نقصًا غير مُغطّى إلى التيم ليدر (كرت يحتاج تصرّفًا) — حين يرفض الجميع ' +
      'أو تنتهي مهلة طلب التغطية. بعدها يعرض الذكاء على الليدر قائمة الحلول.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        clinicNumber: { type: 'integer' },
        period: { type: 'integer', enum: [1, 2, 3, 4] },
        shift: { type: 'string', enum: ['morning', 'evening'] },
        absentDoctorIndex: { type: 'integer', description: 'الطبيب الغائب (اختياريّ، للصياغة).' },
      },
      required: ['weekStart', 'day', 'clinicNumber', 'period', 'shift'],
    },
  },
  {
    name: 'request_swap_consent',
    description:
      'يُرسل طلب تبديلٍ إلى الطرف الآخر لأخذ موافقته. لا يُطبَّق إلا عند قبوله، ولا ' +
      'يُبلَّغ الليدر بالتبديل المتّفق. استعملها لطلب طبيبٍ التبديل مع زميل.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndexes: {
          type: 'array', items: { type: 'integer' },
          description: 'أرقام أطراف التبديل مرتّبين؛ كلٌّ يأخذ مكان التالي.',
        },
        targetIndex: { type: 'integer', description: 'رقم الطبيب الذي تُطلَب موافقته.' },
        scope: { type: 'string', enum: ['day', 'shift', 'period'] },
        shift: { type: 'string', enum: ['morning', 'evening'], description: 'فقط لو scope=shift.' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'فقط لو scope=period.' },
      },
      required: ['weekStart', 'day', 'doctorIndexes', 'targetIndex', 'scope'],
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

const asShift = (s: unknown): 'morning' | 'evening' => (s === 'evening' ? 'evening' : 'morning');

function senderOf(ctx: V2ToolContext): { id?: string; name?: string } {
  return { id: ctx.user?.id, name: ctx.user?.name };
}

/** معرّف التيم ليدر لهذه العيادة من جدول الأطباء */
async function getTeamLeaderId(clinicId: string): Promise<string | null> {
  const { data } = await supabase
    .from('doctors')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('role', 'team_leader')
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** كلّ معرّفات القادة في العيادة (لاستثنائهم من البثّ — يُبلَّغون تلقائيًّا) */
async function getTeamLeaderIds(clinicId: string): Promise<string[]> {
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

// ─── الموزّع ───────────────────────────────────────────────────
export async function dispatchNotificationTool(
  name: string,
  input: unknown,
  ctx: V2ToolContext,
): Promise<string> {
  if (!ctx.clinicId) return 'Tool error: لا توجد عيادة مرتبطة بالمستخدم الحالي.';
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const { notifications } = await import('../algorithms/notifications');
  const { requests } = await import('../algorithms/requests');
  const sender = senderOf(ctx);

  try {
    switch (name) {
      case 'send_coverage_request': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const absent = resolveDoctor(ctx, r.absentDoctorIndex);
        if (!absent) return 'Tool error: رقم الطبيب الغائب غير صالح.';
        const gap = {
          clinicNumber: Number(r.clinicNumber),
          period: Number(r.period),
          shift: asShift(r.shift),
        };
        const stage = r.stage === 'other_shift' ? 'other_shift' : 'same_shift';
        const candidates =
          stage === 'other_shift'
            ? await requests.findShiftCandidates(
                ctx.clinicId, String(r.weekStart), r.day,
                gap.shift === 'morning' ? 'evening' : 'morning',
                { excludeDoctorId: absent.id, gapPeriod: gap.period },
              )
            : await requests.findCoverageCandidates(ctx.clinicId, String(r.weekStart), r.day, gap);
        if (candidates.length === 0) {
          return stage === 'other_shift'
            ? 'لا يوجد زملاء مؤهَّلون في الشفت الآخر.'
            : 'لا يوجد زملاء مؤهَّلون للتغطية في هذا الشفت.';
        }
        const res = await notifications.openCoverageRequests({
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          gap, absentDoctorId: absent.id, absentDoctorName: absent.name,
          candidates, stage,
          senderId: sender.id, senderName: sender.name,
        });
        const where = stage === 'other_shift' ? 'الشفت الآخر' : 'زملاء الفترة الأخرى';
        return res.success
          ? `أرسلتُ طلب التغطية إلى ${res.sent} من ${where} (يبقى 24 ساعة).`
          : `Tool error: ${res.error}`;
      }

      case 'announce_to': {
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
        // استثنِ القادة من البثّ — يصلهم إشعارهم التلقائيّ الخاصّ فلا يُكرَّر
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

      case 'alert_leader_gap': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const leaderId = await getTeamLeaderId(ctx.clinicId);
        if (!leaderId) return 'Tool error: لا يوجد تيم ليدر لهذه العيادة.';
        const absent = r.absentDoctorIndex != null ? resolveDoctor(ctx, r.absentDoctorIndex) : null;
        const res = await notifications.alertLeaderGap({
          clinicId: ctx.clinicId, leaderId, weekStart: String(r.weekStart), day: r.day,
          gap: { clinicNumber: Number(r.clinicNumber), period: Number(r.period), shift: asShift(r.shift) },
          absentDoctorName: absent?.name,
          senderId: sender.id, senderName: sender.name,
        });
        return res.success ? 'صعّدتُ النقص إلى التيم ليدر.' : `Tool error: ${res.error}`;
      }

      case 'request_swap_consent': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const idxs = Array.isArray(r.doctorIndexes) ? r.doctorIndexes : [];
        const docs = idxs.map((n) => resolveDoctor(ctx, n)).filter((d): d is Resolved => d != null);
        if (docs.length < 2) return 'Tool error: التبديل يحتاج طبيبين صالحين على الأقلّ.';
        const target = resolveDoctor(ctx, r.targetIndex);
        if (!target) return 'Tool error: رقم الطبيب الذي تُطلَب موافقته غير صالح.';
        const requesterId = sender.id;
        const requesterName = sender.name;
        if (!requesterId || !requesterName) return 'Tool error: لا يوجد مستخدم لإرسال الطلب باسمه.';
        const scope =
          r.scope === 'shift' ? { kind: 'shift' as const, shift: asShift(r.shift) }
            : r.scope === 'period' ? { kind: 'period' as const, period: Number(r.period) }
              : { kind: 'day' as const };
        const res = await notifications.openSwapRequest({
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          requesterId, requesterName, targetId: target.id, targetName: target.name,
          scope, doctorIds: docs.map((d) => d.id),
        });
        return res.success
          ? `أرسلتُ طلب التبديل إلى ${target.name} يوم ${DAY_AR[r.day]}.`
          : `Tool error: ${res.error}`;
      }

      default:
        return `Tool error: أداة إشعارات غير معروفة "${name}".`;
    }
  } catch (e) {
    return `Tool error: ${e instanceof Error ? e.message : 'خطأ غير متوقّع.'}`;
  }
}
