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
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { getNotifications, markAsRead } from '../lib/database';
import { notifications as notifEngine } from '../lib/algorithms/notifications';
import { ChatMessage } from './aiTypes';
import { scale } from '../lib/scale';

type Props = {
  visible: boolean;
  onClose: () => void;
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
  /** المحادثة المشتركة مع صفحة الذكاء الكاملة */
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isLoading?: boolean;
};

type ConvoNotif = {
  id: string; type: string; title: string; body: string;
  action_type?: string | null; action_status?: string | null; is_read?: boolean;
};

// أنواع «محادثة الذكاء» — مكانها الجات لا صفحة الإشعارات
const AI_CHAT_TYPES = ['swap_request', 'coverage_request', 'gap_alert', 'request_result'];
const isActionType = (t: string) => t === 'coverage_request' || t === 'swap_request' || t === 'gap_alert';
const isPending = (n: { type: string; action_type?: string | null; action_status?: string | null }) =>
  isActionType(n.type) && n.action_type === 'accept_reject' && (!n.action_status || n.action_status === 'pending');

/** عدد عناصر محادثة الذكاء غير المقروءة (طلب معلّق أو نتيجة جديدة) — للون الزرّ الأحمر */
export async function countUnreadAIChat(userId: string): Promise<number> {
  if (!userId) return 0;
  const { data } = await getNotifications(userId, 50);
  return (data || []).filter((n: ConvoNotif) => AI_CHAT_TYPES.includes(n.type) && (isPending(n) || !n.is_read)).length;
}

export default function AIChatModal({ visible, onClose, user, clinicId, messages, onSend, isLoading }: Props) {
  const [convo, setConvo] = useState<ConvoNotif[]>([]);
  const [input, setInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const loadConvo = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    const items = ((data || []) as ConvoNotif[]).filter((n) => AI_CHAT_TYPES.includes(n.type)).reverse();
    setConvo(items);
    items.filter((n) => !isPending(n) && !n.is_read).forEach((n) => markAsRead(n.id));
  }, [user?.id]);

  // حمّل الطلبات عند الفتح، وأعد التحميل عند تغيّر المحادثة (قد ينشئ ردّ الذكاء طلبًا)
  useEffect(() => { if (visible) loadConvo(); }, [visible, messages.length, loadConvo]);

  async function handleDecision(n: ConvoNotif, decision: 'accept' | 'reject') {
    if (!user?.id) return;
    setBusyId(n.id);
    try {
      if (n.type === 'coverage_request') {
        if (decision === 'accept') await notifEngine.acceptCoverage({ notificationId: n.id, accepterId: user.id, accepterRole: user.role, accepterName: user.name });
        else await notifEngine.rejectCoverage({ notificationId: n.id });
      } else if (n.type === 'swap_request') {
        if (decision === 'accept') await notifEngine.acceptSwap({ notificationId: n.id, targetId: user.id, targetRole: user.role, targetName: user.name });
        else await notifEngine.rejectSwap({ notificationId: n.id, targetName: user.name });
      } else {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, decision === 'accept' ? 'accepted' : 'rejected');
      }
      await loadConvo();
    } finally {
      setBusyId(null);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    onSend(text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>الذكاء</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeTxt}>إغلاق</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={{ padding: scale(12), paddingBottom: scale(16) }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {/* طلبات الذكاء ونتائجها (من قاعدة البيانات) */}
              {convo.map((n) => {
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

              {convo.length === 0 && messages.length === 0 && (
                <Text style={styles.empty}>لا توجد طلبات. اكتب طلبك بالأسفل.</Text>
              )}

              {/* المحادثة المشتركة */}
              {messages.map((m) => (
                <View key={m.id} style={[styles.msg, m.role === 'user' ? styles.msgUser : styles.msgAI]}>
                  <Text style={[styles.msgTxt, m.role === 'user' && styles.msgTxtUser]}>{m.content}</Text>
                </View>
              ))}
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
});
