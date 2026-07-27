import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../../lib/scale';
import { Patient } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// QueueStatsStrip — what the two stat cards become once you swipe them away.
//
// كان شريطًا متحرّكًا تمرُّ عليه الأرقامُ واحدًا بعدَ واحد. وهذا يقلبُ الغرضَ رأسًا على
// عقب: أنتَ طويتَ الإحصاءَ لتنظرَ إلى الكروت، ثمّ يطلبُ منك الشريطُ أن **تنتظرَ** رقمَك
// حتّى يمرّ. فصارَ ساكنًا يُقرأُ كلُّه في نظرة، وقُسِمَ إلى ما يُسأَلُ عنه فعلًا:
//   كم ينتظر · مَن في الكرسيِّ الآن · مَن التالي
// وتحتَه شريطُ تركيبِ اليوم: مُنجَزٌ وفي الكرسيِّ ومنتظِرٌ وغائب، بنسبِهم الحقيقيّة —
// حالةُ اليومِ كلِّها في ثلاثةِ بكسلاتٍ لا تُزاحمُ كلمةً على السطر.
// وألوانُه ألوانُ المخطّطِ الأفقيِّ نفسُها، فاللونُ يعني الشيءَ ذاتَه أينما وقعت عليه العين.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#12232A';
const MUTED = '#5A7079';
const TEAL = '#0E9F8C';

const TONE = {
  done: 'rgba(90,112,121,0.40)',
  chair: TEAL,
  wait: '#9FD9CE',
  away: '#B4B7D8',
};

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
    const inChair = live.filter((p) => !!p.clinic && p.clinic !== 'Clinic');
    const queued = live
      .filter((p) => !p.clinic || p.clinic === 'Clinic')
      .sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));
    return {
      done: patients.filter((p) => p.status === 'complete').length,
      away: patients.filter((p) => p.status === 'na').length,
      inChair,
      next: queued[0] ?? null,
    };
  }, [patients]);

  const segs = [
    { k: 'done', n: m.done, c: TONE.done },
    { k: 'chair', n: m.inChair.length, c: TONE.chair },
    { k: 'wait', n: Math.max(0, waiting - m.inChair.length), c: TONE.wait },
    { k: 'away', n: m.away, c: TONE.away },
  ].filter((s) => s.n > 0);

  if (!total) {
    return (
      <View style={s.rail}>
        <View style={s.row}>
          <Text style={s.empty}>No patients yet</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.rail}>
      <View style={s.row}>
        {/* ما ينتظر — الرقمُ الذي طُوِيَ الإحصاءُ ولم يُطوَ هو */}
        <View style={s.lead}>
          <LinearGradient
            colors={waiting ? ['#12B39D', '#0B7F71'] : ['#B9C6CB', '#93A5AC']}
            start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
            style={s.leadFill}
          >
            <Text style={s.leadNum}>{waiting}</Text>
          </LinearGradient>
        </View>
        <Text style={s.leadLbl}>WAITING</Text>

        {m.inChair.length > 0 && (
          <View style={s.mid}>
            <View style={s.liveDot}>
              <View style={s.liveHalo} />
              <View style={s.liveCore} />
            </View>
            <Text style={s.midTxt} numberOfLines={1}>
              {m.inChair.length === 1 ? firstName(m.inChair[0].name) : `${m.inChair.length} in chair`}
            </Text>
          </View>
        )}

        <View style={s.tail}>
          {m.next ? (
            <>
              <Text style={s.tailLbl}>NEXT</Text>
              <View style={s.qn}><Text style={s.qnTxt}>{m.next.queue_number}</Text></View>
              <Text style={s.tailName} numberOfLines={1}>{firstName(m.next.name)}</Text>
            </>
          ) : (
            <Text style={s.tailLbl}>{m.done === total ? 'ALL DONE' : 'NO ONE WAITING'}</Text>
          )}
        </View>
      </View>

      {/* تركيبُ اليومِ بنسبِه — بلا أرقامٍ ولا كلمات، اللونُ وحدَه والطول */}
      <View style={s.bar}>
        {segs.map((g) => (
          <View key={g.k} style={{ flex: g.n, backgroundColor: g.c }} />
        ))}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  rail: {
    marginHorizontal: scale(24),
    height: scale(46),
    borderRadius: scale(16),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.52)',
    overflow: 'hidden',
    shadowColor: '#0A2834',
    shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: 0.10,
    shadowRadius: scale(9),
    elevation: 2,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingHorizontal: scale(11),
    paddingBottom: scale(3),   // مكانُ شريطِ التركيبِ بالأسفل
  },
  empty: { flex: 1, textAlign: 'center', fontSize: scale(12), fontWeight: '700', color: MUTED },

  lead: {
    width: scale(27), height: scale(25), borderRadius: scale(9),
    shadowColor: '#0B7F71', shadowOffset: { width: 0, height: scale(3) },
    shadowOpacity: 0.32, shadowRadius: scale(5), elevation: 3,
  },
  leadFill: { flex: 1, borderRadius: scale(9), alignItems: 'center', justifyContent: 'center' },
  leadNum: { fontSize: scale(14), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  leadLbl: { fontSize: scale(8.5), fontWeight: '800', letterSpacing: 1.2, color: MUTED },

  mid: { flexDirection: 'row', alignItems: 'center', gap: scale(6), flexShrink: 1 },
  liveDot: { width: scale(7), height: scale(7), alignItems: 'center', justifyContent: 'center' },
  liveHalo: {
    position: 'absolute', width: scale(15), height: scale(15), borderRadius: scale(8),
    backgroundColor: TEAL, opacity: 0.18,
  },
  liveCore: { width: scale(7), height: scale(7), borderRadius: scale(4), backgroundColor: TEAL },
  midTxt: { fontSize: scale(11.5), fontWeight: '700', color: TEAL, flexShrink: 1 },

  tail: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: scale(6) },
  tailLbl: { fontSize: scale(8.5), fontWeight: '800', letterSpacing: 1.2, color: MUTED },
  qn: {
    minWidth: scale(18), height: scale(18), borderRadius: scale(6),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(4),
    backgroundColor: 'rgba(18,35,42,0.07)',
  },
  qnTxt: { fontSize: scale(10.5), fontWeight: '800', color: INK },
  tailName: { fontSize: scale(12.5), fontWeight: '800', color: INK, flexShrink: 1 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: scale(3), flexDirection: 'row' },
});
