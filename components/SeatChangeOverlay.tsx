// ═══════════════════════════════════════════════════════════════
// عرض المعاينة «طرأ تغييرٌ على جدولك» — للرؤية فقط (لا تعديل).
// يُفتح بنقرة كرت الأورب. يعيد استعمال الجدول الحقيقيّ (ScheduleGrid) وشريط
// الأسابيع (WeekStrip) كما هما؛ كلُّ الخانات فارغة إلّا اسمَ الطبيب في مكانه
// القديم (منطفئ) والجديد (مضيء). الأسابيع التي فيها تغييرٌ تُضيء في الشريط.
// ═══════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../lib/scale';
import { ScheduleGrid } from '../screens/Schedule/ScheduleGrid';
import { WeekStrip } from '../screens/Schedule/WeekStrip';
import type { ScheduleSlot, DayOfWeek, DoctorRole } from '../screens/Schedule/types';

export type SeatRefUI = { clinic: number; period: number; role: string };
export type SeatChangeUI = { week_start: string; day: string; old: SeatRefUI[]; new: SeatRefUI[] };

const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};

/** «YYYY-MM-DD» → تاريخٌ محلّيّ (تفادي انزياح UTC). */
function parseLocalISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** خانةٌ مرجعيّة → صفُّ جدولٍ صناعيّ بنبرة (منطفئ/مضيء). */
function seatToSlot(
  ch: SeatChangeUI, s: SeatRefUI, tone: 'old' | 'new', i: number,
  doctorId: string, doctorName: string,
): ScheduleSlot {
  const role: DoctorRole = s.role === 'extra' ? 'ex' : s.role === 'delegator' ? 'delegator' : 'clinic';
  return {
    id: `${ch.week_start}-${ch.day}-${tone}-${s.role}-${s.clinic}-${s.period}-${i}`,
    day: ch.day as DayOfWeek,
    period: s.role === 'extra' ? 0 : s.period,
    clinicNumber: s.role === 'extra' ? 0 : (s.clinic || 1),
    doctorId,
    doctorName,
    role,
    status: 'active',
    tone,
  };
}

export default function SeatChangeOverlay({
  visible, onClose, doctorId, doctorName, changes, clinicCount,
}: {
  visible: boolean;
  onClose: () => void;
  doctorId: string;
  doctorName: string;
  changes: SeatChangeUI[];
  clinicCount: number;
}) {
  // أسابيعُ التغيير (بداية الأحد) مرتّبة
  const weeks = useMemo(
    () => [...new Set(changes.map((c) => c.week_start).filter(Boolean))].sort(),
    [changes],
  );
  const [selWeek, setSelWeek] = useState<string>(weeks[0] || toISO(new Date()));

  // عدد العيادات: من الإشعار، وإلّا أكبر رقم عيادةٍ في الخانات (حدٌّ أدنى 1)
  const cols = useMemo(() => {
    if (clinicCount && clinicCount > 0) return clinicCount;
    let mx = 1;
    for (const c of changes) for (const s of [...c.old, ...c.new]) {
      if (s.role !== 'extra' && s.clinic > mx) mx = s.clinic;
    }
    return mx;
  }, [clinicCount, changes]);

  const weekChanges = useMemo(
    () => changes.filter((c) => c.week_start === selWeek),
    [changes, selWeek],
  );

  const slots = useMemo<ScheduleSlot[]>(() => {
    const out: ScheduleSlot[] = [];
    weekChanges.forEach((ch) => {
      ch.old.forEach((s, i) => out.push(seatToSlot(ch, s, 'old', i, doctorId, doctorName)));
      ch.new.forEach((s, i) => out.push(seatToSlot(ch, s, 'new', i, doctorId, doctorName)));
    });
    return out;
  }, [weekChanges, doctorId, doctorName]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.scrim}>
        {/* رأس */}
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={st.closeBtn}>
            <Ionicons name="close" size={scale(22)} color="#EDE8FF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.title} numberOfLines={1}>طرأ تغييرٌ على جدولك</Text>
            <Text style={st.subtitle} numberOfLines={1}>{doctorName} · للرؤية فقط</Text>
          </View>
        </View>

        {/* مفتاح الألوان */}
        <View style={st.legend}>
          <View style={st.legendItem}>
            <View style={[st.dot, { backgroundColor: '#1D4ED8', shadowColor: '#1D4ED8', shadowOpacity: 0.9, shadowRadius: scale(5), shadowOffset: { width: 0, height: 0 } }]} />
            <Text style={st.legendTxt}>المكان الجديد (مضيء)</Text>
          </View>
          <View style={st.legendItem}>
            <View style={[st.dot, { backgroundColor: '#9AA0B4', opacity: 0.6 }]} />
            <Text style={st.legendTxt}>المكان السابق (منطفئ)</Text>
          </View>
        </View>

        {/* شريط الأسابيع — كما هو، مع إضاءة أسابيع التغيير */}
        <WeekStrip
          selectedWeekStart={parseLocalISO(selWeek)}
          onSelectWeek={(d) => setSelWeek(toISO(d))}
          highlightWeeks={weeks}
        />

        {/* الجدول الحقيقيّ — للرؤية: كلّ الخانات فارغة إلّا القديم/الجديد */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: scale(12), paddingBottom: scale(40) }} showsVerticalScrollIndicator={false}>
          {weekChanges.length === 0 && (
            <Text style={st.empty}>لا تغييرات في هذا الأسبوع.</Text>
          )}
          <ScheduleGrid slots={slots} clinicCount={cols} onCellPress={() => {}} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(12,10,24,0.94)' },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: scale(10),
    paddingTop: scale(48), paddingBottom: scale(12), paddingHorizontal: scale(14),
  },
  closeBtn: {
    width: scale(36), height: scale(36), borderRadius: scale(18),
    backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: scale(16), fontWeight: '800', color: '#F4F1FF', textAlign: 'right' },
  subtitle: { fontSize: scale(11.5), fontWeight: '600', color: 'rgba(214,196,255,0.7)', textAlign: 'right', marginTop: scale(2) },
  legend: {
    flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(14),
    paddingHorizontal: scale(16), paddingBottom: scale(10),
  },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: scale(6) },
  dot: { width: scale(11), height: scale(11), borderRadius: scale(6) },
  legendTxt: { fontSize: scale(11.5), color: '#D8D2F0', fontWeight: '600' },
  empty: { fontSize: scale(13), color: '#C9C0E8', textAlign: 'center', marginBottom: scale(14), fontWeight: '600' },
});
