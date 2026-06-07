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
  onSend: (text: string, opts?: { task?: 'schedule' | 'requests'; contextData?: string; hidden?: boolean }) => void;
  isLoading?: boolean;
};

export default function AIButton({ user, clinicId, orbState, onPress, messages, onSend, isLoading }: Props) {
  const [showChat, setShowChat] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const openChat = () => setShowChat(true);

  const refreshPending = useCallback(async () => {
    if (!user?.id) return;
    setPendingCount(await countUnreadAIChat(user.id));
  }, [user?.id]);

  // وصول فوريّ (Realtime) + فحص دوريّ احتياطيّ (شبكة متقطّعة/إعادة اتّصال)
  useEffect(() => {
    refreshPending();
    const unsub = user?.id ? subscribeToNotifications(user.id, refreshPending) : () => {};
    const t = setInterval(refreshPending, 30000);
    return () => { clearInterval(t); unsub(); };
  }, [refreshPending, user?.id]);

  // عند إغلاق المحادثة، حدّث العدّاد (قد بُتّ في طلبات)
  useEffect(() => { if (!showChat) refreshPending(); }, [showChat, refreshPending]);

  // سؤال معلّق: آخر رسالة من الذكاء تحمل خيارات [..] ولم يُجَب عنها بعد →
  // يبقى الزرّ أحمر إشارةً إلى وجود سؤال ينتظر ردًّا (حتى لو أُغلقت المحادثة).
  const last = messages[messages.length - 1];
  const hasPendingQuestion =
    !!last && last.role === 'assistant' && /\[[^\]\n]{1,30}\]/.test(last.content);

  return (
    <>
      <AIOrb
        state={orbState}
        onPress={onPress || openChat}
        onLongPress={openChat}
        delayLongPress={400}
        alert={pendingCount > 0 || hasPendingQuestion}
      />
      <AIChatModal
        visible={showChat}
        onClose={() => setShowChat(false)}
        user={user}
        clinicId={clinicId ?? user.clinicId}
        messages={messages}
        onSend={onSend}
        isLoading={isLoading}
      />
    </>
  );
}
