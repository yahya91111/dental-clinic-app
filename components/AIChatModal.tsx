// ═══════════════════════════════════════════════════════════════
// AIChatModal — محادثة الذكاء وسط الشاشة (تصميم بسيط مؤقّت)
// ═══════════════════════════════════════════════════════════════
// حديث الذكاء مع المستخدم — منفصل تمامًا عن صفحة الإشعارات.
//
// المحادثة (الرسائل + المُرسِل) **مشتركة** مع صفحة الذكاء الكاملة: نأخذها
// من الأب (messages/onSend) فما يُكتب هنا أو هناك هو نفسه. أمّا طلبات الذكاء
// المعلّقة (تبديل/تغطية) ونتائجها فتُحمَّل من قاعدة البيانات وتُعرض كرسائل.
// هذه الأنواع لا تظهر في الجرس إطلاقًا.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, PanResponder,
} from 'react-native';
import { getNotifications, markAsRead, subscribeToNotifications } from '../lib/database';
import { notifications as notifEngine } from '../lib/algorithms/notifications';
import { sendMessageV2, type V2Message, type V2User } from '../lib/ai_v2';
import type { CoverageChoice } from '../lib/ai_v2/tools_requests_v2';
import { ChatMessage } from './aiTypes';
import { scale } from '../lib/scale';

type Props = {
  visible: boolean;
  onClose: () => void;
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  /** المحادثة المشتركة مع صفحة الذكاء الكاملة */
  messages: ChatMessage[];
  onSend: (text: string, opts?: { task?: 'schedule' | 'requests'; contextData?: string; hidden?: boolean; freshConversation?: boolean }) => void;
  /** مسح المحادثة (فقاعات الذاكرة + كروت قاعدة البيانات) */
  onClearConversation?: () => void | Promise<void>;
  isLoading?: boolean;
};

type ConvoNotif = {
  id: string; type: string; title: string; body: string;
  action_type?: string | null; action_status?: string | null; is_read?: boolean;
  created_at?: string; data?: any;
};

// أنواع «محادثة الذكاء» — مكانها الجات لا صفحة الإشعارات.
// طلبات التبديل (swap_request) ونتائجها (request_result مع data.swap_v2) مكانها
// **صفحة الإشعارات** حصرًا — لا تظهر هنا.
const AI_CHAT_TYPES = ['coverage_request', 'gap_alert', 'request_result'];
const inAIChat = (n: { type: string; data?: any }) =>
  AI_CHAT_TYPES.includes(n.type) && !(n.type === 'request_result' && n.data?.swap_v2);
const isActionType = (t: string) => t === 'coverage_request' || t === 'gap_alert';
const isPending = (n: { type: string; action_type?: string | null; action_status?: string | null }) =>
  isActionType(n.type) && n.action_type === 'accept_reject' && (!n.action_status || n.action_status === 'pending');

/** يفصل خيارات [نعم] [لا] من نصّ رسالة الذكاء لعرضها كأزرار قابلة للنقر */
function parseChoices(content: string): { text: string; choices: string[] } {
  const choices: string[] = [];
  const re = /\[([^\]\n]{1,30})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) choices.push(m[1].trim());
  const text = content.replace(re, '').replace(/[ \t]+\n/g, '\n').trim();
  return { text, choices };
}

/** عدد عناصر محادثة الذكاء غير المقروءة (طلب معلّق أو نتيجة جديدة) — للون الزرّ الأحمر */
export async function countUnreadAIChat(userId: string): Promise<number> {
  if (!userId) return 0;
  const { data } = await getNotifications(userId, 50);
  return (data || []).filter((n: ConvoNotif) => {
    // gap_alert: تغطية v2 (data.v===2) تُحمّر الزرّ ما دامت معلّقةً وغير مقروءة. بمجرّد
    // فتح القائد للكرت تُعلَّم مقروءةً فيهدأ الأوربّ، ويبقى الكرت للمرجع. القديمة بلا v2 تُستثنى.
    if (n.type === 'gap_alert') return n.data?.v === 2 && isPending(n) && !n.is_read;
    return inAIChat(n) && (isPending(n) || !n.is_read);
  }).length;
}

/** أحد الأسبوع الحاليّ — لإبقاء كروت التغطية المُنهاة ظاهرةً خلال أسبوعها فقط */
function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_AR_SEED: Record<string, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};

/** «د. اسم» مرّة واحدة فقط — الأسماء المخزَّنة قد تحمل اللقب أصلاً (لا «د.د.»). */
const dr = (name?: string): string => {
  const n = (name || '').trim();
  if (!n) return '';
  return /^د\s*\./.test(n) ? n : `د. ${n}`;
};

/**
 * يبني سياق التغذية الخفيّ لنقصِ تغطية (v2): حقائق منظَّمة + تعليمات صياغة. الذكاء
 * يصوغ الرسالة بصوته كأنّه لاحظ النقص بنفسه — لا يذكر أنّها مُعطاة له ولا يذكر فترات.
 */
type SeedDoc = { id?: string; name: string };
type SeedGap = {
  kind: string;
  clinicNumber?: number;
  twoPeriodColleague?: SeedDoc | null;
  candidates?: SeedDoc[];
  fullCandidates?: SeedDoc[];                              // متفرّغون في كلّ الفترات الشاغرة
  partials?: { period?: number; candidates?: SeedDoc[] }[]; // لا حلّ كامل → مرشّحو كلّ فترة
  // إعادة توزيع اليوم — كلّ الخيارات (كلّ خيار: منفردٌ بالعيادة + بقيّة نقلاته)
  reshapeOptions?: { moves?: { doctor?: SeedDoc; period?: number; clinic?: number; from?: string }[] }[];
  clinicColleague?: SeedDoc | null;
  optionA?: { cover: SeedDoc; coverClinic: number; backfill: SeedDoc | null }[];
  optionB?: { clinicNumber: number; a: SeedDoc; b: SeedDoc }[];
};

// الكرت قد يجمع أكثر من غائب — بندٌ لكلّ (يوم، غائب)؛ البنود القديمة بلا absentId
// مالكها غائب الكرت (data.absent_doctor_id).
type SeedDay = { day: string; absentId?: string; absentName?: string; gaps?: SeedGap[]; reserves?: SeedDoc[] };

/** أيّام الكرت: data.days[] الجديد، أو coverage المفرد القديم (توافق رجعيّ). */
function coverageDays(d: Record<string, any>): SeedDay[] {
  if (Array.isArray(d.days)) return d.days as SeedDay[];
  if (d.coverage) return [d.coverage as SeedDay];
  return [];
}

