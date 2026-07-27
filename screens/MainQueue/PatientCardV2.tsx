import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  PanResponder,
  InteractionManager,
  StyleSheet,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../../lib/scale';
import { Patient, CLINICS, CONDITIONS, TREATMENTS, TREATMENT_DURATIONS, treatmentNeedsDuration } from './constants';
import { slotAvailable, shiftFit, Lane, Break } from './QueueTimeline';

// لقطةُ الجدولِ المعروضِ على المخطّط — بها يُفحَصُ توفّرُ وقتِ الحجز، وهل تسعُ المدّةُ قبلَ تبديلِ الشفت
type ApptCtx = { chairCount: number; breaks: Break[]; lanes: Lane[]; nowMin: number };

// ─────────────────────────────────────────────────────────────────────────────
// PatientCardV2 — a faithful RN port of the glass "triad console" prototype.
// Collapsed row (RTL): number + name on the right, arrow on the left.
// Swipe right → Done / NA. Arrow → a tidy console (Clinic / Condition / Treatment
// as collapsible segmented rows) + secondary actions. Feature-flagged in the
// screen so the classic card is one boolean away.
// ─────────────────────────────────────────────────────────────────────────────

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// palette (light — the app is a light surface)
const C = {
  ink: '#33415A',
  inkStrong: '#1E2940',
  muted: '#7E8CA3',
  hair: 'rgba(40,54,82,0.10)',
  glass: 'rgba(255,255,255,0.55)',
  glass2: 'rgba(255,255,255,0.40)',
  brd: 'rgba(255,255,255,0.85)',
  blue: '#5B7CD8',
  violet: '#9B6FD4',
  teal: '#0EA5A0',
  done: '#10B981',
  away: '#64748B',
  elderly: '#F97316',
  special: '#8B5CF6',
  danger: '#EF4444',
};

// accent (base, darker) pairs for segment fills / swipe buttons
const G = {
  blue: ['#5B7CD8', '#4560B4'] as [string, string],
  amber: ['#EA8A0C', '#B96C05'] as [string, string],
  teal: ['#0EA5A0', '#0A7A76'] as [string, string],
  done: ['#10B981', '#0B8F63'] as [string, string],
  away: ['#7C8798', '#4B5563'] as [string, string],
  keep: ['#5B7CD8', '#9B6FD4'] as [string, string],
  busy: ['#E0616A', '#C0303C'] as [string, string],   // لا كرسيَّ فارغًا في هذا الوقت
};

// the reverse of the card: the same wash, lit from the other side
const BACK_TINT: [string, string] = ['rgba(212,184,232,0.30)', 'rgba(184,212,241,0.28)'];

const ACCENT = { clinic: C.blue, cond: '#EA8A0C', tx: C.teal };
const ACCENT_G = { clinic: G.blue, cond: G.amber, tx: G.teal };

// queue-number chip: subtle top-left→bottom-right white glass gradient (prototype .qnum)
const QNUM_G: [string, string] = ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.14)'];

const ACTIONS_W = scale(150); // swipe-reveal width (Done + NA), finger-tracked 1:1

// تتابعُ الدخول: مِلِّيٌّ لكلِّ كرت، وسقفٌ لا يُتجاوَز (انظر تعليقَ slide أدناه)
const STAGGER_MS = 65;
const STAGGER_MAX = 6;

// the other side of the swipe: the clinics. One tone for all of them — they are
// the same kind of thing, and the number is what tells them apart.
const CLINIC_CHOICES = CLINICS.filter((c) => c.id !== 0).map((c) => c.id);
const CLINIC_CHIP_W = scale(40), CLINIC_GAP = scale(6), CLINIC_PAD = scale(9);
const CLINICS_W =
  CLINIC_CHIP_W * CLINIC_CHOICES.length + CLINIC_GAP * (CLINIC_CHOICES.length - 1) + CLINIC_PAD * 2;


// status tint wash behind the card content — matches the prototype's .card::before
// (default is applied at opacity 0.5 there, so the waiting stops are ~halved here)
const TINT: Record<string, [string, string]> = {
  waiting: ['rgba(184,212,241,0.30)', 'rgba(212,184,232,0.28)'],
  // in the chair reads violet — the one state that belongs to the clinic, not the queue.
  // these two carry a step more colour than the rest: they are the states you scan for.
  inclinic: ['rgba(155,111,212,0.34)', 'rgba(129,90,205,0.23)'],
  done: ['rgba(16,185,129,0.30)', 'rgba(59,130,246,0.22)'],
  away: ['rgba(100,116,139,0.18)', 'rgba(100,116,139,0.10)'],
};

// The clinic tray sits against the card's RIGHT EDGE — and because the card slides
// away whole, that edge always shows the tail of its wash, never a fraction of it.
// Down that edge the diagonal reads from its half-way colour at the top to its last
// colour at the bottom, so the tray repeats exactly that as a vertical gradient:
// every column of it matches the card's edge, and no seam can appear between them.
const chan = (c: string) => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  const p = m ? m[1].split(',').map(Number) : [0, 0, 0, 0];
  return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] === undefined ? 1 : p[3]];
};
const halfway = (a: string, b: string) => {
  const A = chan(a), B = chan(b);
  const at = (i: number) => Math.round((A[i] + B[i]) / 2);
  return `rgba(${at(0)}, ${at(1)}, ${at(2)}, ${((A[3] + B[3]) / 2).toFixed(3)})`;
};
const TRAY_TINT: Record<string, [string, string]> = {};
for (const k of Object.keys(TINT)) TRAY_TINT[k] = [halfway(TINT[k][0], TINT[k][1]), TINT[k][1]];

// action-tile gradients (iOS app-icon look): [top-light, bottom-dark]
const ACT_G: Record<string, [string, string]> = {
  note: ['#6D9BFF', '#4360D0'],
  edit: ['#FFB443', '#F0890C'],
  danger: ['#FF6E72', '#E23B42'],
  profile: ['#B98BEA', '#7C4DC4'],   // only a filed patient has one
};
// diagonal white sheen laid over each tile (glossy top-left → transparent)
const SHEEN: [string, string, string] = ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'];
const SHEEN_LOC: [number, number, number] = [0, 0.46, 0.64];

const clinicNumOf = (clinic?: string) => {
  if (!clinic) return null;
  const m = String(clinic).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

const kindOf = (p: Patient): 'done' | 'na' | 'inclinic' | 'waiting' => {
  if (p.status === 'complete') return 'done';
  if (p.status === 'na') return 'na';
  return clinicNumOf(p.clinic) != null ? 'inclinic' : 'waiting';
};

const fmtHM = (d?: Date) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  const h = dt.getHours(), m = dt.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const ap = h < 12 ? 'AM' : 'PM';
  return `${hh}:${m < 10 ? '0' + m : m} ${ap}`;
};

const statusText = (p: Patient) => {
  const k = kindOf(p);
  if (k === 'done') return p.completed_at ? `Done ${fmtHM(p.completed_at)}` : 'Done';
  if (k === 'na') return p.na_at ? `Called ${fmtHM(p.na_at)}` : 'Not available';
  if (k === 'inclinic') return `In ${p.clinic}`;
  return 'Waiting';
};

// option lists derived from the app's canonical constants
const CLINIC_OPTS = ['None', ...CLINICS.filter((c) => c.id !== 0).map((c) => String(c.id))];
const COND_OPTS = CONDITIONS.map((c) => c.name);
const TX_OPTS = TREATMENTS.map((t) => t.name);

// duration counter (some treatments carry no scheduled time — see constants.treatmentNeedsDuration)
const needsDuration = treatmentNeedsDuration;
const DUR_MIN = 5, DUR_MAX = 120, DUR_STEP = 5;
const durOf = (p: Patient) =>
  p.expected_minutes && p.expected_minutes > 0 ? p.expected_minutes : (TREATMENT_DURATIONS[p.treatment || ''] ?? 30);

