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

/** خانةٌ مرجعيّة → صفُّ جدولٍ صناعيّ بنبرة: مكانُك القديمُ مشطوبٌ منطفئ (tone=old)،
 *  ومكانُك الجديدُ مضيء (tone=new). باسمِك في الحالتَين — بكلِّ بساطة. */
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
    const sigOf = (s: SeatRefUI) => `${s.role}.${s.clinic}.${s.period}`;
    weekChanges.forEach((ch) => {
      const newSigs = new Set(ch.new.map(sigOf));
      // الحالةُ الجديدةُ **كاملةً** (مضيئةٌ باسمك) — تشملُ الفترةَ الباقيةَ والمُكتسَبة، فيظهرُ
      // الانتقالُ فترة→فترتَين (تغطية) وفترتَان→فترة (تقلّص) بوضوحٍ وبلا تكرارِ اسم.
      ch.new.forEach((s, i) => out.push(seatToSlot(ch, s, 'new', i, doctorId, doctorName)));
      // ما **غادرتَه فقط** (خانةٌ قديمةٌ ليست ضمن الجديد) — تُرسَمُ مشطوبةً منطفئةً باسمك.
      // (الخانةُ الباقيةُ في الحالتَين لا تُرسَمُ مرّتَين فلا يتكرّرُ الاسمُ داخلها.)
      ch.old.filter((s) => !newSigs.has(sigOf(s)))
        .forEach((s, i) => out.push(seatToSlot(ch, s, 'old', i, doctorId, doctorName)));
    });
    return out;
  }, [weekChanges, doctorId, doctorName]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* الصفحة كلّها بخلفيّة صفحة الجدول الحقيقيّة — الرأس مثل باقي الصفحة (فاتح) */}
      <LinearGradient colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']} style={{ flex: 1 }}>
        {/* رأسٌ بنفس تصميم رأس صفحة الجدول (زرٌّ زجاجيّ + عنوانٌ وسطيّ) */}
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={st.iconBtn}>
            <Ionicons name="close" size={scale(24)} color="#2D3748" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={st.title} numberOfLines={1}>طرأ تغييرٌ على جدولك</Text>
            <Text style={st.subtitle} numberOfLines={1}>{doctorName} · للرؤية فقط</Text>
          </View>
          <View style={{ width: scale(40) }} />
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
      </LinearGradient>
    </Modal>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: scale(48), paddingBottom: scale(12), paddingHorizontal: scale(16),
  },
  iconBtn: {
    width: scale(40), height: scale(40), borderRadius: scale(20),
    backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: scale(2), borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: scale(18), fontWeight: '800', color: '#4A5568', textAlign: 'center' },
  subtitle: { fontSize: scale(11.5), fontWeight: '600', color: '#718096', textAlign: 'center', marginTop: scale(2) },
  empty: { fontSize: scale(13), color: '#64708A', textAlign: 'center', marginBottom: scale(14), fontWeight: '600' },
});