/** حلول نقصٍ واحد — نصًّا، بلا أقواس. */
function gapSolution(g: SeedGap, reserveStr: string): string {
  if (g.kind === 'delegator_combo') {
    // عيادة الغائب + الدليقيتر معًا → **خياران منفصلان مُسمّيان** (الأول/الثاني)
    const A = g.optionA || [];
    const B = g.optionB || [];
    const lines: string[] = [`  نقص مركّب: عيادة ${g.clinicNumber} + الدليقيتر (يُغطّيان معًا). خياران منفصلان:`];
    if (A.length) {
      const a0 = A[0];
      const back0 = a0.backfill ? ` ويستلم ${dr(a0.backfill.name)} عيادة ${a0.coverClinic} كاملة` : '';
      lines.push(`  **الخيار الأول:** ${dr(a0.cover.name)} يحلّ محلّ الغائب (عيادته + الدليقيتر)،${back0}.`);
      const altA = A.slice(1).map((o) => dr(o.cover.name));
      if (altA.length) lines.push(`     (بدائل المُغطّي: ${altA.join('، ')})`);
    }
    if (B.length) {
      const b0 = B[0];
      const col = g.clinicColleague ? `${dr(g.clinicColleague.name)} يستلم عيادة ${g.clinicNumber} كاملة، و` : '';
      lines.push(`  **الخيار الثاني:** ${col}عيادة ${b0.clinicNumber} (${dr(b0.a.name)} و${dr(b0.b.name)}) تتولّى الدليقيتر بالتناوب.`);
      const altB = B.slice(1).map((o) => `عيادة ${o.clinicNumber}`);
      if (altB.length) lines.push(`     (بدائل عيادة الدليقيتر: ${altB.join('، ')})`);
    }
    if (reserveStr) lines.push(`  أو الاحتياطي: ${reserveStr}.`);
    return lines.join('\n');
  }
  if (g.kind === 'delegator') {
    const names = (g.candidates || []).map((x) => dr(x.name));
    const opts: string[] = [];
    if (names.length) opts.push(`${names.join(' أو ')} (متفرّغون في تلك الفترة)`);
    if (reserveStr) opts.push(`الاحتياطي: ${reserveStr}`);
    return `  - الدليقيتر: ${opts.length ? opts.join('، أو ') : 'لا حلّ متاح حاليًّا'}`;
  }
  const opts: string[] = [];
  if (g.twoPeriodColleague) opts.push(`${dr(g.twoPeriodColleague.name)} (زميله في العيادة) يستلم الفترتين`);
  for (const f of g.fullCandidates || []) opts.push(`${dr(f.name)} (متفرّغ) يستلمها كاملة`);
  // إعادة توزيع اليوم — كلّ خيار: طبيبٌ ينفرد بالعيادة وزميله يستلم عيادتهما كاملة،
  // والدليقيتر يبقى بالتناوب إن أمكن وإلّا ذاب
  for (const ro of g.reshapeOptions || []) {
    const rsMoves = ro.moves || [];
    const rsMain = dr(rsMoves.find((m) => m.clinic === g.clinicNumber)?.doctor?.name);
    if (!rsMain) continue;
    const rsTails = [...new Set(
      rsMoves.filter((m) => (m.clinic ?? 0) > 0 && m.clinic !== g.clinicNumber)
        .map((m) => `يبقى ${dr(m.doctor?.name)} في عيادة ${m.clinic} كاملة`),
    )];
    const rsDelegs = [...new Set(
      rsMoves.filter((m) => m.clinic === 0).map((m) => dr(m.doctor?.name)).filter(Boolean),
    )];
    if (rsDelegs.length) {
      rsTails.push(rsDelegs.length > 1
        ? `يتناوب ${rsDelegs.join(' و')} على الدليقيتر`
        : `يستلم ${rsDelegs[0]} الدليقيتر`);
    }
    opts.push(`إعادة توزيع اليوم: يستلم ${rsMain} العيادة منفردًا` +
      (rsTails.length ? ` و${rsTails.join(' و')}` : ''));
  }
  if (reserveStr) opts.push(`الاحتياطي: ${reserveStr}`);
  // لا حلّ كامل؟ المعادلة تقترح تغطيةً جزئيّة: متفرّغ كلّ فترةٍ على حدة
  const partialNames = [...new Set(
    (g.partials || []).flatMap((p) => (p.candidates || []).map((x) => dr(x.name))),
  )];
  if (!opts.length && partialNames.length) {
    return `  - عيادة ${g.clinicNumber}: لا أحد متاحًا لليوم كاملًا؛ تغطية جزئيّة ممكنة: ${partialNames.join(' أو ')} (كلٌّ في وقته المتاح)`;
  }
  return `  - عيادة ${g.clinicNumber}: ${opts.length ? opts.join('، أو ') : 'لا حلّ متاح حاليًّا'}`;
}

