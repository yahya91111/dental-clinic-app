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

// «مدخّن · عمق ٢٠» — مأخوذةٌ من البروتوتايبِ بأرقامِها.
// وهذا العمقُ دونَ نقطةِ الانقلاب (٤٨)، فاللوحُ في وجهِه الفاتح: حروفٌ حبريّةٌ لا مضيئة،
// ونقاطٌ بألوانِ الصفحةِ لا بتوهُّجِها، وضوءٌ خافتٌ في القاعِ لا بئرٌ ساطع.
const SURF_A = 'rgba(209,219,222,0.49)';
const SURF_B = 'rgba(190,203,208,0.49)';
const RIM = 'rgba(255,255,255,0.80)';
const INK = '#12232A';
const SUB = '#5A7079';
const HAIR = 'rgba(18,35,42,0.10)';
const DOT = { done: '#0E9F8C', cur: '#8A5CD6', wait: 'rgba(18,35,42,0.28)', away: '#93A5AD' };
const TEAL = '#0E9F8C';
const TEAL_D = '#0B7F71';

const two = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

// النصُّ فوقَ الرقمِ لا بجانبِه: في صفٍّ واحدٍ كانت النقطةُ والرقمُ يقتسمانِ معه عرضَ نصفِ
// عمودٍ فيُقَصُّ («IN CHAI…»)؛ ورأسيًّا يرثُ النصُّ العرضَ كلَّه فيظهرُ تامًّا مهما طال.
function CellBody({ tone, n, label, active }: { tone: string; n: number; label: string; active?: boolean }) {
  return (
    <>
      <Text style={[s.ccap, active && s.ccapOn]} numberOfLines={1}>{label}</Text>
      <View style={s.cellRow}>
        <View style={s.dotWrap}>
          {active && <View style={s.dotHalo} />}
          <View style={[s.dot, { backgroundColor: active ? TEAL : tone }]} />
        </View>
        <Text style={[s.cnum, active && s.cnumOn]}>{n}</Text>
      </View>
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
        colors={['rgba(22,192,166,0.12)', 'rgba(22,192,166,0.035)', 'rgba(22,192,166,0)']}
        locations={[0, 0.45, 0.8]}
        start={{ x: 0, y: 1 }} end={{ x: 0.85, y: 0.05 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* ضوءٌ يتجمّعُ في القاعِ (لا عتمة، فاللوحُ فاتح)، وبريقُ الزجاجِ على حافّتِه العليا */}
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)']} style={s.floor} pointerEvents="none" />
      <LinearGradient colors={['rgba(255,255,255,0.58)', 'rgba(255,255,255,0)']} style={s.gloss} pointerEvents="none" />

      <View style={s.head}>
        <Text style={s.eyebrow}>{showTreatments ? 'TREATMENTS' : 'TODAY'}</Text>
        <Text style={s.clock}>{clock}</Text>
      </View>

      {showTreatments ? (
        <View style={s.txFace}>
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
              {/* ثلاثةُ أرقامٍ لا تسعُ في هذا العرضِ بحجمِها الكامل، فينكمشُ الحرفُ ولا يُقَصّ */}
              <Text style={s.num} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{m.total}</Text>
              <Text style={s.cap}>PATIENTS</Text>
            </View>

            {/* الصفُّ الأعلى هو الحيُّ (مَن ينتظرُ ومَن على الكرسيّ)، والأسفلُ سِجِلٌّ وقعَ وانتهى */}
            <View style={s.right}>
              {/* الفلترُ مُشتَغِلًا: لا صندوقَ ولا حدَّ مرسوم — وَشْمٌ من ضوءٍ يذوبُ في القاعِ،
                  وخيطٌ مضيءٌ تحتَه من جنسِ خيطِ اليومِ على حافّةِ اللوح، وهالةٌ حولَ النقطة. */}
              <TouchableOpacity style={s.slot} activeOpacity={0.75} onPress={onToggleFilter}>
                <View style={s.cellBox}>
                  {filterWaitingOnly && (
                    <>
                      <LinearGradient
                        colors={['rgba(14,159,140,0.19)', 'rgba(14,159,140,0.02)']}
                        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
                        style={s.cellWash} pointerEvents="none"
                      />
                      <LinearGradient
                        colors={['rgba(14,159,140,0.10)', TEAL, 'rgba(14,159,140,0.10)']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={s.cellLine} pointerEvents="none"
                      />
                    </>
                  )}
                  <CellBody tone={DOT.wait} n={m.waiting} active={filterWaitingOnly}
                    label={filterWaitingOnly ? 'FILTERED' : 'WAITING'} />
                </View>
              </TouchableOpacity>
              <View style={s.slot}><View style={s.cellBox}><CellBody tone={DOT.cur} n={m.inChair} label="IN CHAIR" /></View></View>
              <View style={s.slot}><View style={s.cellBox}><CellBody tone={DOT.done} n={m.done} label="SEEN" /></View></View>
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
  // ورثَ ارتفاعَ نُقَطِ الصفحاتِ التي أُزيلَت من تحتِه، ومعها مساحةٌ من رأسِ الصفحة
  card: {
    flex: 1,
    height: 180,
    borderRadius: 26,
    overflow: 'hidden',
    paddingTop: 18,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: RIM,
    shadowColor: '#08202A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.27,
    shadowRadius: 14,
    elevation: 5,
  },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 54 },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: 20 },
  head: { flexDirection: 'row', alignItems: 'center', zIndex: 3 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.9, color: SUB },
  clock: { marginLeft: 'auto', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, color: SUB },

  body: { flex: 1, flexDirection: 'row', paddingTop: 2 },
  left: { width: '38%', justifyContent: 'center', paddingRight: 12 },
  // ارتفاعُ السطرِ لا ينزلُ تحتَ حجمِ الحرف: أندرويد يقصُّ الرقمَ حينَ ينزل
  num: {
    fontSize: 72, fontWeight: '800', letterSpacing: -5, lineHeight: 72, color: INK,
  },
  cap: { marginTop: 6, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.9, color: SUB },

  right: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center',
    paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: HAIR,
  },
  // الخانةُ نصفُ العرض، والطوقُ حولَ «ينتظر» يلتفُّ على النصِّ والرقمِ معًا
  slot: { width: '50%', paddingVertical: 3 },
  cellBox: {
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5,
    alignSelf: 'flex-start', minWidth: 62,
  },
  // وَشْمُ الضوء: يبدأُ من أعلى اليسارِ ويفنى في أسفلِ اليمين، فلا حافّةَ له تُقرأُ صندوقًا
  cellWash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12 },
  cellLine: {
    position: 'absolute', left: 8, right: 8, bottom: 0, height: 2, borderRadius: 1,
    shadowColor: TEAL, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.85, shadowRadius: 5, elevation: 3,
  },
  cellRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  dotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotHalo: { position: 'absolute', width: 17, height: 17, borderRadius: 9, backgroundColor: 'rgba(14,159,140,0.20)' },
  cnum: { fontSize: 25, fontWeight: '800', letterSpacing: -1.1, lineHeight: 26, color: INK },
  cnumOn: { color: TEAL_D },
  ccap: { fontSize: 8.5, fontWeight: '800', letterSpacing: 1.1, color: SUB },
  ccapOn: { color: TEAL_D },

  tx: { flexDirection: 'row', gap: 13, paddingBottom: 14 },
  txLine: { flexShrink: 1, fontSize: 8, fontWeight: '800', letterSpacing: 1.2, color: SUB },
  txLineNum: { color: INK },

  // ── الوجهُ الآخر: العلاجاتُ كلُّها ──
  txFace: { flex: 1, paddingBottom: 14 },
  txGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center' },
  txRow: { width: '50%', flexDirection: 'row', alignItems: 'baseline', gap: 9, paddingVertical: 5 },
  txNum: { fontSize: 19, fontWeight: '800', letterSpacing: -0.8, color: INK, minWidth: 22 },
  txName: { flex: 1, fontSize: 11.5, fontWeight: '700', color: SUB },
  txEmpty: { marginTop: 20, fontSize: 14, fontWeight: '700', color: SUB },
  txMore: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2, color: SUB },

  led: { position: 'absolute', left: 0, bottom: 0, height: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
}) as any;
