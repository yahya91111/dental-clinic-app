import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../../lib/scale';
import { Patient } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// QueueStatsStrip — ما تصيرُ إليه بطاقتا الإحصاءِ حينَ تُطويانِ بالسحب.
//
// طويتَ الإحصاءَ لتنظرَ إلى الكروت، فلا يصحُّ أن يطلبَ منك ما بقيَ منه انتباهًا.
// فهو لا يتحرّكُ ولا يُنادي: **اليومُ نفسُه هو خلفيّتُه**. يمتلئُ الشريطُ من يساره
// بقدرِ ما أُنجِز، وعندَ حدِّ الامتلاءِ خيطٌ فيروزيٌّ مضيءٌ هو موضعُك من اليوم — فترى
// تقدُّمَك دونَ أن تقرأَ رقمًا. وفوقَه ثلاثةٌ لا رابعَ لها: كم ينتظر، كم في الكراسي،
// ومَن التالي.
//
// وما استُغنيَ عنه مقصودٌ: «المنجَز» يقولُه الامتلاءُ فلا يُكتَب، و«الغائب» ليس ممّا
// يُتَّخَذُ عليه قرارٌ في لمحة. الجمالُ هنا في ما لم يُوضَع.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#12232A';
const MUTED = '#5A7079';
const TEAL = '#0E9F8C';
const TEAL_G: [string, string] = ['#12B39D', '#0B7F71'];

const firstName = (n?: string) => (n || '').trim().split(/\s+/)[0] || '—';

export const QueueStatsStrip = React.memo(function QueueStatsStrip({
  total,
  waiting,
  patients,
}: {
  total: number;
  waiting: number;
  patients: Patient[];
}) {
  const m = useMemo(() => {
    const live = patients.filter((p) => p.status !== 'complete' && p.status !== 'na');
    return {
      done: patients.filter((p) => p.status === 'complete').length,
      inChair: live.filter((p) => !!p.clinic && p.clinic !== 'Clinic').length,
      next: live
        .filter((p) => !p.clinic || p.clinic === 'Clinic')
        .sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0))[0] ?? null,
    };
  }, [patients]);

  const pct = total ? Math.min(100, Math.round((m.done / total) * 100)) : 0;

  return (
    <View style={s.rail}>
      <LinearGradient
        colors={['rgba(255,255,255,0.66)', 'rgba(255,255,255,0.40)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* اليومُ يملأُ الشريط: ما أُنجِزَ فيروزيٌّ خافت، وحدُّه خيطٌ مضيءٌ هو موضعُك منه */}
      {pct > 0 && (
        <View style={[s.wash, { width: `${pct}%` }]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(14,159,140,0.24)', 'rgba(14,159,140,0.07)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          {pct < 100 && <View style={s.edge} />}
        </View>
      )}

      {/* بريقُ الزجاجِ على الحافّةِ العليا */}
      <LinearGradient
        colors={['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={s.gloss}
        pointerEvents="none"
      />

      {total === 0 ? (
        <View style={s.row}><Text style={s.empty}>No patients yet</Text></View>
      ) : (
        <View style={s.row}>
          <View style={s.well}>
            <Text style={s.wellNum}>{waiting}</Text>
            <Text style={s.wellLbl}>WAITING</Text>
          </View>
          <View style={s.hair} />
          <View style={s.well}>
            <Text style={[s.wellNum, m.inChair > 0 && { color: TEAL }]}>{m.inChair}</Text>
            <Text style={s.wellLbl}>IN CHAIR</Text>
          </View>

          <View style={s.gap} />

          {m.next ? (
            <View style={s.next}>
              <LinearGradient colors={TEAL_G} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={s.qn}>
                <Text style={s.qnTxt}>{m.next.queue_number}</Text>
              </LinearGradient>
              <View style={s.nextTxt}>
                <Text style={s.nextLbl}>NEXT UP</Text>
                <Text style={s.nextName} numberOfLines={1}>{firstName(m.next.name)}</Text>
              </View>
            </View>
          ) : (
            <View style={s.clear}>
              <Ionicons name="checkmark-circle" size={scale(15)} color={TEAL} />
              <Text style={s.clearTxt}>{m.inChair ? 'NO ONE WAITING' : 'ALL SEEN'}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  rail: {
    marginHorizontal: scale(24),
    height: scale(50),
    borderRadius: scale(17),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    shadowColor: '#0A2834',
    shadowOffset: { width: 0, height: scale(5) },
    shadowOpacity: 0.11,
    shadowRadius: scale(11),
    elevation: 3,
  },
  wash: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  edge: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 2,
    backgroundColor: TEAL, opacity: 0.55,
    shadowColor: TEAL, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: scale(4),
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: scale(16) },

  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(13) },
  empty: { flex: 1, textAlign: 'center', fontSize: scale(12), fontWeight: '700', color: MUTED },
  gap: { flex: 1, minWidth: scale(8) },

  well: { alignItems: 'flex-start' },
  wellNum: { fontSize: scale(17), fontWeight: '800', color: INK, letterSpacing: -0.6, lineHeight: scale(19) },
  wellLbl: { fontSize: scale(7.5), fontWeight: '800', letterSpacing: 1.1, color: MUTED },
  hair: { width: 1, height: scale(22), marginHorizontal: scale(13), backgroundColor: 'rgba(18,35,42,0.11)' },

  next: {
    flexDirection: 'row', alignItems: 'center', gap: scale(7), flexShrink: 1,
    height: scale(34), borderRadius: scale(12),
    paddingLeft: scale(4), paddingRight: scale(11),
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#0A2834', shadowOffset: { width: 0, height: scale(2) },
    shadowOpacity: 0.10, shadowRadius: scale(5), elevation: 2,
  },
  qn: {
    minWidth: scale(26), height: scale(26), borderRadius: scale(9),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(4),
  },
  qnTxt: { fontSize: scale(12), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  nextTxt: { flexShrink: 1 },
  nextLbl: { fontSize: scale(7.5), fontWeight: '800', letterSpacing: 1.1, color: MUTED },
  nextName: { fontSize: scale(12.5), fontWeight: '800', color: INK, marginTop: scale(1) },

  clear: {
    flexDirection: 'row', alignItems: 'center', gap: scale(6),
    height: scale(30), paddingHorizontal: scale(11), borderRadius: scale(11),
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
  },
  clearTxt: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 0.9, color: TEAL },
});