function buildCoverageSeed(n: ConvoNotif, selfId?: string): string {
  const d = n.data || {};
  // كرت «استئذان يحتاج ترتيبًا»: طبيبٌ استأذن وهو يستلم خانةً في فترةٍ يحجبها
  // استئذانه — الذكاء يعرض الحال على القائد وينفّذ ما يأمر به (تبديل/نقل).
  // يُغلَق الكرت تلقائيًّا متى زال التعارض.
  if (d.perm_conflict) {
    const p = d.perm_conflict as { day?: string; doctor_id?: string; doctor_name?: string; status_ar?: string };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    const self = !!selfId && p.doctor_id === selfId;
    return [
      'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): طبيبٌ سجّل استئذانًا وهو يستلم خانةً في',
      'الفترة التي يحجبها استئذانه — اسمه باقٍ في الجدول لكن يلزم تبديل فترة عمله',
      '(أو نقله) كي لا تبقى عيادته معلّقةً وقت الاستئذان. ابدأ أنت الحديث مع القائد',
      self
        ? 'كأنّك لاحظتَ ذلك بنفسك — وهو نفسه صاحب الاستئذان فخاطبه مباشرةً: أخبره'
        : `كأنّك لاحظتَ ذلك بنفسك: أخبره أنّ ${dr(p.doctor_name)} (${p.status_ar || 'استئذان'})`,
      self
        ? `أنّ استئذانه (${p.status_ar || 'استئذان'}) يوم ${dayAr} يتعارض مع استلامه، واسأله`
        : `يوم ${dayAr} يستلم وقتَ استئذانه، واسأله **سطرًا واحدًا** كيف يرتّبه —`,
      self
        ? '**سطرًا واحدًا** كيف يرتّب فترته — **بلا اقتراحات ولا خيارات**.'
        : '**بلا اقتراحات ولا خيارات**.',
      'ثمّ نفّذ ما يطلبه كما هو بأدواتك (تبديل طبيبين → swap_doctors بهذا اليوم',
      'والأسبوع أدناه). أكّد بسطرٍ بعد التنفيذ.',
      '',
      `الأسبوع: ${d.week_start || ''}`,
      `اليوم: ${p.day || ''} (${dayAr})`,
      `الطبيب المستأذن: ${dr(p.doctor_name)}${self ? ' (هو القائد المخاطَب نفسه)' : ''}`,
    ].join('\n');
  }
  // كرت «عودة تحتاج مكانًا»: أُلغيت حالةٌ ومكان صاحبها مُغطًّى — الذكاء يسأل القائد
  // أين يوضَع العائد (بلا اقتراحات) وينفّذ أمره كما هو. العائد قد يكون القائد نفسه
  // (ألغى حالته بنفسه) — حينها يُخاطَب مباشرةً: «أين تريد أن تعود؟».
  if (d.placement) {
    const p = d.placement as { day?: string; doctor_id?: string; doctor_name?: string; status_ar?: string; converted?: boolean };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    const self = !!selfId && p.doctor_id === selfId;
    // تحويل مرضيّةٍ/تفرّغٍ مُغطًّى إلى استئذان: حاضرٌ معظم اليوم لكن بلا مركز —
    // نفس سؤال «أين يوضَع؟» بصياغة التحويل لا الإلغاء.
    if (p.converted) {
      return [
        'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): طبيبٌ حوّل حالة غيابه (مرضية/تفرّغ) إلى',
        'استئذانٍ — أي أنّه حاضرٌ معظم اليوم — لكنّ مكانه السابق غُطّي وقت غيابه فلا',
        'يُعاد إليه تلقائيًّا. ابدأ أنت الحديث مع القائد كأنّك لاحظتَ ذلك بنفسك:',
        self
          ? 'وهو نفسه المحوِّل — أخبره أنّ مكانه السابق مُغطًّى واسأله **سطرًا واحدًا** أين'
          : `أخبره أنّ ${dr(p.doctor_name)} حوّل حالته إلى استئذانٍ يوم ${dayAr} ومكانه السابق`,
        self
          ? 'يعود — **بلا اقتراحات ولا خيارات**.'
          : 'مُغطًّى، واسأله **سطرًا واحدًا** أين يضعه — **بلا اقتراحات ولا خيارات**.',
        'ثمّ نفّذ ما يطلبه كما هو بأدواتك (ومرّر اليوم والأسبوع أدناه). أكّد بسطرٍ بعد التنفيذ.',
        '',
        `الأسبوع: ${d.week_start || ''}`,
        `اليوم: ${p.day || ''} (${dayAr})`,
        `الطبيب المستأذن: ${dr(p.doctor_name)}${self ? ' (هو القائد المخاطَب نفسه)' : ''}`,
      ].join('\n');
    }
    return [
      self
        ? 'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): القائد الذي تخاطبه ألغى حالته بنفسه،'
        : 'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): أُلغيت حالة طبيب، ومكانه السابق صار مُغطًّى',
      self
        ? 'ومكانه السابق صار مُغطًّى فلم يُعَد إليه تلقائيًّا. ابدأ أنت الحديث وخاطبه'
        : 'فلم يُعَد إليه تلقائيًّا. ابدأ أنت الحديث مع القائد كأنّك لاحظتَ ذلك بنفسك:',
      self
        ? `مباشرةً (هو نفسه العائد): أخبره أنّ مكانه السابق مُغطًّى، واسأله **سطرًا واحدًا**`
        : `أخبره أنّ ${p.status_ar || 'حالة'} ${dr(p.doctor_name)} يوم ${dayAr} أُلغيت وأنّ مكانه`,
      self
        ? 'أين يريد أن يعود — **بلا اقتراحات ولا خيارات**.'
        : 'السابق مُغطًّى، واسأله **سطرًا واحدًا** أين يضعه — **بلا اقتراحات ولا خيارات**.',
      'ثمّ نفّذ ما يطلبه كما هو (قد يكون مركّبًا بأكثر من نقلة — نفّذها كلّها بأدواتك،',
      'ومرّر اليوم والأسبوع أدناه). أكّد بسطرٍ بعد التنفيذ.',
      '',
      `الأسبوع: ${d.week_start || ''}`,
      `اليوم: ${p.day || ''} (${dayAr})`,
      `الطبيب العائد: ${dr(p.doctor_name)}${self ? ' (هو القائد المخاطَب نفسه)' : ''}`,
    ].join('\n');
  }
  const days = coverageDays(d);
  const rawNames = [...new Set(days.map((x) => x.absentName).filter(Boolean))] as string[];
  const multi = rawNames.length > 1;
  const absentName = rawNames.length
    ? rawNames.map((x) => dr(x)).join(' و')
    : dr(String(d.absent_doctor_name || ''));

  // كتلة لكلّ بند (يوم، غائب): «يوم الأحد — غياب فلان: …حلول» أو «لا نقص — مغطّى».
  const dayBlocks = days.map((c) => {
    const dayAr = DAY_AR_SEED[c.day] || c.day || '';
    const who = multi && c.absentName ? ` — غياب ${dr(c.absentName)}` : '';
    const gaps: SeedGap[] = c.gaps || [];
    const reserves: SeedDoc[] = c.reserves || [];
    const reserveStr = reserves.length ? reserves.map((x) => dr(x.name)).join(' أو ') : '';
    if (!gaps.length) return `• يوم ${dayAr}${who}: لا نقص — اليوم مغطّى، لا حاجة لإجراء.`;
    return [`• يوم ${dayAr}${who}:`, ...gaps.map((g) => gapSolution(g, reserveStr))].join('\n');
  });

  return [
    'حدثٌ داخليّ (لا تذكر أنّه مُعطى لك): غاب طبيبٌ أو أكثر في يومٍ أو أكثر، وقد ينشأ نقصٌ',
    'في بعض الأيّام. تكلّم مع القائد كأنّك لاحظتَ ذلك بنفسك.',
    '',
    `**القائمة أدناه فيها ${days.length} ${days.length === 2 ? 'بندان' : 'بنود'} (بندٌ لكلّ غائبٍ في يوم). يجب أن يحتوي ردّك على`,
    `${days.length} فقرات — فقرةٌ لكلّ بند بالترتيب، تبدأ بـ«يوم …». لا تدمج بندين، ولا تُسقط أيّ`,
    'بند، ولا تكتفِ بآخر بند.** للبند الذي فيه نقص اذكر مكانه (بلا فترات) ثمّ حلوله؛ وللبند بلا',
    'نقص قل إنّه مغطّى ولا حاجة لإجراء. **اعرض الحلول كنصّ (نقاط)؛ لا أقواس [ ] ولا أزرار.** لا',
    'تذكر حلًّا غير موجود. اليوم الواحد قد يجمع غائبَين أو أكثر — سمِّ صاحب كلّ نقص في فقرته،',
    'وعند التنفيذ مرّر رقم **صاحب ذلك النقص** للأداة لا غائبًا آخر. عند ردّ القائد على بندٍ نفّذ',
    'بالأداة المناسبة **لذلك اليوم** (مرّر day الصحيح، لا تذكر فترةً، ولا تستعمل place_in_clinic):',
    'نقصٌ مركّب (عيادة+دليقيتر) → **apply_coverage_option**؛ نقصٌ بسيط (عيادة فقط أو دليقيتر فقط) → **cover_gap**؛',
    'اختار أحد خيارات «إعادة توزيع اليوم» → **reshape_day** بالمنفرد المختار (soloDoctorIndex) — المحرّك ينفّذ كلّ النقلات.',
    '',
    `الأسبوع: ${d.week_start || ''}`,
    absentName ? `${multi ? 'الأطبّاء الغائبون' : 'الطبيب الغائب'}: ${absentName}` : '',
    `البنود والحلول (${days.length}):`,
    ...dayBlocks,
  ].filter(Boolean).join('\n');
}

/** عنوان الكرت الثابت: الطبيب الغائب + أيّام النقص (بلا حلول وبلا فترات). */
function coverageTitle(n: ConvoNotif): string {
  const d = n.data || {};
  if (d.perm_conflict) {
    const p = d.perm_conflict as { day?: string; doctor_name?: string };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    return `استئذان يحتاج ترتيبًا — ${dr(p.doctor_name)}${dayAr ? `: ${dayAr}` : ''}`;
  }
  if (d.placement) {
    const p = d.placement as { day?: string; doctor_name?: string };
    const dayAr = DAY_AR_SEED[p.day || ''] || p.day || '';
    return `عودة تحتاج مكانًا — ${dr(p.doctor_name)}${dayAr ? `: ${dayAr}` : ''}`;
  }
  const days = coverageDays(d);
  const gapEntries = days.filter((c) => (c.gaps?.length || 0) > 0);
  const rawNames = [...new Set(
    (gapEntries.length ? gapEntries : days).map((x) => x.absentName).filter(Boolean),
  )] as string[];
  const absentName = rawNames.length
    ? rawNames.map((x) => dr(x)).join(' و')
    : dr(String(d.absent_doctor_name || ''));
  const gapDays = [...new Set(gapEntries.map((c) => DAY_AR_SEED[c.day] || c.day))];
  const list = gapDays.join('، ');
  return `نقص${absentName ? ` — ${absentName}` : ''}${list ? `: ${list}` : ''}`;
}

/**
 * أزرار التغطية — تُبنى **من حقائق الكرت نفسها** (بالهويّات) لا من نصّ الذكاء، فكلّ
 * زرّ يطابق حلًّا ذكره النصّ حرفيًّا. الضغط يُنفَّذ بالكود مباشرةً (applyCoverageChoice)
 * بلا أيّ نداءٍ للنموذج. الكتابة الحرّة تبقى متاحةً لما هو خارج الخيارات.
 */
type CovBtn = { label: string; choice: CoverageChoice };

type CovBtnGroup = { day: string; dayAr: string; absentId: string; absentName: string; btns: CovBtn[] };

