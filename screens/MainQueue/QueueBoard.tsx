import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { scale, scaledStyleSheet } from '../../lib/scale';
import { Patient } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// QueueBoard — لوحُ اليومِ في موضعِ بطاقتَي «Total» و«Waiting».
//
// كانتا بطاقتَينِ منفصلتَينِ لا تحملانِ إلّا رقمَين، وكلُّ ما عداهما مخبوءٌ خلفَ لمسةٍ لا
// يعرفُها أحد. فصارتا **لوحًا واحدًا**: الإجماليُّ رقمًا كبيرًا، والحالاتُ الأربعُ في شبكةٍ
// إلى جانبِه (منجَزٌ · على الكرسيِّ · ينتظر · غائب)، والساعةُ في الزاوية، وأكثرُ العلاجاتِ
// سطرًا رفيعًا أسفلَه — ولا شيءَ مخبوء.
//
// وسطحُه زجاجٌ مدخّنٌ لا لونٌ مصمت: يُموِّهُ ما خلفَه فتمرُّ فقاعاتُ الخلفيّةِ من ورائِه، فيبدو
// **نافذةً في الصفحةِ لا لوحًا فوقَها**. ولا حاويةَ حولَه: هو الكرتُ نفسُه، بحافّةٍ عُليا مضيئةٍ
// وظلٍّ يرفعُه. وهو دخانٌ فاتحٌ لا داكن، فيبقى في عائلةِ زجاجِ الصفحةِ ولا يقطعُها.
//
// وعلى حافّتِه السفلى خيطُ ضوءٍ يمتدُّ بامتدادِ اليوم — لا نسبةَ مئويّةَ ولا شريطَ تقدُّم، بل
// حافّةُ اللوحِ تُضيء.
//
// اللمس: خانةُ «ينتظر» وحدَها تُشغّلُ الفلتر (فتُحاطُ بحلقةٍ فيروزيّة)، وما عداها يقلبُ اللوحَ
// إلى وجهِ العلاجاتِ الكامل.
// ─────────────────────────────────────────────────────────────────────────────

// «مدخّن · عمق ٣٥» — مأخوذةٌ من البروتوتايبِ بأرقامِها.
// وهذا العمقُ دونَ نقطةِ الانقلاب (٤٨)، فاللوحُ في وجهِه الفاتح: حروفٌ حبريّةٌ لا مضيئة،
// ونقاطٌ بألوانِ الصفحةِ لا بتوهُّجِها، وضوءٌ خافتٌ في القاعِ لا بئرٌ ساطع.
const SURF_A = 'rgba(178,194,199,0.54)';
const SURF_B = 'rgba(158,174,180,0.54)';
const RIM = 'rgba(255,255,255,0.68)';
const INK = '#12232A';
const SUB = '#5A7079';
const HAIR = 'rgba(18,35,42,0.10)';
const DOT = { done: '#0E9F8C', cur: '#8A5CD6', wait: 'rgba(18,35,42,0.28)', away: '#93A5AD' };

const two = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

function CellBody({ tone, n, label }: { tone: string; n: number; label: string }) {
  return (
    <>
      <View style={[s.dot, { backgroundColor: tone }]} />
      <Text style={s.cnum}>{n}</Text>
      <Text style={s.ccap} numberOfLines={1}>{label}</Text>
    </>
  );
}

