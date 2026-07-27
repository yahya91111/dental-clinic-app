/**
 * QueueTimeline — المخطّط الأفقيّ للدور (معاينة حيّة ببيانات حقيقيّة).
 *
 * قراءةٌ فقط: يبني المسارات من قائمة المرضى الموجودة (لا يكتب شيئًا، لا إشعارات).
 *  • كلُّ عيادةٍ (clinic) = مسارٌ/كرسيّ.
 *  • المنجَز (completed_at) والجاري (clinic_entry_at) يُرسمان من الأوقاتِ الحقيقيّة.
 *  • المنتظِرون يُوزَّعون توزيعًا مبدئيًّا: كبارُ السنّ فورًا لأوّلِ كرسيٍّ يفرغ، ثمّ البقيّة بترتيبِ الدور.
 *  • مصغّرٌ في موضع الإحصاء (يعرض رقمَ الدور)، وبالنقر يكبر ملءَ الشاشة (اسم/حالة/علاج/وقت).
 *
 * التوزيعُ هنا نسخةٌ أساسيّةٌ للمعاينة — الخوارزميّةُ التفاعليّةُ الكاملةُ تأتي في المرحلةِ التالية.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Defs, Pattern, Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { scale, scaledStyleSheet, SCREEN } from '../../lib/scale';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getScheduleSettings, updateScheduleBreaks } from '../../lib/database';
import { Patient, TREATMENT_DURATIONS } from './constants';

// قلبُ الترتيب في ملفٍّ مستقلٍّ بلا React — كي يُشغَّلَ ويُختبَرَ وحدَه.
// (scripts/test-timeline-wall.ts)
import {
  buildLanes, slotAvailable, shiftFit, snapshotChart, estMinutes, hasDuration, isPriority,
  minutesOfDay, isRealClinic, clinicNum, localDay,
} from './queueLanes';
import type { Kind, Blk, Lane, TimelineData, Break, DayChart } from './queueLanes';
import { rememberDayChart } from './dayChartStore';
export { buildLanes, slotAvailable, shiftFit };
export type { Lane, TimelineData, Break, DayChart };

const fmtHM = (min: number): string => {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
};
// مدّةُ الفراغِ المتاحِ: دقائقُ حتّى ٥٩ «10 min»، ثمّ ساعاتٌ «1hr» / «1hr 30min»
const fmtGap = (min: number): string => {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h}hr` : `${h}hr ${r}min`;
};

const TEAL_INK = '#0E7C66';
const BG_COLORS: [string, string, string] = ['#F0F4F8', '#E8EDF3', '#F5F0F8'];

// ═══════════════ محاكاةٌ افتراضيّةٌ تفاعليّةٌ معزولةٌ عن الوقتِ الفعليّ (بيئةُ عملٍ للتجربة 7ص→9م) ═══════════════
// عالَمٌ افتراضيٌّ قائمٌ بذاته يأخذُ مرضاك **الحقيقيّين** (أسماؤهم/علاجُهم/مدّتُهم) ويتجاهلُ
// أوقاتَهم الحقيقيّةَ تمامًا. **لا شيءَ تلقائيّ**: المريضُ يبقى منتظِرًا حتّى تُدخِلَه أنتَ للعيادةِ
// (بنقرِه على المخطّط) ثمّ تُنهيه — كالعملِ الحقيقيّ لكن بساعةٍ مسرَّعة. (الربطُ الحيُّ لاحقًا، بنفسِ المنطق.)
export type SimAct = { enter?: number; chair?: number; done?: number; na?: boolean; naAt?: number };

// نأخذُ تاريخَ اليومِ فقط لبناءِ Date؛ الساعةُ/الدقيقةُ افتراضيّةٌ بالكامل (buildLanes يقرأُ الدقائقَ فقط).
const dateAtMin = (min: number): Date => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), Math.round(min % 60), 0, 0);
};

// يُجسّدُ حالةَ كلِّ مريضٍ من إجراءاتِك أنتَ (أختامٌ افتراضيّةٌ فقط): منتظِرٌ ما لم تُدخِلْه.
function applySimActs(patients: Patient[], acts: { [id: string]: SimAct }, doctorName?: string): Patient[] {
  return patients.map((p) => {
    const a = acts[p.id];
    // «غيرُ متاح»: إجراؤُك في المحاكاةِ يَجُبُّ الحالةَ الحقيقيّةَ (وإلّا فالحالةُ الحقيقيّة)
    const naEff = a?.na !== undefined ? a.na : p.status === 'na';
    // نسجّلُ لحظةَ النداءِ (متى صارَ غيرَ متاح) لتُعرَضَ على الكرت — من الإجراءِ إن وُجدَ وإلّا نُبقي الحقيقيّ
    if (naEff) return { ...p, status: 'na', clinic_entry_at: undefined, completed_at: undefined,
      na_at: a?.naAt != null ? dateAtMin(a.naAt) : p.na_at } as Patient;
    if (!a || a.enter == null) {
      // لم تُدخِلْه بعد → منتظِرٌ بلا أختامٍ ولا طبيبٍ معالِج؛ الحسّابُ يتوقّعُ مكانَه أمامَ الخطّ
      return { ...p, clinic: 'Clinic', status: p.isElderly ? 'elderly' : 'normal', clinic_entry_at: undefined, completed_at: undefined, doctor_name: undefined } as Patient;
    }
    return {
      ...p,
      clinic: `Clinic ${a.chair}`,
      status: a.done != null ? 'complete' : (p.isElderly ? 'elderly' : 'normal'),
      clinic_entry_at: dateAtMin(a.enter),
      completed_at: a.done != null ? dateAtMin(a.done) : undefined,
      doctor_name: doctorName || p.doctor_name,   // في المحاكاةِ أنتَ الطبيبُ المعالِج (وسمُ الكرت)
    } as Patient;
  });
}

// أوّلُ كرسيٍّ شاغرٍ عندَ الإدخال (لا يشغلُه مريضٌ أُدخِلَ ولم يُنجَزْ بعد)
function firstFreeChair(acts: { [id: string]: SimAct }, chairCount: number): number {
  const busy = new Set(Object.values(acts).filter((a) => a.enter != null && a.done == null).map((a) => a.chair));
  for (let c = 1; c <= chairCount; c++) if (!busy.has(c)) return c;
  return 1;
}

const SIM_SPEEDS = [1, 3, 10, 30, 90]; // دقائقُ افتراضيّةٌ لكلِّ ثانيةٍ حقيقيّة (1 = أبطأ، الافتراضيّ — دقيقةٌ لكلِّ ثانية)

// ═══════════════ بطاقةُ المعلومات (في موضع الإحصاء) — لا مخطّطٌ مصغّر، بل «التالي في الدور» وملخّصٌ سريع ═══════════════
function MiniTimeline({ data, nowMin, simOn }: { data: TimelineData; nowMin: number; simOn?: boolean }) {
  const { lanes } = data;
  const flat = lanes.flatMap((l) => l.blocks.map((b) => ({ b, clinic: l.short })));
  const serving = flat.filter((x) => x.b.kind === 'cur' || x.b.kind === 'over');
  const upcoming = flat.filter((x) => x.b.kind === 'fut' || x.b.kind === 'eld').sort((a, b) => a.b.start - b.b.start);
  const naCount = flat.filter((x) => x.b.kind === 'na').length;
  const next = upcoming[0] ?? null;                 // التاليَ في الدور (أبكرُ منتظِرٍ متوقَّع)
  const then = upcoming.slice(1, 3);                // الذين بعده (اثنان)
  const nextBreak = flat.filter((x) => x.b.kind === 'break' && x.b.end > nowMin).sort((a, b) => a.b.start - b.b.start)[0]?.b ?? null;
  const caseOf = (p: Patient) => (p.treatment && p.treatment !== 'Treatment') ? p.treatment : 'Treatment';

  return (
    <View style={mini.card}>
      <View style={mini.expIcon}><Text style={mini.expTxt}>⤢</Text></View>
      {simOn && <View style={mini.simBadge}><Text style={mini.simBadgeTxt}>SIM {fmtHM(nowMin)}</Text></View>}

      {next ? (
        <>
          <Text style={mini.eyebrow}>UP NEXT</Text>
          <View style={mini.nextRow}>
            <View style={[mini.badge, next.b.kind === 'eld' && mini.badgeEld]}>
              <Text style={[mini.badgeTxt, next.b.kind === 'eld' && { color: '#7c2d12' }]}>{next.b.p.queue_number}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mini.name} numberOfLines={1}>{next.b.p.name}</Text>
              <Text style={mini.sub} numberOfLines={1}>{caseOf(next.b.p)} · {estMinutes(next.b.p)} min</Text>
            </View>
            <View style={mini.timeCol}>
              <Text style={mini.timeBig}>{fmtHM(next.b.start)}</Text>
              <Text style={mini.timeSub}>{next.clinic}</Text>
            </View>
          </View>

          {then.length ? (
            <View style={mini.thenRow}>
              <Text style={mini.thenLbl}>THEN</Text>
              {then.map((x, i) => (
                <View key={i} style={mini.thenChip}>
                  <Text style={mini.thenNum}>{x.b.p.queue_number}</Text>
                  <Text style={mini.thenName} numberOfLines={1}>{x.b.p.name}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : serving.length ? (
        <><Text style={mini.eyebrow}>QUEUE</Text><Text style={mini.emptyBig}>No one waiting</Text><Text style={mini.emptySub}>{serving.length} patient{serving.length > 1 ? 's' : ''} in clinic now</Text></>
      ) : (
        <><Text style={mini.eyebrow}>QUEUE</Text><Text style={mini.emptyBig}>No patients yet</Text><Text style={mini.emptySub}>Add patients to see who's next</Text></>
      )}

      <View style={mini.statsRow}>
        <View style={mini.stat}><View style={[mini.dot, mini.dotServing]} /><Text style={mini.statTxt}>{serving.length} in clinic</Text></View>
        <View style={mini.stat}><View style={[mini.dot, mini.dotWait]} /><Text style={mini.statTxt}>{upcoming.length} waiting</Text></View>
        {nextBreak ? <View style={mini.stat}><Text style={mini.statIcon}>☕</Text><Text style={mini.statTxt}>{fmtHM(nextBreak.start)}</Text></View> : null}
        {naCount ? <View style={mini.stat}><Text style={mini.statIcon}>🚫</Text><Text style={mini.statTxt}>{naCount} away</Text></View> : null}
      </View>
    </View>
  );
}

// منتقي وقتٍ بسيط (± ١٥ دقيقة) لمحرِّرِ البريك
function TimeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={full.stepper}>
      <TouchableOpacity style={full.stepBtn} onPress={() => onChange(Math.max(0, value - 15))}><Text style={full.stepSign}>−</Text></TouchableOpacity>
      <Text style={full.stepVal}>{fmtHM(value)}</Text>
      <TouchableOpacity style={full.stepBtn} onPress={() => onChange(Math.min(24 * 60, value + 15))}><Text style={full.stepSign}>＋</Text></TouchableOpacity>
    </View>
  );
}

// إجراءاتُ المريضِ من المخطّط — تُنفَّذُ على قاعدةِ البيانات (الوضعُ الحقيقيّ) أو على المحاكاةِ وحدَها.
// هي نفسُها إجراءاتُ الكرتِ في صفحةِ الدور، فالحدثُ واحدٌ أينما نُفِّذ.
export type BlockActions = {
  onEnterClinic: (patientId: string, chair: string) => void;
  onToggleNA: (patientId: string) => void;
  onDone: (patientId: string) => void;
};

// ═══════════════ نظامُ ألوانِ الكروت المكبّرة ═══════════════
// grad = خلفيّةٌ متدرّجة، bg = خلفيّةٌ مصمتة، ink = لونُ النصّ، badge = شارةُ الدور،
// trk/fil = مسارُ التقدّمِ وامتلاؤه، shadow = ظلٌّ ملوَّنٌ للحالاتِ البارزة.
type CardVis = { grad?: string[]; bg?: string; ink: string; badgeBg: string; badgeInk: string;
  trk: string; fil: string; border?: string; dashed?: boolean; shadow?: string };
const CARD: { [k in Kind]?: CardVis } = {
  done:     { bg: 'rgba(255,255,255,0.42)', ink: '#5A7079', badgeBg: 'rgba(90,112,121,0.55)', badgeInk: '#F3F7F8', trk: 'rgba(90,112,121,0.18)', fil: 'rgba(90,112,121,0.5)' },
  lateDone: { grad: ['rgba(239,68,68,0.20)', 'rgba(239,68,68,0.11)'], ink: '#7E1D18', border: 'rgba(239,68,68,0.32)', badgeBg: 'rgba(126,29,24,0.65)', badgeInk: '#FDECEA', trk: 'rgba(126,29,24,0.16)', fil: 'rgba(126,29,24,0.55)' },
  cur:      { grad: ['rgba(140,222,204,0.95)', 'rgba(104,197,177,0.82)'], ink: '#05302A', border: 'rgba(255,255,255,0.75)', badgeBg: 'rgba(5,48,42,0.85)', badgeInk: '#CFF3EA', trk: 'rgba(5,48,42,0.16)', fil: 'rgba(5,48,42,0.6)', shadow: '#09705C' },
  over:     { grad: ['#F46057', '#E13A30'], ink: '#FFFFFF', border: 'rgba(255,255,255,0.35)', badgeBg: 'rgba(255,255,255,0.92)', badgeInk: '#C6362D', trk: 'rgba(255,255,255,0.28)', fil: 'rgba(255,255,255,0.92)', shadow: '#E13A30' },
  fut:      { bg: 'rgba(255,255,255,0.26)', ink: '#093F36', border: 'rgba(14,124,102,0.42)', dashed: true, badgeBg: 'transparent', badgeInk: '#093F36', trk: 'rgba(14,124,102,0.18)', fil: 'transparent' },
  eld:      { grad: ['rgba(252,198,60,0.92)', 'rgba(240,168,26,0.80)'], ink: '#6B3E0B', border: 'rgba(107,62,11,0.42)', dashed: true, badgeBg: 'transparent', badgeInk: '#6B3E0B', trk: 'rgba(107,62,11,0.18)', fil: 'transparent', shadow: '#BF830A' },
  // غيرُ المتاحِ: كرتٌ مصمتٌ بلونٍ رماديٍّ-بنفسجيٍّ مميَّزٍ (تغيُّرُ لونٍ فقط، لا خفوتٌ ولا اختفاء) — يبقى حاضرًا كبقيّةِ الكروت
  na:       { grad: ['#CBCDE6', '#B4B7D8'], ink: '#3B3F63', border: 'rgba(96,100,140,0.6)', badgeBg: 'rgba(59,63,99,0.85)', badgeInk: '#EEEFF8', trk: 'rgba(59,63,99,0.16)', fil: 'transparent' },
};

// وسمُ الحالةِ الناطق: نصٌّ يُغني عن قراءةِ اللون (متأخّرٌ +7، جارٍ 8 min left، إلخ)
const chipOf = (b: Blk, nowMin: number): string => {
  const s = b.start, est = estMinutes(b.p), e = b.end;
  switch (b.kind) {
    case 'over': return `+${Math.max(0, Math.round(nowMin - (s + est)))} min`;
    case 'cur': return `${Math.max(0, Math.round(s + est - nowMin))} min left`;
    case 'lateDone': return `+${Math.max(0, Math.round((e - s) - est))} min`;
    case 'done': return `${Math.max(1, Math.round(e - s))} min`;
    case 'eld': return 'Elderly';
    case 'na': return 'not available';
    default: return 'awaiting';
  }
};
// شريطُ التقدّم: الامتلاءُ = ما مضى، والعلامةُ = المدّةُ المقدَّرة. المنتظِرُ/الغائبُ = مسارٌ فارغٌ (لم يبدأْ)
const barInfo = (b: Blk, nowMin: number): { fill: number; tick: number; empty: boolean } => {
  if (b.kind === 'fut' || b.kind === 'eld' || b.kind === 'na') return { fill: 0, tick: -1, empty: true };
  const est = estMinutes(b.p);
  const isDone = b.kind === 'done' || b.kind === 'lateDone';
  const elapsed = isDone ? (b.end - b.start) : (nowMin - b.start);
  const total = Math.max(elapsed, est, 1);
  return { fill: Math.max(0, Math.min(100, (elapsed / total) * 100)), tick: Math.max(0, Math.min(100, (est / total) * 100)), empty: false };
};

// تاريخُ اليومِ بالإنجليزيّةِ دونَ اعتمادٍ على locale (كي لا يتغيّرَ الشكلُ بين الأجهزة)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtToday = (): string => { const d = new Date(); return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

// ═══════════════ الخلفيةُ الحيّة (كُراتٌ منجرفةٌ داخلَ المخطّطِ المكبّر) ═══════════════
// نافذةُ المخطّطِ طبقةٌ مستقلّةٌ (Modal) لا ترثُ كُراتِ الصفحة، فنُعيدُها هنا بنفسِ الألوانِ والمواضع.
// حركةٌ واحدةٌ مشتركةٌ (native driver، إزاحةٌ فقط) كي لا تُثقِلَ الأداء.
type Blob = { top?: string; left?: string; right?: string; bottom?: string; size: number; color: string; dx: number; dy: number };
const BLOBS: Blob[] = [
  { top: '3%', left: '5%', size: 180, color: 'rgba(91,159,237,0.15)', dx: 30, dy: 40 },
  { top: '64%', right: '3%', size: 220, color: 'rgba(168,85,247,0.12)', dx: -25, dy: 35 },
  { bottom: '5%', left: '46%', size: 200, color: 'rgba(236,72,153,0.10)', dx: 20, dy: -30 },
  { top: '34%', left: '72%', size: 160, color: 'rgba(251,191,36,0.12)', dx: -20, dy: 25 },
  { top: '18%', right: '24%', size: 170, color: 'rgba(34,197,94,0.11)', dx: 28, dy: -32 },
  { bottom: '28%', left: '12%', size: 150, color: 'rgba(239,68,68,0.10)', dx: -18, dy: 22 },
];
function BlobField() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {BLOBS.map((b, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', top: b.top as any, left: b.left as any, right: b.right as any, bottom: b.bottom as any,
          width: scale(b.size), height: scale(b.size), borderRadius: scale(b.size / 2), backgroundColor: b.color,
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, scale(b.dx)] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, scale(b.dy)] }) },
          ],
        }} />
      ))}
    </View>
  );
}

// ═══════════════ كرتُ المريضِ في المخطّطِ المكبّر ═══════════════
function Card({ b, left, width, nowMin, onPress }:
  { b: Blk; left: number; width: number; nowMin: number; onPress: () => void }) {
  const v = CARD[b.kind]!;
  const pending = b.kind === 'fut' || b.kind === 'eld';   // شارةٌ مجوّفةٌ للمنتظِر
  const est = estMinutes(b.p);
  const dur = est;
  const caseType = (b.p.treatment && b.p.treatment !== 'Treatment') ? b.p.treatment : 'Treatment';
  // حاويةُ الوقتِ أمامَ الحالة: المدّةُ المحدَّدةُ للحالة، وتُستبدَلُ بالمتبقّي أثناءَ العلاج (والتأخيرِ إن زاد)
  const pillText = (b.kind === 'cur' || b.kind === 'over') ? chipOf(b, nowMin) : `${dur} min`;
  // بعدَ الإنجاز: وسمٌ أعلى يمينِ الكرتِ بجانبِ الاسم يوضّحُ الوقتَ الفعليَّ المستغرَق — بلا وحدةِ min
  const actualMin = Math.round(b.end - b.start);
  const showActual = (b.kind === 'done' || b.kind === 'lateDone');
  const actualTagText = b.kind === 'lateDone' ? `+${Math.max(0, actualMin - est)}` : `${actualMin}`;   // متأخّرٌ «+N» أو الوقتُ المستغرَقُ فقط «N»
  // سطرُ «End time»: المنجَزُ يُظهِرُ وقتَ الانتهاءِ الحقيقيَّ (b.end) كي يكملَ الخطُّ الزمنيُّ سيرَه واقعيًّا؛ وغيرُه الوقتَ المحدَّد/المتوقَّع
  const endMin = showActual ? b.end : b.start + est;
  // «غيرُ المتاح»: بدلَ وقتِ الانتهاء نعرضُ وقتَ ندائِه (لحظةَ صيرورتِه غيرَ متاح) — نُودِيَ ولم يكنْ حاضرًا
  const naMin = b.kind === 'na' ? minutesOfDay(b.p.na_at) : null;
  const bar = barInfo(b, nowMin);
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress}
      style={[cs.card, { left, width, borderColor: v.border ?? 'rgba(255,255,255,0.6)' },
        v.dashed ? { borderStyle: 'dashed', borderWidth: scale(1.5) } : null,
        v.shadow ? { shadowColor: v.shadow, shadowOpacity: 0.5, shadowRadius: scale(12), shadowOffset: { width: 0, height: scale(8) }, elevation: 6 }
                 : { shadowColor: '#0A2834', shadowOpacity: 0.14, shadowRadius: scale(10), shadowOffset: { width: 0, height: scale(6) }, elevation: 3 }]}>
      {/* طبقةٌ داخليّةٌ تُقصُّ (overflow) لتحتضنَ الخلفيّةَ والأقواسَ دونَ أن تبتلعَ ظلَّ الكرتِ الخارجيّ */}
      <View pointerEvents="none" style={[cs.clip, v.bg ? { backgroundColor: v.bg } : null]}>
        {v.grad ? <LinearGradient colors={v.grad as any} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
        {/* أقواسُ الركنِ المتراكزة (نسيجُ الهويّة) */}
        <View style={[cs.arc, { width: scale(44), height: scale(44), right: scale(-22), bottom: scale(-22), borderColor: v.ink, opacity: 0.16 }]} />
        <View style={[cs.arc, { width: scale(74), height: scale(74), right: scale(-37), bottom: scale(-37), borderColor: v.ink, opacity: 0.11 }]} />
        <View style={[cs.arc, { width: scale(108), height: scale(108), right: scale(-54), bottom: scale(-54), borderColor: v.ink, opacity: 0.07 }]} />
        {/* التأثيرُ الضوئيّ: بريقٌ يتلاشى عندَ الحافّةِ العليا + وميضٌ زاويٌّ خفيفٌ من الأعلى */}
        <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} start={{ x: 0.2, y: 0 }} end={{ x: 0.7, y: 0.9 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={cs.gloss} />
        <View style={[cs.spine, { backgroundColor: v.ink, opacity: v.grad ? 0.7 : 0.55 }]} />
      </View>
      <View style={cs.row1}>
        <View style={[cs.badge, pending ? { borderWidth: scale(1.5), borderColor: v.badgeInk, borderStyle: 'dashed' } : { backgroundColor: v.badgeBg }]}>
          <Text style={[cs.badgeTxt, { color: v.badgeInk }]}>{b.p.queue_number}</Text>
        </View>
        <Text style={[cs.name, { color: v.ink }]} numberOfLines={1}>{b.p.name}</Text>
        {/* أعلى يمينِ الكرت بجانبِ الاسم: وسمُ الوقتِ الفعليِّ بعدَ الإنجاز (أخضرُ = المستغرَق، أحمرُ = +التأخير)، وإلّا شارةُ الهويّةِ لكبيرِ السنّ/غيرِ المتاح */}
        {showActual ? (
          <View style={[cs.tPill, b.kind === 'lateDone' ? cs.actualLate : cs.actualEarly]}>
            <Text style={[cs.tPillTxt, { color: '#FFFFFF' }]} numberOfLines={1}>{actualTagText}</Text>
          </View>
        ) : (b.kind === 'eld') ? (
          <View style={cs.chip}>
            <Text style={[cs.chipTxt, { color: v.ink }]} numberOfLines={1}>{chipOf(b, nowMin)}</Text>
          </View>
        ) : null}
      </View>
      {/* تحتَ الاسم: حاويةُ الوقتِ أمامَ نوعِ الحالة (Filling / Extraction …) — وسطرُ End time يبقى مكانَه بالأسفل.
          «غيرُ المتاح» يعرضُ نفسَ معلوماتِ المنتظِر — يتغيّرُ لونُ الكرتِ فقط. */}
      <View style={cs.metaRow}>
        <Text style={[cs.mCase, { color: v.ink }]} numberOfLines={1}>{caseType}</Text>
        <View style={[cs.tPill, { backgroundColor: v.trk }]}>
          <Text style={[cs.tPillTxt, { color: v.ink }]} numberOfLines={1}>{pillText}</Text>
        </View>
      </View>
      <View style={[cs.bar, { backgroundColor: v.trk }]}>
        {!bar.empty ? <View style={[cs.barFill, { width: `${bar.fill}%` as any, backgroundColor: v.fil }]} /> : null}
        {!bar.empty && bar.tick >= 0 && bar.tick < 99.5 ? <View style={[cs.barTick, { left: `${bar.tick}%` as any, backgroundColor: v.ink }]} /> : null}
      </View>
      {b.kind === 'na'
        ? <Text style={[cs.time, { color: v.ink }]} numberOfLines={1}>{naMin != null ? `Called ${fmtHM(naMin)}` : 'Not available'}</Text>
        : <Text style={[cs.time, { color: v.ink }]} numberOfLines={1}>{b.p.appointment_min != null ? '🕐 ' : ''}End time {fmtHM(endMin)}</Text>}
      {b.p.doctor_name ? (
        <View style={cs.docRow}>
          <Ionicons name="person" size={scale(9)} color={v.ink} />
          <Text style={[cs.doc, { color: v.ink }]} numberOfLines={1}>{b.p.doctor_name}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ═══════════════ المكبّر (ملء الشاشة) ═══════════════
// readOnly: عرضُ يومٍ مضى من الأرشيف. المخطّطُ نفسُه بلا يدٍ تُغيّره — لا محاكاةَ ولا
// تحريرَ بريكاتٍ ولا إجراءاتِ مريض. اليومُ انتهى، وما يُعرَضُ خبرٌ عنه لا تحكُّمٌ فيه.
function FullTimeline({ visible, onClose, data, nowMin, topInset, bottomInset, sim, breaks, onSaveBreaks, chairCount, onSetChairCount, actions, readOnly, title, subtitle }:
  { visible: boolean; onClose: () => void; data: TimelineData; nowMin: number; topInset: number; bottomInset: number;
    sim: { on: boolean; playing: boolean; speed: number; toggle: () => void; playPause: () => void; cycleSpeed: () => void; reset: () => void };
    breaks: Break[]; onSaveBreaks: (b: Break[]) => void;
    chairCount: number; onSetChairCount: (n: number) => void; actions: BlockActions;
    readOnly?: boolean; title?: string; subtitle?: string }) {
  const { lanes, dayStart, dayEnd } = data;
  const [actionId, setActionId] = useState<string | null>(null);   // المريضُ المفتوحةُ نافذتُه
  const [editingBreaks, setEditingBreaks] = useState(false);
  const [draft, setDraft] = useState<Break[]>([]);
  const [breakActionOrig, setBreakActionOrig] = useState<number | null>(null);   // بدايةُ البريكِ الملموسِ (لنافذةِ ثابت/متحرّك)
  const [beyondLane, setBeyondLane] = useState<string | null>(null);             // عيادةُ شارةِ «خلفَ الشفت» المفتوحة
  const [chairDraft, setChairDraft] = useState(chairCount);
  const openEditor = () => {
    setDraft(breaks.map((b) => ({ ...b })));
    setChairDraft(chairCount);
    setEditingBreaks(true);
  };
  const saveEditor = () => {
    onSaveBreaks(draft.filter((b) => b.end > b.start).sort((a, b) => a.start - b.start));
    if (chairDraft !== chairCount) onSetChairCount(chairDraft);
    setEditingBreaks(false);
  };
  // البريكُ الملموس + ضبطُ نوعِه (ثابتٌ لا يتحرّك / متحرّكٌ يُدفَعُ بانشغالٍ حقيقيّ) — يُطابَقُ ببدايتِه الأصليّة
  const actBreak = breakActionOrig != null ? breaks.find((b) => b.start === breakActionOrig) : null;
  const setBreakFixed = (fixed: boolean) => {
    if (breakActionOrig == null) return;
    onSaveBreaks(breaks.map((b) => (b.start === breakActionOrig ? { ...b, fixed } : b)));
    setBreakActionOrig(null);
  };
  const cancelBreak = () => {   // حذفُ البريكِ نهائيًّا من إعداداتِ المركز
    if (breakActionOrig == null) return;
    onSaveBreaks(breaks.filter((b) => b.start !== breakActionOrig));
    setBreakActionOrig(null);
  };
  const HOUR_W = scale(200);                        // اتّساعُ الساعةِ الواحدة — أوسعُ كي يقتربَ عرضُ الكرتِ من امتدادِه الزمنيِّ الحقيقيّ (فيبقى داخلَ نطاقِ ساعتِه)
  // topH = رأسُ الجدول: شريطٌ عريضٌ يحملُ محورَ الأوقاتِ الثابت (7:00 8:00 …) مرجعًا للكلِّ العيادات
  const laneH = scale(96), stripH = scale(17), topH = scale(38), labelW = scale(64);
  const unitH = stripH + laneH;                    // شريطُ الأوقات + كروتُ العيادة = وحدةٌ واحدة
  const GAP = scale(8);                             // فجوةٌ دنيا بين كلِّ كرتَين متجاورَين (كي لا تلتصقَ الكروت)
  const MIN_IDLE = scale(12);                       // حدٌّ أدنى مرئيٌّ لخيطِ الفراغِ (للفجواتِ الصغيرةِ جدًّا فقط) — لا يُضافُ فوقَ المتناسبِ، فتبقى المسافةُ دقيقةً للأكبر
  const minWOf = (k: Kind): number => (k === 'cur' || k === 'over') ? scale(120) : scale(132);   // الجاري صارَ كرتًا كاملًا (يمشي عليه الخطُّ) فيحتاجُ عرضًا مقروءًا
  const hours: number[] = [];
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h);

  // ═══ محورٌ زمنيٌّ مشتركٌ لكلِّ العيادات ═══
  // خطّيٌّ بالوقتِ الحقيقيّ، ويتمدّدُ فقط حيثُ تتزاحمُ الكروتُ كي لا تتراكبَ (لا يضغطُ دونَ الوقت).
  // كلُّ العياداتِ تشتركُ فيه: الساعاتُ الثابتةُ في الرأسِ فوقَه، وكلُّ كرتٍ تحتَها في موضعِه الزمنيِّ الحقيقيِّ نفسِه —
  // والساعاتُ تتباعدُ حيثُ يلزمُ لتُفسِحَ للكروت. (يُصلِحُ أيضًا انزياحَ خطِّ الآنَ لأنّه يقرأُ المحورَ نفسَه.)
  const axis = useMemo(() => {
    const anchorSet = new Set<number>([dayStart, dayEnd, nowMin]);
    for (const l of lanes) for (const b of l.blocks) { anchorSet.add(b.start); anchorSet.add(b.end); }
    for (let h = dayStart / 60; h <= dayEnd / 60; h++) { anchorSet.add(h * 60); if (h * 60 + 30 <= dayEnd) anchorSet.add(h * 60 + 30); }
    const anchors = Array.from(anchorSet).sort((a, b) => a - b);
    const predOf = new Map<Blk, Blk>();               // سابقُ كلِّ كتلةٍ في عيادتِها
    const startsAt = new Map<number, Blk[]>();         // كتلٌ تبدأُ عند كلِّ وقت
    for (const l of lanes) for (let i = 0; i < l.blocks.length; i++) {
      const b = l.blocks[i];
      if (i > 0) predOf.set(b, l.blocks[i - 1]);
      const arr = startsAt.get(b.start); if (arr) arr.push(b); else startsAt.set(b.start, [b]);
    }
    const xm = new Map<number, number>();
    xm.set(anchors[0], 0);
    for (let i = 1; i < anchors.length; i++) {
      const t = anchors[i], pt = anchors[i - 1];
      let xx = (xm.get(pt) as number) + ((t - pt) / 60) * HOUR_W;   // تباعدٌ طبيعيٌّ بالوقت
      const bs = startsAt.get(t);
      if (bs) for (const b of bs) {
        const p = predOf.get(b); if (!p) continue;
        const xpS = xm.get(p.start) as number;
        // الكرتُ يبدأُ بعدَ سابقِه في عيادتِه: عرضُه الأدنى المقروء (أو امتدادُه الزمنيّ) + فجوة.
        // الفراغُ الزمنيُّ الحقيقيُّ (≥١د — ينتهي مريضٌ ثمّ يتأخّرُ دخولُ التالي) مسافتُه **دقيقةٌ متناسبةٌ مع الدقائق**
        // (تأتي طبيعيًّا من xx)؛ نضمنُ فقط حدًّا أدنى مرئيًّا للخيطِ (MIN_IDLE) بلا إضافةٍ فوقَ المتناسبِ — فلا يتشوّهُ الأكبر.
        // المنجَزُ (done/lateDone) يُثبَّتُ يمينُه على وقتِ إنجازِه ويمتدُّ يسارًا (قاعدةُ الاقتراض) — فلا نحجزُ عرضَه الأدنى
        // إلى يمينِه (وإلّا ظهرَ فراغٌ زائفٌ = فائضُ عرضِه)، بل تُدارُ مسافتُه من نهايتِه فقط فتصيرُ الفجوةُ دقيقةً حقًّا.
        const pDone = p.kind === 'done' || p.kind === 'lateDone';
        const idleFloor = (p.end < t && t - p.end >= 1) ? MIN_IDLE : 0;
        const cand = p.end < t
          ? (pDone
              ? (xm.get(p.end) as number) + Math.max(GAP, idleFloor)
              : Math.max(xpS + minWOf(p.kind) + GAP, (xm.get(p.end) as number) + Math.max(GAP, idleFloor)))
          : (pDone
              ? xpS                                          // منجَزٌ متتالٍ بلا فراغ — لا قيدَ يمينَه، والفجوةُ الدنيا (GAP) تُدارُ في الرسمِ (rightBound)
              : Math.max(xpS + minWOf(p.kind) + GAP, xpS + ((p.end - p.start) / 60) * HOUR_W + GAP));
        if (cand > xx) xx = cand;
      }
      xm.set(t, xx);
    }
    return { anchors, xm };
  }, [lanes, dayStart, dayEnd, nowMin]);

  // زمنٌ → بكسل: إصابةٌ مباشرةٌ من المرساة (كلُّ أوقاتِنا مراسٍ)، وإلّا استيفاءٌ خطّيٌّ بين أقربِ مرساتين
  const xAt = (t: number): number => {
    const { anchors, xm } = axis;
    const hit = xm.get(t); if (hit !== undefined) return hit;
    let lo = anchors[0], hi = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length; i++) { if (anchors[i] <= t) lo = anchors[i]; if (anchors[i] >= t) { hi = anchors[i]; break; } }
    if (hi === lo) return xm.get(lo) as number;
    return (xm.get(lo) as number) + (t - lo) / (hi - lo) * ((xm.get(hi) as number) - (xm.get(lo) as number));
  };
  const nowX = xAt(nowMin);

  // يُفتَحُ المخطّطُ على الآنَ — لا على أوّلِ اليوم. فالساعةُ هي ما جئتَ تنظرُ إليه،
  // ولا معنى لأن تُمرّرَ باحثًا عنها في كلِّ مرّةٍ تفتحُ فيها الصفحة. نتركُ قليلًا من
  // الماضي على اليسارِ لِيُقرأَ السياقُ (مَن كان قبلَ قليل).
  const hScroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      hScroll.current?.scrollTo({ x: Math.max(0, nowX - scale(90)), animated: false });
    }, 0);
    return () => clearTimeout(id);
    // عندَ الفتحِ فقط: بعدَ ذلك التمريرُ لك، فلا يُخطَفُ منك مع كلِّ دقيقة
  }, [visible]);

  // الكتلةُ (والمريضُ) المفتوحةُ نافذتُها — تُقرأُ من المساراتِ الحيّةِ لا من لقطة، فتعكسُ الحالةَ اللحظيّة.
  const actBlk = actionId ? (lanes.flatMap((l) => l.blocks).find((b) => b.p.id === actionId) ?? null) : null;
  const actP = actBlk?.p ?? null;
  const actNA = actBlk?.kind === 'na';
  const actEntered = actBlk ? (actBlk.kind === 'cur' || actBlk.kind === 'over') : false;

  // حالُ كلِّ كرسيٍّ الآنَ (لِشرائحِ الاختيارِ في النافذة): مشغولٌ إن كان فيه مريضٌ جارٍ، وإلّا فارغ
  const chairStatus = lanes.map((l) => {
    const live = l.blocks.find((b) => b.kind === 'cur' || b.kind === 'over');
    return live ? { free: false, till: live.start + estMinutes(live.p) } : { free: true, till: null as number | null };
  });

  // انزلاقُ نافذةِ الإجراءاتِ ومحرِّرِ البريك (دخولٌ فقط، native driver — لا يُثقِلُ الأداء)
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const editAnim = useRef(new Animated.Value(0)).current;
  const brkAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (actionId) { sheetAnim.setValue(0); Animated.timing(sheetAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
  }, [actionId, sheetAnim]);
  useEffect(() => {
    if (editingBreaks) { editAnim.setValue(0); Animated.timing(editAnim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
  }, [editingBreaks, editAnim]);
  useEffect(() => {
    if (breakActionOrig != null) { brkAnim.setValue(0); Animated.timing(brkAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
  }, [breakActionOrig, brkAnim]);
  // نبضةُ نقطةِ «الحيّ» في الرأس (حلقةٌ واحدةٌ مشتركة، native driver)
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  // تخطيطُ الكروت لكلِّ مسار: عرضٌ أدنى يُقرأ + فجوةٌ بينها، ويُدفَعُ لليمينِ عندَ التزاحمِ فلا يتداخلُ كرتان.
  // وحيثُ توجدُ فجوةُ فراغٍ زمنيّةٌ نُوسّعُ المسافةَ قليلًا كي يظهرَ خيطُها ولو كانتِ الفجوةُ دقائقَ معدودة.
  // تخطيطُ الكروت من المحورِ المشترك: كلُّ كرتٍ في موضعِه الزمنيِّ الحقيقيِّ (left = xAt(البداية))،
  // وعرضُه يمتدُّ إلى نهايتِه الزمنيّةِ (أو الحدُّ الأدنى المقروء)، مقصوصًا كي لا يتجاوزَ تاليَه في العيادة.
  const CHIP_W = scale(44);                        // شارةُ «خلفَ الشفت» — تُحجَزُ لها مساحةٌ قبلَ التبديل
  const laidLanes = lanes.map((l) => {
    // خطوطُ تبديلِ الشفتِ في هذه العيادة — حواجزُ رسمٍ صلبة
    const walls = l.blocks.filter((b) => b.kind === 'break' && b.fixed).map((b) => b.start);
    const chipWall = l.blocks.find((b) => b.kind === 'break' && b.fixed);   // حيثُ تلتصقُ شارةُ «خلفَ الشفت»
    return l.blocks.map((b, i) => {
      const left = xAt(b.start);
      const succ = l.blocks[i + 1];
      const rawW = Math.max(minWOf(b.kind), xAt(b.end) - left);
      const chipRoom = (succ && succ === chipWall && l.beyond.length > 0) ? CHIP_W + GAP : 0;
      const capW = succ ? (xAt(succ.start) - GAP - chipRoom - left) : Infinity;   // لا يتجاوزُ بدايةَ تاليه
      let width = Math.max(minWOf(b.kind), Math.min(rawW, capW));
      // ── حائطُ الرسم ──
      // الكرتُ يُرسَمُ بعرضٍ أدنى مقروءٍ مهما قصُرَت مدّتُه، فكرتُ نصفِ ساعةٍ يُطلى أعرضَ من
      // نصفِ ساعة. ولهذا كانت كروتُ الانتظارِ تعبرُ خطَّ التبديلِ **رسمًا** وإن كان جدولُها
      // سليمًا. فهنا حاجزٌ صلب: لا بكسلَ واحدًا يتجاوزُ الخطَّ — يضيقُ الكرتُ ولا يعبر.
      // (الجاري والمنجَزُ لا يُقصّان: هما واقعٌ حدثَ، لا تنبّؤٌ يُربِكُ الشفتَ التالي.)
      if (b.kind === 'fut' || b.kind === 'eld' || b.kind === 'na') {
        const wall = walls.find((w) => b.start < w);
        if (wall != null) width = Math.min(width, Math.max(scale(1), xAt(wall) - GAP - left));
      }
      const prev = i > 0 ? l.blocks[i - 1] : null;
      const prevEnd = prev ? ((prev.kind === 'cur' || prev.kind === 'over') ? Math.max(prev.end, prev.start + estMinutes(prev.p)) : prev.end) : -Infinity;
      const idle = prev ? (b.start - prevEnd) : 0;   // فراغٌ زمنيٌّ قبلَها (لخيطِ الفراغِ المنقّط)
      return { b, left, width, idle };
    });
  });
  // ═══ الكروتُ المنجَزةُ خلفَ خطِّ الآنَ: اقتراضٌ ثمّ عودةٌ تدريجيّة ═══
  // كلُّ منجَزٍ مثبَّتٌ بيمينِه على وقتِ إنجازِه (≤ الآنَ فيبقى خلفَ الخطّ) ويمتدُّ يسارًا بعرضٍ مقروء.
  // إن لم يتّسعِ المكانُ خلفَه دفعَ المنجَزَ الأسبقَ إلى الخلفِ (يقترضُ مكانَه مؤقّتًا فيصيرُ موضعُه «خطأً» زمنيًّا)،
  // ثمّ يعودُ كلٌّ إلى موضعِه الحقيقيِّ حينَ يتّسعُ المحورُ (بدخولِ التالي/تقدُّمِ الوقت). يمسُّ المنجَزاتِ المتصدّرةَ فقط.
  laidLanes.forEach((laid) => {
    let rightBound = Infinity;                              // أقصى يمينٍ متاحٍ للكرتِ الحاليِّ (يتضاءلُ يسارًا)
    for (let i = laid.length - 1; i >= 0; i--) {
      const o = laid[i];
      if (o.b.kind !== 'done' && o.b.kind !== 'lateDone') { rightBound = o.left - GAP; continue; }
      const desiredW = Math.max(minWOf(o.b.kind), (estMinutes(o.b.p) / 60) * HOUR_W);   // حجمُه الطبيعيُّ (بالمدّةِ المحدَّدة) فلا ينكمشُ بعدَ الإنجاز
      const right = Math.min(xAt(o.b.end), rightBound);                      // يمينُه = وقتُ إنجازِه، أو ما قبلَ تاليه
      const left = Math.max(0, right - desiredW);                            // لا يُدفَعُ خارجَ الحافّةِ اليسرى — يتقلّصُ بدلَ أن يختفي
      o.left = left; o.width = Math.max(scale(1), right - left);
      rightBound = left - GAP;
    }
  });

  const maxRight = laidLanes.reduce((mx, arr) => arr.reduce((m, p) => Math.max(m, p.left + p.width), mx), 0);
  const contentW = Math.max(xAt(dayEnd), maxRight + scale(24));

  // شريطُ أوقاتٍ خاصٌّ بكلِّ عيادة: بداياتُ كروتِها فوقَها (متحرِّكةٌ مع الدور)، أو الساعاتُ الافتراضيّة إن كانت فارغة.
  const LBL_GAP = scale(40);
  const strips = laidLanes.map((laid) => {
    if (!laid.length) return null;
    const ticks: { left: number; label: string }[] = [];
    let lastR = -Infinity;
    for (const { b, left } of laid) {
      if (left < lastR + LBL_GAP) continue;
      ticks.push({ left, label: fmtHM(b.start) });
      lastR = left;
    }
    return ticks;
  });

  // حِملُ كلِّ عيادة (نسبةُ امتلاءِ اليوم) + هل هي مشغولةٌ الآن — لعمودِ العياداتِ الأيسر
  const laneMeta = lanes.map((l) => {
    const busy = l.blocks.some((b) => b.kind === 'cur' || b.kind === 'over');
    const filled = l.blocks.reduce((s, b) => s + ((b.kind === 'break' || b.kind === 'na') ? 0 : (b.end - b.start)), 0);
    return { busy, load: Math.max(0, Math.min(1, filled / Math.max(1, dayEnd - dayStart))) };
  });

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <LinearGradient colors={BG_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <BlobField />
        <View style={{ flex: 1, paddingTop: Math.max(topInset, scale(24)), paddingBottom: Math.max(bottomInset, scale(8)) }}>
          {/* الرأس: التاريخُ ثمّ العنوانُ والساعةُ الكبيرة */}
          <View style={full.head}>
            <View style={full.headTop}>
              <Text style={full.eyebrow}>{title ?? fmtToday()}</Text>
              <View style={{ flex: 1 }} />
              {!readOnly && (
                <TouchableOpacity style={[full.iconBtn, full.breakBtn]} activeOpacity={0.85} onPress={openEditor}>
                  <LinearGradient colors={['rgba(253,246,231,0.97)', 'rgba(243,223,183,0.94)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={full.breakBtnFill} />
                  <View style={full.breakBtnDot}><Text style={full.breakBtnIcon}>⚙︎</Text></View>
                  <Text style={full.breakBtnTxt}>Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={full.iconBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={full.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <View style={full.titleRow}>
              <View style={{ flexShrink: 1 }}>
                <Text style={full.title}>{readOnly ? 'Day chart' : "Today's chairs"}</Text>
                <Text style={full.sub}>{subtitle ?? `${lanes.length} clinics · ${fmtHM(dayStart)} – ${fmtHM(dayEnd)}`}</Text>
              </View>
              <View style={full.clockWrap}>
                <Text style={full.clockT}>{fmtHM(nowMin)}</Text>
                <View style={full.clockL}>
                  {!readOnly && (
                    <View style={full.clockDotWrap}>
                      <Animated.View pointerEvents="none" style={[full.clockRing, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} />
                      <View style={full.clockDot} />
                    </View>
                  )}
                  <Text style={full.clockLTxt}>{readOnly ? 'SAVED' : sim.on ? 'SIM' : 'LIVE'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* شريطُ المحاكاة (مسرِّعٌ زمنيّ للاختبار) — لا معنى له في يومٍ مضى */}
          {!readOnly && (
          <View style={full.simBar}>
            <TouchableOpacity onPress={sim.toggle} style={[full.simMain, sim.on && full.simMainOn]}>
              <Text style={[full.simMainTxt, sim.on && { color: '#fff' }]}>{sim.on ? '● محاكاة' : '▶ محاكاة يوم'}</Text>
            </TouchableOpacity>
            {sim.on && (
              <>
                <TouchableOpacity onPress={sim.reset} style={full.simCtl}><Text style={full.simCtlTxt}>⏮</Text></TouchableOpacity>
                <TouchableOpacity onPress={sim.playPause} style={full.simCtl}><Text style={full.simCtlTxt}>{sim.playing ? '⏸' : '▶'}</Text></TouchableOpacity>
                <TouchableOpacity onPress={sim.cycleSpeed} style={full.simCtl}><Text style={full.simCtlTxt}>{sim.speed} د/ث</Text></TouchableOpacity>
              </>
            )}
            <View style={{ flex: 1 }} />
            {sim.on ? <Text style={full.simTag}>اختبار</Text> : null}
          </View>
          )}
          {!readOnly && sim.on && (
            <Text style={full.simHint}>انقرِ المريضَ على المخطّطِ لتفتحَ إجراءاتِه — لا شيءَ تلقائيّ.</Text>
          )}

          {/* لوحُ المخطّطِ الزجاجيّ — ظلٌّ خارجيٌّ لا يُقصُّ + حافّةٌ عليا مضيئة، وتمريرٌ عموديٌّ للعياداتِ الكثيرة.
              maxHeight = مقاسُ العياداتِ نفسِها (الرأسُ + عددُ العيادات) فيهبطُ اللوحُ على قدرِها ولا يتمدّدُ؛
              وإن كثُرتِ العياداتُ حتّى تجاوزتِ الشاشةَ يتقيّدُ بارتفاعِها ويعملُ التمريرُ العموديّ. */}
          <View style={[full.panelShadow, { maxHeight: topH + lanes.length * unitH + scale(2) }]}>
          <View style={full.panel}>
            <View pointerEvents="none" style={full.panelTopHi} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ flexDirection: 'row', height: Math.max(topH + lanes.length * unitH, scale(1)) }}>
              {/* عمودُ العيادات: رقمٌ شبحيٌّ كبيرٌ + نقطةُ انشغالٍ + شريطُ امتلاء — بفاصلٍ رأسيٍّ عن الجدول */}
              <View style={[full.railCol, { width: labelW }]}>
                {/* ركنُ الرأس: نفسُ خلفيّةِ محورِ الأوقات كي يمتدَّ الرأسُ عرضَ الجدولِ كلِّه (يبقى ثابتًا عند التمرير) */}
                <View style={[full.railHead, { height: topH }]}>
                  <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                </View>
                {lanes.map((l, li) => (
                  <View key={l.clinic} style={[full.railCell, { height: unitH }]}>
                    <View style={[full.railDot, !laneMeta[li].busy && full.railDotFree]} />
                    <Text style={[full.railNo, laidLanes[li].length === 0 && full.railNoFree]}>{clinicNum(l.clinic) || (li + 1)}</Text>
                    <Text style={full.railName}>Clinic</Text>
                    <View style={full.railBar}><LinearGradient colors={['#7DD3C0', '#0E7C66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[full.railBarFill, { width: `${laneMeta[li].load * 100}%` as any }]} /></View>
                  </View>
                ))}
              </View>

              {/* المساراتُ القابلةُ للتمرير أفقيًّا */}
              <ScrollView
                ref={hScroll}
                horizontal
                style={{ flex: 1 }}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ width: contentW }}
              >
                <View style={{ width: contentW, height: topH + lanes.length * unitH }}>
                  {/* خلفيّةُ المستقبل: نقشٌ قطريٌّ يمينَ خطِّ الآنَ (تنبّؤٌ لا واقع) */}
                  {contentW > nowX + 2 ? (
                    <Svg pointerEvents="none" style={{ position: 'absolute', top: topH, left: nowX }} width={contentW - nowX} height={lanes.length * unitH}>
                      <Defs>
                        <Pattern id="futHatch" width={7} height={7} patternUnits="userSpaceOnUse">
                          <SvgLine x1={0} y1={7} x2={7} y2={0} stroke="rgba(18,58,68,0.06)" strokeWidth={1} />
                        </Pattern>
                      </Defs>
                      <SvgRect x={0} y={0} width={contentW - nowX} height={lanes.length * unitH} fill="url(#futHatch)" />
                    </Svg>
                  ) : null}
                  {/* رأسُ الجدول: محورُ أوقاتٍ ثابتٌ (7:00 8:00 …) يمتدُّ عرضَ الجدولِ كلِّه؛ والأعمدةُ الزمنيّةُ تنزلُ خلالَه */}
                  <View pointerEvents="none" style={[full.ruler, { width: contentW, height: topH }]}>
                    <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                    {hours.map((h) => (
                      <React.Fragment key={'r' + h}>
                        <Text style={[full.rTick, { left: xAt(h * 60) }]} numberOfLines={1}>{h}:00</Text>
                        <View pointerEvents="none" style={[full.rTickMark, { left: xAt(h * 60) }]} />
                        {h * 60 + 30 <= dayEnd ? <View pointerEvents="none" style={[full.rHalf, { left: xAt(h * 60 + 30) }]} /> : null}
                      </React.Fragment>
                    ))}
                  </View>
                  {/* خطوطُ التقسيم: أعمدةُ الساعاتِ الرأسيّةُ تمتدُّ من الرأسِ إلى أسفلِ الجدول (top:0) + فواصلُ العيادات الأفقيّة */}
                  {hours.map((h) => <View key={'gv' + h} pointerEvents="none" style={[full.gridV, { left: xAt(h * 60), top: 0 }]} />)}
                  {lanes.map((l, li) => <View key={'gh' + li} pointerEvents="none" style={[full.gridH, { top: topH + li * unitH, width: contentW }]} />)}
                  {lanes.map((l, li) => {
                    const uTop = topH + li * unitH;
                    const st = strips[li];
                    const laid = laidLanes[li];
                    return (
                      <React.Fragment key={l.clinic}>
                        {/* شريطُ أوقاتِ العيادة: بداياتُ المرضى (متحرِّكة) أو الساعاتُ الافتراضيّة */}
                        <View style={[full.strip, { top: uTop, width: contentW, height: stripH }]}>
                          {st
                            ? st.map((tk, ti) => (
                                <React.Fragment key={ti}>
                                  <Text style={[full.startTick, { left: tk.left }]} numberOfLines={1}>{tk.label}</Text>
                                  <View style={[full.startTickMark, { left: tk.left + scale(1) }]} />
                                </React.Fragment>
                              ))
                            : hours.map((h) => (
                                <Text key={h} style={[full.hourTick, { left: xAt(h * 60) }]}>{h}:00</Text>
                              ))}
                        </View>
                        {/* صفُّ العيادة */}
                        <View style={[full.laneRow, { top: uTop + stripH, height: laneH }]}>
                          {/* «خلفَ الشفت»: مَن انتهى شفتُه قبلَ أن يأتيَ دورُه — سيرحل. لا نرسمُ له
                              كرتًا في شفتٍ ليس شفتَه؛ شارةٌ ملاصقةٌ لكرتِ التبديلِ من اليسارِ
                              تقولُ كم هم، وبالنقرِ تظهرُ أسماؤهم. */}
                          {l.beyond.length > 0 && (() => {
                            // تلتصقُ بأوّلِ تبديلٍ في العيادةِ من **يسارِه** دائمًا — مهما مضى الوقت.
                            // فهي تقولُ «هؤلاء وقفوا هنا ولم يعبروا»، ولو رحلَتْ يمينَه لقالتْ عكسَ ذلك.
                            const wall = l.blocks.find((b) => b.kind === 'break' && b.fixed);
                            const left = wall
                              ? xAt(wall.start) - CHIP_W - GAP
                              : laid.reduce((m, o) => Math.max(m, o.left + o.width), scale(8)) + GAP;
                            return (
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => setBeyondLane(l.clinic)}
                                style={[full.beyond, { left, width: CHIP_W }]}
                              >
                                <Text style={full.beyondN}>+{l.beyond.length}</Text>
                                <Text style={full.beyondL}>next</Text>
                              </TouchableOpacity>
                            );
                          })()}
                          {/* عيادةٌ بلا مرضى */}
                          {laid.length === 0 ? (
                            <View style={[full.vacant, { left: scale(8), width: contentW - scale(16) }]}>
                              <View style={[full.vacantPill, { left: Math.max(scale(4), nowX - scale(104)) }]}>
                                <Ionicons name="bed-outline" size={scale(14)} color="#8CA0A8" />
                                <Text style={full.vacantTxt}>Chair free</Text>
                              </View>
                            </View>
                          ) : null}
                          {/* خيوطُ الفراغِ الصامتةُ بين مريضَين — تظهرُ لأيِّ فراغٍ ≥ دقيقةٍ واحدة، وطولُها متناسبٌ مع الوقتِ الحقيقيّ */}
                          {laid.map((o, i) => {
                            if (i === 0 || o.idle < 1) return null;
                            const prev = laid[i - 1];
                            const gx = prev.left + prev.width;
                            const gw = o.left - gx;
                            if (gw < scale(5)) return null;
                            const lineW = Math.max(scale(1), gw - scale(8));
                            return (
                              <React.Fragment key={'idle' + i}>
                                {/* الوقتُ الحقيقيُّ المتاحُ فوقَ الخيط (بين مريضَين، أو بين آخرِ مريضٍ والبريك) — يظهرُ دائمًا ولو دقيقة */}
                                <Text pointerEvents="none" numberOfLines={1} style={[full.idleLabel, { left: gx + gw / 2 - scale(28), width: scale(56), top: laneH / 2 - scale(15) }]}>{fmtGap(o.idle)}</Text>
                                {/* خيطُ النقطِ المتّصلُ عبرَ كاملِ المسافة (svg — لا ينقطعُ مهما بَعُدت) */}
                                <Svg pointerEvents="none" style={{ position: 'absolute', left: gx + scale(4), top: laneH / 2 - scale(1), width: lineW, height: scale(3) }} width={lineW} height={scale(3)}>
                                  <SvgLine x1={0} y1={scale(1.5)} x2={lineW} y2={scale(1.5)} stroke="rgba(140,160,168,0.75)" strokeWidth={scale(2)} strokeDasharray={`${scale(2)} ${scale(5)}`} strokeLinecap="round" />
                                </Svg>
                              </React.Fragment>
                            );
                          })}
                          {/* الكتل: استراحةٌ كريميّةٌ أو كرتُ مريض */}
                          {laid.map(({ b, left, width }, i) => {
                            if (b.kind === 'break') {
                              const moved = b.orig != null && b.orig !== b.start;
                              return (
                                <TouchableOpacity key={i} activeOpacity={0.8} style={[full.brk, b.fixed && full.brkFixed, { left, width }]}
                                  onPress={() => { if (!readOnly) setBreakActionOrig(b.orig ?? b.start); }}>
                                  <View style={[full.brkChip, b.fixed && full.brkChipFixed]}><Text style={full.brkChipTxt}>{b.fixed ? '🔒' : '☕'}</Text></View>
                                  <Text style={[full.brkS, b.fixed && full.brkSFixed]}>{fmtHM(b.start)} · {Math.round(b.end - b.start)} min</Text>
                                  {b.fixed
                                    ? <Text style={full.brkFixedTag}>Fixed</Text>
                                    : moved ? <Text style={full.brkMoved}>was <Text style={full.brkMovedOld}>{fmtHM(b.orig!)}</Text></Text> : null}
                                </TouchableOpacity>
                              );
                            }
                            return <Card key={i} b={b} left={left} width={width} nowMin={nowMin} onPress={() => { if (!readOnly) setActionId(b.p.id); }} />;
                          })}
                        </View>
                      </React.Fragment>
                    );
                  })}
                  {/* هالةُ خطِّ الآنَ ثمّ الخطُّ ثمّ الوسم */}
                  <LinearGradient pointerEvents="none" colors={['rgba(125,211,192,0)', 'rgba(125,211,192,0.34)', 'rgba(125,211,192,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: topH, bottom: 0, left: nowX - scale(32), width: scale(64) }} />
                  <View pointerEvents="none" style={{ position: 'absolute', top: topH, bottom: 0, left: nowX, width: scale(2), backgroundColor: TEAL_INK, shadowColor: TEAL_INK, shadowOpacity: 0.5, shadowRadius: scale(6), shadowOffset: { width: 0, height: 0 }, elevation: 4 }} />
                  <View pointerEvents="none" style={[full.nowPill, { left: Math.max(0, nowX - scale(26)) }]}>
                    <Text style={full.nowPillTxt}>Now {fmtHM(nowMin)}</Text>
                  </View>
                </View>
              </ScrollView>
            </View>
            </ScrollView>
          </View>
          </View>

          {/* نافذةُ إجراءاتِ المريض (لوحٌ زجاجيٌّ ينزلقُ من الأسفل) — نفسُ إجراءاتِ الكرتِ في صفحةِ الدور */}
          {actP && (
            <View style={StyleSheet.absoluteFill}>
              {/* ضبابيّةُ الصفحةِ خلفَ النافذة (backdrop-filter الحقيقيّ) */}
              <BlurView intensity={24} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={full.sheetScrim}>
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setActionId(null)} />
              <Animated.View style={[full.sheet, { opacity: sheetAnim, transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [scale(340), 0] }) }] }]}>
                {/* طبقةُ الزجاجِ المقصوصة: تدرّجٌ لؤلؤيٌّ فوقَ ضبابِ الصفحةِ الخلفيّ + وهجٌ فيروزيٌّ علويٌّ خفيف */}
                <View style={full.sheetGlass}>
                  <LinearGradient colors={['rgba(255,255,255,0.82)', 'rgba(240,247,250,0.6)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={['rgba(125,211,192,0.18)', 'rgba(125,211,192,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.55 }} style={StyleSheet.absoluteFill} />
                </View>
                <View pointerEvents="none" style={full.sheetTopHi} />
                <View style={full.grab} />
                <View style={full.shHead}>
                  <View style={[full.shBadge, !actEntered && full.shBadgeHollow, actNA && full.shBadgeNA]}>
                    <Text style={[full.shBadgeTxt, { color: actEntered ? '#05302A' : actNA ? '#474B68' : TEAL_INK }]}>{actP.queue_number}</Text>
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={full.shName} numberOfLines={1}>{actP.name}</Text>
                    <Text style={full.shMeta} numberOfLines={1}>{(actP.treatment && actP.treatment !== 'Treatment') ? actP.treatment : 'Treatment'} · {estMinutes(actP)} min</Text>
                  </View>
                  {actBlk ? (
                    <View style={[full.shState, (actBlk.kind === 'over' || actBlk.kind === 'lateDone') ? full.shStateLate : (actEntered ? full.shStateLive : null)]}>
                      <Text style={[full.shStateTxt, { color: (actBlk.kind === 'over' || actBlk.kind === 'lateDone') ? '#7E1D18' : (actEntered ? TEAL_INK : '#5A7079') }]}>{chipOf(actBlk, nowMin)}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={full.shDivider} />

                {/* ١ — إدخالُ العيادة: كلُّ كرسيٍّ يقولُ حالَه، والمشغولُ معطَّل */}
                <Text style={full.shLabel}>Enter clinic</Text>
                <View style={full.chairRow}>
                  {lanes.map((l, li) => {
                    const cst = chairStatus[li];
                    const on = actEntered && actP.clinic === l.clinic;
                    const disabled = actNA || (!cst.free && !on);
                    return (
                      <TouchableOpacity key={l.clinic} disabled={disabled} activeOpacity={0.85}
                        style={[full.chair, on && full.chairOn, disabled && full.chairOff]}
                        onPress={() => { actions.onEnterClinic(actP.id, l.clinic); setActionId(null); }}>
                        {on ? <LinearGradient colors={['#8DE0CC', '#5FC0A9']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={full.chairFill} /> : null}
                        <Text style={[full.chairEyebrow, on && full.chairInkOn]}>CLINIC</Text>
                        <Text style={[full.chairN, on && full.chairInkOnStrong]}>{clinicNum(l.clinic) || (li + 1)}</Text>
                        <View style={full.chairStatusRow}>
                          <View style={[full.chairDot, cst.free ? full.chairDotFree : full.chairDotBusy, on && full.chairDotOn]} />
                          <Text style={[full.chairS, cst.free ? full.chairSfree : full.chairSbusy, on && full.chairInkOn]}>{cst.free ? 'free' : 'busy'}</Text>
                        </View>
                        <Text style={[full.chairT, on && full.chairInkOnDim]}>{cst.free ? 'now' : (cst.till && cst.till > nowMin ? `till ${fmtHM(cst.till)}` : 'overdue')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ٢ — غيرُ متاح (تبديل) */}
                <TouchableOpacity style={[full.actBtn, actNA && full.actBtnNAOn]} onPress={() => { actions.onToggleNA(actP.id); setActionId(null); }}>
                  <Text style={[full.actBtnTxt, actNA && full.actBtnNAOnTxt]}>{actNA ? 'Patient available' : 'Patient not available'}</Text>
                </TouchableOpacity>

                {/* ٣ — إنهاء (نفسُ مسارِ زرِّ Done) */}
                <TouchableOpacity style={[full.actDone, (!actEntered || actNA) && full.actDoneOff]} activeOpacity={0.9} disabled={!actEntered || actNA}
                  onPress={() => { setActionId(null); actions.onDone(actP.id); }}>
                  {!(!actEntered || actNA) ? <LinearGradient colors={['#12B58C', '#0B7A5E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={full.actDoneFill} /> : null}
                  <Text style={full.actDoneTxt}>Done</Text>
                </TouchableOpacity>
                {!actEntered && !actNA ? <Text style={full.hint}>اختَرْ عيادةً لإدخالِ المريضِ أوّلًا</Text> : null}
                {actNA ? <Text style={full.hint}>المريضُ خارجَ الدورِ الآن</Text> : null}

                <TouchableOpacity style={full.actClose} onPress={() => setActionId(null)}><Text style={full.actCloseTxt}>Close</Text></TouchableOpacity>
              </Animated.View>
              </View>
            </View>
          )}

          {/* نافذةُ نوعِ البريكِ (عند النقرِ على كرتِ بريك): ثابتٌ لا يتحرّك / متحرّكٌ يُدفَعُ بانشغالٍ حقيقيّ */}
          {actBreak && (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={24} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={full.sheetScrim}>
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setBreakActionOrig(null)} />
              <Animated.View style={[full.sheet, { opacity: brkAnim, transform: [{ translateY: brkAnim.interpolate({ inputRange: [0, 1], outputRange: [scale(320), 0] }) }] }]}>
                <View style={full.sheetGlass}>
                  <LinearGradient colors={['rgba(255,255,255,0.82)', 'rgba(240,247,250,0.6)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={['rgba(212,186,148,0.16)', 'rgba(212,186,148,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.55 }} style={StyleSheet.absoluteFill} />
                </View>
                <View pointerEvents="none" style={full.sheetTopHi} />
                <View style={full.grab} />
                <View style={full.shHead}>
                  <View style={full.brkHeadChip}><Text style={{ fontSize: scale(15) }}>☕</Text></View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={full.shName} numberOfLines={1}>Break · {fmtHM(actBreak.start)}</Text>
                    <Text style={full.shMeta} numberOfLines={1}>{Math.round(actBreak.end - actBreak.start)} min · applies to all clinics</Text>
                  </View>
                </View>
                <View style={full.shDivider} />
                <Text style={full.shLabel}>Break type</Text>

                {/* متحرّك */}
                <TouchableOpacity activeOpacity={0.85} style={[full.brkOpt, !actBreak.fixed && full.brkOptOn]} onPress={() => setBreakFixed(false)}>
                  <View style={[full.brkOptIcon, !actBreak.fixed && full.brkOptIconOn]}><Text style={{ fontSize: scale(17) }}>🔄</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[full.brkOptTitle, !actBreak.fixed && full.brkOptTitleOn]}>Moving break</Text>
                    <Text style={full.brkOptDesc}>Shifts forward while a chair is still busy — the normal rest.</Text>
                  </View>
                  {!actBreak.fixed ? <View style={full.brkOptTick}><Text style={full.brkOptTickTxt}>✓</Text></View> : <View style={full.brkOptRing} />}
                </TouchableOpacity>

                {/* ثابت */}
                <TouchableOpacity activeOpacity={0.85} style={[full.brkOpt, full.brkOptFixed, actBreak.fixed && full.brkOptFixedOn]} onPress={() => setBreakFixed(true)}>
                  <View style={[full.brkOptIcon, actBreak.fixed && full.brkOptIconFixedOn]}><Text style={{ fontSize: scale(16) }}>🔒</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[full.brkOptTitle, actBreak.fixed && full.brkOptTitleFixedOn]}>Fixed break</Text>
                    <Text style={full.brkOptDesc}>Never moves — marks a shift change / new shift.</Text>
                  </View>
                  {actBreak.fixed ? <View style={[full.brkOptTick, full.brkOptTickFixed]}><Text style={full.brkOptTickTxt}>✓</Text></View> : <View style={full.brkOptRing} />}
                </TouchableOpacity>

                {/* إلغاءُ البريكِ نهائيًّا */}
                <TouchableOpacity style={full.brkCancel} activeOpacity={0.85} onPress={cancelBreak}>
                  <Text style={full.brkCancelTxt}>Cancel break</Text>
                </TouchableOpacity>
                <TouchableOpacity style={full.actClose} onPress={() => setBreakActionOrig(null)}><Text style={full.actCloseTxt}>Close</Text></TouchableOpacity>
              </Animated.View>
              </View>
            </View>
          )}

          {/* «خلفَ الشفت»: أسماءُ مَن لن يُدرِكَهم هذا الشفتُ في هذه العيادة */}
          {beyondLane && (() => {
            const l = lanes.find((x) => x.clinic === beyondLane);
            if (!l) return null;
            return (
              <View style={StyleSheet.absoluteFill}>
                <BlurView intensity={20} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                <View style={full.editScrim}>
                  <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setBeyondLane(null)} />
                  <View style={full.byCard}>
                    <Text style={full.byT}>خلفَ تبديلِ الشفت</Text>
                    <Text style={full.byS}>{l.clinic} · لن يُدرِكَهم هذا الشفت</Text>
                    <ScrollView style={{ maxHeight: scale(220) }} showsVerticalScrollIndicator={false}>
                      {l.beyond.map((p) => (
                        <View key={p.id} style={full.byRow}>
                          <View style={full.byNo}><Text style={full.byNoTxt}>{p.queue_number}</Text></View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={full.byName} numberOfLines={1}>{p.name}</Text>
                            <Text style={full.byTx} numberOfLines={1}>{p.treatment || '—'} · {estMinutes(p)} min</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                    <TouchableOpacity style={full.actClose} onPress={() => setBeyondLane(null)}>
                      <Text style={full.actCloseTxt}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* محرِّرُ أوقاتِ البريك (لوحٌ كريميٌّ في القلب — إعدادٌ لا إجراءٌ على مريض) */}
          {editingBreaks && (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={24} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={full.editScrim}>
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setEditingBreaks(false)} />
              <Animated.View style={[full.editCard, { opacity: editAnim, transform: [{ translateY: editAnim.interpolate({ inputRange: [0, 1], outputRange: [scale(14), 0] }) }] }]}>
                <View style={full.editHd}>
                  <View style={full.editHdIcon}><Text style={{ fontSize: scale(14) }}>⚙︎</Text></View>
                  <View>
                    <Text style={full.editHdT}>إعداداتُ المخطّط</Text>
                    <Text style={full.editHdS}>لكلِّ العيادات · تُطبَّقُ فورًا</Text>
                  </View>
                </View>

                {/* عددُ الكراسي — لِمخطّطِ الدورِ وحدَه. الجدولُ الأسبوعيُّ شيءٌ آخر:
                    قد تفتحُ عيادةً إضافيّةً اليومَ أو تُغلقَ واحدةً، وليس على المخطّطِ
                    أن ينتظرَ تعديلَ الجدولِ كي يعكسَ ما هو قائمٌ فعلًا. */}
                <View style={full.cntRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={full.cntT}>عددُ العيادات</Text>
                    <Text style={full.cntS}>مستقلٌّ عن الجدول</Text>
                  </View>
                  <TouchableOpacity
                    style={[full.cntBtn, chairDraft <= 1 && full.cntBtnOff]}
                    activeOpacity={0.8}
                    disabled={chairDraft <= 1}
                    onPress={() => setChairDraft((n) => Math.max(1, n - 1))}
                  >
                    <Text style={full.cntBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={full.cntNum}>{chairDraft || 1}</Text>
                  <TouchableOpacity
                    style={[full.cntBtn, chairDraft >= 12 && full.cntBtnOff]}
                    activeOpacity={0.8}
                    disabled={chairDraft >= 12}
                    onPress={() => setChairDraft((n) => Math.min(12, (n || 1) + 1))}
                  >
                    <Text style={full.cntBtnTxt}>＋</Text>
                  </TouchableOpacity>
                </View>

                <Text style={full.editGroup}>أوقاتُ الاستراحة</Text>
                <ScrollView style={{ maxHeight: scale(176) }}>
                  {draft.length === 0 && <Text style={full.editEmpty}>لا فتراتٍ بعد — أضِفْ فترة.</Text>}
                  {draft.map((b, i) => (
                    <View key={i} style={full.brRow}>
                      <TimeStepper value={b.start} onChange={(v) => setDraft((d) => d.map((x2, j) => (j === i ? { ...x2, start: v } : x2)))} />
                      <Text style={full.brArrow}>→</Text>
                      <TimeStepper value={b.end} onChange={(v) => setDraft((d) => d.map((x2, j) => (j === i ? { ...x2, end: v } : x2)))} />
                      <TouchableOpacity style={full.brDel} onPress={() => setDraft((d) => d.filter((_, j) => j !== i))}><Text style={full.brDelTxt}>✕</Text></TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity style={full.brAdd} onPress={() => setDraft((d) => [...d, { start: 12 * 60, end: 12 * 60 + 30 }])}><Text style={full.brAddTxt}>＋ إضافةُ فترة</Text></TouchableOpacity>
                <View style={full.editBtns}>
                  <TouchableOpacity style={full.editCancel} onPress={() => setEditingBreaks(false)}><Text style={full.editCancelTxt}>إلغاء</Text></TouchableOpacity>
                  <TouchableOpacity style={full.editSave} onPress={saveEditor}><Text style={full.editSaveTxt}>حفظ</Text></TouchableOpacity>
                </View>
              </Animated.View>
              </View>
            </View>
          )}
        </View>
      </LinearGradient>
    </Modal>
  );
}

// ═══════════════ الحاوية: سحبٌ بين الإحصاء والمخطّط ═══════════════
// ── عارضُ لقطةِ يومٍ محفوظة (الأرشيف) ──
// اللقطةُ تحملُ مساراتِها ومحورَها وساعةَ حفظِها، فلا حسابَ هنا ولا اعتمادَ على «الآن»:
// نرسمُ ما حُفِظَ كما حُفِظ. ونمرّرُ دوالَّ صوريّةً لأنّ readOnly يقطعُ كلَّ ما يستدعيها.
const NO_SIM = { on: false, playing: false, speed: 1, toggle: () => {}, playPause: () => {}, cycleSpeed: () => {}, reset: () => {} };
const NO_ACTIONS: BlockActions = { onEnterClinic: () => {}, onToggleNA: () => {}, onDone: () => {} };

export function DayChartViewer({ visible, onClose, chart, dateLabel }:
  { visible: boolean; onClose: () => void; chart: DayChart | null; dateLabel: string }) {
  const insets = useSafeAreaInsets();
  if (!chart) return null;
  const data: TimelineData = { lanes: chart.lanes, dayStart: chart.dayStart, dayEnd: chart.dayEnd };
  return (
    <FullTimeline
      visible={visible}
      onClose={onClose}
      data={data}
      nowMin={chart.savedAtMin}
      topInset={insets.top}
      bottomInset={insets.bottom}
      sim={NO_SIM}
      breaks={chart.breaks}
      onSaveBreaks={() => {}}
      chairCount={chart.chairCount}
      onSetChairCount={() => {}}
      actions={NO_ACTIONS}
      readOnly
      title={dateLabel}
      subtitle={`${chart.lanes.length} clinics · saved ${fmtHM(chart.savedAtMin)}`}
    />
  );
}

export function QueueTimelinePager({ patients, clinicId, statsNode, currentDoctorName, onSchedule, onEnterClinic, onToggleNA, onDone }:
  { patients: Patient[]; clinicId?: string | null; statsNode: React.ReactNode; currentDoctorName?: string;
    onSchedule?: (lanes: Lane[], chairCount: number, breaks: Break[], nowMin: number) => void;
    // إجراءاتُ صفحةِ الدور الحقيقيّة (نفسُها على الكرت) — تُستدعى خارجَ المحاكاة
    onEnterClinic?: (patientId: string, clinic: string) => void;
    onToggleNA?: (patientId: string) => void;
    onDone?: (patientId: string) => void }) {
  const W = SCREEN.width;
  const insets = useSafeAreaInsets();
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const [page, setPage] = useState(0);
  const [showFull, setShowFull] = useState(false);
  const [clinicCount, setClinicCount] = useState(0);
  // تجاوزٌ محلّيٌّ لعددِ الكراسي: المخطّطُ يصفُ اليومَ كما هو قائمٌ فعلًا — قد تُفتَحُ عيادةٌ
  // إضافيّةٌ اليومَ أو تُغلَقُ واحدةٌ — ولا ينبغي أن ينتظرَ تعديلَ الجدولِ الأسبوعيِّ ليقولَ ذلك.
  const [chairOverride, setChairOverride] = useState<number | null>(null);
  const chairKey = clinicId ? `queue_chairs_${clinicId}` : null;
  useEffect(() => {
    let alive = true;
    if (!chairKey) { setChairOverride(null); return; }
    AsyncStorage.getItem(chairKey).then((v) => {
      if (alive) setChairOverride(v ? Number(v) || null : null);
    });
    return () => { alive = false; };
  }, [chairKey]);
  const setChairCount = (n: number) => {
    setChairOverride(n);
    if (chairKey) AsyncStorage.setItem(chairKey, String(n));
  };
  const [breaks, setBreaks] = useState<Break[]>([]);   // أوقاتُ البريك لكلِّ العيادات (من إعداداتِ المركز)
  // محاكاة (مسرِّعٌ زمنيّ): ساعةٌ افتراضيّةٌ من 7ص إلى 9م + مرضى مولَّدون
  const [simOn, setSimOn] = useState(false);
  const [simPlaying, setSimPlaying] = useState(true);
  const [simSpeedIdx, setSimSpeedIdx] = useState(0);
  const [simNowMin, setSimNowMin] = useState(7 * 60);
  // إجراءاتُك داخلَ المحاكاة (إدخال/إنجاز) بالوقتِ الافتراضيّ — لا شيءَ تلقائيّ، ولا كتابةَ في قاعدةِ البيانات
  const [simActs, setSimActs] = useState<{ [id: string]: SimAct }>({});

  // عددُ العياداتِ من إعداداتِ المركز (نفسُ الرقمِ في صفحةِ الجداول). قراءةٌ فقط،
  // ويُحدَّثُ كلَّ نصفِ دقيقةٍ ليظهرَ أيُّ تغييرٍ في العددِ فورًا تقريبًا.
  useEffect(() => {
    let alive = true;
    const loadSettings = async () => {
      if (!clinicId) { if (alive) { setClinicCount(0); setBreaks([]); } return; }
      try {
        const { data } = await getScheduleSettings(clinicId);
        if (alive) {
          setClinicCount(Number(data?.clinic_count) || 0);
          setBreaks(Array.isArray(data?.breaks) ? data.breaks : []);
        }
      } catch { if (alive) { setClinicCount(0); setBreaks([]); } }
    };
    const tick = () => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); };
    loadSettings(); tick();
    const id = setInterval(() => { tick(); loadSettings(); }, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [clinicId]);

  // الكراسي = عددُ العيادات (عيادة ١ .. عيادة N)؛ وإن لم يتوفّر تُشتَقُّ من عياداتِ المرضى.
  const chairs = useMemo(() =>
    (chairOverride ?? clinicCount) >= 1
      ? Array.from({ length: chairOverride ?? clinicCount }, (_, i) => `Clinic ${i + 1}`)
      : [],
    [chairOverride, clinicCount]);

  // ساعةُ المحاكاة: تتقدّمُ بسرعةٍ مختارةٍ حتّى 9م ثمّ تتوقّف
  const simSpeed = SIM_SPEEDS[simSpeedIdx];
  useEffect(() => {
    if (!simOn || !simPlaying) return;
    const id = setInterval(() => {
      setSimNowMin((m) => Math.min(24 * 60, m + simSpeed * 0.25));
    }, 250);
    return () => clearInterval(id);
  }, [simOn, simPlaying, simSpeed]);

  // بياناتٌ فعّالة:
  //  • المحاكاة (تجربة) = عالَمٌ افتراضيٌّ معزول: الحالةُ من إجراءاتِك أنتَ (applySimActs)، والوقتُ
  //    من ساعتِها الافتراضيّة — تجاهلٌ تامٌّ لأوقاتِ المرضى الحقيقيّة، فلا يتسرّبُ الوقتُ الفعليّ.
  //  • بدون محاكاة = الوقتُ الفعليُّ والحالةُ الحقيقيّة (يأتي ربطُه حيًّا لاحقًا).
  const simChairs = chairs.length ? chairs : ['Clinic 1', 'Clinic 2', 'Clinic 3'];
  const effNow = simOn ? Math.round(simNowMin) : nowMin;
  // ملحوظةٌ عن المحاكاة: ساعتُها افتراضيّةٌ بينما يبقى registered_at بالساعةِ الحقيقيّة، فكلُّ
  // مَن في الطابورِ يبدو لها «منتظِرًا منذ الفجر». فحكمُ البريكِ الثابتِ على تسجيلٍ جديدٍ لا
  // يُعايَنُ إلّا في الوضعِ الحيّ — والمحاكاةُ تبقى لِمعاينةِ سيرِ الدورِ لا لِهذا.
  const effPatients = useMemo(
    () => (simOn ? applySimActs(patients, simActs, currentDoctorName) : patients),
    [simOn, patients, simActs, currentDoctorName],
  );
  const effChairs = simOn ? simChairs : chairs;
  const data = useMemo(() => buildLanes(effPatients, effNow, effChairs, breaks), [effPatients, effNow, effChairs, breaks]);

  // نُبلّغُ الشاشةَ بالجدولِ الحاليِّ نفسِه المعروضِ (محاكاةً كان أو وقتًا فعليًّا) كي يعتمدَه
  // فحصُ توفّرِ حجزِ موعدِ الدخول في الكروت — فيطابقُ الحجزُ ما تراه على المخطّطِ تمامًا.
  // نُبلّغُ بعددِ الكراسي **المرسومةِ فعلًا** لا بالمُعَدِّ: إن لم يكن للمركزِ عددٌ محفوظٌ
  // (ولا تجاوزٌ محلّيّ) كان المُعَدُّ صفرًا، وصفرٌ يعني عندَ فحصِ التوفّرِ «لا أعرفُ فلا أمنع» —
  // فلا يحمرُّ وقتٌ ممتلئٌ أبدًا. أمّا المرسومُ فلا يقلُّ عن واحد، ويطابقُ ما تراه.
  useEffect(() => { onSchedule?.(data.lanes, data.lanes.length, breaks, effNow); }, [data, breaks, effNow, onSchedule]);

  // لقطةُ اليوم: تُودَعُ مع كلِّ بناءٍ فيبقى في قاعدةِ البيانات آخرُ ما رآه المركز، وتجدُها
  // أرشفةُ الخادمِ الليليّةُ جاهزةً. والمحاكاةُ عالَمٌ افتراضيٌّ — لا تُحفَظ.
  // البصمةُ تصفُ **المضمونَ** بلا وقت، فتُفرَّقُ الكتابةُ عندَ تغييرٍ حقيقيٍّ عن تقدُّمِ الساعةِ وحدَه.
  useEffect(() => {
    if (simOn || !clinicId) return;
    const sig = effPatients
      .map((p) => `${p.id}:${p.status}:${p.expected_minutes}:${p.appointment_min}:${p.clinic_entry_at?.getTime() ?? ''}:${p.completed_at?.getTime() ?? ''}:${p.na_at?.getTime() ?? ''}`)
      .join('|') + `#${JSON.stringify(breaks)}#${effChairs.length}`;
    rememberDayChart(clinicId, snapshotChart(data, breaks, localDay(), effNow), sig);
  }, [data, effPatients, breaks, effChairs.length, effNow, simOn, clinicId]);

  // حفظُ أوقاتِ البريك في إعداداتِ المركز (تفاؤليّ + كتابةٌ في قاعدة البيانات)
  const onSaveBreaks = async (next: Break[]) => {
    setBreaks(next);
    if (clinicId) { try { await updateScheduleBreaks(clinicId, next); } catch {} }
  };

  // ── إجراءاتُ نافذةِ المريض ──
  // المحاكاةُ مشغَّلة → تُنفَّذُ على simActs وحدَها (لا كتابةَ في قاعدةِ البيانات، العزلُ محفوظ).
  // مطفأة → تُستدعى دوالُّ الصفحةِ الحقيقيّةُ نفسُها، فالحدثُ واحدٌ هنا وعلى كرتِ المريض.
  const actions: BlockActions = useMemo(() => ({
    onEnterClinic: (id, clinic) => {
      if (simOn) {
        const now = Math.round(simNowMin);
        const chair = clinicNum(clinic) || firstFreeChair(simActs, simChairs.length);
        setSimActs((prev) => ({ ...prev, [id]: { ...prev[id], enter: prev[id]?.enter ?? now, chair, na: false, done: undefined } }));
      } else onEnterClinic?.(id, clinic);
    },
    onToggleNA: (id) => {
      if (simOn) {
        const cur = patients.find((p) => p.id === id);
        setSimActs((prev) => {
          const nowNA = prev[id]?.na !== undefined ? prev[id]!.na : cur?.status === 'na';
          const turningOn = !nowNA;   // عندَ التفعيل نُثبّتُ وقتَ النداء (لحظةَ المحاكاةِ الآن)؛ وعندَ الإلغاء نمحوه
          // نمحو الدخول/الإنجاز في الحالتين: التفعيل يُخرِجُه من الكرسيّ، والإلغاءُ يُعيدُه إلى الطابورِ حسبَ رقمِ الدور (لا يستأنفُ علاجًا)
          return { ...prev, [id]: { ...prev[id], na: turningOn, naAt: turningOn ? Math.round(simNowMin) : undefined, enter: undefined, done: undefined } };
        });
      } else onToggleNA?.(id);
    },
    onDone: (id) => {
      if (simOn) setSimActs((prev) => ({ ...prev, [id]: { ...prev[id], done: Math.round(simNowMin) } }));
      // الوضعُ الحقيقيّ: نُغلقُ المخطّطَ أوّلًا لتظهرَ نافذةُ اختيارِ الطبيبِ الحاليّةُ دونَ تراكُمِ نافذتين،
      // ونُمهِلُ إغلاقَه قبلَ فتحِها لأنّ فتحَ نافذةٍ في اللحظةِ نفسِها التي تُغلَقُ فيها أخرى قد يبتلِعُها.
      else { setShowFull(false); setTimeout(() => onDone?.(id), 350); }
    },
  }), [simOn, simNowMin, simActs, simChairs.length, patients, onEnterClinic, onToggleNA, onDone]);

  const simApi = {
    on: simOn, playing: simPlaying, speed: simSpeed,
    toggle: () => { setSimOn((v) => { const nx = !v; if (nx) { setSimNowMin(7 * 60); setSimPlaying(true); setSimActs({}); } return nx; }); },
    playPause: () => setSimPlaying((v) => !v),
    cycleSpeed: () => setSimSpeedIdx((i) => (i + 1) % SIM_SPEEDS.length),
    reset: () => { setSimNowMin(7 * 60); setSimActs({}); },
  };

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
      >
        <View style={{ width: W, paddingHorizontal: scale(24) }}>
          <View style={{ flexDirection: 'row', gap: scale(16) }}>{statsNode}</View>
        </View>
        <TouchableOpacity activeOpacity={0.9} style={{ width: W, paddingHorizontal: scale(24) }} onPress={() => setShowFull(true)}>
          <MiniTimeline data={data} nowMin={effNow} simOn={simOn} />
        </TouchableOpacity>
      </ScrollView>

      <View style={dots.row}>
        <View style={[dots.dot, page === 0 && dots.on]} />
        <View style={[dots.dot, page === 1 && dots.on]} />
      </View>

      <FullTimeline visible={showFull} onClose={() => setShowFull(false)} data={data} nowMin={effNow} topInset={insets.top} bottomInset={insets.bottom} sim={simApi} breaks={breaks} onSaveBreaks={onSaveBreaks} chairCount={effChairs.length} onSetChairCount={setChairCount} actions={actions} />
    </View>
  );
}

const mini = scaledStyleSheet({
  card: { minHeight: 150, backgroundColor: 'rgba(255,255,255,0.42)', borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', paddingVertical: 13, paddingHorizontal: 15, justifyContent: 'center' },
  expIcon: { position: 'absolute', top: 9, right: 12, zIndex: 3 },
  expTxt: { fontSize: 14, color: '#94a3b8' },
  simBadge: { position: 'absolute', top: 9, left: 13, zIndex: 3, backgroundColor: '#0E7C66', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  simBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4, color: '#8CA0A8', marginBottom: 9 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  badge: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7DD3C0', shadowColor: '#09705C', shadowOpacity: 0.28, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  badgeEld: { backgroundColor: '#FBBF24' },
  badgeTxt: { fontSize: 17, fontWeight: '800', color: '#05302A' },
  name: { fontSize: 16, fontWeight: '800', color: '#12232A', letterSpacing: -0.3 },
  sub: { marginTop: 2, fontSize: 11, fontWeight: '600', color: '#5A7079' },
  timeCol: { alignItems: 'flex-end' },
  timeBig: { fontSize: 15, fontWeight: '800', color: '#0E7C66' },
  timeSub: { marginTop: 1, fontSize: 9.5, fontWeight: '700', color: '#8CA0A8' },
  thenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
  thenLbl: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: '#9AACB3' },
  thenChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(140,160,168,0.24)' },
  thenNum: { fontSize: 10.5, fontWeight: '800', color: '#0E7C66' },
  thenName: { flex: 1, fontSize: 10.5, fontWeight: '700', color: '#31454D' },
  emptyBig: { fontSize: 16, fontWeight: '800', color: '#31454D' },
  emptySub: { marginTop: 3, fontSize: 11, fontWeight: '600', color: '#8CA0A8' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(140,160,168,0.18)' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotServing: { backgroundColor: '#34D399' },
  dotWait: { backgroundColor: '#B6C2C8' },
  statIcon: { fontSize: 10 },
  statTxt: { fontSize: 10, fontWeight: '700', color: '#5A7079' },
}) as any;

const full = scaledStyleSheet({
  // ── الرأس ──
  head: { paddingHorizontal: 22, paddingTop: 4 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: '#8CA0A8' },
  iconBtn: { height: 34, minWidth: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  breakBtn: { paddingHorizontal: 11, gap: 5, backgroundColor: 'rgba(248,236,214,0.9)', borderColor: 'rgba(206,178,132,0.75)', shadowColor: '#B98A3E', shadowOpacity: 0.22, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  breakBtnFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 17 },
  breakBtnDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)' },
  breakBtnIcon: { fontSize: 10.5 },
  breakBtnTxt: { fontSize: 12, fontWeight: '800', color: '#7A5A2E', letterSpacing: 0.2 },
  closeTxt: { fontSize: 15, fontWeight: '800', color: '#4A5568' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 8 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -1, color: '#12232A' },
  sub: { marginTop: 6, fontSize: 11, fontWeight: '600', color: '#5A7079' },
  clockWrap: { marginLeft: 'auto', alignItems: 'flex-end' },
  clockT: { fontSize: 34, fontWeight: '800', letterSpacing: -1.6, color: '#0E7C66' },
  clockL: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  clockDotWrap: { width: 5, height: 5, alignItems: 'center', justifyContent: 'center' },
  clockRing: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#7DD3C0' },
  clockDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#7DD3C0' },
  clockLTxt: { fontSize: 8.5, fontWeight: '800', letterSpacing: 1.4, color: '#8CA0A8' },
  // ── شريطُ المحاكاة ──
  simBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 10 },
  simMain: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: 'rgba(125,211,192,0.8)' },
  simMainOn: { backgroundColor: '#0E7C66', borderColor: '#0E7C66' },
  simMainTxt: { fontSize: 11.5, fontWeight: '800', color: '#0E7C66' },
  simCtl: { minWidth: 33, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(18,58,68,0.09)', alignItems: 'center' },
  simCtlTxt: { fontSize: 11, fontWeight: '800', color: '#31454D' },
  simTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#8CA0A8' },
  simHint: { fontSize: 11, fontWeight: '700', color: '#0E7C66', textAlign: 'center', paddingHorizontal: 22, paddingBottom: 8 },
  // ── اللوحُ الزجاجيّ + عمودُ العيادات ──
  panelShadow: { flex: 1, marginHorizontal: 14, marginBottom: 12, borderRadius: 28, shadowColor: '#0A2834', shadowOpacity: 0.32, shadowRadius: 22, shadowOffset: { width: 0, height: 16 }, elevation: 10 },
  panel: { flex: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.34)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)' },
  panelTopHi: { position: 'absolute', top: 0, left: 22, right: 22, height: 1, backgroundColor: 'rgba(255,255,255,0.9)', zIndex: 5 },
  gridV: { position: 'absolute', bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(18,58,68,0.05)' },
  // فاصلٌ أفقيٌّ واضحٌ بين العيادات (كان خافتًا جدًّا فلا يُرى) — يمتدُّ عرضَ الجدولِ فوقَ كلِّ عيادة
  gridH: { position: 'absolute', left: 0, height: 1, backgroundColor: 'rgba(18,58,68,0.13)' },
  // ── رأسُ الجدول: محورُ الأوقاتِ الثابت (7:00 8:00 …) ──
  ruler: { position: 'absolute', top: 0, left: 0 },
  rTick: { position: 'absolute', top: 8, fontSize: 10.5, fontWeight: '800', color: '#8CA0A8' },
  rTickMark: { position: 'absolute', top: 25, width: 1, height: 11, backgroundColor: 'rgba(18,58,68,0.09)' },
  rHalf: { position: 'absolute', top: 30, width: 1, height: 6, backgroundColor: 'rgba(18,58,68,0.05)' },
  railCol: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(18,58,68,0.09)' },
  railHead: { overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(18,58,68,0.06)' },
  railCell: { paddingTop: 12, paddingLeft: 13, paddingRight: 8, borderTopWidth: 1, borderTopColor: 'rgba(18,58,68,0.13)' },
  railDot: { position: 'absolute', top: 13, right: 9, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(140,160,168,0.5)' },
  // العيادةُ الفارغةُ (لا مريضَ فيها الآن): نقطةٌ خضراءُ مضيئةٌ تدلُّ على أنّها متاحةٌ لاستقبالِ مريض
  railDotFree: { backgroundColor: '#34D399', shadowColor: '#34D399', shadowOpacity: 0.95, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  railNo: { fontSize: 28, fontWeight: '800', letterSpacing: -1.6, color: 'rgba(18,58,68,0.13)' },
  railNoFree: { color: 'rgba(18,58,68,0.07)' },
  railName: { marginTop: 4, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, color: '#8CA0A8' },
  railBar: { marginTop: 8, width: 26, height: 3, borderRadius: 2, backgroundColor: 'rgba(18,58,68,0.1)', overflow: 'hidden' },
  railBarFill: { height: '100%', borderRadius: 2, backgroundColor: '#7DD3C0' },
  // ── شريطُ الأوقاتِ والصفّ ──
  strip: { position: 'absolute', left: 0 },
  startTick: { position: 'absolute', top: 1, fontSize: 9.5, fontWeight: '800', color: '#0E7C66' },
  startTickMark: { position: 'absolute', top: 13, width: 1, height: 4, backgroundColor: 'rgba(14,124,102,0.45)' },
  hourTick: { position: 'absolute', top: 2, fontSize: 10, fontWeight: '800', color: '#8CA0A8' },
  laneRow: { position: 'absolute', left: 0, right: 0 },
  // ── عيادةٌ فارغة + خيطُ الفراغ ──
  vacant: { position: 'absolute', top: 7, bottom: 7, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.36)', borderStyle: 'dashed' },
  vacantPill: { position: 'absolute', top: '50%', marginTop: -14, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  vacantTxt: { fontSize: 10.5, fontWeight: '800', color: '#5A7079' },
  idleDot: { width: 2, height: 2, borderRadius: 1, marginRight: 5, backgroundColor: 'rgba(140,160,168,0.6)' },
  // الوقتُ المتاحُ فوقَ نقاطِ الفراغ — رماديٌّ بسيطٌ في الوسط
  idleLabel: { position: 'absolute', textAlign: 'center', fontSize: 8.5, fontWeight: '700', letterSpacing: 0.2, color: '#9AA8AF' },
  // ── الاستراحة (كريميّة) ──
  brk: { position: 'absolute', top: 13, bottom: 13, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 3, overflow: 'hidden', backgroundColor: 'rgba(250,239,220,0.82)', borderWidth: 1, borderColor: 'rgba(212,186,148,0.5)' },
  brkChip: { width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  brkChipTxt: { fontSize: 11 },
  brkS: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4, color: '#7A6446' },
  brkMoved: { fontSize: 7.5, fontWeight: '800', color: '#6B3E0B', backgroundColor: 'rgba(251,191,36,0.34)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  brkMovedOld: { textDecorationLine: 'line-through', color: '#8A6A2E' },
  // البريكُ الثابت (تبديلُ شفت): مظهرٌ فولاذيٌّ مميّزٌ عن العسليِّ المتحرّك
  brkFixed: { backgroundColor: 'rgba(228,233,242,0.9)', borderColor: 'rgba(99,116,152,0.55)' },
  brkChipFixed: { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: 'rgba(255,255,255,0.95)' },
  brkSFixed: { color: '#4A5570' },
  brkFixedTag: { fontSize: 7.5, fontWeight: '800', letterSpacing: 0.5, color: '#3E4763', backgroundColor: 'rgba(99,116,152,0.24)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  // ── خطُّ الآن ──
  nowPill: { position: 'absolute', top: 4, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#0E7C66' },
  nowPillTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  // ── نافذةُ الإجراءات (لوحٌ سفليّ) ──
  sheetScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(10,32,38,0.24)' },
  sheet: { paddingHorizontal: 17, paddingTop: 13, paddingBottom: 20, marginHorizontal: 11, marginBottom: 11, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', shadowColor: '#0A2834', shadowOpacity: 0.24, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
  sheetGlass: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.5)' },
  sheetTopHi: { position: 'absolute', top: 0, left: 26, right: 26, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.95)' },
  grab: { width: 40, height: 4.5, borderRadius: 3, backgroundColor: 'rgba(90,112,121,0.26)', alignSelf: 'center', marginBottom: 14 },
  shHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  shBadge: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7DD3C0', shadowColor: '#09705C', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  shBadgeHollow: { backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1.5, borderColor: 'rgba(14,124,102,0.5)', borderStyle: 'dashed', shadowOpacity: 0, elevation: 0 },
  shBadgeNA: { borderColor: 'rgba(120,124,160,0.6)' },
  shBadgeTxt: { fontSize: 15, fontWeight: '800' },
  shName: { fontSize: 16.5, fontWeight: '800', color: '#12232A', letterSpacing: -0.3 },
  shMeta: { marginTop: 2, fontSize: 10.5, fontWeight: '600', color: '#5A7079' },
  shState: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 5.5, borderRadius: 9, backgroundColor: 'rgba(140,160,168,0.16)' },
  shStateLive: { backgroundColor: 'rgba(125,211,192,0.28)' },
  shStateLate: { backgroundColor: 'rgba(239,68,68,0.16)' },
  shStateTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  shDivider: { height: 1, marginTop: 14, marginHorizontal: 2, backgroundColor: 'rgba(140,160,168,0.18)' },
  shLabel: { marginTop: 13, marginBottom: 9, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, color: '#8CA0A8' },
  chairRow: { flexDirection: 'row', gap: 7 },
  chair: { flex: 1, paddingVertical: 10, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.3)' },
  chairOn: { borderColor: 'rgba(14,124,102,0.9)' },
  chairFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 15 },
  chairOff: { opacity: 0.4 },
  chairEyebrow: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1, color: '#9AACB3' },
  chairN: { marginTop: 1, fontSize: 20, fontWeight: '800', color: '#31454D', letterSpacing: -0.5 },
  chairStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  chairDot: { width: 5, height: 5, borderRadius: 3 },
  chairDotFree: { backgroundColor: '#34D399' },
  chairDotBusy: { backgroundColor: '#B6C2C8' },
  chairDotOn: { backgroundColor: '#05302A' },
  chairS: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  chairSfree: { color: '#0E9E78' },
  chairSbusy: { color: '#8CA0A8' },
  chairT: { marginTop: 2, fontSize: 8, fontWeight: '700', color: '#8CA0A8' },
  chairInkOn: { color: 'rgba(5,48,42,0.78)' },
  chairInkOnStrong: { color: '#05302A' },
  chairInkOnDim: { color: 'rgba(5,48,42,0.6)' },
  actBtn: { marginTop: 14, paddingVertical: 12.5, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(140,160,168,0.12)', borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.34)' },
  actBtnTxt: { fontSize: 13.5, fontWeight: '800', color: '#31454D' },
  actBtnNAOn: { backgroundColor: '#5A7079', borderColor: '#31454D' },
  actBtnNAOnTxt: { color: '#fff' },
  actDone: { marginTop: 9, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E7C66', shadowColor: '#0B7A5E', shadowOpacity: 0.32, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  actDoneFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 },
  actDoneOff: { backgroundColor: 'rgba(140,160,168,0.32)', shadowOpacity: 0, elevation: 0 },
  actDoneTxt: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  hint: { marginTop: 8, fontSize: 10, fontWeight: '700', textAlign: 'center', color: '#8CA0A8' },
  actClose: { marginTop: 11, paddingVertical: 9, alignItems: 'center' },
  actCloseTxt: { fontSize: 13.5, fontWeight: '800', color: '#6B7280', letterSpacing: 0.3 },
  // ── نافذةُ نوعِ البريك (ثابت/متحرّك) ──
  brkHeadChip: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,236,214,0.95)', borderWidth: 1, borderColor: 'rgba(212,186,148,0.6)' },
  brkOpt: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 9, padding: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.28)' },
  brkOptOn: { backgroundColor: 'rgba(125,211,192,0.2)', borderColor: 'rgba(14,124,102,0.75)' },
  brkOptFixed: { backgroundColor: 'rgba(99,116,152,0.06)' },
  brkOptFixedOn: { backgroundColor: 'rgba(99,116,152,0.18)', borderColor: 'rgba(71,88,122,0.8)' },
  brkOptIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  brkOptIconOn: { backgroundColor: 'rgba(125,211,192,0.4)' },
  brkOptIconFixedOn: { backgroundColor: 'rgba(99,116,152,0.32)' },
  brkOptTitle: { fontSize: 14, fontWeight: '800', color: '#31454D' },
  brkOptTitleOn: { color: '#05302A' },
  brkOptTitleFixedOn: { color: '#2E3654' },
  brkOptDesc: { marginTop: 2, fontSize: 10, fontWeight: '600', color: '#7C8A92', lineHeight: 13 },
  brkOptTick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E7C66' },
  brkOptTickFixed: { backgroundColor: '#47587A' },
  brkOptTickTxt: { fontSize: 11, fontWeight: '800', color: '#fff' },
  brkOptRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.4)' },
  brkCancel: { marginTop: 13, paddingVertical: 12, borderRadius: 15, alignItems: 'center', backgroundColor: 'rgba(220,38,38,0.09)', borderWidth: 1.5, borderColor: 'rgba(220,38,38,0.34)' },
  brkCancelTxt: { fontSize: 13, fontWeight: '800', color: '#DC2626', letterSpacing: 0.2 },
  // ── محرِّرُ البريك (كريميّ في القلب) ──
  editScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(10,32,38,0.26)' },
  editCard: { width: '100%', maxWidth: 360, padding: 17, borderRadius: 26, backgroundColor: 'rgba(253,247,238,0.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  editHd: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  editHdIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  editHdT: { fontSize: 15, fontWeight: '800', color: '#5F4E36' },
  editHdS: { marginTop: 1, fontSize: 9.5, fontWeight: '700', color: '#9A8564' },
  editEmpty: { fontSize: 12, color: '#A8926F', textAlign: 'center', paddingVertical: 22 },

  // شارةُ «خلفَ الشفت» ولوحُ أسمائِها — رماديّةٌ هادئة: هؤلاء ليسوا جدولًا، بل تنبيهٌ
  beyond: {
    position: 'absolute', top: 26, bottom: 26,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: 'rgba(122,140,150,0.16)',
    borderWidth: 1.5, borderColor: 'rgba(122,140,150,0.4)', borderStyle: 'dashed',
  },
  beyondN: { fontSize: 15, fontWeight: '800', color: '#5A7079', letterSpacing: -0.4 },
  beyondL: { marginTop: 1, fontSize: 7.5, fontWeight: '800', letterSpacing: 0.8, color: '#8CA0A8' },
  byCard: {
    width: '86%', maxWidth: 380, borderRadius: 22, padding: 18,
    backgroundColor: 'rgba(252,253,255,0.98)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#1E2D4B', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
  },
  byT: { fontSize: 16, fontWeight: '800', color: '#12232A' },
  byS: { marginTop: 2, marginBottom: 12, fontSize: 11.5, fontWeight: '600', color: '#8CA0A8' },
  byRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(40,54,82,0.07)',
  },
  byNo: {
    width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(122,140,150,0.14)',
  },
  byNoTxt: { fontSize: 13, fontWeight: '800', color: '#5A7079' },
  byName: { fontSize: 14, fontWeight: '700', color: '#12232A' },
  byTx: { marginTop: 1, fontSize: 11, fontWeight: '600', color: '#8CA0A8' },

  // عددُ العيادات — صفٌّ واحدٌ بارزٌ فوقَ فتراتِ الاستراحة
  cntRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.46)',
    borderWidth: 1.5, borderColor: 'rgba(212,186,148,0.55)',
  },
  cntT: { fontSize: 13, fontWeight: '800', color: '#6B5735' },
  cntS: { marginTop: 1, fontSize: 9.5, fontWeight: '700', color: '#9A8564' },
  cntBtn: {
    width: 32, height: 32, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1.5, borderColor: 'rgba(212,186,148,0.7)',
  },
  cntBtnOff: { opacity: 0.35 },
  cntBtnTxt: { fontSize: 17, fontWeight: '800', color: '#6B5735', marginTop: -1 },
  cntNum: { minWidth: 26, textAlign: 'center', fontSize: 19, fontWeight: '800', color: '#4E3F24', letterSpacing: -0.5 },

  editGroup: { marginTop: 14, marginBottom: 4, fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#9A8564' },
  brRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8, padding: 8, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  brArrow: { fontSize: 12, fontWeight: '800', color: '#B49A72' },
  brDel: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,0.1)' },
  brDelTxt: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
  brAdd: { marginTop: 10, paddingVertical: 11, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1.5, borderColor: 'rgba(212,186,148,0.7)', borderStyle: 'dashed' },
  brAddTxt: { fontSize: 12.5, fontWeight: '800', color: '#7A6446' },
  editBtns: { flexDirection: 'row', gap: 9, marginTop: 14 },
  editCancel: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  editCancelTxt: { fontSize: 13.5, fontWeight: '800', color: '#7A6446' },
  editSave: { flex: 1.4, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: '#9A6E32' },
  editSaveTxt: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  // ── منتقي الوقت (البريك) ──
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: 'rgba(212,186,148,0.4)' },
  stepBtn: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.7)' },
  stepSign: { fontSize: 16, fontWeight: '800', color: '#7A6446' },
  stepVal: { fontSize: 14, fontWeight: '800', color: '#5F4E36' },
}) as any;

// ── كرتُ المريضِ في المخطّطِ المكبّر ──
const cs = scaledStyleSheet({
  card: { position: 'absolute', top: 6, bottom: 6, borderRadius: 14, paddingTop: 6, paddingBottom: 6, paddingLeft: 13, paddingRight: 10, borderWidth: 1, justifyContent: 'center' },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 13, overflow: 'hidden' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  arc: { position: 'absolute', borderWidth: 1.5, borderRadius: 999 },
  gloss: { position: 'absolute', top: 0, left: 8, right: 8, height: 1, backgroundColor: 'rgba(255,255,255,0.85)' },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 9, fontWeight: '800' },
  name: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: -0.1 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.5)' },
  chipTxt: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  meta: { marginTop: 2, fontSize: 9, fontWeight: '600', opacity: 0.8 },
  // حاويةُ الوقتِ أمامَ الحالة — خلفيّتُها من لونِ الكرتِ نفسِه (v.trk) فتنسجمُ معه
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  tPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  tPillTxt: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.2 },
  // وسمُ الوقتِ الفعليِّ بعدَ الإنجاز
  actualEarly: { backgroundColor: 'rgba(16,185,129,0.92)' },   // أُنجزَ أبكرَ — كم استغرق
  actualLate: { backgroundColor: 'rgba(220,38,38,0.92)' },     // تأخّر — +كم
  mCase: { flexShrink: 1, fontSize: 9, fontWeight: '600', opacity: 0.78 },
  bar: { height: 3.5, borderRadius: 2, marginTop: 4, marginBottom: 2 },
  barFill: { height: '100%', borderRadius: 2 },
  barTick: { position: 'absolute', top: -2.5, width: 1.5, height: 8.5, borderRadius: 1, opacity: 0.6 },
  time: { marginTop: 1, fontSize: 9, fontWeight: '700', opacity: 0.72 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  doc: { flex: 1, fontSize: 8.5, fontWeight: '800', opacity: 0.82 },
}) as any;

const dots = scaledStyleSheet({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(74,85,104,0.25)' },
  on: { width: 18, backgroundColor: '#7DD3C0' },
}) as any;