function buildCoverageButtons(d: Record<string, any>): CovBtnGroup[] {
  const topId = String(d.absent_doctor_id || '');
  const topName = String(d.absent_doctor_name || '');
  const out: CovBtnGroup[] = [];
  for (const c of coverageDays(d)) {
    const gaps: SeedGap[] = c.gaps || [];
    if (!gaps.length) continue;
    const reserves = (c.reserves || []).filter((x): x is { id: string; name: string } => !!x.id);
    const btns: CovBtn[] = [];
    for (const g of gaps) {
      if (g.kind === 'delegator_combo') {
        const a0 = (g.optionA || [])[0];
        if (a0?.cover?.id) {
          btns.push({
            label: `الخيار الأول — ${dr(a0.cover.name)}`,
            choice: { kind: 'option_a', coverId: a0.cover.id, coverName: a0.cover.name },
          });
        }
        const b0 = (g.optionB || [])[0];
        if (b0) {
          btns.push({
            label: `الخيار الثاني — عيادة ${b0.clinicNumber} بالتناوب`,
            choice: { kind: 'option_b', delegatorClinicNumber: b0.clinicNumber },
          });
        }
        for (const rsv of reserves) {
          btns.push({
            label: `الاحتياطي ${dr(rsv.name)}`,
            choice: { kind: 'option_a', coverId: rsv.id, coverName: rsv.name },
          });
        }
      } else if (g.kind === 'delegator') {
        for (const cand of (g.candidates || []).slice(0, 3)) {
          if (!cand.id) continue;
          btns.push({
            label: `${dr(cand.name)} — الدليقيتر`,
            choice: { kind: 'cover_gap', location: 'delegator', coverId: cand.id, coverName: cand.name },
          });
        }
        for (const rsv of reserves) {
          btns.push({
            label: `الاحتياطي ${dr(rsv.name)} — الدليقيتر`,
            choice: { kind: 'cover_gap', location: 'delegator', coverId: rsv.id, coverName: rsv.name },
          });
        }
      } else {
        // نقص عيادة بسيط — الزميل/المتفرّغ يستلمها، أو الاحتياطي، أو جزئيًّا
        // (المحرّك يُغطّي تلقائيًّا الفترات المتاحة للمضغوط عليه — نفس النداء)
        const where = gaps.length > 1 ? ` — عيادة ${g.clinicNumber}` : '';
        const mate = g.twoPeriodColleague;
        if (mate?.id) {
          btns.push({
            label: `${dr(mate.name)} يستلم الفترتين${where}`,
            choice: { kind: 'cover_gap', location: 'clinic', clinicNumber: g.clinicNumber, coverId: mate.id, coverName: mate.name },
          });
        }
        for (const f of (g.fullCandidates || []).filter((x): x is { id: string; name: string } => !!x.id)) {
          btns.push({
            label: `${dr(f.name)} يستلمها كاملة${where}`,
            choice: { kind: 'cover_gap', location: 'clinic', clinicNumber: g.clinicNumber, coverId: f.id, coverName: f.name },
          });
        }
        // إعادة توزيع اليوم — زرٌّ لكلّ خيار (يحمل المنفرد المختار)
        for (const ro of g.reshapeOptions || []) {
          const rsSolo = (ro.moves || []).find((m) => m.clinic === g.clinicNumber)?.doctor;
          if (!rsSolo?.id) continue;
          btns.push({
            label: `إعادة توزيع اليوم: ${dr(rsSolo.name)} منفردًا${where}`,
            choice: { kind: 'reshape', clinicNumber: g.clinicNumber, soloId: rsSolo.id },
          });
        }
        for (const rsv of reserves) {
          btns.push({
            label: `الاحتياطي ${dr(rsv.name)}${where}`,
            choice: { kind: 'cover_gap', location: 'clinic', clinicNumber: g.clinicNumber, coverId: rsv.id, coverName: rsv.name },
          });
        }
        // حلول جزئيّة — تظهر فقط حين لا حلّ كامل (هكذا يبنيها المحرّك)
        const seenPartial = new Set(btns.map((b) => b.label));
        for (const p of g.partials || []) {
          for (const cand of (p.candidates || []).filter((x): x is { id: string; name: string } => !!x.id)) {
            const label = `${dr(cand.name)} — وقته المتاح${where}`;
            if (seenPartial.has(label)) continue;
            seenPartial.add(label);
            btns.push({
              label,
              choice: { kind: 'cover_gap', location: 'clinic', clinicNumber: g.clinicNumber, coverId: cand.id, coverName: cand.name },
            });
          }
        }
      }
    }
    if (btns.length) {
      out.push({
        day: c.day, dayAr: DAY_AR_SEED[c.day] || c.day,
        absentId: String(c.absentId || topId), absentName: String(c.absentName || topName),
        btns,
      });
    }
  }
  return out;
}

const SEED_TRIGGER = 'ابدأ'; // أوّل رسالة خفيّة تُشغّل صياغة الذكاء داخل الكرت (لا تُعرَض)

/**
 * كرت تغطية مستقلّ: عنوانٌ ثابت من المحرّك، ونقره يفتح **خيطًا خاصًّا** يصوغ فيه
 * الذكاء الحلول بسياق هذا النقص وحده (sendMessageV2 بحقائقه). يحلّ تشويش تعدّد
 * الطلبات: كلّ كرت حديثه منفصل. أوّل فتح يُعلّم الكرت مقروءًا فيهدأ الأوربّ.
 */
