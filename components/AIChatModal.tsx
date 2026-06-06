// ═══════════════════════════════════════════════════════════════
// AIChatModal — محادثة الذكاء وسط الشاشة (تصميم بسيط مؤقّت)
// ═══════════════════════════════════════════════════════════════
// حديث الذكاء مع المستخدم — منفصل تمامًا عن صفحة الإشعارات. يعرض:
//   • الطلبات المعلّقة (تبديل/تغطية/تنبيه) ككروت ذكاء مع موافق/رفض.
//   • محادثة حرّة: يكتب المستخدم طلبًا جديدًا فيردّ الذكاء.
// القبول/الرفض مربوط بمحرّك الإشعارات؛ الطلب الجديد عبر sendMessageV2.
// التجميل لاحقًا.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { sendMessageV2, type V2Message, type V2User } from '../lib/ai_v2';
import { getNotifications } from '../lib/database';
import { notifications as notifEngine } from '../lib/algorithms/notifications';
import { scale } from '../lib/scale';

type Props = {
  visible: boolean;
  onClose: () => void;
  user: { id: string; name: string; role: string; clinicId?: string | null; clinicName?: string };
  clinicId?: string | null;
};

type PendingNotif = {
  id: string; type: string; title: string; body: string;
  action_type?: string | null; action_status?: string | null;
};

const isActionType = (t: string) =>
  t === 'coverage_request' || t === 'swap_request' || t === 'gap_alert';

export default function AIChatModal({ visible, onClose, user, clinicId }: Props) {
  const [messages, setMessages] = useState<V2Message[]>([]);
  const [pending, setPending] = useState<PendingNotif[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    const items = (data || []).filter(
      (n: PendingNotif) => isActionType(n.type)
        && n.action_type === 'accept_reject'
        && (!n.action_status || n.action_status === 'pending'),
    );
    setPending(items as PendingNotif[]);
  }, [user?.id]);

  useEffect(() => { if (visible) loadPending(); }, [visible, loadPending]);

  const v2User: V2User = {
    id: user.id, name: user.name, role: user.role,
    clinicId: user.clinicId || undefined, clinicName: user.clinicName,
  };

  async function handleDecision(n: PendingNotif, decision: 'accept' | 'reject') {
    if (!user?.id) return;
    setBusyId(n.id);
    try {
      let reply = '';
      if (n.type === 'coverage_request') {
        const res = decision === 'accept'
          ? await notifEngine.acceptCoverage({ notificationId: n.id, accepterId: user.id, accepterRole: user.role, accepterName: user.name })
          : await notifEngine.rejectCoverage({ notificationId: n.id });
        reply = res.success ? (decision === 'accept' ? 'وافقتَ — تمّ التبديل.' : 'رفضتَ الطلب.') : `تعذّر: ${res.error}`;
      } else if (n.type === 'swap_request') {
        const res = decision === 'accept'
          ? await notifEngine.acceptSwap({ notificationId: n.id, targetId: user.id, targetRole: user.role, targetName: user.name })
          : await notifEngine.rejectSwap({ notificationId: n.id, targetName: user.name });
        reply = res.success ? (decision === 'accept' ? 'وافقتَ — تمّ التبديل.' : 'اعتذرتَ عن التبديل.') : `تعذّر: ${res.error}`;
      } else {
        const { updateNotificationAction } = await import('../lib/database');
        await updateNotificationAction(n.id, decision === 'accept' ? 'accepted' : 'rejected');
        reply = decision === 'accept' ? 'تمّ.' : 'رُفض.';
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      await loadPending();
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }]);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const history: V2Message[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setLoading(true);
    try {
      const res = await sendMessageV2({ messages: history, user: v2User, clinicId: clinicId || undefined });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.success ? res.message : (res.message || 'تعذّر تنفيذ الطلب.') }]);
      await loadPending(); // قد ينشئ الطلب الجديد طلبات معلّقة جديدة
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: e instanceof Error ? e.message : 'خطأ غير متوقّع.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          <View style={styles.card}>
            {/* Header */}
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
              {/* الطلبات المعلّقة (كروت ذكاء) */}
              {pending.map((n) => {
                const busy = busyId === n.id;
                return (
                  <View key={n.id} style={styles.reqCard}>
                    <Text style={styles.reqTitle}>{n.title}</Text>
                    <Text style={styles.reqBody}>{n.body}</Text>
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
              })}

              {pending.length === 0 && messages.length === 0 && (
                <Text style={styles.empty}>لا توجد طلبات. اكتب طلبك بالأسفل.</Text>
              )}

              {/* المحادثة */}
              {messages.map((m, i) => (
                <View key={i} style={[styles.msg, m.role === 'user' ? styles.msgUser : styles.msgAI]}>
                  <Text style={[styles.msgTxt, m.role === 'user' && styles.msgTxtUser]}>{m.content}</Text>
                </View>
              ))}
              {loading && <ActivityIndicator color="#2D8C8C" style={{ marginTop: scale(8) }} />}
            </ScrollView>

            {/* الإدخال */}
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
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={loading}>
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
  reqCard: {
    backgroundColor: '#FFFFFF', borderRadius: scale(14), padding: scale(13),
    marginBottom: scale(10), borderWidth: scale(1.5), borderColor: '#2D8C8C',
  },
  reqTitle: { fontSize: scale(14), fontWeight: '800', color: '#1A2B2B', textAlign: 'right', marginBottom: scale(3) },
  reqBody: { fontSize: scale(13), color: '#42514F', textAlign: 'right', lineHeight: scale(19) },
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
