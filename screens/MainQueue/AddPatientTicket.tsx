import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  LayoutAnimation,
  Platform,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../../lib/scale';
import { CONDITIONS, TREATMENTS, TREATMENT_DURATIONS, treatmentNeedsDuration, arabicToEnglish } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// AddPatientTicket — the add-patient window rebuilt as a queue ticket.
// A stub carrying the number, a tear line, then the part the clinic keeps.
// Ruled lines instead of stacked boxes; the mode is deduced from what you type
// (a matched file / a typed file / "No file") rather than chosen up front.
// Wired to the existing state + handleAddPatient, whose logic is untouched.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  ink: '#33415A',
  inkStrong: '#1E2940',
  muted: '#7E8CA3',
  faint: '#A6B1C4',
  hair: 'rgba(40,54,82,0.13)',
  paper: '#FBFCFE',
  brd: 'rgba(255,255,255,0.85)',
  blue: '#5B7CD8',
  violet: '#9B6FD4',
  amber: '#EA8A0C',
  teal: '#0EA5A0',
  elderly: '#F97316',
  slate: '#64748B',
};

const G = {
  brand: ['#5B7CD8', '#9B6FD4'] as [string, string],
  cond: ['#EA8A0C', '#B96C05'] as [string, string],
  tx: ['#0EA5A0', '#0A7A76'] as [string, string],
  elderly: ['#FFB05C', '#F97316'] as [string, string],
  slate: ['#8C99AC', '#5A6577'] as [string, string],
};

const DASHES = 26;                       // the tear line, drawn by hand so both platforms match
const NOTCH_R = scale(11);               // the bite punched out of each side
const NOTCH_DROP = scale(6);             // the notches sit just below the tear line
const STRIP_H = NOTCH_DROP + NOTCH_R * 2;
const DUR_MIN = 5, DUR_MAX = 120, DUR_STEP = 5;

// A rounded corner can only curve outward, so two of them meeting leave a pointed
// gap — not a notch. The band that carries the punches is drawn as a real
// silhouette instead: a paper rectangle with a half-circle bitten from each edge.
const punchedBand = (w: number) => {
  const cy = NOTCH_DROP + NOTCH_R, r = NOTCH_R;
  return [
    `M 0 0`, `H ${w}`,
    `V ${cy - r}`, `A ${r} ${r} 0 0 0 ${w} ${cy + r}`,   // right bite
    `V ${STRIP_H}`, `H 0`,
    `V ${cy + r}`, `A ${r} ${r} 0 0 0 0 ${cy - r}`,       // left bite
    `Z`,
  ].join(' ');
};

// the app counts these from the dental chart, so a filed patient doesn't pick them here
const FILED_HIDES = new Set(['Filling', 'Scaling', 'Pulpectomy', 'Extraction', 'Referral']);

const COND_OPTS = CONDITIONS.filter((c) => c.name !== 'Condition').map((c) => c.name);
const TX_ALL = TREATMENTS.filter((t) => t.name !== 'Treatment').map((t) => t.name);