function CoverageCard({ notif, user, clinicId, onSeen }: {
  notif: ConvoNotif;
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  onSeen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<V2Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const startedRef = useRef(false);

  // حالة الكرت: معلّق (أحمر — تذكير) / متجاهَل (هذا القائد فقط) / تمّ (حُلّ يدويًّا
  // أو أغلقه المحرّك تلقائيًّا بعد تنفيذ التغطية = accepted)
  const status: 'pending' | 'ignored' | 'done' =
    !notif.action_status || notif.action_status === 'pending' ? 'pending'
      : notif.action_status === 'ignored' ? 'ignored' : 'done';

  // سحب الكرت (مثل محادثات الواتساب): يمينًا تظهر خيارات «تجاهل» و«تمّ»، يسارًا تختفي
  const [actionsOpen, setActionsOpen] = useState(false);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => {
      if (g.dx > 36) setActionsOpen(true);
      else if (g.dx < -36) setActionsOpen(false);
    },
  })).current;

  const mark = useCallback(async (s: 'ignored' | 'done') => {
    setActionsOpen(false);
    try {
      const { updateNotificationAction } = await import('../lib/database');
      await updateNotificationAction(notif.id, s);
      onSeen();
    } catch { /* يُعاد المحاولة بسحبٍ آخر */ }
  }, [notif.id, onSeen]);

  // يحفظ الخيط في بيانات الإشعار (دمجٌ مع الحقائق) فلا يُعاد توليده عند كلّ فتح
  const persist = useCallback(async (h: V2Message[]) => {
    try {
      const { updateNotificationData } = await import('../lib/database');
      await updateNotificationData(notif.id, { ...(notif.data || {}), thread: h });
    } catch { /* الحفظ تحسينٌ لا حرج في فشله */ }
  }, [notif.id, notif.data]);

  const runTurn = useCallback(async (h: V2Message[]) => {
    setHistory(h);
    setLoading(true);
    try {
      const v2User: V2User = {
        id: user.id, name: user.name, role: user.role,
        clinicId: user.clinicId || undefined, clinicName: user.clinicName,
      };
      const res = await sendMessageV2({
        messages: h, user: v2User,
        clinicId: clinicId || user.clinicId || undefined,
        contextData: buildCoverageSeed(notif, user.id), task: 'requests',
      });
      const text = res.success ? res.message : (res.error || 'تعذّر تنفيذ الطلب.');
      const next: V2Message[] = [...h, { role: 'assistant', content: text }];
      setHistory(next);
      persist(next);
    } catch (e) {
      setHistory([...h, { role: 'assistant', content: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }]);
    } finally {
      setLoading(false);
    }
  }, [notif, user, clinicId, persist]);

  const onToggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !startedRef.current) {
      startedRef.current = true;
      try { await markAsRead(notif.id); onSeen(); } catch { /* يهدأ الأوربّ لاحقًا */ }
      // خيطٌ محفوظ سابقًا؟ حمّله بلا نداء للذكاء (توفير توكن). وإلّا ابدأ التوليد.
      const saved = Array.isArray(notif.data?.thread) ? (notif.data!.thread as V2Message[]) : null;
      if (saved && saved.length) setHistory(saved);
      else runTurn([{ role: 'user', content: SEED_TRIGGER }]);
    }
  }, [expanded, notif.id, notif.data, onSeen, runTurn]);

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    setReply('');
    runTurn([...history, { role: 'user', content: t }]);
  }, [history, loading, runTurn]);

  // ─── أزرار الحلول: تنفيذٌ بالكود مباشرةً، لا نداء للنموذج ───
  // التأكيد يُضاف للخيط محليًّا فقط (لا persist): المحرّك يَشطب النقص من بيانات
  // الكرت ويُبطل الخيط بنفسه (resolveCoverageV2)، وإعادة حفظ الخيط هنا كانت
  // ستُعيد البيانات القديمة فوق المحدَّثة.
  const [covBusy, setCovBusy] = useState<string | null>(null);
  const [doneDays, setDoneDays] = useState<Record<string, boolean>>({});
  // كلّ مجموعة أزرار تحمل غائبها (الكرت قد يجمع أكثر من غائب لليوم نفسه) —
  // التنفيذ والشطب يستهدفان بند (اليوم، الغائب) بعينه.
  const handleChoice = useCallback(async (
    day: string, absent: { id: string; name: string }, label: string, choice: CoverageChoice,
  ) => {
    if (covBusy || loading) return;
    setCovBusy(`${day}|${absent.id}|${label}`);
    try {
      const { applyCoverageChoice } = await import('../lib/ai_v2/tools_requests_v2');
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const d = notif.data || {};
      if (!absent.id) throw new Error('بيانات الكرت ناقصة.');
      const res = await applyCoverageChoice({
        clinicId: cid,
        actor: { id: user.id, name: user.name, role: user.role },
        weekStart: String(d.week_start || ''), day,
        absent, choice,
      });
      const text = res.success ? (res.info || 'تمّ.') : (res.error || 'تعذّر التنفيذ.');
      if (res.success) setDoneDays((p) => ({ ...p, [`${day}|${absent.id}`]: true }));
      setHistory((h) => [...h, { role: 'assistant', content: text }]);
      onSeen(); // يجلب بيانات الكرت بعد شطب النقص (يُغلق إن لم يبقَ نقص)
    } catch (e) {
      setHistory((h) => [...h, { role: 'assistant', content: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }]);
    } finally {
      setCovBusy(null);
    }
  }, [covBusy, loading, clinicId, user, notif.data, onSeen]);

  // مجموعات الأزرار من حقائق الكرت — بندٌ نُفّذ حلُّه يسقط فورًا
  const covButtonDays = status === 'pending'
    ? buildCoverageButtons(notif.data || {}).filter((g) => !doneDays[`${g.day}|${g.absentId}`])
    : [];
  const covMultiAbsent = new Set(covButtonDays.map((g) => g.absentId)).size > 1;

  // ما يُعرَض: تجاوز رسالة التشغيل الخفيّة (index 0)، وآخر ردّ يحمل خياراته كأزرار
  const shown = history.filter((m, i) => !(i === 0 && m.role === 'user' && m.content === SEED_TRIGGER));

  // الألوان مبدئيّة (التصميم لاحقًا): معلّق = كهرمانيّ، متجاهَل = رماديّ، تمّ = أخضر
  const statusTag = status === 'done' ? ' · تمّ' : status === 'ignored' ? ' · متجاهَل' : '';

  return (
    <View
      style={[styles.covCard, status === 'ignored' && styles.covIgnored, status === 'done' && styles.covDone]}
      {...pan.panHandlers}
    >
      <TouchableOpacity style={styles.covHead} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.covCaret}>{expanded ? '▾' : '▸'}</Text>
        <Text style={styles.covTitle}>{coverageTitle(notif) + statusTag}</Text>
      </TouchableOpacity>

      {actionsOpen && (
        <View style={styles.covActions}>
          <TouchableOpacity style={[styles.covActBtn, styles.covActDone]} onPress={() => mark('done')}>
            <Text style={styles.covActTxt}>تمّ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.covActBtn, styles.covActIgnore]} onPress={() => mark('ignored')}>
            <Text style={styles.covActTxt}>تجاهل</Text>
          </TouchableOpacity>
        </View>
      )}

      {expanded && (
        <View style={styles.covBody}>
          {/* الذكاء يعرض الحلول نصًّا، والأزرار أسفله تُبنى من حقائق الكرت (كود لا نموذج) */}
          {shown.map((m, i) => {
            const isAI = m.role === 'assistant';
            return (
              <View key={i} style={[styles.msg, isAI ? styles.msgAI : styles.msgUser]}>
                <Text style={[styles.msgTxt, !isAI && styles.msgTxtUser]}>{m.content}</Text>
              </View>
            );
          })}
          {loading && <ActivityIndicator color="#2D8C8C" style={{ marginVertical: scale(6) }} />}

          {/* أزرار الحلول — تحت نصّ الذكاء مباشرةً، مجموعة لكلّ يوم؛ الضغط ينفّذ
              بالكود فورًا (بلا نموذج)، والكتابة الحرّة تبقى لما هو خارج الخيارات */}
          {!loading && shown.some((m) => m.role === 'assistant') && covButtonDays.map((g) => (
            <View key={`${g.day}|${g.absentId}`} style={styles.covBtnGroup}>
              {covButtonDays.length > 1 && (
                <Text style={styles.covBtnDay}>
                  يوم {g.dayAr}{covMultiAbsent && g.absentName ? ` — غياب ${dr(g.absentName)}` : ''}:
                </Text>
              )}
              <View style={styles.chipRow}>
                {g.btns.map((b) => {
                  const k = `${g.day}|${g.absentId}|${b.label}`;
                  const busy = covBusy === k;
                  return busy ? (
                    <ActivityIndicator key={k} color="#2D8C8C" style={{ marginVertical: scale(4) }} />
                  ) : (
                    <TouchableOpacity
                      key={k}
                      style={styles.chip}
                      disabled={!!covBusy}
                      onPress={() => handleChoice(g.day, { id: g.absentId, name: g.absentName }, b.label, b.choice)}
                    >
                      <Text style={styles.chipTxt}>{b.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.covInputRow}>
            <TextInput
              style={styles.covInput}
              value={reply}
              onChangeText={setReply}
              placeholder="ردّك…"
              placeholderTextColor="#9AA7A7"
              textAlign="right"
              onSubmitEditing={() => send(reply)}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={() => send(reply)} disabled={loading}>
              <Text style={styles.sendTxt}>إرسال</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function AIChatModal({ visible, onClose, user, clinicId, messages, onSend, onClearConversation, isLoading }: Props) {
  const [convo, setConvo] = useState<ConvoNotif[]>([]);
  const [input, setInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // أزرار الإبلاغ بعد غيابٍ ذاتيّ: الضغط يُنفَّذ **بالكود مباشرةً** (announceAbsence)
  // — النموذج لا يسأل ولا يشارك. النتيجة تحلّ محلّ الأزرار (لكلّ رسالة على حدة).
  const [annResults, setAnnResults] = useState<Record<string, string>>({});
  const [annBusyId, setAnnBusyId] = useState<string | null>(null);
  const handleAnnounce = useCallback(async (m: ChatMessage, choice: 'shift' | 'center' | 'none') => {
    const offer = m.announceOffer;
    if (!offer || annBusyId) return;
    if (choice === 'none') {
      setAnnResults((p) => ({ ...p, [m.id]: 'حسنًا — بلا إبلاغ.' }));
      return;
    }
    setAnnBusyId(m.id);
    try {
      const { announceAbsence } = await import('../lib/ai_v2/tools_requests_v2');
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const res = await announceAbsence({
        clinicId: cid, sender: { id: user.id, name: user.name },
        audience: choice, message: offer.message, subjectId: offer.subjectId,
      });
      setAnnResults((p) => ({
        ...p,
        [m.id]: res.success ? (res.info || 'تمّ الإبلاغ.') : `تعذّر الإبلاغ: ${res.error || ''}`,
      }));
    } catch (e) {
      setAnnResults((p) => ({ ...p, [m.id]: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }));
    } finally {
      setAnnBusyId(null);
    }
  }, [annBusyId, clinicId, user]);

  // أزرار التبديل للقائد: [أرسل طلبًا]/[بدّل مباشرة] حين يكون طرفًا، و[أبلغهما]/[لا داعي]
  // بعد تبديله اثنين، وأزرار اقتراحات الاستئذان المتعارض (زميل/فترة/شفت آخر) —
  // الضغط يُنفَّذ **بالكود مباشرةً**، لا نداء للنموذج.
  const [swapResults, setSwapResults] = useState<Record<string, string>>({});
  const [swapBusyId, setSwapBusyId] = useState<string | null>(null);
  const handleSwapOffer = useCallback(async (
    m: ChatMessage,
    choice: 'request' | 'direct' | 'notify' | 'none' | 'perm_colleague' | 'perm_period' | 'perm_other',
  ) => {
    const offer = m.swapOffer;
    if (!offer || swapBusyId) return;
    if (choice === 'none') {
      setSwapResults((p) => ({ ...p, [m.id]: 'حسنًا — بلا إبلاغ.' }));
      return;
    }
    setSwapBusyId(m.id);
    try {
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      let res: { success: boolean; info?: string; error?: string } | null = null;
      if (offer.kind === 'ask_mode' && choice === 'request') {
        res = await mod.sendSwapRequestByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          targetId: offer.target.id, targetName: offer.target.name,
        });
      } else if (offer.kind === 'ask_mode' && choice === 'direct') {
        res = await mod.directSwapByCode({
          clinicId: cid, actor: { id: user.id, role: user.role },
          weekStart: offer.weekStart, day: offer.day,
          targetId: offer.target.id, targetName: offer.target.name,
          actorName: user.name,
        });
      } else if (offer.kind === 'offer_notify' && choice === 'notify') {
        res = await mod.notifySwappedPair({
          clinicId: cid, sender: { id: user.id, name: user.name },
          day: offer.day, a: offer.a, b: offer.b,
        });
      } else if (offer.kind === 'permission_fix' && choice === 'perm_colleague' && offer.colleague) {
        res = await mod.sendSwapRequestByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          targetId: offer.colleague.id, targetName: offer.colleague.name,
          perm: { blocked: offer.blocked, targetPeriod: offer.period, statusAr: offer.statusAr || 'استئذان', leaderIds: offer.leaderIds || [] },
        });
      } else if (offer.kind === 'permission_fix' && choice === 'perm_period' && offer.period) {
        res = await mod.sendSwapRequestModeByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          mode: { kind: 'period', period: offer.period },
          excludePeriods: offer.blocked,
          perm: { blocked: offer.blocked, targetPeriod: offer.period, statusAr: offer.statusAr || 'استئذان', leaderIds: offer.leaderIds || [] },
        });
      } else if (offer.kind === 'permission_fix' && choice === 'perm_other') {
        res = await mod.sendSwapRequestModeByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          mode: { kind: 'other_shift' },
          excludePeriods: offer.blocked,
          perm: { blocked: offer.blocked, targetPeriod: offer.period, statusAr: offer.statusAr || 'استئذان', leaderIds: offer.leaderIds || [] },
        });
      }
      if (res) {
        setSwapResults((p) => ({
          ...p,
          [m.id]: res!.success ? (res!.info || 'تمّ.') : `تعذّر: ${res!.error || ''}`,
        }));
      }
    } catch (e) {
      setSwapResults((p) => ({ ...p, [m.id]: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }));
    } finally {
      setSwapBusyId(null);
    }
  }, [swapBusyId, clinicId, user]);

  const loadConvo = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    // الطلبات المعلّقة + النتائج الجديدة (تختفي الموافقة/الرفض بعد قراءتها).
    // وكرت التغطية المُنهى (تمّ/متجاهَل/أغلقه المحرّك) يبقى ظاهرًا بلونه خلال أسبوعه
    // فقط — المعلّق يبقى دائمًا (أحمر، تذكير).
    const sunday = currentSunday();
    const items = ((data || []) as ConvoNotif[])
      .filter((n) =>
        isPending(n)
        || (n.type === 'request_result' && !n.data?.swap_v2 && !n.is_read)
        || (n.type === 'gap_alert' && n.data?.v === 2 && String(n.data?.week_start || '') >= sunday))
      .reverse();
    setConvo(items);
    // علّم النتائج المعروضة مقروءة (يُطفئ الأحمر وتختفي عند الفتح التالي)
    items.filter((n) => n.type === 'request_result').forEach((n) => markAsRead(n.id));
  }, [user?.id]);

  // كرت إعادة عرض تبديل الاستئذان: الطالب يضغط الجانب الآخر → يُرسَل الطلب ويُغلَق الكرت.
  const handlePermRetry = useCallback(async (n: ConvoNotif) => {
    const pr = n.data?.perm_retry as
      | { day: string; side: 'same' | 'other'; blocked: number[]; target_period?: number; status_ar?: string; leader_ids?: string[] }
      | undefined;
    if (!pr || swapBusyId) return;
    setSwapBusyId(n.id);
    try {
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const perm = { blocked: pr.blocked, targetPeriod: pr.target_period, statusAr: pr.status_ar || 'استئذان', leaderIds: pr.leader_ids || [] };
      const mode = pr.side === 'other'
        ? { kind: 'other_shift' as const }
        : { kind: 'period' as const, period: pr.target_period ?? 0 };
      const res = await mod.sendSwapRequestModeByCode({
        clinicId: cid, requester: { id: user.id, name: user.name },
        weekStart: String(n.data?.week_start || ''), day: pr.day,
        mode, excludePeriods: pr.blocked, perm,
      });
      setSwapResults((p) => ({ ...p, [n.id]: res.success ? (res.info || 'تمّ.') : `تعذّر: ${res.error || ''}` }));
      if (res.success) {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, 'accepted'); // أُغلق كرت إعادة العرض بعد الإرسال
      }
      loadConvo();
    } catch (e) {
      setSwapResults((p) => ({ ...p, [n.id]: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }));
    } finally {
      setSwapBusyId(null);
    }
  }, [swapBusyId, clinicId, user, loadConvo]);

  // حمّل الطلبات عند الفتح، وأعد التحميل عند تغيّر المحادثة (قد ينشئ ردّ الذكاء طلبًا)
  useEffect(() => { if (visible) { setNote(''); loadConvo(); } }, [visible, messages.length, loadConvo]);

  // تحديث فوريّ (Realtime) والمحادثة مفتوحة: يصل الردّ (موافقة/رفض) فورًا دون
  // الحاجة للخروج والدخول.
  useEffect(() => {
    if (!visible || !user?.id) return;
    const unsub = subscribeToNotifications(user.id, loadConvo);
    return unsub;
  }, [visible, user?.id, loadConvo]);

  // إرسال إدخال المستخدم العاديّ (المحادثة المشتركة). كروت التغطية لها خيطها
  // المستقلّ داخل الكرت (CoverageCard) فلا تمرّ من هنا.
  const sendInput = useCallback((text: string) => {
    onSend(text);
  }, [onSend]);

  async function handleDecision(n: ConvoNotif, decision: 'accept' | 'reject') {
    if (!user?.id) return;
    setBusyId(n.id);
    try {
      let msg = '';
      if (n.type === 'coverage_request') {
        const res = decision === 'accept'
          ? await notifEngine.acceptCoverage({ notificationId: n.id, accepterId: user.id, accepterRole: user.role, accepterName: user.name })
          : await notifEngine.rejectCoverage({ notificationId: n.id });
        msg = res.success ? (decision === 'accept' ? 'تمّت الموافقة وطُبّق التبديل.' : 'رفضتَ الطلب.') : `تعذّر: ${res.error || ''}`;
      } else {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, decision === 'accept' ? 'accepted' : 'rejected');
        msg = decision === 'accept' ? 'تمّ.' : 'رُفض.';
      }
      setNote(msg);
      await loadConvo();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setBusyId(null);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendInput(text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }

  async function handleClear() {
    try { await onClearConversation?.(); } catch { /* تجاهل */ }
    setConvo([]); setNote('');
    await loadConvo();
  }

  // دمج الرسائل المشتركة مع طلبات/نتائج الذكاء وترتيبها زمنيًّا تصاعديًّا
  type Merged =
    | { kind: 'msg'; ts: number; m: ChatMessage }
    | { kind: 'notif'; ts: number; n: ConvoNotif };
  const mergedItems: Merged[] = [
    ...messages.map((m): Merged => ({ kind: 'msg', ts: m.timestamp || 0, m })),
    ...convo.map((n): Merged => ({ kind: 'notif', ts: n.created_at ? new Date(n.created_at).getTime() : 0, n })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>الذكاء</Text>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(4) }}>
                {!!onClearConversation && (
                  <TouchableOpacity onPress={handleClear} style={styles.closeBtn}>
                    <Text style={[styles.closeTxt, { color: '#C0493B' }]}>مسح المحادثة</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeTxt}>إغلاق</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={{ padding: scale(12), paddingBottom: scale(16) }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {/* المحادثة المشتركة + طلبات الذكاء ونتائجها، مدموجة ومرتّبة زمنيًّا
                  (فالموافقة تظهر تحت الطلب لا فوقه) */}
              {mergedItems.map((it) => {
                if (it.kind === 'msg') {
                  const m = it.m;
                  // رسائل الذكاء قد تحمل خيارات [..] → اعرضها كأزرار للنقر السريع
                  const { text, choices } = m.role === 'assistant'
                    ? parseChoices(m.content)
                    : { text: m.content, choices: [] as string[] };
                  const isLast = it === mergedItems[mergedItems.length - 1];
                  return (
                    <View key={m.id} style={[styles.msg, m.role === 'user' ? styles.msgUser : styles.msgAI]}>
                      {!!text && (
                        <Text style={[styles.msgTxt, m.role === 'user' && styles.msgTxtUser]}>{text}</Text>
                      )}
                      {choices.length > 0 && isLast && (
                        <View style={styles.chipRow}>
                          {choices.map((c, i) => (
                            <TouchableOpacity
                              key={`${m.id}-${i}`}
                              style={styles.chip}
                              disabled={isLoading}
                              onPress={() => sendInput(c)}
                            >
                              <Text style={styles.chipTxt}>{c}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {/* أزرار الإبلاغ بعد غيابٍ ذاتيّ — تنفيذ بالكود مباشرةً، لا نداء للنموذج */}
                      {m.role === 'assistant' && !!m.announceOffer && (
                        annResults[m.id] ? (
                          <Text style={styles.annNote}>{annResults[m.id]}</Text>
                        ) : annBusyId === m.id ? (
                          <ActivityIndicator color="#2D8C8C" style={{ marginTop: scale(8) }} />
                        ) : (
                          <>
                            <Text style={styles.annAsk}>هل تُبلَّغ الجهات؟</Text>
                            <View style={styles.chipRow}>
                              <TouchableOpacity style={styles.chip} onPress={() => handleAnnounce(m, 'shift')}>
                                <Text style={styles.chipTxt}>الشفت</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.chip} onPress={() => handleAnnounce(m, 'center')}>
                                <Text style={styles.chipTxt}>المركز</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.chip} onPress={() => handleAnnounce(m, 'none')}>
                                <Text style={styles.chipTxt}>لا داعي</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )
                      )}
                      {/* أزرار التبديل للقائد — تنفيذ بالكود مباشرةً، لا نداء للنموذج */}
                      {m.role === 'assistant' && !!m.swapOffer && (
                        swapResults[m.id] ? (
                          <Text style={styles.annNote}>{swapResults[m.id]}</Text>
                        ) : swapBusyId === m.id ? (
                          <ActivityIndicator color="#2D8C8C" style={{ marginTop: scale(8) }} />
                        ) : m.swapOffer.kind === 'ask_mode' ? (
                          <View style={styles.chipRow}>
                            <TouchableOpacity style={styles.chip} onPress={() => handleSwapOffer(m, 'request')}>
                              <Text style={styles.chipTxt}>أرسل طلبًا</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.chip} onPress={() => handleSwapOffer(m, 'direct')}>
                              <Text style={styles.chipTxt}>بدّل مباشرة</Text>
                            </TouchableOpacity>
                          </View>
                        ) : m.swapOffer.kind === 'permission_fix' ? (
                          <View style={styles.chipRow}>
                            {!!m.swapOffer.colleague && (
                              <TouchableOpacity style={styles.chip} onPress={() => handleSwapOffer(m, 'perm_colleague')}>
                                <Text style={styles.chipTxt}>{`بدّل مع ${m.swapOffer.colleague.name}`}</Text>
                              </TouchableOpacity>
                            )}
                            {!!m.swapOffer.period && (
                              <TouchableOpacity style={styles.chip} onPress={() => handleSwapOffer(m, 'perm_period')}>
                                <Text style={styles.chipTxt}>اعرض على كلّ الفترة</Text>
                              </TouchableOpacity>
                            )}
                            {m.swapOffer.otherShift && (
                              <TouchableOpacity style={styles.chip} onPress={() => handleSwapOffer(m, 'perm_other')}>
                                <Text style={styles.chipTxt}>اعرض على الشفت الآخر</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ) : (
                          <>
                            <Text style={styles.annAsk}>هل يُبلَّغ الطرفان بالتبديل؟</Text>
                            <View style={styles.chipRow}>
                              <TouchableOpacity style={styles.chip} onPress={() => handleSwapOffer(m, 'notify')}>
                                <Text style={styles.chipTxt}>أبلغهما</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.chip} onPress={() => handleSwapOffer(m, 'none')}>
                                <Text style={styles.chipTxt}>لا داعي</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )
                      )}
                    </View>
                  );
                }
                const n = it.n;
                // كرت التغطية (gap_alert v2): كرتٌ بعنوان ثابت من المحرّك؛ نقره يفتح
                // خيطًا مستقلًّا يصوغ فيه الذكاء الحلول بسياق هذا النقص وحده. القديمة تُتجاهَل.
                if (n.type === 'gap_alert') {
                  if (n.data?.v !== 2) return null;
                  // كرت إعادة عرض تبديل الاستئذان للطالب — زرّ الجانب الآخر (تنفيذ بالكود).
                  if (n.data?.perm_retry) {
                    const pr = n.data.perm_retry as { side: 'same' | 'other' };
                    const label = pr.side === 'other' ? 'اطلب من الشفت الآخر' : 'اطلب من فترتك';
                    return (
                      <View key={n.id} style={[styles.msg, styles.msgAI]}>
                        <Text style={styles.msgTxt}>{n.body}</Text>
                        {swapResults[n.id] ? (
                          <Text style={styles.annNote}>{swapResults[n.id]}</Text>
                        ) : swapBusyId === n.id ? (
                          <ActivityIndicator color="#2D8C8C" style={{ marginTop: scale(8) }} />
                        ) : (
                          <View style={styles.chipRow}>
                            <TouchableOpacity style={styles.chip} onPress={() => handlePermRetry(n)}>
                              <Text style={styles.chipTxt}>{label}</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  }
                  if (coverageDays(n.data).length === 0 && !n.data?.placement && !n.data?.perm_conflict) return null;
                  return (
                    <CoverageCard
                      key={n.id}
                      notif={n}
                      user={user}
                      clinicId={clinicId ?? user.clinicId}
                      onSeen={loadConvo}
                    />
                  );
                }
                if (isPending(n)) {
                  const busy = busyId === n.id;
                  return (
                    <View key={n.id} style={[styles.msg, styles.msgAI]}>
                      <Text style={styles.msgTxt}>{n.body}</Text>
                      <View style={styles.reqActions}>
                        {busy ? (
                          <ActivityIndicator color="#2D8C8C" />
                        ) : (
                          <>
                            <TouchableOpacity style={[styles.actBtn, styles.accept]} onPress={() => handleDecision(n, 'accept')}>
                              <Text style={styles.actTxt}>موافق</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actBtn, styles.reject]} onPress={() => handleDecision(n, 'reject')}>
                              <Text style={styles.actTxt}>رفض</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                }
                return (
                  <View key={n.id} style={[styles.msg, styles.msgAI]}>
                    <Text style={styles.msgTxt}>{n.body}</Text>
                  </View>
                );
              })}

              {mergedItems.length === 0 && (
                <Text style={styles.empty}>لا توجد طلبات. اكتب طلبك بالأسفل.</Text>
              )}

              {/* نتيجة آخر قبول/رفض (تغذية فوريّة للطرف الذي اتّخذ القرار) */}
              {!!note && (
                <View style={[styles.msg, styles.msgAI]}>
                  <Text style={styles.msgTxt}>{note}</Text>
                </View>
              )}
              {isLoading && <ActivityIndicator color="#2D8C8C" style={{ marginTop: scale(8) }} />}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="اكتب طلبك…"
                placeholderTextColor="#9AA7A7"
                multiline
                textAlign="right"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={isLoading}>
                <Text style={styles.sendTxt}>إرسال</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(16) },
  card: {
    width: '100%', maxWidth: scale(440), height: '74%',
    backgroundColor: '#FFFFFF', borderRadius: scale(20), overflow: 'hidden',
  },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: scale(16), paddingVertical: scale(12),
    borderBottomWidth: 1, borderBottomColor: '#ECEFF0',
  },
  headerTitle: { fontSize: scale(17), fontWeight: '800', color: '#1A2B2B' },
  closeBtn: { paddingVertical: scale(4), paddingHorizontal: scale(8) },
  closeTxt: { fontSize: scale(14), fontWeight: '700', color: '#2D8C8C' },
  body: { flex: 1, backgroundColor: '#F7F9FA' },
  empty: { textAlign: 'center', color: '#8A9A9A', marginTop: scale(30), fontSize: scale(14) },
  chipRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(8), marginTop: scale(10) },
  chip: {
    paddingVertical: scale(8), paddingHorizontal: scale(14),
    borderRadius: scale(20), backgroundColor: '#EAF4F4',
    borderWidth: 1, borderColor: '#2D8C8C',
  },
  chipTxt: { color: '#1F6B6B', fontSize: scale(13), fontWeight: '800' },
  // سؤال/نتيجة الإبلاغ (أزرار كود بعد غيابٍ ذاتيّ)
  annAsk: { fontSize: scale(13), color: '#5A6B6B', textAlign: 'right', marginTop: scale(8), fontWeight: '700' },
  annNote: { fontSize: scale(13), color: '#1F6B6B', textAlign: 'right', marginTop: scale(8), fontWeight: '700' },
  reqActions: { flexDirection: 'row-reverse', gap: scale(10), marginTop: scale(11) },
  actBtn: { flex: 1, paddingVertical: scale(9), borderRadius: scale(10), alignItems: 'center' },
  accept: { backgroundColor: '#2D8C8C' },
  reject: { backgroundColor: '#C0493B' },
  actTxt: { color: '#FFFFFF', fontSize: scale(14), fontWeight: '800' },
  msg: { maxWidth: '85%', borderRadius: scale(14), padding: scale(10), marginBottom: scale(8) },
  msgUser: { alignSelf: 'flex-start', backgroundColor: '#2D8C8C' },
  msgAI: { alignSelf: 'flex-end', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E7E8' },
  msgTxt: { fontSize: scale(14), color: '#1A2B2B', textAlign: 'right', lineHeight: scale(20) },
  msgTxtUser: { color: '#FFFFFF' },
  inputRow: {
    flexDirection: 'row-reverse', alignItems: 'flex-end', gap: scale(8),
    paddingHorizontal: scale(12), paddingVertical: scale(10),
    borderTopWidth: 1, borderTopColor: '#ECEFF0', backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1, maxHeight: scale(110), minHeight: scale(42),
    backgroundColor: '#F2F4F5', borderRadius: scale(12),
    paddingHorizontal: scale(12), paddingVertical: scale(10),
    fontSize: scale(14), color: '#1A2B2B',
  },
  sendBtn: { backgroundColor: '#2D8C8C', borderRadius: scale(12), paddingHorizontal: scale(16), justifyContent: 'center', minHeight: scale(42) },
  sendTxt: { color: '#FFFFFF', fontSize: scale(14), fontWeight: '800' },
  // كرت التغطية (gap_alert v2)
  covCard: {
    alignSelf: 'stretch', borderRadius: scale(14), marginBottom: scale(10),
    backgroundColor: '#FFF8EC', borderWidth: 1, borderColor: '#E6B566', overflow: 'hidden',
  },
  covIgnored: { backgroundColor: '#F2F4F5', borderColor: '#C9D2D2' },
  covDone: { backgroundColor: '#EDF7F0', borderColor: '#83BD95' },
  covActions: {
    flexDirection: 'row-reverse', gap: scale(8),
    paddingHorizontal: scale(10), paddingBottom: scale(10),
  },
  covActBtn: { flex: 1, paddingVertical: scale(8), borderRadius: scale(10), alignItems: 'center' },
  covActDone: { backgroundColor: '#2D8C8C' },
  covActIgnore: { backgroundColor: '#8A9A9A' },
  covActTxt: { color: '#FFFFFF', fontSize: scale(13), fontWeight: '800' },
  covHead: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: scale(8),
    paddingHorizontal: scale(12), paddingVertical: scale(11),
  },
  covCaret: { fontSize: scale(14), color: '#B07A1E', fontWeight: '800' },
  covTitle: { flex: 1, fontSize: scale(14), fontWeight: '800', color: '#7A4E0A', textAlign: 'right' },
  covBody: {
    paddingHorizontal: scale(10), paddingBottom: scale(10),
    borderTopWidth: 1, borderTopColor: '#F0DDB8', backgroundColor: '#FFFCF5',
  },
  // أزرار حلول التغطية — منسجمة مع نصّ الذكاء (نفس الـchip)، عنوان اليوم فوقها
  covBtnGroup: { alignSelf: 'flex-end', maxWidth: '85%', marginBottom: scale(6) },
  covBtnDay: { fontSize: scale(13), color: '#5A6B6B', textAlign: 'right', fontWeight: '700' },
  covInputRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: scale(8), marginTop: scale(6) },
  covInput: {
    flex: 1, maxHeight: scale(90), minHeight: scale(40),
    backgroundColor: '#FFFFFF', borderRadius: scale(10), borderWidth: 1, borderColor: '#E3E7E8',
    paddingHorizontal: scale(12), paddingVertical: scale(9), fontSize: scale(14), color: '#1A2B2B',
  },
});
