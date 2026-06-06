// ═══════════════════════════════════════════════════════════════
// شاشة إشعارات بسيطة — للتجربة فقط (التصميم النهائيّ لاحقًا)
// ═══════════════════════════════════════════════════════════════
// تعرض إشعارات المستخدم الحاليّ، وتربط نقر «قبول/رفض» بمحرّك الإشعارات
// (acceptCoverage / acceptSwap / rejectCoverage / rejectSwap). كرت الذكاء
// المميّز وزرّ الإشعارات الجميل سيأتيان في مرحلة التصميم.
// ═══════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { getNotifications, updateNotificationAction, markAsRead } from '../lib/database';
import { notifications as notif } from '../lib/algorithms/notifications';
import { scale } from '../lib/scale';

type Props = { onBack: () => void };

type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: any;
  sender_name?: string;
  action_type?: string | null;
  action_status?: string | null;
  is_read?: boolean;
  created_at?: string;
};

const TYPE_AR: Record<string, string> = {
  schedule_created: 'جدول جديد',
  request_info: 'طلب',
  broadcast: 'إبلاغ',
  coverage_request: 'طلب تغطية',
  swap_request: 'طلب تبديل',
  gap_alert: 'نقص تغطية',
};

export default function NotificationsTestScreen({ onBack }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; msg: string } | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await getNotifications(user.id, 50);
    setRows((data || []) as NotifRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const isPendingAction = (n: NotifRow) =>
    n.action_type === 'accept_reject' && (!n.action_status || n.action_status === 'pending');

  async function handleAction(n: NotifRow, decision: 'accept' | 'reject') {
    if (!user?.id) return;
    setBusyId(n.id);
    try {
      let msg = '';
      if (n.type === 'coverage_request') {
        if (decision === 'accept') {
          const res = await notif.acceptCoverage({ notificationId: n.id, accepterId: user.id, accepterRole: user.role });
          msg = res.success ? 'تمّت الموافقة وطُبّق التبديل.' : `تعذّر: ${res.error}`;
        } else {
          const res = await notif.rejectCoverage({ notificationId: n.id });
          msg = res.success ? (res.allExhausted ? 'رُفض — لم يبقَ مرشّح، يُصعَّد للّيدر.' : 'رُفض الطلب.') : `تعذّر: ${res.error}`;
        }
      } else if (n.type === 'swap_request') {
        if (decision === 'accept') {
          const res = await notif.acceptSwap({ notificationId: n.id, targetId: user.id, targetRole: user.role });
          msg = res.success ? 'تمّ التبديل.' : `تعذّر: ${res.error}`;
        } else {
          const res = await notif.rejectSwap({ notificationId: n.id });
          msg = res.success ? 'رُفض التبديل.' : `تعذّر: ${res.error}`;
        }
      } else {
        await updateNotificationAction(n.id, decision === 'accept' ? 'accepted' : 'rejected');
        msg = decision === 'accept' ? 'قُبل.' : 'رُفض.';
      }
      setResult({ id: n.id, msg });
      await load();
    } catch (e) {
      setResult({ id: n.id, msg: e instanceof Error ? e.message : 'خطأ غير متوقّع.' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleTapInfo(n: NotifRow) {
    if (!n.is_read) { await markAsRead(n.id); load(); }
  }

  const statusLabel = (s?: string | null) =>
    s === 'accepted' ? 'مقبول' : s === 'rejected' ? 'مرفوض' : '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹ رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        <TouchableOpacity onPress={load} style={styles.backBtn}>
          <Text style={styles.backTxt}>تحديث</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2D8C8C" style={{ marginTop: scale(40) }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: scale(12), paddingBottom: scale(40) }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        >
          {rows.length === 0 && (
            <Text style={styles.empty}>لا توجد إشعارات.</Text>
          )}
          {rows.map((n) => {
            const pending = isPendingAction(n);
            const busy = busyId === n.id;
            return (
              <TouchableOpacity
                key={n.id}
                activeOpacity={pending ? 1 : 0.7}
                onPress={() => !pending && handleTapInfo(n)}
                style={[styles.card, !n.is_read && styles.cardUnread, pending && styles.cardAction]}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.badge}>{TYPE_AR[n.type] || n.type}</Text>
                  {!!statusLabel(n.action_status) && (
                    <Text style={[styles.status, n.action_status === 'rejected' ? styles.statusRej : styles.statusAcc]}>
                      {statusLabel(n.action_status)}
                    </Text>
                  )}
                </View>
                <Text style={styles.title}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>

                {pending && (
                  <View style={styles.actions}>
                    {busy ? (
                      <ActivityIndicator color="#2D8C8C" />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.actBtn, styles.accept]}
                          onPress={() => handleAction(n, 'accept')}
                        >
                          <Text style={styles.actTxt}>قبول</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actBtn, styles.reject]}
                          onPress={() => handleAction(n, 'reject')}
                        >
                          <Text style={styles.actTxt}>رفض</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}

                {result?.id === n.id && (
                  <Text style={styles.result}>{result.msg}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: scale(14), paddingTop: scale(54), paddingBottom: scale(12),
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E3E7E8',
  },
  backBtn: { paddingVertical: scale(6), paddingHorizontal: scale(8) },
  backTxt: { color: '#2D8C8C', fontSize: scale(15), fontWeight: '600' },
  headerTitle: { fontSize: scale(18), fontWeight: '700', color: '#1A2B2B' },
  empty: { textAlign: 'center', color: '#7A8A8A', marginTop: scale(40), fontSize: scale(15) },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: scale(14), padding: scale(14),
    marginBottom: scale(10), borderWidth: 1, borderColor: '#E3E7E8',
  },
  cardUnread: { borderColor: '#9FD3D3', backgroundColor: '#F7FBFB' },
  cardAction: { borderColor: '#2D8C8C', borderWidth: scale(1.5) },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(6) },
  badge: {
    fontSize: scale(12), color: '#2D8C8C', fontWeight: '700',
    backgroundColor: '#E6F4F4', paddingHorizontal: scale(8), paddingVertical: scale(2), borderRadius: scale(8),
  },
  status: { fontSize: scale(12), fontWeight: '700' },
  statusAcc: { color: '#2E9E5B' },
  statusRej: { color: '#C0493B' },
  title: { fontSize: scale(15), fontWeight: '700', color: '#1A2B2B', textAlign: 'right', marginBottom: scale(3) },
  body: { fontSize: scale(14), color: '#42514F', textAlign: 'right', lineHeight: scale(20) },
  actions: { flexDirection: 'row-reverse', gap: scale(10), marginTop: scale(12) },
  actBtn: { flex: 1, paddingVertical: scale(9), borderRadius: scale(10), alignItems: 'center' },
  accept: { backgroundColor: '#2D8C8C' },
  reject: { backgroundColor: '#C0493B' },
  actTxt: { color: '#FFFFFF', fontSize: scale(15), fontWeight: '700' },
  result: { marginTop: scale(10), fontSize: scale(13), color: '#2D6E6E', textAlign: 'right', fontWeight: '600' },
});