// same-day appointment (entry time): a simple half-hour dial across the working day
// مدى الحجز = اليومُ التقويميُّ نفسُه الذي يرسمُه المخطّط، فلا يُمنَعُ شفتٌ مسائيٌّ من الحجزِ في وقتِه
const APPT_START = 0, APPT_END = 23 * 60 + 30, APPT_STEP = 30;
const fmtClock = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m < 10 ? '0' + m : m} ${h < 12 ? 'AM' : 'PM'}`;
};

type FieldKey = 'clinic' | 'cond' | 'tx' | 'dur' | 'flags';

// ── the note lives on the BACK of the card: it turns over, it doesn't open a window ──
const FLIP_MS = 460;
const NOTE_H = scale(322);       // height the card holds while turned over
const NOTE_MAX = 280;

// full-word badge pills (left edge) — [light, base] gradient + glyph
const BADGE_G: Record<string, [string, string]> = {
  na: ['#8C99AC', C.away],
  elderly: ['#FFB05C', C.elderly],
  special: ['#A78BFA', C.special],
  note: ['#6D9BFF', '#3B82F6'],
};

// ── one segmented control (equal segments, selected one filled with the accent) ──
function Segmented({
  accent,
  options,
  current,
  numeric,
  onPick,
}: {
  accent: [string, string];
  options: string[];
  current: string;
  numeric?: boolean;
  onPick: (v: string) => void;
}) {
  const cols = numeric ? Math.min(options.length, 6) : 3;
  const basis = `${100 / cols}%`;
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = String(o) === String(current);
        return (
          <TouchableOpacity
            key={o}
            activeOpacity={0.85}
            onPress={() => onPick(o)}
            style={[s.segCell, { width: basis as any }]}
          >
            {on ? (
              <LinearGradient
                colors={accent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.segFill, { shadowColor: accent[0], shadowOffset: { width: 0, height: scale(4) }, shadowOpacity: 0.5, shadowRadius: scale(6), elevation: 3 }]}
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

// ── the head of one console row: the icon, the label, the value it holds ──
// Shared so a read-only row is the same row with nothing to press, not a second design.
function RowHead({ icon, label, value, accent, chevron }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent: string;
  chevron?: 'up' | 'down';
}) {
  return (
    <>
      <View style={[s.rowIc, { backgroundColor: accent + '26' }]}>
        <Ionicons name={icon} size={scale(15)} color={accent} />
      </View>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowVal, { color: accent }]} numberOfLines={1}>{value}</Text>
      {chevron ? <Ionicons name={`chevron-${chevron}`} size={scale(15)} color={C.muted} /> : null}
    </>
  );
}

// ── one collapsible console row: glanceable value up top, selector on tap ──
function ConsoleRow({
  icon,
  label,
  value,
  accent,
  accentG,
  options,
  current,
  numeric,
  open,
  readOnly,
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
  numeric?: boolean;
  open: boolean;
  readOnly?: boolean;
  onToggle: () => void;
  onPick: (v: string) => void;
}) {
  if (readOnly) {
    return (
      <View style={s.rowHead}>
        <RowHead icon={icon} label={label} value={value} accent={accent} />
      </View>
    );
  }
  return (
    <View>
      <TouchableOpacity activeOpacity={0.7} onPress={onToggle} style={s.rowHead}>
        <RowHead icon={icon} label={label} value={value} accent={accent} chevron={open ? 'up' : 'down'} />
      </TouchableOpacity>
      {open && (
        <View style={s.rowBody}>
          <Segmented
            accent={accentG}
            options={options}
            current={current}
            numeric={numeric}
            onPick={onPick}
          />
        </View>
      )}
    </View>
  );
}

// ── a professional drag counter for the treatment duration (5–120 min) ──
function DurationDial({ minutes, onCommit }: { minutes: number; onCommit: (m: number) => void }) {
  const [m, setM] = useState(minutes);
  const mRef = useRef(minutes);
  const trackRef = useRef<View>(null);
  const geo = useRef({ x: 0, w: 1 }); // absolute left + width of the track (measured, not layout-relative)
  const measure = () => { trackRef.current?.measureInWindow((x, _y, w) => { if (w) geo.current = { x, w }; }); };
  const snapTo = (val: number) => {
    const snapped = Math.max(DUR_MIN, Math.min(DUR_MAX, Math.round(val / DUR_STEP) * DUR_STEP));
    mRef.current = snapped;
    setM(snapped);
  };
  const fromPageX = (pageX: number) => {
    const { x, w } = geo.current;
    snapTo(DUR_MIN + (Math.max(0, Math.min(w, pageX - x)) / w) * (DUR_MAX - DUR_MIN));
  };
  const pan = useRef(
    PanResponder.create({
      // claim the touch in the capture phase so the vertical ScrollView can't steal the first drag
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => { measure(); fromPageX(e.nativeEvent.pageX); },
      onPanResponderMove: (e) => fromPageX(e.nativeEvent.pageX),
      onPanResponderRelease: () => onCommit(mRef.current),
      onPanResponderTerminate: () => onCommit(mRef.current),
    }),
  ).current;
  const pct = ((m - DUR_MIN) / (DUR_MAX - DUR_MIN)) * 100;
  return (
    <View style={s.dial}>
      <View style={s.dialReadout}>
        <Text style={s.dialNum}>{m}</Text>
        <Text style={s.dialUnit}>min</Text>
      </View>
      <View ref={trackRef} style={s.dialTrackHit} onLayout={measure} {...pan.panHandlers}>
        <View style={s.dialTrack}>
          <LinearGradient colors={G.teal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.dialFill, { width: `${pct}%` }]} />
        </View>
        <View style={[s.dialThumb, { left: `${pct}%` }]} />
      </View>
      <View style={s.dialScale}>
        <Text style={s.dialTick}>{DUR_MIN}</Text>
        <Text style={s.dialTick}>{DUR_MAX} min</Text>
      </View>
    </View>
  );
}

// ── the shift-change heads-up ──
// The doctor picks the minutes the treatment needs, not the minutes that are left. So this
// never blocks and never edits behind their back — it only says what the chart will do with
// the number they chose, and names the hour, so the answer isn't a surprise on the timeline.
// "Shorten" is there because the common case is a treatment that would fit in the gap with a
// small trim; it snaps to the largest duration that still lands before the change.
function ShiftNotice({ minutes, ctx, selfId, onShorten }: {
  minutes: number; ctx?: ApptCtx; selfId: string; onShorten: (m: number) => void;
}) {
  const [okFor, setOkFor] = useState<number | null>(null);
  if (!ctx || !ctx.lanes.length) return null;
  const r = shiftFit(minutes, ctx.lanes, ctx.breaks, ctx.nowMin, selfId);
  if (r.fits || okFor === minutes) return null;
  const alt = Math.floor(r.gap / DUR_STEP) * DUR_STEP;   // أطولُ مدّةٍ ما زالت تسعُ قبلَ التبديل
  return (
    <View style={s.shWrap}>
      <View style={s.shHead}>
        <View style={s.shIc}><Ionicons name="swap-horizontal" size={scale(13)} color="#B96C05" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.shTitle}>After the shift change</Text>
          <Text style={s.shBody}>
            {minutes} min won't fit before it — his turn comes at{' '}
            <Text style={s.shTime}>{r.startsAt != null ? fmtClock(r.startsAt) : ''}</Text>
          </Text>
        </View>
      </View>
      <View style={s.shBtns}>
        {alt >= DUR_MIN && (
          <TouchableOpacity activeOpacity={0.85} style={s.shAlt} onPress={() => { setOkFor(null); onShorten(alt); }}>
            <Text style={s.shAltTxt}>Shorten to {alt}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity activeOpacity={0.85} style={s.shOk} onPress={() => setOkFor(minutes)}>
          <LinearGradient colors={G.amber} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={s.shOkFill}>
            <Text style={s.shOkTxt}>OK</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── a simple −/＋ time stepper for the same-day appointment (no drag), then Book (violet) ──
// A time with no free chair is not a time you can book: every chair is taken for
// the whole visit, so the patient could not be treated then. The clock turns red
// and says so, rather than letting the booking be made and quietly slip later.
function AppointmentStepper({ booked, dur, avail, selfId, onBook, onClear }: {
  booked?: number; dur: number; avail?: ApptCtx; selfId: string;
  onBook: (min: number) => void; onClear: () => void;
}) {
  const init = booked != null ? Math.max(APPT_START, Math.min(APPT_END, booked)) : 9 * 60;
  const [t, setT] = useState(init);
  const step = (d: number) => setT((v) => Math.max(APPT_START, Math.min(APPT_END, v + d)));
  const isBooked = booked != null && t === booked;
  const free = avail ? slotAvailable(t, dur, avail.chairCount, avail.lanes, avail.breaks, selfId) : true;
  return (
    <View style={s.apptWrap}>
      <View style={s.stepRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => step(-APPT_STEP)} style={s.stepBtn} disabled={t <= APPT_START}>
          <Ionicons name="remove" size={scale(24)} color={t <= APPT_START ? C.hair : C.teal} />
        </TouchableOpacity>
        <View style={s.stepReadout}>
          <Text style={[s.apptNum, !free && s.apptNumOff]}>{fmtClock(t)}</Text>
          {!free && <Text style={s.apptNo}>Unavailable</Text>}
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => step(APPT_STEP)} style={s.stepBtn} disabled={t >= APPT_END}>
          <Ionicons name="add" size={scale(24)} color={t >= APPT_END ? C.hair : C.teal} />
        </TouchableOpacity>
      </View>
      <View style={s.apptBtns}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => free && onBook(t)} disabled={!free} style={s.apptBook}>
          <LinearGradient colors={free ? G.teal : G.busy} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={s.apptBookFill}>
            <Ionicons
              name={!free ? 'close-circle-outline' : isBooked ? 'checkmark-sharp' : 'alarm-outline'}
              size={scale(16)}
              color="#fff"
            />
            <Text style={s.apptBookTxt}>{!free ? 'No chair free' : isBooked ? 'Booked' : 'Book time'}</Text>
          </LinearGradient>
        </TouchableOpacity>
        {booked != null && (
          <TouchableOpacity activeOpacity={0.85} onPress={onClear} style={s.apptClear}>
            <Text style={s.apptClearTxt}>Queue</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── نبضةٌ واحدةٌ لكلِّ النقاط ──
// كانت كلُّ نقطةٍ تُشعِلُ حلقتَها: مئتا كرتٍ = مئتا حلقةٍ لا نهائيّة، تعملُ كلُّها ولو
// لم يكنْ صاحبُها على الشاشة. والنبضُ واحدٌ في حقيقتِه، فليكنْ محرّكُه واحدًا — تعدُّها
// النقاطُ عندَ ظهورِها وتُطفِئُه آخرُ نقطةٍ تغيب. (وتنبضُ متوافقةً الآن، وهي أهدأُ للعين.)
const pulseVal = new Animated.Value(0);
let pulseLoop: Animated.CompositeAnimation | null = null;
let pulseUsers = 0;
const pulseJoin = () => {
  if (++pulseUsers > 1) return;
  pulseLoop = Animated.loop(
    Animated.timing(pulseVal, { toValue: 1, duration: 1600, useNativeDriver: true }),
  );
  pulseLoop.start();
};
const pulseLeave = () => {
  if (--pulseUsers > 0) return;
  pulseUsers = 0;
  pulseLoop?.stop();
  pulseLoop = null;
  pulseVal.setValue(0);
};

// ── status dot with an expanding "ping" halo for live states ──
function PulseDot({ color, animated }: { color: string; animated?: boolean }) {
  const a = pulseVal;
  useEffect(() => {
    if (!animated) return;
    pulseJoin();
    return pulseLeave;
  }, [animated]);
  return (
    <View style={s.dotWrap}>
      <View style={[s.dotGlow, { backgroundColor: color }]} />
      {animated && (
        <Animated.View
          style={[
            s.dotRing,
            {
              backgroundColor: color,
              opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }],
            },
          ]}
        />
      )}
      <View style={[s.dotCore, { backgroundColor: color, shadowColor: color }]} />
    </View>
  );
}

// ── an action tile styled like a real iOS app icon (squircle gradient + gloss + colored shadow) ──
function ActBtn({
  icon,
  label,
  kind,
  width,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  kind: 'note' | 'edit' | 'danger' | 'profile';
  width?: string;
  onPress: () => void;
}) {
  const g = ACT_G[kind];
  const press = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.timing(press, { toValue: v, duration: 120, useNativeDriver: true }).start();
  const scaleTile = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      style={[s.act, width ? { width: width as any } : null]}
    >
      <Animated.View style={[s.actIcShadow, { shadowColor: g[1], backgroundColor: g[1], transform: [{ scale: scaleTile }] }]}>
        <LinearGradient colors={g} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={s.actIcFill}>
          <LinearGradient colors={SHEEN} locations={SHEEN_LOC} start={{ x: 0.12, y: 0 }} end={{ x: 0.82, y: 1 }} style={s.actSheen} />
          <Ionicons name={icon} size={scale(23)} color="#fff" style={s.actGlyph} />
        </LinearGradient>
      </Animated.View>
      <Text style={s.actLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── read-only visit timeline (Registered → Entered clinic → Completed + doctor) ──
// Surfaces, inline in the drawer, the same timestamps the old "View Details" showed.
function VisitTimeline({ patient }: { patient: Patient }) {
  const steps: { label: string; at?: Date; color: string; sub?: string; sub2?: string }[] = [
    { label: 'Registered', at: patient.registered_at || patient.timestamp, color: C.blue },
    { label: 'Entered clinic', at: patient.clinic_entry_at, color: C.teal },
    {
      label: 'Completed', at: patient.completed_at, color: C.done,
      sub: patient.doctor_name,
      sub2: patient.assigned_by_doctor_name ? `Assigned by Dr. ${patient.assigned_by_doctor_name}` : undefined,
    },
  ];
  return (
    <View>
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        const has = !!st.at;
        return (
          <View key={st.label} style={s.tlStep}>
            <View style={s.tlRail}>
              <View style={[s.tlDot, { backgroundColor: has ? st.color : C.hair, shadowColor: st.color }, has && s.tlDotOn]} />
              {!last && <View style={s.tlLine} />}
            </View>
            <View style={[s.tlBody, !last && s.tlBodyGap]}>
              <View style={s.tlBodyRow}>
                <Text style={s.tlLabel}>{st.label}</Text>
                <Text style={[s.tlTime, !has && s.tlTimeOff]}>{has ? fmtHM(st.at) : '—'}</Text>
              </View>
              {st.sub ? <Text style={s.tlSub}>{st.sub}</Text> : null}
              {st.sub2 ? <Text style={s.tlSub}>{st.sub2}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export interface PatientCardV2Props {
  patient: Patient;
  index: number;
  animKey: number;
  isExpanded: boolean;
  // كلُّها اختياريّةٌ لأنَّ الكرتَ يُعرَضُ أيضًا في الأرشيف، حيثُ لا شيءَ يُعدَّل
  onUpdateField?: (patientId: string, field: 'clinic' | 'condition' | 'treatment', value: string) => void;
  onSetDuration?: (patientId: string, minutes: number | null) => void;
  onSetAppointment?: (patientId: string, min: number | null) => void;
  onWriteNote?: (patientId: string, note: string | null) => void;
  onMenuAction?: (patientId: string, action: string) => void;
  onProfilePress?: (patient: Patient) => void;
  onToggleExpand: () => void;
  // الأرشيف: يومٌ مضى. الكرتُ هو الكرتُ نفسُه شكلًا، لكنّه يُقرأُ ولا يُلمَس —
  // لا سحبَ ولا اختياراتٍ ولا أزرارَ فعل، والدرجُ يعرضُ ما كان.
  readOnly?: boolean;
  // a filed patient carries a record; the card borrows it rather than owning it,
  // so everything the old card showed keeps its existing wiring
  hasProfile?: boolean;
  // لقطةُ المخطّطِ نفسِه (عبرَ onSchedule) فيطابقُ فحصُ الحجزِ ما تراه على الشاشة
  appointmentCtx?: ApptCtx;
  renderProfile?: (backRef: React.MutableRefObject<(() => boolean) | null>) => React.ReactNode;
}

export function PatientCardV2({
  patient,
  index,
  animKey,
  isExpanded,
  onUpdateField,
  onSetDuration,
  onSetAppointment,
  onWriteNote,
  onMenuAction,
  onProfilePress,
  onToggleExpand,
  readOnly,
  hasProfile,
  appointmentCtx,
  renderProfile,
}: PatientCardV2Props) {
  // Expansion is driven by the parent: one card open at a time, isolated on the page
  // (the header collapses with the same animation the old card used).
  const open = isExpanded;
  const [row, setRow] = useState<FieldKey | null>(null);
  // the visit timeline is reference info — folded away until asked for.
  // In the archive it is the point of opening the card at all, so it starts open.
  const [showVisit, setShowVisit] = useState(!!readOnly);
  // the record is opened on request, inside this same card
  const [showProfile, setShowProfile] = useState(false);
  const profileBack = useRef<(() => boolean) | null>(null);
  // collapse any open selector when the card is closed from the outside
  useEffect(() => {
    if (!isExpanded) { setRow(null); setShowVisit(!!readOnly); setShowProfile(false); }
  }, [isExpanded, readOnly]);

  // ── the turn: one object, two sides. Rotation runs on the native driver; the height
  // change rides LayoutAnimation (also native) at the same duration, and the faces swap
  // exactly at the half-way point where both are edge-on and invisible. ──
  const spin = useRef(new Animated.Value(0)).current;
  const [turned, setTurned] = useState(false);   // drives height + hides the drawer
  const [backUp, setBackUp] = useState(false);   // keeps the back mounted through the turn
  const [draft, setDraft] = useState('');
  const noteRef = useRef<TextInput>(null);

  const layout = (d = FLIP_MS) =>
    LayoutAnimation.configureNext(
      LayoutAnimation.create(d, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );

  const turnToNote = () => {
    setDraft(patient.note || '');
    setBackUp(true);
    setRow(null);
    setShowVisit(false);
    layout();
    setTurned(true);
    // no auto-focus: the keyboard comes up only when the doctor taps the field
    Animated.timing(spin, {
      toValue: 1, duration: FLIP_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
    }).start();
  };

  const turnBack = () => {
    noteRef.current?.blur();
    layout();
    setTurned(false);
    Animated.timing(spin, {
      toValue: 0, duration: FLIP_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
    }).start(() => setBackUp(false));
  };

  const keepNote = () => { onWriteNote?.(patient.id, draft.trim() || null); turnBack(); };
  const dropNote = () => { setDraft(''); onWriteNote?.(patient.id, null); turnBack(); };

  // faces: front turns 0→180, back 180→360; opacity flips hard at the edge-on midpoint
  // so the wrong face can never show even where backfaceVisibility is unreliable
  const frontSpin = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backSpin = spin.interpolate({ inputRange: [0, 1], outputRange: ['-180deg', '0deg'] });
  const frontFade = spin.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const backFade = spin.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1] });

  // ── ما لا يُرى لا يُبنى مع أوّلِ رسمة ──
  // Swipeable يُركِّبُ لوحَي السحبِ من أوّلِ لحظة، وهما مطويّانِ خلفَ الكرتِ لا يُرَيان:
  // زرّا «تمَّ» و«غائب»، ودُرجُ العيادات (خمسُ رقاقاتٍ لكلِّ واحدةٍ تدرّجٌ وظلٌّ مرتفع).
  // فكلُّ كرتٍ يُنشئُ ثمانيةَ تدرّجاتٍ وخمسةَ ظلالٍ لا تُطلَبُ حتّى يُسحَب — وهي التي
  // كانت تُثقِلُ أوّلَ رسمةٍ للطابور. فلْتُبنَ حينَ يهدأُ الخيط: الكرتُ يظهرُ أوّلًا،
  // ويأتي ما خلفَه بعدَ أن تستقرَّ الحركة. والأرشيفُ لا يُسحَبُ أصلًا فلا لوحَ له.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (readOnly) return;
    const h = InteractionManager.runAfterInteractions(() => setArmed(true));
    return () => h.cancel();
  }, [readOnly]);

  // ── swipe-to-reveal via gesture-handler Swipeable (coordinates cleanly with the scroll view) ──
  const swipeRef = useRef<Swipeable>(null);
  const closeSwipe = () => swipeRef.current?.close();
  // the card is glass now, so the buttons behind it must fade with the swipe —
  // otherwise they stay legible through the card all the way through the close
  const revealFade = (progress: Animated.AnimatedInterpolation<number>) =>
    progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.06, 1], extrapolate: 'clamp' });

  const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>) => (
    <Animated.View style={[s.actions, { opacity: revealFade(progress) }]}>
      <TouchableOpacity activeOpacity={0.85} style={s.swipeBtn} onPress={() => { closeSwipe(); onMenuAction?.(patient.id, 'complete'); }}>
        <LinearGradient colors={G.done} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={s.swipeFill}>
          <Ionicons name="checkmark-sharp" size={scale(22)} color="#fff" />
          <Text style={s.swipeTxt}>Done</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.85} style={s.swipeBtn} onPress={() => { closeSwipe(); onMenuAction?.(patient.id, 'na'); }}>
        <LinearGradient colors={G.away} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={s.swipeFill}>
          <Ionicons name="person-remove-outline" size={scale(20)} color="#fff" />
          <Text style={s.swipeTxt}>NA</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );

  // ── the other way: the clinics, straight from the swipe ──
  const setClinic = (id: number) => {
    closeSwipe();
    onUpdateField?.(patient.id, 'clinic', `Clinic ${id}`);
  };

  // the clinic tray comes out where the patient's identity sits, so the number and
  // the name step aside for it and the card asks its question instead
  const qnumFade = useRef(new Animated.Value(1)).current;
  const askFade = qnumFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const fadeQnum = (to: number) =>
    Animated.timing(qnumFade, { toValue: to, duration: 150, useNativeDriver: true }).start();

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => (
    <Animated.View style={[s.clinics, { opacity: revealFade(progress) }]}>
      {/* the same sheet of material, continued — not a second one */}
      <LinearGradient colors={trayTint} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {CLINIC_CHOICES.map((id) => (
        <TouchableOpacity key={id} activeOpacity={0.8} style={s.clinicChip} onPress={() => setClinic(id)}>
          <LinearGradient colors={QNUM_G} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.qnumFill}>
            <Text style={s.clinicNum}>{id}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );

  // entrance slide-in (matches the classic list feel).
  // التتابعُ زينةٌ لأوّلِ ما تقعُ عليه العين. وكان كلُّ كرتٍ يتأخّرُ تسعينَ مِلِّي عن سابقِه
  // بلا سقف، فالكرتُ الستّون يبدأُ بعدَ خمسِ ثوانٍ والمئتانِ بعدَ ثمانيَ عشرة — فيُرى
  // تقطيعًا لا أناقة. الآن يتتابعُ ما تراه الشاشةُ وحدَه، وما بعدَه يدخلُ فورًا.
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    slide.setValue(0);
    Animated.spring(slide, {
      toValue: 1,
      delay: Math.min(index, STAGGER_MAX) * STAGGER_MS,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [animKey]);
  const fromRight = index % 2 === 0;

  const kind = kindOf(patient);
  const tint = TINT[kind === 'na' ? 'away' : kind]; // NA reuses the grey "away" wash
  const trayTint = TRAY_TINT[kind === 'na' ? 'away' : kind] as [string, string];
  const qn = patient.queue_number === 0 ? '-' : String(patient.queue_number);
  const clinicNum = clinicNumOf(patient.clinic);
  const dotColor = kind === 'done' ? C.done : kind === 'inclinic' ? C.violet : kind === 'na' ? C.away : C.blue;
  // في الأرشيف يُقاسُ الوقتُ لا يُقدَّر: من الدخولِ إلى الإنجاز. وإن لم يكتملْ فالمدّةُ المحدَّدةُ هي كلُّ ما كان
  const actualMin = patient.clinic_entry_at && patient.completed_at
    ? Math.max(0, Math.round((+new Date(patient.completed_at) - +new Date(patient.clinic_entry_at)) / 60000))
    : null;
  const showTime = needsDuration(patient.treatment) || actualMin != null;
  const shownMin = readOnly && actualMin != null ? actualMin : durOf(patient);
  const durLabel = showTime && (readOnly || needsDuration(patient.treatment)) ? `${shownMin}min` : '';
  const caseText = [patient.condition, patient.treatment, durLabel].filter((x) => x && x !== 'Condition' && x !== 'Treatment').join(' · ');
  const ACT_W = hasProfile ? '25%' : '33.33%';   // a filed patient gets a fourth tile
  const flagList = [patient.isElderly ? 'Elderly' : null, patient.isSpecialNeeds ? 'Special' : null].filter(Boolean) as string[];

  const animate = (d = 200) =>
    LayoutAnimation.configureNext(
      LayoutAnimation.create(d, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );

  const toggleDrawer = () => {
    // inside the record, the chevron is the only way back: first out of an open
    // section, then out of the record — never straight out of the card
    if (showProfile) {
      animate(240);
      if (profileBack.current?.()) return;
      setShowProfile(false);
      return;
    }
    // animate the drawer growing on open; on close, the returning list's own entrance handles it
    if (!isExpanded) animate(240);
    onToggleExpand();
  };
  const toggleRow = (k: FieldKey) => {
    animate(200);
    setRow((r) => (r === k ? null : k));
  };

  const pickClinic = (v: string) => {
    onUpdateField?.(patient.id, 'clinic', v === 'None' ? 'Clinic' : `Clinic ${v}`);
    setTimeout(() => { animate(180); setRow(null); }, 260);
  };
  const pickField = (field: 'condition' | 'treatment', v: string) => {
    onUpdateField?.(patient.id, field, v); // for treatment this also applies its default duration (atomic)
    if (field === 'treatment' && needsDuration(v)) {
      setTimeout(() => { animate(220); setRow('dur'); }, 280); // reveal the dial to fine-tune
      return;
    }
    setTimeout(() => { animate(180); setRow(null); }, 260);
  };

  // floating badges (top-LEFT edge) — full words, not codes. No "Done": the card already
  // turns green and its status line says so. The Note badge is a shortcut to the note.
  const badges: { t: string; g: [string, string]; ic: keyof typeof Ionicons.glyphMap; tap?: boolean }[] = [];
  if (kind === 'na') badges.push({ t: 'NA', g: BADGE_G.na, ic: 'close' });
  if (patient.isElderly) badges.push({ t: 'Elderly', g: BADGE_G.elderly, ic: 'walk' });
  if (patient.isSpecialNeeds) badges.push({ t: 'Special needs', g: BADGE_G.special, ic: 'accessibility' });
  if (patient.note) badges.push({ t: 'Note', g: BADGE_G.note, ic: 'document-text', tap: true });

  return (
    <Animated.View
      style={{
        opacity: slide,
        transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [fromRight ? 90 : -90, 0] }) }],
        marginTop: index === 0 ? scale(16) : 0,
        marginBottom: scale(15),
      }}
    >
      {/* `backUp` outlives the turn in both directions, so badges leave as the card turns
          away and only come back once it has fully settled on its front again */}
      {badges.length > 0 && !backUp && (
        <View style={s.badges}>
          {badges.map((b, i) => {
            const inner = (
              <LinearGradient colors={b.g} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.badgeFill}>
                <Ionicons name={b.ic} size={scale(11)} color="#fff" />
                <Text style={s.badgeTxt}>{b.t}</Text>
              </LinearGradient>
            );
            return b.tap ? (
              <TouchableOpacity key={i} activeOpacity={0.8} onPress={turnToNote} style={s.badge}>
                {inner}
              </TouchableOpacity>
            ) : (
              <View key={i} style={s.badge} pointerEvents="none">{inner}</View>
            );
          })}
        </View>
      )}

      <View style={[s.flipWrap, turned && { height: NOTE_H }]}>
      <Animated.View
        style={[s.face, { opacity: frontFade, transform: [{ perspective: 1000 }, { rotateY: frontSpin }] }]}
        pointerEvents={turned ? 'none' : 'auto'}
      >
      <View style={s.shadowWrap}>
      <View style={s.card}>
        <Swipeable
          ref={swipeRef}
          renderLeftActions={armed ? renderLeftActions : undefined}
          renderRightActions={armed ? renderRightActions : undefined}
          friction={1}
          leftThreshold={scale(36)}
          rightThreshold={scale(36)}
          overshootLeft={false}
          overshootRight={false}
          onSwipeableOpenStartDrag={(d) => { if (d === 'right') fadeQnum(0); }}
          onSwipeableCloseStartDrag={(d) => { if (d === 'right') fadeQnum(1); }}
          onSwipeableWillClose={(d) => { if (d === 'right') fadeQnum(1); }}
          enabled={!readOnly && row !== 'dur'}
        >
          <View style={s.surface}>
          <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cardInner}>
            {/* collapsed row (RTL: number + name right, arrow left) */}
            <View style={s.row}>
              <Animated.View style={[s.qnum, { opacity: qnumFade }]}>
                <LinearGradient colors={QNUM_G} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.qnumFill}>
                  <Text style={s.qnumTxt}>{qn}</Text>
                </LinearGradient>
              </Animated.View>
              <View style={s.who}>
                <Animated.View style={{ opacity: qnumFade }}>
                  <View style={s.topLine}>
                    <View style={s.statusWrap}>
                      <PulseDot color={dotColor} animated />
                      <Text style={[s.statusTxt, { color: dotColor }]} numberOfLines={1}>{statusText(patient)}</Text>
                    </View>
                    {/* the name is the patient — tapping it opens their chart,
                        collapsed or open, as long as they have a file */}
                    {hasProfile && !readOnly ? (
                      <TouchableOpacity
                        style={s.nameHit}
                        activeOpacity={0.6}
                        hitSlop={{ top: 8, bottom: 8 }}
                        onPress={() => onProfilePress?.(patient)}
                      >
                        <Text style={s.name} numberOfLines={1}>{patient.name}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={s.name} numberOfLines={1}>{patient.name}</Text>
                    )}
                  </View>
                  {caseText ? <Text style={s.caseLine} numberOfLines={1}>{caseText}</Text> : null}
                </Animated.View>
                {/* the card stops saying who, and says what the swipe is for */}
                <Animated.View style={[s.askClinic, { opacity: askFade }]} pointerEvents="none">
                  <Text style={s.askClinicTxt}>Clinic</Text>
                </Animated.View>
              </View>
              <TouchableOpacity style={s.chev} onPress={toggleDrawer} activeOpacity={0.7}>
                {/* inside the record it points back, because that is where it goes */}
                <Ionicons
                  name={showProfile ? 'chevron-back' : open ? 'chevron-up' : 'chevron-down'}
                  size={scale(20)}
                  color={C.inkStrong}
                />
              </TouchableOpacity>
            </View>

            {/* the record takes the whole drawer: the visit console and the action
                tiles step out, and its own tiles are all that is left */}
            {open && !turned && showProfile && renderProfile && (
              <View style={s.drawer}>{renderProfile(profileBack)}</View>
            )}

            {/* drawer — folded away while the card is turned over */}
            {open && !turned && !showProfile && (
              <View style={s.drawer}>
                <View style={s.triad}>
                  <ConsoleRow
                    icon="business-outline"
                    label="CLINIC"
                    value={clinicNum == null ? '—' : String(clinicNum)}
                    accent={ACCENT.clinic}
                    accentG={ACCENT_G.clinic}
                    options={CLINIC_OPTS}
                    current={clinicNum == null ? 'None' : String(clinicNum)}
                    numeric
                    open={row === 'clinic'}
                    readOnly={readOnly}
                    onToggle={() => toggleRow('clinic')}
                    onPick={pickClinic}
                  />
                  <View style={s.rowSep} />
                  <ConsoleRow
                    icon="pulse-outline"
                    label="CONDITION"
                    value={patient.condition && patient.condition !== 'Condition' ? patient.condition : '—'}
                    accent={ACCENT.cond}
                    accentG={ACCENT_G.cond}
                    options={COND_OPTS}
                    current={patient.condition || 'Condition'}
                    open={row === 'cond'}
                    readOnly={readOnly}
                    onToggle={() => toggleRow('cond')}
                    onPick={(v) => pickField('condition', v)}
                  />
                  <View style={s.rowSep} />
                  <ConsoleRow
                    icon="medical-outline"
                    label="TREATMENT"
                    value={patient.treatment && patient.treatment !== 'Treatment' ? patient.treatment : '—'}
                    accent={ACCENT.tx}
                    accentG={ACCENT_G.tx}
                    options={TX_OPTS}
                    current={patient.treatment || 'Treatment'}
                    open={row === 'tx'}
                    readOnly={readOnly}
                    onToggle={() => toggleRow('tx')}
                    onPick={(v) => pickField('treatment', v)}
                  />
                  {readOnly && showTime && (
                    <>
                      <View style={s.rowSep} />
                      <View style={s.rowHead}>
                        <RowHead
                          icon="time-outline"
                          label="TIME"
                          value={`${shownMin} min`}
                          accent={C.teal}
                        />
                      </View>
                    </>
                  )}
                  {!readOnly && needsDuration(patient.treatment) && (
                    <>
                      <View style={s.rowSep} />
                      <View>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleRow('dur')} style={s.rowHead}>
                          <RowHead
                            icon="time-outline"
                            label="TIME"
                            value={`${durOf(patient)} min${patient.appointment_min != null ? ` · ${fmtClock(patient.appointment_min)}` : ''}`}
                            accent={C.teal}
                            chevron={row === 'dur' ? 'up' : 'down'}
                          />
                        </TouchableOpacity>
                        {row === 'dur' && (
                          <View style={s.rowBody}>
                            <Text style={s.subLabel}>DURATION</Text>
                            <DurationDial key={`${patient.treatment}·${durOf(patient)}`} minutes={durOf(patient)} onCommit={(mnt) => onSetDuration?.(patient.id, mnt)} />
                            <ShiftNotice
                              minutes={durOf(patient)}
                              ctx={appointmentCtx}
                              selfId={patient.id}
                              onShorten={(mnt) => onSetDuration?.(patient.id, mnt)}
                            />
                            <View style={s.subSep} />
                            <Text style={s.subLabel}>APPOINTMENT</Text>
                            <AppointmentStepper
                              booked={patient.appointment_min}
                              dur={durOf(patient)}
                              avail={appointmentCtx}
                              selfId={patient.id}
                              onBook={(min) => onSetAppointment?.(patient.id, min)}
                              onClear={() => onSetAppointment?.(patient.id, null)}
                            />
                          </View>
                        )}
                      </View>
                    </>
                  )}
                  {/* flags live in the console too — it holds everything you SET.
                      In the archive nothing is set, and the badges above already say it. */}
                  {!readOnly && (
                    <>
                      <View style={s.rowSep} />
                      <View>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleRow('flags')} style={s.rowHead}>
                          <View style={[s.rowIc, { backgroundColor: C.elderly + '26' }]}>
                            <Ionicons name="star-outline" size={scale(15)} color={C.elderly} />
                          </View>
                          <Text style={s.rowLabel}>FLAGS</Text>
                          <Text style={[s.rowVal, { color: flagList.length ? C.elderly : C.muted }]} numberOfLines={1}>
                            {flagList.length ? flagList.join(', ') : '—'}
                          </Text>
                          <Ionicons name={row === 'flags' ? 'chevron-up' : 'chevron-down'} size={scale(15)} color={C.muted} />
                        </TouchableOpacity>
                        {row === 'flags' && (
                          <View style={s.rowBody}>
                            <View style={s.toggles}>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => onMenuAction?.(patient.id, 'elderly')}
                                style={[s.tgl, patient.isElderly && { backgroundColor: C.elderly, borderColor: 'transparent' }]}
                              >
                                <View style={[s.pip, patient.isElderly && s.pipOn]} />
                                <Text style={[s.tglTxt, patient.isElderly && s.tglTxtOn]}>Elderly</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => onMenuAction?.(patient.id, 'special_needs')}
                                style={[s.tgl, patient.isSpecialNeeds && { backgroundColor: C.special, borderColor: 'transparent' }]}
                              >
                                <View style={[s.pip, patient.isSpecialNeeds && s.pipOn]} />
                                <Text style={[s.tglTxt, patient.isSpecialNeeds && s.tglTxtOn]}>Special needs</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    </>
                  )}
                </View>

                {/* الأرشيف: لا شيءَ يُفعَل. ويبقى الملفُّ وحدَه — فمريضُ الملفِّ له سابقةُ علاجٍ تُقرأ */}
                {readOnly ? (
                  hasProfile ? (
                    <View style={s.acts}>
                      <ActBtn
                        icon="person-circle-outline"
                        label="Record"
                        kind="profile"
                        width="33.33%"
                        onPress={() => { animate(260); setShowProfile(true); }}
                      />
                    </View>
                  ) : null
                ) : (
                  <View style={s.acts}>
                    {hasProfile && (
                      <ActBtn
                        icon="person-circle-outline"
                        label="Profile"
                        kind="profile"
                        width={ACT_W}
                        onPress={() => { animate(260); setShowProfile(true); }}
                      />
                    )}
                    <ActBtn icon="document-text-outline" label="Notes" kind="note" width={ACT_W} onPress={turnToNote} />
                    <ActBtn icon="create-outline" label="Edit" kind="edit" width={ACT_W} onPress={() => onMenuAction?.(patient.id, 'edit')} />
                    <ActBtn icon="trash-outline" label="Delete" kind="danger" width={ACT_W} onPress={() => onMenuAction?.(patient.id, 'delete')} />
                  </View>
                )}

                <View style={[s.hr, readOnly && !hasProfile && { marginTop: 0 }]} />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { animate(200); setShowVisit((v) => !v); }}
                  style={s.visitHead}
                >
                  <Text style={s.visitLabel}>DETAILS</Text>
                  <Ionicons name={showVisit ? 'chevron-up' : 'chevron-down'} size={scale(15)} color={C.muted} />
                </TouchableOpacity>
                {showVisit && (
                  <View style={s.visitBody}>
                    <VisitTimeline patient={patient} />
                  </View>
                )}
              </View>
            )}
          </LinearGradient>
          </View>
        </Swipeable>
        <View style={s.border} pointerEvents="none" />
      </View>
      </View>
      </Animated.View>

      {/* ── the reverse: the note, written straight onto the material ── */}
      {backUp && (
        <Animated.View
          style={[s.face, s.backFace, { opacity: backFade, transform: [{ perspective: 1000 }, { rotateY: backSpin }] }]}
          pointerEvents={turned ? 'auto' : 'none'}
        >
          {/* flex:1 must run the whole chain — the absolute face is the only definite height */}
          <View style={[s.shadowWrap, s.fill]}>
            <View style={[s.card, s.fill]}>
              <LinearGradient colors={BACK_TINT} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.backInner}>
                {/* the queue number, stamped into the material behind the writing */}
                <Text style={s.emboss} pointerEvents="none" numberOfLines={1}>{qn}</Text>

                <View style={s.backHead}>
                  <TouchableOpacity activeOpacity={0.7} onPress={turnBack} style={s.backTurn}>
                    <Ionicons name="arrow-undo-outline" size={scale(17)} color={C.inkStrong} />
                  </TouchableOpacity>
                  <View style={s.backTitle}>
                    <Text style={s.backKicker}>NOTE</Text>
                    <Text style={s.backName} numberOfLines={1}>{patient.name}</Text>
                  </View>
                </View>

                <View style={[s.backWrite, readOnly && { marginBottom: scale(13) }]}>
                  {/* the ink rail fills as the note grows — a counter you feel, not read */}
                  <View style={s.rail}>
                    <View style={[s.railFill, { height: `${Math.min(100, (draft.length / NOTE_MAX) * 100)}%` }]} />
                  </View>
                  <TextInput
                    ref={noteRef}
                    style={s.noteInput}
                    value={draft}
                    onChangeText={setDraft}
                    editable={!readOnly}
                    placeholder={readOnly ? '' : 'What should the next doctor know?'}
                    placeholderTextColor={C.muted}
                    multiline
                    maxLength={NOTE_MAX}
                    textAlignVertical="top"
                    selectionColor={C.blue}
                  />
                </View>

                {!readOnly && (
                <View style={s.backFoot}>
                  {patient.note ? (
                    <TouchableOpacity activeOpacity={0.8} onPress={dropNote} style={s.kill}>
                      <Ionicons name="trash-outline" size={scale(17)} color={C.danger} />
                    </TouchableOpacity>
                  ) : null}
                  <Text style={[s.count, draft.length > NOTE_MAX - 30 && { color: C.elderly }]}>
                    {draft.length}/{NOTE_MAX}
                  </Text>
                  <TouchableOpacity activeOpacity={0.85} onPress={keepNote} style={s.keep}>
                    <LinearGradient colors={G.keep} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={s.keepFill}>
                      <Ionicons name="checkmark-sharp" size={scale(20)} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                )}
              </LinearGradient>
              <View style={s.border} pointerEvents="none" />
            </View>
          </View>
        </Animated.View>
      )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // the turn: a relative box both faces live in; height is fixed only while turned
  flipWrap: { position: 'relative' },
  face: { backfaceVisibility: 'hidden' },
  backFace: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fill: { flex: 1 },

  // full-word badges, top-LEFT edge
  badges: {
    position: 'absolute',
    top: scale(-11),
    left: scale(18),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(5),
    maxWidth: '88%',
    zIndex: 8,
    elevation: 10,
  },

  // soft drop shadow (separate layer so the card's overflow:hidden can't clip it)
  // mirrors the prototype's  0 14px 30px -18px rgba(30,45,75,.55)
  // translucent, not opaque: the page shows through the card. It keeps just
  // enough white to cast a shadow (a fully clear background casts none on iOS).
  shadowWrap: {
    borderRadius: scale(22),
    backgroundColor: 'rgba(255,255,255,0.20)',
    shadowColor: '#1E2D4B',
    shadowOffset: { width: 0, height: scale(9) },
    shadowOpacity: 0.18,
    shadowRadius: scale(18),
    elevation: 6,
  },
  badge: {
    height: scale(22),
    borderRadius: scale(11),
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  badgeFill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingHorizontal: scale(8),
  },
  badgeTxt: { fontSize: scale(10.5), fontWeight: '800', color: '#fff' },

  card: {
    borderRadius: scale(22),
    overflow: 'hidden',
  },
  // square corners — the outer card's overflow:hidden does all the rounding, so the
  // content meets the swipe buttons edge-to-edge with no light sliver at the corners
  cardInner: { borderRadius: 0 },
  // glass base — the page reads through the card, the status wash sits on top.
  // The swipe buttons don't leak: Swipeable parks them off the left edge and the
  // card's overflow:hidden clips whatever is outside it.
  surface: { backgroundColor: 'rgba(255,255,255,0.28)' },
  // continuous rounded border drawn on TOP of everything → frame stays connected across the buttons
  border: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: scale(22),
    borderWidth: 1.5,
    borderColor: C.brd,
  },

  // swipe actions (Done / NA) — revealed to the left, clipped to the card's rounded corners
  actions: { width: ACTIONS_W, flexDirection: 'row' },
  swipeBtn: { flex: 1 },
  swipeFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: scale(5) },
  swipeTxt: { color: '#fff', fontSize: scale(11), fontWeight: '800', letterSpacing: 0.4 },

  // the clinic picker on the other side — the queue chip, once per chair
  clinics: {
    width: CLINICS_W,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: CLINIC_PAD, gap: CLINIC_GAP,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  clinicChip: {
    width: CLINIC_CHIP_W,
    height: scale(44),
    borderRadius: scale(14),
    backgroundColor: 'rgba(255,255,255,0.30)',
    shadowColor: '#1E2D4B',
    shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: 0.22,
    shadowRadius: scale(7),
    elevation: 3,
  },
  clinicNum: { fontSize: scale(19), fontWeight: '800', letterSpacing: -0.5, color: C.inkStrong },

  // collapsed row
  // row-reverse → number + name sit on the RIGHT (Arabic reading start), arrow on the LEFT
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: scale(12), paddingHorizontal: scale(13), paddingVertical: scale(12) },
  qnum: {
    width: scale(42),
    height: scale(46),
    borderRadius: scale(14),
    backgroundColor: 'rgba(255,255,255,0.30)',
    shadowColor: '#1E2D4B',
    shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: 0.22,
    shadowRadius: scale(7),
    elevation: 3,
  },
  qnumFill: {
    flex: 1,
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qnumTxt: { fontSize: scale(22), fontWeight: '800', letterSpacing: -0.5, color: C.inkStrong },
  who: { flex: 1, minWidth: 0 },
  nameHit: { flex: 1 },
  name: { flex: 1, fontSize: scale(17), fontWeight: '700', color: C.inkStrong, textAlign: 'right', lineHeight: scale(23) },
  // top line: status (left) faces the name (right); case sits on its own line below
  topLine: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: scale(6), flexShrink: 0 },
  dotWrap: { width: scale(7), height: scale(7), alignItems: 'center', justifyContent: 'center' },
  dotGlow: { position: 'absolute', width: scale(16), height: scale(16), borderRadius: scale(8), opacity: 0.22 },
  dotRing: { position: 'absolute', width: scale(7), height: scale(7), borderRadius: scale(4) },
  dotCore: {
    width: scale(7), height: scale(7), borderRadius: scale(4),
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: scale(3), elevation: 3,
  },
  statusTxt: { fontSize: scale(11.5), fontWeight: '800' },
  // sits exactly where the name was, so the swap reads as one thing becoming another
  askClinic: { position: 'absolute', top: 0, right: 0, bottom: 0, alignItems: 'flex-end', justifyContent: 'center' },
  askClinicTxt: { fontSize: scale(17), fontWeight: '800', color: C.violet, letterSpacing: -0.2 },
  caseLine: { fontSize: scale(11.5), fontWeight: '500', color: C.muted, textAlign: 'left', marginTop: scale(3) },
  chev: {
    width: scale(32), height: scale(32), borderRadius: scale(11),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.glass2, borderWidth: 1, borderColor: C.brd,
  },

  // drawer
  drawer: { paddingHorizontal: scale(13), paddingBottom: scale(14) },
  triad: {
    borderRadius: scale(18),
    borderWidth: 1,
    borderColor: C.brd,
    backgroundColor: C.glass,
    marginBottom: scale(13),
    // raised "console" look (prototype: 0 16px 34px -22px navy) — no overflow:hidden so it isn't clipped
    shadowColor: '#1E2D4B',
    shadowOffset: { width: 0, height: scale(10) },
    shadowOpacity: 0.16,
    shadowRadius: scale(16),
    elevation: 3,
  },
  rowSep: { height: 1, backgroundColor: C.hair },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: scale(10), paddingHorizontal: scale(13), paddingVertical: scale(13) },
  rowIc: { width: scale(28), height: scale(28), borderRadius: scale(8), alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: scale(10.5), fontWeight: '800', letterSpacing: 1, color: C.muted },
  rowVal: { marginLeft: 'auto', fontSize: scale(14), fontWeight: '800', maxWidth: '46%' },
  rowBody: { paddingHorizontal: scale(13), paddingBottom: scale(13), paddingTop: scale(2) },

  // segmented
  seg: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: C.brd,
    backgroundColor: C.glass2,
  },
  segCell: { height: scale(40), padding: scale(3) },
  // fills the cell and centers the label both axes (fixes text sitting at the top)
  segFill: { flex: 1, borderRadius: scale(11), alignItems: 'center', justifyContent: 'center' },
  segTxt: { textAlign: 'center', fontSize: scale(12.5), fontWeight: '700', color: C.ink },
  segTxtOn: { color: '#fff' },

  // secondary actions — iOS app-icon tiles, 3 per row, equal width (a lone one keeps its size)
  acts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: scale(13) },
  act: { width: '33.33%', alignItems: 'center', gap: scale(8), paddingVertical: scale(2) },
  // shadow layer (no overflow, opaque base) so the colored drop shadow isn't clipped
  actIcShadow: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(15),
    shadowOffset: { width: 0, height: scale(8) },
    shadowOpacity: 0.5,
    shadowRadius: scale(9),
    elevation: 7,
  },
  // the gradient face; clips the sheen to the rounded corners
  actIcFill: { flex: 1, borderRadius: scale(15), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  actSheen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  actGlyph: { textShadowColor: 'rgba(0,0,0,0.22)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.5 },
  actLabel: { fontSize: scale(11.5), fontWeight: '600', color: C.muted },

  // toggles (inside the console's FLAGS row body — the body already supplies the spacing)
  toggles: { flexDirection: 'row', gap: scale(8) },
  tgl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    height: scale(40),
    borderRadius: scale(13),
    borderWidth: 1.5,
    borderColor: C.brd,
    backgroundColor: C.glass2,
  },
  pip: { width: scale(15), height: scale(15), borderRadius: scale(8), borderWidth: 2, borderColor: C.muted, opacity: 0.5 },
  pipOn: { opacity: 1, backgroundColor: '#fff', borderColor: '#fff' },
  tglTxt: { fontSize: scale(12), fontWeight: '800', color: C.muted },
  tglTxtOn: { color: '#fff' },

  // read-only visit timeline (drawer, last) — faint divider, a foldaway header, then the steps
  hr: { height: 1, backgroundColor: C.hair, marginTop: scale(14), marginBottom: scale(4) },
  visitHead: { flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingVertical: scale(9) },
  visitLabel: { flex: 1, fontSize: scale(10.5), fontWeight: '800', letterSpacing: 1, color: C.muted },
  visitBody: { paddingTop: scale(4) },
  tlStep: { flexDirection: 'row' },
  tlRail: { width: scale(18), alignItems: 'center' },
  tlDot: { width: scale(9), height: scale(9), borderRadius: scale(5), marginTop: scale(4) },
  tlDotOn: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: scale(3), elevation: 2 },
  tlLine: { width: 2, flex: 1, backgroundColor: C.hair, marginTop: scale(3), borderRadius: 1 },
  tlBody: { flex: 1, paddingLeft: scale(9) },
  tlBodyGap: { paddingBottom: scale(13) },
  tlBodyRow: { flexDirection: 'row', alignItems: 'center' },
  tlLabel: { fontSize: scale(12.5), fontWeight: '700', color: C.ink },
  tlTime: { marginLeft: 'auto', fontSize: scale(12.5), fontWeight: '800', color: C.inkStrong },
  tlTimeOff: { color: C.muted, fontWeight: '700' },
  tlSub: { fontSize: scale(11.5), fontWeight: '600', color: C.muted, marginTop: scale(2) },

  // treatment-duration drag counter
  dial: { paddingTop: scale(2) },
  dialReadout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: scale(5), marginBottom: scale(14) },
  dialNum: { fontSize: scale(34), fontWeight: '800', color: C.teal, letterSpacing: -0.5 },
  dialUnit: { fontSize: scale(13), fontWeight: '700', color: C.muted },
  dialTrackHit: { height: scale(34), justifyContent: 'center' },
  dialTrack: { height: scale(8), borderRadius: scale(4), backgroundColor: 'rgba(14,165,160,0.14)', overflow: 'hidden' },
  dialFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: scale(4) },
  dialThumb: {
    position: 'absolute', top: '50%', marginTop: -scale(12), marginLeft: -scale(12),
    width: scale(24), height: scale(24), borderRadius: scale(12),
    backgroundColor: '#fff', borderWidth: 2.5, borderColor: C.teal,
    shadowColor: '#1E2D4B', shadowOffset: { width: 0, height: scale(2) }, shadowOpacity: 0.28, shadowRadius: scale(4), elevation: 4,
  },
  dialScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: scale(9) },
  dialTick: { fontSize: scale(10.5), fontWeight: '700', color: C.muted },

  // same-day appointment (merged under TIME): sub-labels, −/＋ stepper, Book/Queue
  subLabel: { fontSize: scale(10.5), fontWeight: '800', letterSpacing: 1, color: C.muted, marginBottom: scale(6) },
  subSep: { height: 1, backgroundColor: C.hair, marginTop: scale(14), marginBottom: scale(15) },

  // ── تنبيهُ تبديلِ الشفت: كهرمانٌ لا أحمر — إخبارٌ بما سيحدث، لا منعٌ ولا خطأ ──
  shWrap: {
    marginTop: scale(12), padding: scale(11), borderRadius: scale(14),
    backgroundColor: 'rgba(234,138,12,0.09)',
    borderWidth: 1, borderColor: 'rgba(234,138,12,0.22)',
  },
  shHead: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(9) },
  shIc: {
    width: scale(24), height: scale(24), borderRadius: scale(8),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(234,138,12,0.16)',
  },
  shTitle: { fontSize: scale(11), fontWeight: '900', letterSpacing: 0.6, color: '#B96C05', textTransform: 'uppercase' },
  shBody: { marginTop: scale(3), fontSize: scale(12), lineHeight: scale(17), fontWeight: '600', color: C.ink },
  shTime: { fontWeight: '900', color: '#B96C05' },
  shBtns: { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginTop: scale(11) },
  shAlt: {
    flex: 1, paddingVertical: scale(10), borderRadius: scale(12), alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1, borderColor: 'rgba(234,138,12,0.30)',
  },
  shAltTxt: { fontSize: scale(12.5), fontWeight: '800', color: '#B96C05' },
  shOk: { width: scale(88), borderRadius: scale(12), overflow: 'hidden' },
  shOkFill: { paddingVertical: scale(11), alignItems: 'center' },
  shOkTxt: { color: '#fff', fontSize: scale(12.5), fontWeight: '900', letterSpacing: 0.4 },
  apptWrap: { paddingTop: scale(2) },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(18) },
  stepBtn: {
    width: scale(48), height: scale(48), borderRadius: scale(15),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,165,160,0.10)', borderWidth: 1.5, borderColor: 'rgba(14,165,160,0.32)',
  },
  stepReadout: { minWidth: scale(118), alignItems: 'center' },
  apptNum: { fontSize: scale(30), fontWeight: '800', color: C.teal, letterSpacing: -0.5 },
  apptNumOff: { color: '#C0303C' },
  apptNo: { marginTop: scale(1), fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1, color: '#C0303C' },
  apptBtns: { flexDirection: 'row', gap: scale(9), marginTop: scale(15) },
  apptBook: { flex: 1, borderRadius: scale(13), overflow: 'hidden' },
  apptBookFill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), paddingVertical: scale(12) },
  apptBookTxt: { color: '#fff', fontSize: scale(13.5), fontWeight: '800', letterSpacing: 0.3 },
  apptClear: {
    paddingHorizontal: scale(18), alignItems: 'center', justifyContent: 'center',
    borderRadius: scale(13), backgroundColor: C.glass2, borderWidth: 1, borderColor: C.brd,
  },
  apptClearTxt: { fontSize: scale(13), fontWeight: '800', color: C.muted },

  // ── the reverse: writing on the material, no framed field ──
  backInner: { flex: 1, backgroundColor: '#F7F9FC' },
  // the queue number stamped into the card behind the writing
  emboss: {
    position: 'absolute',
    right: scale(12),
    bottom: -scale(26),
    fontSize: scale(128),
    fontWeight: '800',
    letterSpacing: -scale(6),
    color: C.inkStrong,
    opacity: 0.055,
  },
  backHead: { flexDirection: 'row', alignItems: 'center', gap: scale(10), paddingHorizontal: scale(13), paddingTop: scale(13), paddingBottom: scale(9) },
  backTurn: {
    width: scale(32), height: scale(32), borderRadius: scale(11),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.glass2, borderWidth: 1, borderColor: C.brd,
  },
  backTitle: { flex: 1, minWidth: 0 },
  backKicker: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.6, color: '#3B82F6' },
  backName: { fontSize: scale(15), fontWeight: '800', color: C.inkStrong, marginTop: scale(1) },

  // a distinct recessed panel: the writing sits IN something, lifted off the card material
  backWrite: {
    flex: 1,
    flexDirection: 'row',
    marginHorizontal: scale(13),
    padding: scale(13),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderWidth: 1,
    borderColor: C.brd,
    shadowColor: '#1E2D4B',
    shadowOffset: { width: 0, height: scale(6) },
    shadowOpacity: 0.10,
    shadowRadius: scale(12),
    elevation: 2,
  },
  rail: {
    width: scale(3), borderRadius: scale(2), marginRight: scale(11),
    backgroundColor: 'rgba(91,124,216,0.16)', overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  railFill: { width: '100%', borderRadius: scale(2), backgroundColor: C.blue },
  noteInput: {
    flex: 1,
    padding: 0,
    fontSize: scale(15.5),
    lineHeight: scale(26),
    fontWeight: '500',
    color: C.inkStrong,
  },

  backFoot: { flexDirection: 'row', alignItems: 'center', gap: scale(10), paddingHorizontal: scale(13), paddingVertical: scale(12) },
  count: { flex: 1, fontSize: scale(11), fontWeight: '700', color: C.muted },
  kill: {
    width: scale(38), height: scale(38), borderRadius: scale(13),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(226,59,66,0.24)', backgroundColor: 'rgba(226,59,66,0.08)',
  },
  // no overflow:'hidden' here — it would clip the coloured shadow on iOS; the gradient rounds itself
  // icon only — no overflow:'hidden', it would clip the coloured shadow on iOS
  keep: {
    width: scale(56), height: scale(38), borderRadius: scale(13), backgroundColor: '#7C4FBF',
    shadowColor: '#7C4FBF', shadowOffset: { width: 0, height: scale(8) },
    shadowOpacity: 0.4, shadowRadius: scale(10), elevation: 5,
  },
  keepFill: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: scale(13) },
});
