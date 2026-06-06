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

import React, { useState } from 'react';
import { AIOrb, AIState } from './AIOrb';
import AIChatModal from './AIChatModal';

type Props = {
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  orbState?: AIState;
  /** فعل النقرة الخاصّ بالصفحة؛ إن غاب فالنقرة تفتح المحادثة */
  onPress?: () => void;
};

export default function AIButton({ user, clinicId, orbState, onPress }: Props) {
  const [showChat, setShowChat] = useState(false);
  const openChat = () => setShowChat(true);

  return (
    <>
      <AIOrb
        state={orbState}
        onPress={onPress || openChat}
        onLongPress={openChat}
        delayLongPress={400}
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