// ── a segmented grid, same control the patient card uses ──
function Segmented({
  options,
  current,
  accent,
  accentG,
  onPick,
}: {
  options: string[];
  current: string;
  accent: string;
  accentG: [string, string];
  onPick: (v: string) => void;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o === current;
        return (
          <TouchableOpacity key={o} activeOpacity={0.85} onPress={() => onPick(o)} style={s.segCell}>
            {on ? (
              <LinearGradient
                colors={accentG}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.segFill, { shadowColor: accent, shadowOffset: { width: 0, height: scale(4) }, shadowOpacity: 0.45, shadowRadius: scale(6), elevation: 3 }]}
              >
                <Text style={[s.segTxt, s.segTxtOn]} numberOfLines={1}>{o}</Text>
              </LinearGradient>
            ) : (
              <View style={s.segFill}>
                <Text style={s.segTxt} numberOfLines={1}>{o}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── one collapsible row: the value at a glance, the choices only on tap ──
function Row({
  icon,
  label,
  value,
  accent,
  accentG,
  options,
  current,
  open,
  onToggle,
  onPick,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent: string;
  accentG: [string, string];
  options: string[];
  current: string;
  open: boolean;
  onToggle: () => void;
  onPick: (v: string) => void;
}) {
  return (
    <View>
      <TouchableOpacity activeOpacity={0.7} onPress={onToggle} style={s.rowHead}>
        <View style={[s.rowIc, { backgroundColor: accent + '26' }]}>
          <Ionicons name={icon} size={scale(15)} color={accent} />
        </View>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={[s.rowVal, { color: value === '—' ? C.faint : accent }]} numberOfLines={1}>{value}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={scale(15)} color={C.muted} />
      </TouchableOpacity>
      {open && (
        <View style={s.rowBody}>
          <Segmented options={options} current={current} accent={accent} accentG={accentG} onPick={onPick} />
        </View>
      )}
    </View>
  );
}

export interface AddPatientTicketProps {
  visible: boolean;
  onClose: () => void;

  isEditMode: boolean;

  name: string;
  setName: (v: string) => void;
  fileNumber: string;
  setFileNumber: (v: string) => void;
  queueNumber: string;
  setQueueNumber: (v: string) => void;
  condition: string;
  setCondition: (v: string) => void;
  treatment: string;
  setTreatment: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  isElderly: boolean;
  setIsElderly: (v: boolean) => void;
  isSpecialNeeds: boolean;
  setIsSpecialNeeds: (v: boolean) => void;
  minutes: number | null;
  setMinutes: (v: number | null) => void;

  patientMode: string;
  setPatientMode: (v: any) => void;
  selectedPermanentPatientId: string | null;
  setSelectedPermanentPatientId: (v: string | null) => void;

  onNameSearch: (t: string) => void;
  onFileSearch: (t: string) => void;
  fileNumberSearchResults: any[];
  permanentPatientSearchResults: any[];
  showFileNumberSuggestions: boolean;
  setShowFileNumberSuggestions: (v: boolean) => void;
  showPatientSuggestions: boolean;
  setShowPatientSuggestions: (v: boolean) => void;

  onSubmit: () => void;
}

export function AddPatientTicket(p: AddPatientTicketProps) {
  const walk = p.patientMode === 'walk-in';
  const filed = !walk && !!p.fileNumber.trim();

  // one row open at a time, exactly like the expanded card's console
  const [row, setRow] = useState<'cond' | 'tx' | 'flags' | null>(null);
  const anim = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  const toggleRow = (k: 'cond' | 'tx' | 'flags') => {
    anim();
    setRow((cur) => (cur === k ? null : k));
  };
  // choosing is the end of the errand — the row folds itself away
  const closeRow = () => { anim(); setRow(null); };

  // the punched band only ever needs the ticket's width, which no row toggle changes
  const [bandW, setBandW] = useState(0);

  // the note sits at the foot of the ticket, so the keyboard would land right on
  // top of it — bring the foot up into view once the field takes focus
  const scroller = useRef<ScrollView>(null);
  const revealFoot = () => {
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 160);
  };

  // a reopened ticket is a fresh one — nothing stays unfolded from last time
  useEffect(() => { if (!p.visible) setRow(null); }, [p.visible]);

  const flagList = [p.isElderly ? 'Elderly' : null, p.isSpecialNeeds ? 'Special' : null].filter(Boolean) as string[];

  // a filed patient's chart-counted treatments are not offered here
  const txOpts = useMemo(
    () => (filed ? TX_ALL.filter((t) => !FILED_HIDES.has(t)) : TX_ALL),
    [filed],
  );

  const qNum = parseInt(arabicToEnglish(p.queueNumber) || '0', 10);
  const stepQueue = (d: number) => {
    const next = Math.max(1, (isNaN(qNum) ? 1 : qNum) + d);
    p.setQueueNumber(String(next));
  };

  const dur = p.minutes ?? (TREATMENT_DURATIONS[p.treatment] ?? 30);
  const showDur = treatmentNeedsDuration(p.treatment);
  const stepDur = (d: number) => p.setMinutes(Math.max(DUR_MIN, Math.min(DUR_MAX, dur + d)));

  // the mode is a consequence of what's on the ticket, never a button pressed first
  const pickSuggestion = (patient: any, withFile: boolean) => {
    p.setName(patient.name);
    if (withFile) p.setFileNumber(arabicToEnglish(patient.file_number || ''));
    p.setSelectedPermanentPatientId(patient.id);
    p.setPatientMode('search');
    p.setShowFileNumberSuggestions(false);
    p.setShowPatientSuggestions(false);
  };

  const onFileTyped = (t: string) => {
    const digits = t.split('').filter((ch) => /[0-9٠-٩]/.test(ch)).join('').slice(0, 4);
    const english = arabicToEnglish(digits);
    p.setFileNumber(english);
    if (english) {
      // a file number that matches nothing means a file is being created
      p.setPatientMode(p.selectedPermanentPatientId ? 'search' : 'new-profile');
      p.onFileSearch(english);
    } else {
      p.setPatientMode('search');
      p.setShowPatientSuggestions(false);
    }
  };

  const toggleWalk = () => {
    if (walk) {
      p.setPatientMode('search');
    } else {
      p.setPatientMode('walk-in');
      p.setFileNumber('');
      p.setSelectedPermanentPatientId(null);
      p.setShowFileNumberSuggestions(false);
      p.setShowPatientSuggestions(false);
    }
  };

  const ready = p.name.trim().length > 1 && !!p.queueNumber.trim();
  const cta = p.isEditMode ? 'Update patient' : 'Add patient';

  return (
    <Modal visible={p.visible} animationType="fade" transparent onRequestClose={p.onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={s.scrim}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scroller}
            contentContainerStyle={s.scrollBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* a tap anywhere that isn't a control puts the keyboard away */}
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={s.ticket}>

                {/* one shadow for the whole ticket, cast from a plate inset past the
                    notches — so the two halves read as a single sheet of paper */}
                <View style={s.plate} pointerEvents="none" />

                {/* ── stub: what the patient is given ── */}
                <View style={s.stub}>
                  <TouchableOpacity onPress={p.onClose} style={s.closeX} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="close" size={scale(25)} color={C.muted} />
                  </TouchableOpacity>

                  <View style={s.numRow}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => stepQueue(-1)} style={s.nStep}>
                      <Ionicons name="remove" size={scale(20)} color={C.muted} />
                    </TouchableOpacity>

                    {/* the number is typed as readily as it is nudged */}
                    <TextInput
                      style={s.bigNum}
                      value={p.queueNumber}
                      onChangeText={(t) => p.setQueueNumber(arabicToEnglish(t.replace(/[^0-9٠-٩]/g, '')).slice(0, 3))}
                      keyboardType="number-pad"
                      maxLength={3}
                      selectTextOnFocus
                      returnKeyType="done"
                      placeholder="—"
                      placeholderTextColor={C.faint}
                    />

                    <TouchableOpacity activeOpacity={0.7} onPress={() => stepQueue(1)} style={s.nStep}>
                      <Ionicons name="add" size={scale(20)} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={s.numCap}>QUEUE NUMBER · TAP TO TYPE</Text>
                </View>

                {/* the tear line, riding above the paper */}
                <View style={s.perf} pointerEvents="none">
                  {Array.from({ length: DASHES }).map((_, i) => (
                    <View key={i} style={s.dash} />
                  ))}
                </View>

                {/* the punched band, just below the tear line */}
                <View
                  style={[s.band, !bandW && { backgroundColor: C.paper }]}
                  onLayout={(e) => setBandW(e.nativeEvent.layout.width)}
                  pointerEvents="none"
                >
                  {bandW > 0 && (
                    <Svg width={bandW} height={STRIP_H}>
                      <Path d={punchedBand(bandW)} fill={C.paper} />
                    </Svg>
                  )}
                </View>

                {/* ── body: what the clinic keeps ── */}
                <View style={s.body}>

                  {/* name */}
                  <View style={s.fld}>
                    <Text style={s.lbl}>NAME</Text>
                    <View style={s.rule}>
                      <TextInput
                        style={s.ruleIn}
                        value={p.name}
                        onChangeText={(t) => {
                          p.setName(t);
                          if (!walk) p.onNameSearch(t);
                        }}
                        placeholder="Write the patient's name"
                        placeholderTextColor={C.faint}
                        returnKeyType="done"
                      />
                      {p.name.trim().length > 1 && (
                        <Ionicons name="checkmark" size={scale(18)} color={C.teal} />
                      )}
                    </View>

                    {p.showFileNumberSuggestions && p.fileNumberSearchResults.length > 0 && (
                      <View style={s.drop}>
                        <Text style={s.dropHead}>FOUND {p.fileNumberSearchResults.length} FILE(S)</Text>
                        {p.fileNumberSearchResults.slice(0, 4).map((pt) => (
                          <TouchableOpacity key={pt.id} activeOpacity={0.7} onPress={() => pickSuggestion(pt, true)} style={s.sug}>
                            <View style={s.sugFile}>
                              <Text style={s.sugFileTxt}>{arabicToEnglish(pt.file_number || '')}</Text>
                            </View>
                            <Text style={s.sugName} numberOfLines={1}>{pt.name}</Text>
                            <Ionicons name="chevron-forward" size={scale(15)} color={C.faint} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* file number + the walk-in escape */}
                  <View style={s.fld}>
                    <View style={s.lblRow}>
                      <Text style={s.lbl}>FILE NUMBER</Text>
                      <Text style={s.lblOpt}>optional</Text>
                    </View>
                    <View style={s.fileRow}>
                      <View style={[s.rule, s.fileRule, walk && { opacity: 0.35 }]}>
                        <TextInput
                          style={[s.ruleIn, s.fileIn]}
                          value={p.fileNumber}
                          onChangeText={onFileTyped}
                          editable={!walk}
                          placeholder="0000"
                          placeholderTextColor={C.faint}
                          keyboardType="number-pad"
                          maxLength={4}
                          returnKeyType="done"
                        />
                      </View>
                      <TouchableOpacity activeOpacity={0.8} onPress={toggleWalk} style={s.walkBtn}>
                        {walk ? (
                          <LinearGradient colors={G.slate} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.walkFill}>
                            <Ionicons name="walk" size={scale(15)} color="#fff" />
                            <Text style={[s.walkTxt, { color: '#fff' }]}>No file</Text>
                          </LinearGradient>
                        ) : (
                          <View style={s.walkFill}>
                            <Ionicons name="walk" size={scale(15)} color={C.muted} />
                            <Text style={s.walkTxt}>No file</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>

                    {p.showPatientSuggestions && p.permanentPatientSearchResults.length > 0 && (
                      <View style={s.drop}>
                        <Text style={s.dropHead}>FOUND {p.permanentPatientSearchResults.length} PATIENT(S)</Text>
                        {p.permanentPatientSearchResults.slice(0, 4).map((pt) => (
                          <TouchableOpacity key={pt.id} activeOpacity={0.7} onPress={() => pickSuggestion(pt, false)} style={s.sug}>
                            <View style={s.sugFile}>
                              <Ionicons name="person" size={scale(14)} color={C.blue} />
                            </View>
                            <Text style={s.sugName} numberOfLines={1}>{pt.name}</Text>
                            <Ionicons name="chevron-forward" size={scale(15)} color={C.faint} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={s.sep} />

                  {/* condition + treatment — folded away like the expanded card's console */}
                  <View style={s.fld}>
                    <View style={s.console}>
                      <Row
                        icon="pulse"
                        label="CONDITION"
                        value={p.condition && p.condition !== 'Condition' ? p.condition : '—'}
                        accent={C.amber}
                        accentG={G.cond}
                        options={COND_OPTS}
                        current={p.condition}
                        open={row === 'cond'}
                        onToggle={() => toggleRow('cond')}
                        onPick={(v) => { p.setCondition(v); closeRow(); }}
                      />
                      <View style={s.rowSep} />
                      <Row
                        icon="medkit"
                        label="TREATMENT"
                        value={p.treatment && p.treatment !== 'Treatment' ? p.treatment : '—'}
                        accent={C.teal}
                        accentG={G.tx}
                        options={txOpts}
                        current={p.treatment}
                        open={row === 'tx'}
                        onToggle={() => toggleRow('tx')}
                        onPick={(v) => {
                          p.setTreatment(v);
                          p.setMinutes(treatmentNeedsDuration(v) ? (TREATMENT_DURATIONS[v] ?? 30) : null);
                          closeRow();
                        }}
                      />
                      <View style={s.rowSep} />

                      {/* flags — the same row the expanded card carries */}
                      <View>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleRow('flags')} style={s.rowHead}>
                          <View style={[s.rowIc, { backgroundColor: C.elderly + '26' }]}>
                            <Ionicons name="star-outline" size={scale(15)} color={C.elderly} />
                          </View>
                          <Text style={s.rowLabel}>FLAGS</Text>
                          <Text style={[s.rowVal, { color: flagList.length ? C.elderly : C.faint }]} numberOfLines={1}>
                            {flagList.length ? flagList.join(', ') : '—'}
                          </Text>
                          <Ionicons name={row === 'flags' ? 'chevron-up' : 'chevron-down'} size={scale(15)} color={C.muted} />
                        </TouchableOpacity>
                        {row === 'flags' && (
                          <View style={s.rowBody}>
                            <View style={s.toggles}>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => p.setIsElderly(!p.isElderly)}
                                style={[s.tgl, p.isElderly && { backgroundColor: C.elderly, borderColor: 'transparent' }]}
                              >
                                <View style={[s.pip, p.isElderly && s.pipOn]} />
                                <Text style={[s.tglTxt, p.isElderly && s.tglTxtOn]}>Elderly</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => p.setIsSpecialNeeds(!p.isSpecialNeeds)}
                                style={[s.tgl, p.isSpecialNeeds && { backgroundColor: C.violet, borderColor: 'transparent' }]}
                              >
                                <View style={[s.pip, p.isSpecialNeeds && s.pipOn]} />
                                <Text style={[s.tglTxt, p.isSpecialNeeds && s.tglTxtOn]}>Special needs</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>

                    {filed && (
                      <View style={s.whyLine}>
                        <Ionicons name="information-circle-outline" size={scale(15)} color={C.blue} />
                        <Text style={s.whyTxt}>
                          Filling, Scaling, Pulpectomy, Extraction and Referral are counted from this patient's dental chart.
                        </Text>
                      </View>
                    )}

                    {/* the chair time the treatment brought with it */}
                    {showDur && (
                      <View style={s.mins}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => stepDur(-DUR_STEP)} style={s.mStep}>
                          <Ionicons name="remove" size={scale(16)} color={C.teal} />
                        </TouchableOpacity>
                        <Text style={s.minsL}>CHAIR TIME</Text>
                        <Text style={s.minsV}>{dur}<Text style={s.minsU}> min</Text></Text>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => stepDur(DUR_STEP)} style={s.mStep}>
                          <Ionicons name="add" size={scale(16)} color={C.teal} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* note */}
                  <View style={s.fld}>
                    <View style={s.lblRow}>
                      <Text style={s.lbl}>NOTE</Text>
                      <Text style={s.lblOpt}>optional</Text>
                    </View>
                    <View style={s.rule}>
                      <TextInput
                        style={[s.ruleIn, s.noteIn]}
                        value={p.note}
                        onChangeText={p.setNote}
                        placeholder="Anything the doctor should know"
                        placeholderTextColor={C.faint}
                        multiline
                        maxLength={280}
                        textAlignVertical="top"
                        onFocus={revealFoot}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.88}
                    disabled={!ready}
                    onPress={p.onSubmit}
                    style={[s.issue, !ready && { opacity: 0.4 }]}
                  >
                    <LinearGradient colors={G.brand} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.issueFill}>
                      <Ionicons name={p.isEditMode ? 'checkmark-sharp' : 'person-add'} size={scale(18)} color="#fff" />
                      <Text style={s.issueTxt}>{cta}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,29,50,0.55)' },
  scrollBody: { flexGrow: 1, justifyContent: 'center', paddingVertical: scale(26), paddingHorizontal: scale(16) },

  // one continuous sheet: stub, punched band and body all sit flush, and a single
  // plate underneath casts the only shadow — inset past the punches so it can't
  // fill them back in.
  ticket: {},
  plate: {
    position: 'absolute',
    top: 0, bottom: 0, left: NOTCH_R, right: NOTCH_R,
    borderRadius: scale(20),
    backgroundColor: C.paper,
    shadowColor: '#0B1220',
    shadowOffset: { width: 0, height: scale(26) },
    shadowOpacity: 0.45,
    shadowRadius: scale(38),
  },

  // ── stub ──
  stub: {
    backgroundColor: C.paper,
    borderTopLeftRadius: scale(20),
    borderTopRightRadius: scale(20),
    paddingHorizontal: scale(20),
    paddingTop: scale(38),
    elevation: 10,        // Android only: keeps the paper above the shadow plate
  },
  band: { height: STRIP_H, elevation: 10 },
  closeX: {
    position: 'absolute', top: scale(8), left: scale(9),
    width: scale(36), height: scale(36), borderRadius: scale(12),
    alignItems: 'center', justifyContent: 'center',
  },

  numRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(18), marginTop: scale(6) },
  nStep: {
    width: scale(38), height: scale(38), borderRadius: scale(12),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.hair,
  },
  bigNum: {
    minWidth: scale(112),
    textAlign: 'center',
    fontSize: scale(62),
    lineHeight: scale(74),
    fontWeight: '800',
    letterSpacing: -scale(3),
    color: C.blue,
    padding: 0,
  },
  numCap: {
    textAlign: 'center', fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.8,
    color: C.faint, paddingBottom: scale(13),
  },

  // ── the tear line, drawn dash by dash so iOS and Android agree ──
  perf: {
    height: 2, marginHorizontal: scale(14),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 3, elevation: 12,
  },
  dash: { width: scale(5), height: 2, borderRadius: 1, backgroundColor: C.hair },

  // ── body ──
  body: {
    backgroundColor: C.paper,
    borderBottomLeftRadius: scale(20),
    borderBottomRightRadius: scale(20),
    paddingHorizontal: scale(20),
    paddingTop: scale(4),
    paddingBottom: scale(20),
    elevation: 10,        // Android only: keeps the paper above the shadow plate
  },
  fld: { marginBottom: scale(19) },
  lblRow: { flexDirection: 'row', alignItems: 'center' },
  lbl: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.7, color: C.muted, marginBottom: scale(7) },
  lblOpt: { marginLeft: 'auto', fontSize: scale(9.5), fontWeight: '700', letterSpacing: 0.8, color: C.faint, marginBottom: scale(7) },

  rule: { flexDirection: 'row', alignItems: 'center', gap: scale(10), borderBottomWidth: 1.5, borderBottomColor: C.hair, paddingBottom: scale(8) },
  ruleIn: { flex: 1, padding: 0, fontSize: scale(17), fontWeight: '700', color: C.inkStrong },
  fileRow: { flexDirection: 'row', alignItems: 'flex-end', gap: scale(13) },
  fileRule: { flex: 1 },
  fileIn: { letterSpacing: 1.4 },
  noteIn: { fontSize: scale(15), fontWeight: '500', lineHeight: scale(23), minHeight: scale(44), maxHeight: scale(120) },

  walkBtn: { height: scale(38), borderRadius: scale(12), overflow: 'hidden', borderWidth: 1.5, borderColor: C.hair },
  walkFill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: scale(7), paddingHorizontal: scale(13) },
  walkTxt: { fontSize: scale(12), fontWeight: '800', color: C.muted },

  // suggestions drop straight from the rule
  drop: {
    marginTop: scale(9), borderRadius: scale(14), backgroundColor: '#fff',
    borderWidth: 1, borderColor: C.hair, overflow: 'hidden',
  },
  dropHead: {
    fontSize: scale(9), fontWeight: '800', letterSpacing: 1.4, color: C.muted,
    paddingHorizontal: scale(13), paddingTop: scale(10), paddingBottom: scale(6),
  },
  sug: { flexDirection: 'row', alignItems: 'center', gap: scale(11), paddingHorizontal: scale(13), paddingVertical: scale(10), borderTopWidth: 1, borderTopColor: C.hair },
  sugFile: {
    minWidth: scale(42), height: scale(30), borderRadius: scale(9),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(91,124,216,0.14)',
  },
  sugFileTxt: { fontSize: scale(12), fontWeight: '800', color: C.blue },
  sugName: { flex: 1, fontSize: scale(14.5), fontWeight: '700', color: C.inkStrong },

  sep: { height: 1, backgroundColor: C.hair, marginBottom: scale(19), marginTop: -scale(2) },

  // ── the console: two folded rows, the card's own control ──
  console: {
    borderRadius: scale(16),
    borderWidth: 1.5,
    borderColor: C.hair,
    backgroundColor: 'rgba(40,54,82,0.025)',
    overflow: 'hidden',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: scale(10), paddingHorizontal: scale(13), paddingVertical: scale(13) },
  rowIc: { width: scale(28), height: scale(28), borderRadius: scale(9), alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: scale(10.5), fontWeight: '800', letterSpacing: 1, color: C.muted },
  rowVal: { marginLeft: 'auto', fontSize: scale(14), fontWeight: '800', maxWidth: '46%', textAlign: 'right' },
  rowBody: { paddingHorizontal: scale(13), paddingBottom: scale(13), paddingTop: scale(2) },
  rowSep: { height: 1, backgroundColor: C.hair },

  // segmented — identical in spirit to the card's console control
  seg: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: scale(14), borderWidth: 1.5, borderColor: C.hair,
    backgroundColor: 'rgba(40,54,82,0.03)',
  },
  segCell: { width: '33.33%', height: scale(42), padding: scale(3) },
  segFill: { flex: 1, borderRadius: scale(11), alignItems: 'center', justifyContent: 'center' },
  segTxt: { textAlign: 'center', fontSize: scale(12), fontWeight: '700', color: C.ink },
  segTxtOn: { color: '#fff' },

  whyLine: {
    flexDirection: 'row', gap: scale(8), alignItems: 'flex-start',
    marginTop: scale(11), padding: scale(11), borderRadius: scale(12),
    backgroundColor: 'rgba(91,124,216,0.08)',
  },
  whyTxt: { flex: 1, fontSize: scale(11.5), lineHeight: scale(17), fontWeight: '600', color: C.muted },

  // chair time — appears only once a treatment that carries one is picked
  mins: {
    flexDirection: 'row', alignItems: 'center', gap: scale(12),
    marginTop: scale(12), paddingHorizontal: scale(13), paddingVertical: scale(10),
    borderRadius: scale(14),
    backgroundColor: 'rgba(14,165,160,0.09)',
    borderWidth: 1, borderColor: 'rgba(14,165,160,0.22)',
  },
  mStep: {
    width: scale(32), height: scale(32), borderRadius: scale(10),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(14,165,160,0.32)',
  },
  minsL: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.5, color: C.teal },
  minsV: { marginLeft: 'auto', fontSize: scale(19), fontWeight: '800', color: C.teal },
  minsU: { fontSize: scale(11.5), fontWeight: '700', color: C.muted },

  // flag toggles, inside the FLAGS row body
  toggles: { flexDirection: 'row', gap: scale(8) },
  tgl: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: scale(8), height: scale(40), borderRadius: scale(13),
    borderWidth: 1.5, borderColor: C.hair, backgroundColor: 'rgba(255,255,255,0.6)',
  },
  pip: { width: scale(15), height: scale(15), borderRadius: scale(8), borderWidth: 2, borderColor: C.muted, opacity: 0.5 },
  pipOn: { opacity: 1, backgroundColor: '#fff', borderColor: '#fff' },
  tglTxt: { fontSize: scale(12), fontWeight: '800', color: C.muted },
  tglTxtOn: { color: '#fff' },

  issue: {
    height: scale(54), borderRadius: scale(17), marginTop: scale(2),
    backgroundColor: C.violet,
    shadowColor: C.violet, shadowOffset: { width: 0, height: scale(12) },
    shadowOpacity: 0.4, shadowRadius: scale(16), elevation: 7,
  },
  issueFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(10), borderRadius: scale(17) },
  issueTxt: { fontSize: scale(15.5), fontWeight: '800', color: '#fff' },
});
