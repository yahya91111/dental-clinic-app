// ═══════════════════════════════════════════════════════════════
// AIButton — زرّ الذكاء الموحّد (مصدر واحد)
// ═══════════════════════════════════════════════════════════════
// زرّ واحد قابل لإعادة الاستخدام: الأوربّ + محادثة الذكاء (AIChatModal).
// نعمل عليه هنا، ثمّ نضعه في كلّ صفحات التطبيق — فالتعديل في مكان واحد
// يسري على كلّ النسخ (كأنّنا عدّلنا كلّ الأزرار).
//
//   • ضغطة مطوّلة سريعة (≤0.5s) → تفتح المحادثة وسط الشاشة (موحّد في كلّ مكان).
//   • نقرة → onPress الخاصّ بالصفحة (مثلًا لوحة الجدول)؛ وإن لم يُمرَّر تفتح المحادثة.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { AIOrb, AIState } from './AIOrb';
import AIChatModal, { countUnreadAIChat } from './AIChatModal';
import { subscribeToNotifications } from '../lib/database';
import { ChatMessage } from './aiTypes';

type Props = {
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  orbState?: AIState;
  /** فعل النقرة الخاصّ بالصفحة؛ إن غاب فالنقرة تفتح المحادثة */
  onPress?: () => void;
  /** المحادثة المشتركة مع صفحة الذكاء الكاملة */
  messages: ChatMessage[];
  onSend: (text: string, opts?: { task?: 'schedule' | 'requests'; contextData?: string; hidden?: boolean; freshConversation?: boolean }) => void;
  /** مسح المحادثة (فقاعات + كروت) — اختياريّ */
  onClearConversation?: () => void | Promise<void>;
  /** تعديل رسالةٍ مشتركة (نتيجة خيار) — للتزامن بين المحادثتين */
  onPatchMessage?: (id: string, patch: Partial<ChatMessage>) => void;
  /** بعد إجراءٍ غيّر الجدول (مسح) — لإنعاش الشبكة */
  onAfterAction?: () => void;
  isLoading?: boolean;
  /** ارتفاعُ الأوربِّ عن الأسفل (افتراضيّ scale(100)) — لرفعِه في صفحاتٍ بعينها */
  orbBottom?: number;
  /** الأوربُ نفسُه شبهُ شفّافٍ (يطابقُ شفافيّةَ أزرارِ الصفحةِ الفاتحة) */
  orbGlass?: boolean;
};

export default function AIButton({ user, clinicId, orbState, onPress, messages, onSend, onClearConversation, onPatchMessage, onAfterAction, isLoading, orbBottom, orbGlass }: Props) {
  const [showChat, setShowChat] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const openChat = () => setShowChat(true);

  const refreshPending = useCallback(async () => {
    if (!user?.id) return;
    setPendingCount(await countUnreadAIChat(user.id));
  }, [user?.id]);

  // وصول فوريّ (Realtime) — والمزامنةُ-عند-الاتّصال تغطّي إعادةَ الاتّصال (لا فحص دوريّ)
  useEffect(() => {
    refreshPending();
    const unsub = user?.id ? subscribeToNotifications(user.id, refreshPending) : () => {};
    return unsub;
  }, [refreshPending, user?.id]);

  // عند إغلاق المحادثة، حدّث العدّاد (قد بُتّ في طلبات)
  useEffect(() => { if (!showChat) refreshPending(); }, [showChat, refreshPending]);

  // سؤال معلّق يُبقي الزرّ متغيّرًا حتى يُعالَج (حتى لو أُغلقت المحادثة):
  //  • عرضٌ (إبلاغ/تبديل/تأكيد) لم يُحَلّ بعد — يُطفَأ بمجرّد ضبط offerResolved، الذي
  //    يتزامن من **أيّ سطح** (محادثة الذكاء أو المنبثقة) عبر الرسالة المشتركة.
  //  • سؤالٌ نصّيّ بخيارات [..] بلا عرضٍ مرتبط — يبقى حتى يتقدّم الحوار (ردُّ المستخدم).
  const last = messages[messages.length - 1];
  const lastIsAssistant = !!last && last.role === 'assistant';
  const lastHasOffer = lastIsAssistant && (!!last.announceOffer || !!last.swapOffer || !!last.confirmOffer);
  const hasPendingQuestion = lastIsAssistant && (
    lastHasOffer
      ? !last.offerResolved
      : /\[[^\]\n]{1,30}\]/.test(last.content)
  );

  return (
    <>
      <AIOrb
        state={orbState}
        onPress={onPress || openChat}
        onLongPress={openChat}
        delayLongPress={400}
        alert={pendingCount > 0 || hasPendingQuestion}
        bottom={orbBottom}
        glass={orbGlass}
      />
      <AIChatModal
        visible={showChat}
        onClose={() => setShowChat(false)}
        user={user}
        clinicId={clinicId ?? user.clinicId}
        messages={messages}
        onSend={onSend}
        onClearConversation={onClearConversation}
        onPatchMessage={onPatchMessage}
        onAfterAction={onAfterAction}
        isLoading={isLoading}
      />
    </>
  );
}
