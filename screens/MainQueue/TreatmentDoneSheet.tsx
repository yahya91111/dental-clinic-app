import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Animated,
  Easing,
  Platform,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../../lib/scale';

// ─────────────────────────────────────────────────────────────────────────────
// TreatmentDoneSheet — a finished treatment gets a name on it.
// A pane of glass floating over the frosted queue: the queue stays visible
// underneath, so the sheet reads as a layer of the same screen, not a new page.
// Quiet by design — one accent, and the answer you give most of the time on top.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  ink: '#33415A',
  inkStrong: '#17222F',
  muted: '#6E7F91',
  faint: '#9BA9B8',
  hair: 'rgba(30,50,66,0.13)',
  line: 'rgba(30,50,66,0.09)',
  rim: 'rgba(255,255,255,0.9)',
  green: '#0E9F6E',
};

export interface TreatmentDoneSheetProps {
  visible: boolean;
  onClose: () => void;
  patientName?: string;
  queueNumber?: number | string | null;
  treatment?: string | null;
  currentDoctorName: string;
  doctors: { id: string; name: string }[];
  query: string;
  setQuery: (v: string) => void;
  onPick: (doctorId: string | null, doctorName: string | null) => void;
}

export function TreatmentDoneSheet(p: TreatmentDoneSheetProps) {
  const [picked, setPicked] = useState<string | null>(null);   // 'me' or a doctor id
  const sink = useRef(new Animated.Value(1)).current;

  const list = useMemo(() => {
    const q = p.query.trim().toLowerCase();
    return q ? p.doctors.filter((d) => d.name.toLowerCase().includes(q)) : p.doctors;
  }, [p.doctors, p.query]);

  // the press settles, then the choice is sent — and a second press can't land
  const choose = (key: string, id: string | null, name: string | null) => {
    if (picked) return;
    setPicked(key);
    Keyboard.dismiss();
    sink.setValue(1);
    Animated.sequence([
      Animated.timing(sink, { toValue: 0.97, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(sink, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setPicked(null);
      p.onPick(id, name);
    });
  };

  const close = () => {
    if (picked) return;
    p.setQuery('');
    p.onClose();
  };

  return (
    <Modal visible={p.visible} animationType="slide" transparent onRequestClose={close}>
      {/* the queue stays there, frosted */}
      <BlurView
        intensity={26}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={s.scrim}>
        <TouchableWithoutFeedback onPress={close}>
          <View style={s.ground} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={s.sheet}>
              {/* the pane itself: pearly body, a breath of green at the top */}
              <View style={s.glass}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.88)', 'rgba(238,246,249,0.64)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={['rgba(14,159,110,0.15)', 'rgba(14,159,110,0)']}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.6, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
              {/* the light catching the rim */}
              <View pointerEvents="none" style={s.topHi} />

              <View style={s.grab} />

              {/* who this is about — never sign blind */}
              <View style={s.head}>
                <View style={s.headTxt}>
                  <Text style={s.kicker}>TREATMENT DONE</Text>
                  <Text style={s.title} numberOfLines={2}>
                    {p.patientName ? `Who treated ${p.patientName}?` : 'Who treated this patient?'}
                  </Text>
                  {!!p.treatment && p.treatment !== 'Treatment' && (
                    <Text style={s.sub} numberOfLines={1}>{p.treatment}</Text>
                  )}
                </View>
                {p.queueNumber != null && String(p.queueNumber) !== '' && (
                  <View style={s.qChip}>
                    <Text style={s.qTxt}>{p.queueNumber}</Text>
                    <Text style={s.qCap}>QUEUE</Text>
                  </View>
                )}
              </View>

              {/* the answer nine times out of ten */}
              <Animated.View style={picked === 'me' ? { transform: [{ scale: sink }] } : undefined}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => choose('me', null, null)} style={s.me}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.55)', 'rgba(14,159,110,0.14)']}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View pointerEvents="none" style={s.meHi} />
                  <View style={s.meTick}>
                    <Ionicons name="checkmark" size={scale(17)} color="#fff" />
                  </View>
                  <View style={s.meTxt}>
                    <Text style={s.meName} numberOfLines={1}>{p.currentDoctorName}</Text>
                    <Text style={s.meSub}>Signing this treatment yourself</Text>
                  </View>
                  <View style={s.youTag}>
                    <Text style={s.youTxt}>YOU</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              <Text style={s.section}>OR CREDIT ANOTHER DOCTOR</Text>

              {/* search and names share one pane, so the field belongs to the list */}
              <View style={s.panel}>
                <View style={s.searchRow}>
                  <Ionicons name="search" size={scale(16)} color={C.faint} />
                  <TextInput
                    style={s.searchIn}
                    value={p.query}
                    onChangeText={p.setQuery}
                    placeholder="Search by name"
                    placeholderTextColor={C.faint}
                    returnKeyType="search"
                  />
                  {!!p.query && (
                    <TouchableOpacity onPress={() => p.setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close-circle" size={scale(16)} color={C.faint} />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView
                  style={s.list}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {list.map((d, i) => {
                    const on = picked === d.id;
                    return (
                      <Animated.View key={d.id} style={on ? { transform: [{ scale: sink }] } : undefined}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => choose(d.id, d.id, d.name)}
                          style={[s.doc, i > 0 && s.docLine, on && s.docOn]}
                        >
                          <Text style={[s.docName, on && { color: C.green }]} numberOfLines={1}>{d.name}</Text>
                          <Ionicons
                            name={on ? 'checkmark-circle' : 'chevron-forward'}
                            size={scale(on ? 19 : 16)}
                            color={on ? C.green : C.faint}
                          />
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}

                  {list.length === 0 && (
                    <Text style={s.emptyTxt}>
                      {p.query ? 'No doctor by that name' : 'No other doctors in this clinic'}
                    </Text>
                  )}
                </ScrollView>
              </View>

              <TouchableOpacity activeOpacity={0.75} onPress={close} style={s.cancel}>
                <View pointerEvents="none" style={s.cancelHi} />
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(14,32,46,0.26)', justifyContent: 'flex-end' },
  ground: { flex: 1 },

  // the sheet floats — a pane over the queue, not a drawer welded to the edge
  sheet: {
    marginHorizontal: scale(11),
    marginBottom: scale(11),
    paddingHorizontal: scale(18),
    paddingTop: scale(11),
    paddingBottom: scale(17),
    borderRadius: scale(32),
    borderWidth: 1,
    borderColor: C.rim,
    shadowColor: '#0A2130',
    shadowOffset: { width: 0, height: scale(18) },
    shadowOpacity: 0.26,
    shadowRadius: scale(32),
    elevation: 20,
  },
  glass: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: scale(32), overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  topHi: {
    position: 'absolute', top: 0, left: scale(28), right: scale(28),
    height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.95)',
  },
  grab: {
    alignSelf: 'center', width: scale(40), height: scale(4.5),
    borderRadius: scale(3), backgroundColor: 'rgba(70,95,115,0.22)', marginBottom: scale(15),
  },

  // ── who it's about ──
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(13), marginBottom: scale(17) },
  headTxt: { flex: 1 },
  kicker: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.8, color: C.muted },
  title: { marginTop: scale(5), fontSize: scale(21), fontWeight: '800', letterSpacing: -0.3, color: C.inkStrong, lineHeight: scale(27) },
  sub: { marginTop: scale(4), fontSize: scale(12.5), fontWeight: '700', color: C.muted },
  qChip: {
    minWidth: scale(54), paddingHorizontal: scale(8), paddingVertical: scale(7),
    borderRadius: scale(15), alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: C.rim,
  },
  qTxt: { fontSize: scale(20), fontWeight: '800', color: C.inkStrong, letterSpacing: -0.5 },
  qCap: { marginTop: scale(1), fontSize: scale(8), fontWeight: '800', letterSpacing: 1.2, color: C.muted },

  // ── the usual answer ──
  me: {
    flexDirection: 'row', alignItems: 'center', gap: scale(13),
    paddingHorizontal: scale(14), paddingVertical: scale(13),
    borderRadius: scale(20), overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(14,159,110,0.34)',
  },
  meHi: {
    position: 'absolute', top: 0, left: scale(18), right: scale(18),
    height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)',
  },
  meTick: {
    width: scale(34), height: scale(34), borderRadius: scale(12),
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.green,
    shadowColor: C.green, shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: 0.35, shadowRadius: scale(7), elevation: 3,
  },
  meTxt: { flex: 1 },
  meName: { fontSize: scale(16.5), fontWeight: '800', color: C.inkStrong },
  meSub: { marginTop: scale(2), fontSize: scale(11.5), fontWeight: '600', color: C.muted },
  youTag: {
    paddingHorizontal: scale(9), paddingVertical: scale(4),
    borderRadius: scale(9), backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1, borderColor: 'rgba(14,159,110,0.3)',
  },
  youTxt: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.2, color: C.green },

  section: {
    marginTop: scale(21), marginBottom: scale(9),
    fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.6, color: C.muted,
  },

  // ── search and names in one pane ──
  panel: {
    borderRadius: scale(20), borderWidth: 1.5, borderColor: C.rim,
    backgroundColor: 'rgba(255,255,255,0.55)', overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: scale(10),
    paddingHorizontal: scale(14), height: scale(48),
    borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  searchIn: { flex: 1, padding: 0, fontSize: scale(15), fontWeight: '700', color: C.inkStrong },

  list: { maxHeight: scale(224) },
  doc: {
    flexDirection: 'row', alignItems: 'center', gap: scale(12),
    paddingHorizontal: scale(14), height: scale(52),
  },
  docLine: { borderTopWidth: 1, borderTopColor: C.line },
  docOn: { backgroundColor: 'rgba(14,159,110,0.10)' },
  docName: { flex: 1, fontSize: scale(15), fontWeight: '700', color: C.inkStrong },

  emptyTxt: {
    textAlign: 'center', paddingVertical: scale(26),
    fontSize: scale(13), fontWeight: '700', color: C.muted,
  },

  cancel: {
    marginTop: scale(15), height: scale(50), borderRadius: scale(17),
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1.5, borderColor: C.rim,
  },
  cancelHi: {
    position: 'absolute', top: 0, left: scale(24), right: scale(24),
    height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.9)',
  },
  cancelTxt: { fontSize: scale(15), fontWeight: '800', letterSpacing: 0.3, color: C.ink },
});