export const QueueBoard = React.memo(function QueueBoard({
  patients,
  treatmentStats,
  filterWaitingOnly,
  onToggleFilter,
  showTreatments,
  onToggleTreatments,
}: {
  patients: Patient[];
  treatmentStats: { [key: string]: number };
  filterWaitingOnly: boolean;
  onToggleFilter: () => void;
  showTreatments: boolean;
  onToggleTreatments: () => void;
}) {
  const m = useMemo(() => {
    const done = patients.filter((p) => p.status === 'complete').length;
    const away = patients.filter((p) => p.status === 'na').length;
    const live = patients.filter((p) => p.status !== 'complete' && p.status !== 'na');
    const inChair = live.filter((p) => !!p.clinic && p.clinic !== 'Clinic').length;
    return { total: patients.length, done, away, inChair, waiting: live.length - inChair };
  }, [patients]);

  // الغائبُ ليس من حسابِ التقدُّم: لا هو أُنجِزَ ولا هو يُنتظَر
  const active = m.total - m.away;
  const pct = active > 0 ? Math.min(100, Math.round((m.done / active) * 100)) : 0;

  // الساعةُ تُقرأُ كلَّ عشرينَ ثانيةً ولا تُعيدُ الرسمَ إلّا إذا تغيّرت الدقيقة
  const [clock, setClock] = useState(() => hhmm(new Date()));
  useEffect(() => {
    const id = setInterval(() => setClock((c) => { const n = hhmm(new Date()); return n === c ? c : n; }), 20000);
    return () => clearInterval(id);
  }, []);

  const tops = useMemo(
    () => Object.entries(treatmentStats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
    [treatmentStats]);

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.94} onPress={onToggleTreatments}>
      {/* ── السطح: تمويهٌ ثمّ زجاجٌ مدخّنٌ فوقَه ── */}
      <BlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[SURF_A, SURF_B]}
        start={{ x: 0.16, y: 0 }} end={{ x: 0.84, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* بئرُ الضوءِ من أسفلِ اليسار — خافتٌ هنا، فالسطحُ فاتحٌ أصلًا */}
      <LinearGradient
        colors={['rgba(22,192,166,0.17)', 'rgba(22,192,166,0.05)', 'rgba(22,192,166,0)']}
        locations={[0, 0.45, 0.8]}
        start={{ x: 0, y: 1 }} end={{ x: 0.85, y: 0.05 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* ضوءٌ يتجمّعُ في القاعِ (لا عتمة، فاللوحُ فاتح)، وبريقُ الزجاجِ على حافّتِه العليا */}
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)']} style={s.floor} pointerEvents="none" />
      <LinearGradient colors={['rgba(255,255,255,0.50)', 'rgba(255,255,255,0)']} style={s.gloss} pointerEvents="none" />

      <Text style={s.clock}>{clock}</Text>

      {showTreatments ? (
        <View style={s.txFace}>
          <Text style={s.txTitle}>TREATMENTS TODAY</Text>
          {tops.length ? (
            <View style={s.txGrid}>
              {tops.slice(0, 6).map(([k, v]) => (
                <View key={k} style={s.txRow}>
                  <Text style={s.txNum}>{v}</Text>
                  <Text style={s.txName} numberOfLines={1}>{k}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.txEmpty}>Nothing recorded yet</Text>
          )}
          {tops.length > 6 && <Text style={s.txMore}>+{tops.length - 6} MORE</Text>}
        </View>
      ) : (
        <>
          <View style={s.body}>
            <View style={s.left}>
              <Text style={s.num}>{m.total}</Text>
              <Text style={s.cap}>PATIENTS TODAY</Text>
            </View>

            <View style={s.right}>
              <View style={s.slot}><View style={s.cellBox}><CellBody tone={DOT.done} n={m.done} label="SEEN" /></View></View>
              <View style={s.slot}><View style={s.cellBox}><CellBody tone={DOT.cur} n={m.inChair} label="IN CHAIR" /></View></View>
              <TouchableOpacity style={s.slot} activeOpacity={0.75} onPress={onToggleFilter}>
                <View style={[s.cellBox, filterWaitingOnly && s.cellOn]}>
                  <CellBody tone={DOT.wait} n={m.waiting} label={filterWaitingOnly ? 'FILTERED' : 'WAITING'} />
                </View>
              </TouchableOpacity>
              <View style={s.slot}><View style={s.cellBox}><CellBody tone={DOT.away} n={m.away} label="AWAY" /></View></View>
            </View>
          </View>

          <View style={s.tx}>
            {tops.slice(0, 3).map(([k, v]) => (
              <Text key={k} style={s.txLine} numberOfLines={1}>
                {k.toUpperCase()} <Text style={s.txLineNum}>{v}</Text>
              </Text>
            ))}
          </View>
        </>
      )}

      {/* خيطُ اليومِ على الحافّةِ السفلى */}
      {pct > 0 && (
        <LinearGradient
          colors={['rgba(14,159,140,0.35)', '#0E9F8C']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[s.led, { width: `${pct}%` }]}
          pointerEvents="none"
        />
      )}
    </TouchableOpacity>
  );
});

const s = scaledStyleSheet({
  card: {
    flex: 1,
    height: 150,
    borderRadius: 24,
    overflow: 'hidden',
    paddingTop: 15,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: RIM,
    shadowColor: '#08202A',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.30,
    shadowRadius: 15,
    elevation: 6,
  },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 46 },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: 18 },
  clock: {
    position: 'absolute', top: 15, right: 18, zIndex: 3,
    fontSize: 10, fontWeight: '800', letterSpacing: 0.4, color: SUB,
  },

  body: { flex: 1, flexDirection: 'row' },
  left: { width: '40%', justifyContent: 'center', paddingRight: 10 },
  // ارتفاعُ السطرِ لا ينزلُ تحتَ حجمِ الحرف: أندرويد يقصُّ الرقمَ حينَ ينزل
  num: {
    fontSize: 62, fontWeight: '800', letterSpacing: -4.4, lineHeight: 62, color: INK,
  },
  cap: { marginTop: 7, fontSize: 8, fontWeight: '800', letterSpacing: 1.8, color: SUB },

  right: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center',
    paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: HAIR,
  },
  // الخانةُ تملأُ نصفَ العرضِ فلا يفيضُ محتواها، وعليه يستقيمُ الطوقُ حولَ «ينتظر» كحبّة
  slot: { width: '50%', paddingVertical: 6 },
  cellBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 9, paddingHorizontal: 4, paddingVertical: 3,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  cellOn: { backgroundColor: 'rgba(14,159,140,0.14)', borderColor: 'rgba(14,159,140,0.55)' },
  // لا هالةَ حولَ النقطةِ في الوجهِ الفاتح: التوهُّجُ لا يُرى إلّا على سطحٍ داكن
  dot: { width: 6, height: 6, borderRadius: 3 },
  cnum: { fontSize: 19, fontWeight: '800', letterSpacing: -0.8, color: INK },
  ccap: { flexShrink: 1, fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1, color: SUB },

  tx: { flexDirection: 'row', gap: 11, paddingBottom: 13 },
  txLine: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1.2, color: SUB },
  txLineNum: { color: INK },

  // ── الوجهُ الآخر: العلاجاتُ كلُّها ──
  txFace: { flex: 1, paddingBottom: 13 },
  txTitle: { fontSize: 8, fontWeight: '800', letterSpacing: 1.8, color: SUB },
  txGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center' },
  txRow: { width: '50%', flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 4 },
  txNum: { fontSize: 17, fontWeight: '800', letterSpacing: -0.7, color: INK, minWidth: 20 },
  txName: { flex: 1, fontSize: 10.5, fontWeight: '700', color: SUB },
  txEmpty: { marginTop: 16, fontSize: 13, fontWeight: '700', color: SUB },
  txMore: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1.2, color: SUB },

  led: { position: 'absolute', left: 0, bottom: 0, height: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
}) as any;
