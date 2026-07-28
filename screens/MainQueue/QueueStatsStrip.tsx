import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../../lib/scale';
import { Patient } from './constants';
import { isPriority } from './queueLanes';

// ─────────────────────────────────────────────────────────────────────────────
// QueueStatsStrip — ما يصيرُ إليه لوحُ اليومِ حينَ يُطوى بالسحب.
//
// طويتَ الرأسَ لتنظرَ إلى الكروت، فلا يصحُّ أن يطلبَ منك ما بقيَ منه انتباهًا. وكان في
// خلفيّتِه عدّادٌ يمتلئُ بما أُنجِزَ من اليوم — مقياسٌ ثانٍ في شريطٍ لا يتّسعُ لمقياس، وقد
// صارَ اللوحُ نفسُه يقولُه أعلاه. فذهبَ العدّادُ وبقيَ الشريطُ **مادّةً لا أداة**.
//
// وهو من مادّةِ الكرتِ واللوحِ حرفيًّا: القاعدةُ المدخّنةُ نفسُها، وبريقُها الأعلى، وضوءُ
// قاعِها، وحافّتُها وظلُّها — فالثلاثةُ سطحٌ واحدٌ بثلاثةِ أحجام.
//
// وعليه ثلاثةٌ لا رابعَ لها: كم ينتظر، كم في الكراسي، ومَن التالي.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#12232A';
const MUTED = '#5A7079';
const TEAL = '#0E9F8C';
const TEAL_G: [string, string] = ['#12B39D', '#0B7F71'];

// «مدخّن · عمق ٢٠» — القيمُ نفسُها في QueueBoard وPatientCardV2
const SMOKE: [string, string] = ['rgba(209,219,222,0.49)', 'rgba(190,203,208,0.49)'];
const GLOSS: [string, string] = ['rgba(255,255,255,0.58)', 'rgba(255,255,255,0)'];
const FLOOR: [string, string] = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)'];
const RIM = 'rgba(255,255,255,0.80)';

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
      inChair: live.filter((p) => !!p.clinic && p.clinic !== 'Clinic').length,
      // «التالي» أحقُّ مَن ينتظر: كبيرُ السنِّ وذو الاحتياجِ الخاصِّ يتقدّمانِ على رقمِ الدور،
      // وإن اجتمعَ أكثرُ من واحدٍ فليس بينهم إلّا رقمُه. (القاعدةُ نفسُها في بطاقةِ المخطّط.)
      next: live
        .filter((p) => !p.clinic || p.clinic === 'Clinic')
        .sort((a, b) =>
          (isPriority(b) ? 1 : 0) - (isPriority(a) ? 1 : 0) ||
          (a.queue_number || 0) - (b.queue_number || 0))[0] ?? null,
    };
  }, [patients]);

  return (
    <View style={s.rail}>
      <LinearGradient
        colors={SMOKE}
        start={{ x: 0.16, y: 0 }} end={{ x: 0.84, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient colors={GLOSS} style={s.gloss} pointerEvents="none" />
      <LinearGradient colors={FLOOR} style={s.floor} pointerEvents="none" />

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
            // الرقمُ يمينَ الاسمِ كما هو في كرتِ المريض: صفٌّ معكوسٌ يضعُ أوّلَ أبنائِه آخرَه
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
    borderRadius: scale(18),
    borderWidth: 1.5,
    borderColor: RIM,
    overflow: 'hidden',
    shadowColor: '#08202A',
    shadowOffset: { width: 0, height: scale(5) },
    shadowOpacity: 0.20,
    shadowRadius: scale(12),
    elevation: 4,
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: scale(14) },
  floor: { position: 'absolute', bottom: 0, left: 0, right: 0, height: scale(18) },

  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(13) },
  empty: { flex: 1, textAlign: 'center', fontSize: scale(12), fontWeight: '700', color: MUTED },
  gap: { flex: 1, minWidth: scale(8) },

  well: { alignItems: 'flex-start' },
  wellNum: { fontSize: scale(17), fontWeight: '800', color: INK, letterSpacing: -0.6, lineHeight: scale(19) },
  wellLbl: { fontSize: scale(7.5), fontWeight: '800', letterSpacing: 1.1, color: MUTED },
  hair: { width: 1, height: scale(22), marginHorizontal: scale(13), backgroundColor: 'rgba(18,35,42,0.11)' },

  next: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: scale(7), flexShrink: 1,
    height: scale(34), borderRadius: scale(12),
    paddingLeft: scale(11), paddingRight: scale(4),
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1, borderColor: RIM,
    shadowColor: '#08202A', shadowOffset: { width: 0, height: scale(2) },
    shadowOpacity: 0.12, shadowRadius: scale(5), elevation: 2,
  },
  qn: {
    minWidth: scale(26), height: scale(26), borderRadius: scale(9),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(4),
  },
  qnTxt: { fontSize: scale(12), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  nextTxt: { flexShrink: 1, alignItems: 'flex-end' },
  nextLbl: { fontSize: scale(7.5), fontWeight: '800', letterSpacing: 1.1, color: MUTED },
  nextName: { fontSize: scale(12.5), fontWeight: '800', color: INK, marginTop: scale(1) },

  clear: {
    flexDirection: 'row', alignItems: 'center', gap: scale(6),
    height: scale(30), paddingHorizontal: scale(11), borderRadius: scale(11),
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1, borderColor: RIM,
  },
  clearTxt: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 0.9, color: TEAL },
});
