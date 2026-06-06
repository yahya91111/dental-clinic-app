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

type Props = {
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  orbState?: AIState;
  /** فعل النقرة الخاصّ بالصفحة؛ إن غاب فالنقرة تفتح المحادثة */
  onPress?: () => void;
};

export default function AIButton({ user, clinicId, orbState, onPress }: Props) {
  const [showChat, setShowChat] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const openChat = () => setShowChat(true);

  const refreshPending = useCallback(async () => {
    if (!user?.id) return;
    setPendingCount(await countUnreadAIChat(user.id));
  }, [user?.id]);

  // فحص دوريّ خفيف لإظهار النقطة الحمراء عند وصول طلب
  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 20000);
    return () => clearInterval(t);
  }, [refreshPending]);

  // عند إغلاق المحادثة، حدّث العدّاد (قد بُتّ في طلبات)
  useEffect(() => { if (!showChat) refreshPending(); }, [showChat, refreshPending]);

  return (
    <>
      <AIOrb
        state={orbState}
        onPress={onPress || openChat}
        onLongPress={openChat}
        delayLongPress={400}
        alert={pendingCount > 0}
      />
      <AIChatModal
        visible={showChat}
        onClose={() => setShowChat(false)}
        user={user}
        clinicId={clinicId ?? user.clinicId}
      />
    </>
  );
}
