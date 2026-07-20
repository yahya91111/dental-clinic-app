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
import { getScheduleSettings, updateScheduleBreaks } from '../../lib/database';
import { Patient, TREATMENT_DURATIONS } from './constants';

// المدّة: الطبيبُ يحدّدها لكلِّ مريض (expected_minutes)؛ وإلّا تقديرٌ من نوعِ العلاج.
const estMinutes = (p: Patient): number =>
  (p.expected_minutes && p.expected_minutes > 0) ? p.expected_minutes : (TREATMENT_DURATIONS[p.treatment || ''] ?? 20);
// شرطُ الظهورِ في المخطّط: أن يكون الطبيبُ قد حدّد المدّة على الكرت.
const hasDuration = (p: Patient): boolean => !!p.expected_minutes && p.expected_minutes > 0;
// ذوو الأولويّة إلى مقدّمةِ الدور: كبارُ السنّ + الاحتياجاتُ الخاصّة (يُختاران على الكرت).
const isPriority = (p: Patient): boolean => !!p.isElderly || !!p.isSpecialNeeds;

const minutesOfDay = (d?: Date): number | null =>
  d ? d.getHours() * 60 + d.getMinutes() : null;
const fmtHM = (min: number): string => {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
};

type Kind = 'done' | 'cur' | 'over' | 'fut' | 'eld' | 'lateDone' | 'break' | 'na';
// orig: وقتُ البريكِ الأصليُّ المحدَّد (كي نُظهِرَ «أُزيحَ · كان HH:MM» إن تحرّك) — للبريكِ فقط
type Blk = { start: number; end: number; kind: Kind; p: Patient; orig?: number };
export type Lane = { clinic: string; short: string; blocks: Blk[] };
export type TimelineData = { lanes: Lane[]; dayStart: number; dayEnd: number };
export type Break = { start: number; end: number };   // فترةُ استراحةٍ لكلِّ العيادات (دقائقُ من منتصف الليل)

const isRealClinic = (c?: string): boolean => !!c && /^clinic\s*\d+/i.test(c);
const clinicNum = (c: string): number => parseInt((c.match(/\d+/) || ['0'])[0], 10);

// مريضٌ صوريٌّ لكتلةِ البريك (كي تُعامَلَ ككتلةٍ عاديّةٍ في الرسمِ والتخطيط دونَ حقلٍ اختياريّ)
const BREAK_P = { id: '__break__', name: 'Break', queue_number: -2, age: 0 } as Patient;

// ── توفّرُ المواعيد (لحجزِ وقتِ الدخول من الكرت) ──
// هل الفترةُ [start, start+dur] متاحةٌ لموعدٍ جديد؟ متاحٌ = عيادةٌ واحدةٌ على الأقلِّ تبقى فارغةً
// طوالَ الفترةِ وفقَ الجدولِ المتوقَّعِ لكلِّ العيادات (كلُّ المرضى: داخلون + منتظِرون بالدور + محجوزون)
// وخارجَ البريك. الفحصُ لكلِّ عيادةٍ على حدة فلا يُحسَبُ كرسيٌّ فيه مريضان متتاليان ككرسيَّين.
// chairCount<1 (غيرُ معروف) → لا نمنع. excludeId يستثني كتلةَ المريضِ نفسِه عند تعديلِ حجزِه.
export function slotAvailable(
  start: number, dur: number, chairCount: number,
  lanes: Lane[], breaks: Break[], excludeId?: string,
): boolean {
  const end = start + dur;
  if (breaks.some((b) => start < b.end && end > b.start)) return false;
  if (chairCount < 1 || !lanes.length) return true;
  return lanes.some((lane) =>
    lane.blocks.every((b) =>
      // البريكُ يُفحَصُ أعلاه، و«غيرُ المتاح» لا يشغلُ كرسيًّا أصلًا
      b.kind === 'break' || b.kind === 'na' || b.p.id === excludeId || !(start < b.end && end > b.start)
    )
  );
}

// ── بناءُ المسارات من المرضى ──
// chairsOverride: عددُ الكراسي من الجدولِ المبنيّ (إن وُجد)؛ وإلّا تُشتَقُّ من عياداتِ المرضى.
export function buildLanes(patients: Patient[], nowMin: number, chairsOverride?: string[], breaks: Break[] = []): TimelineData {
  // «غيرُ المتاح» (na) يبقى ظاهرًا في دورِه ضمنَ الطابور (يُلوَّنُ فقط، لا يُنقَلُ إلى مكانٍ آخر) — يُعالَجُ داخلَ حلقةِ الانتظار
  const active = patients.filter((p) => p.queue_number !== -1 && hasDuration(p));

  let chairs: string[];
  if (chairsOverride && chairsOverride.length) {
    chairs = chairsOverride.slice();
  } else {
    chairs = Array.from(new Set(active.map((p) => p.clinic).filter(isRealClinic))) as string[];
    chairs.sort((a, b) => clinicNum(a) - clinicNum(b));
    if (chairs.length === 0) chairs.push('Clinic 1');
  }

  const lanes: { [c: string]: Blk[] } = {};
  const free: { [c: string]: number } = {};
  const hasReal: { [c: string]: boolean } = {};
  chairs.forEach((c) => { lanes[c] = []; free[c] = nowMin; hasReal[c] = false; });
  const laneOf = (c?: string): string => (isRealClinic(c) && lanes[c!] ? c! : chairs[0]);
  const earliestFree = (): string => chairs.reduce((best, c) => (free[c] < free[best] ? c : best), chairs[0]);

  const waiting: Patient[] = [];

  for (const p of active) {
    const entry = minutesOfDay(p.clinic_entry_at);
    const done = minutesOfDay(p.completed_at);
    const est = estMinutes(p);

    // غيرُ المتاحِ: لا يُعامَلُ كجارٍ أو منجَز — يُوضَعُ في دورِه ضمنَ الطابور (سيُلوَّنُ 'na' ويبقى مكانَه)
    if (p.status === 'na') { waiting.push(p); continue; }
    if (p.status === 'complete' || done != null) {
      const s = entry ?? (done != null ? done - est : nowMin);
      const e = Math.max(done ?? s + est, s + 5);
      const lane = laneOf(p.clinic);
      // أُنجزَ متأخّرًا إن تجاوزَ الزمنُ الفعليُّ المدّةَ المقدَّرة → يبقى أحمر (لا يتحوّلُ رماديًّا)
      const late = entry != null && (e - s) > est + 1;
      lanes[lane].push({ start: s, end: e, kind: late ? 'lateDone' : 'done', p });
      free[lane] = Math.max(free[lane], e); hasReal[lane] = true;
    } else if (entry != null) {
      // دخلَ العيادة: يبقى شكلُ الكرتِ كما كانَ — كرتٌ بمقاسِ المدّةِ المقدَّرةِ كاملةً [الدخول → الدخول+المدّة]،
      // فـ«يمشي عليه الخطُّ الزمنيُّ» مُظهِرًا كم بقيَ ومتى ينتهي. وإن تجاوزَ المدّةَ (over) امتدَّ إلى الآنَ ليُبيّنَ زمنَ التأخير.
      const lane = laneOf(p.clinic);
      const estEnd = entry + est;
      const late = nowMin > estEnd;
      lanes[lane].push({ start: entry, end: late ? Math.max(nowMin, entry + 2) : estEnd, kind: late ? 'over' : 'cur', p });
      // الكرسيُّ مشغولٌ حتّى الإنجازِ المتوقَّعِ (أو الآنَ إن تجاوزَه) — لِتوقُّعٍ صحيحٍ لِمَن بعده
      free[lane] = Math.max(free[lane], estEnd, nowMin); hasReal[lane] = true;
    } else {
      waiting.push(p);
    }
  }

  // ── البريك لكلِّ عيادةٍ على حدة، يُعامَلُ كمريضٍ في الطابور ──
  //   • يبدأُ في وقتِه المحدَّد إن كان الكرسيُّ فارغًا له.
  //   • إن كان الكرسيُّ مشغولًا وقتَها — بمريضٍ جارٍ، أو بصاحبِ الدورِ الذي تأخّرَ وما زالَ يُعالَج —
  //     يُرحَّلُ البريكُ إلى ما بعدِ فراغِ الكرسيّ («يتحرّكُ مع الوقت»: ١٠:٣٠ ← ١٠:٣٥ ← …).
  //   • مَن يأتي دورُه بعدَ وقتِ البريك ينتظرُ إلى ما بعدَه.
  const brs = [...breaks].sort((a, b) => a.start - b.start);
  const bp: { [c: string]: number } = {};           // مؤشِّرُ البريكِ التالي لكلِّ عيادة
  const firstWait: { [c: string]: boolean } = {};   // ما زلنا ننتظرُ أوّلَ منتظِرٍ في العيادة؟
  const realSpan: { [c: string]: number } = {};     // نهايةُ الانشغالِ الحقيقيّ (يتخطّى وقتَ البريك؟)
  chairs.forEach((c) => { bp[c] = 0; firstWait[c] = true; realSpan[c] = hasReal[c] ? free[c] : -Infinity; });

  // يضعُ البريكاتِ التي حانَ وقتُها والكرسيُّ فارغٌ لها، قبلَ المريضِ التالي؛ ويتوقّفُ إن كان
  // التالي هو صاحبَ الدورِ الحاليَّ (تأخّرَ فيُعالَجُ أوّلًا فيُرحَّلُ البريكُ إلى ما بعدَه).
  const flushBreaks = (c: string) => {
    while (bp[c] < brs.length) {
      const br = brs[bp[c]];
      if (br.start > free[c]) break;                       // لم يحِنْ وقتُه بعد
      if (firstWait[c] && realSpan[c] <= br.start) break;  // صاحبُ الدورِ الحاليُّ يُعالَجُ أوّلًا
      const s = Math.max(br.start, free[c]);
      const d = Math.max(1, br.end - br.start);            // مدّةٌ ثابتةٌ (تُعرَضُ داخلَ الكرت)
      lanes[c].push({ start: s, end: s + d, kind: 'break', p: BREAK_P, orig: br.start });
      free[c] = s + d; bp[c]++;
    }
  };

  // ── المواعيدُ المحجوزة (appointment_min): تُوضَعُ في وقتِها الثابتِ على كرسيٍّ متاحٍ لها ──
  //   يُحجَزُ ذو الموعدِ سلَفًا، والمنتظِرون العاديّون (حسبَ الدور) يلتفّون حولَ الحجز فلا يتداخلان.
  const apptWaiting = waiting.filter((p) => p.appointment_min != null)
    .sort((a, b) => (a.appointment_min! - b.appointment_min!) || a.queue_number - b.queue_number);
  const flowWaiting = waiting.filter((p) => p.appointment_min == null);

  const apptIv: { [c: string]: { start: number; end: number }[] } = {};
  chairs.forEach((c) => { apptIv[c] = []; });
  for (const p of apptWaiting) {
    const est = estMinutes(p);
    const t = p.appointment_min!;
    const e = t + est;
    const brkHit = brs.some((b) => t < b.end && e > b.start);   // البريك يمنعُ كلَّ الكراسي
    // اختَرْ عيادةً بلا موعدٍ متداخلٍ ولا انشغالٍ حقيقيٍّ يتجاوزُ وقتَ الموعد
    let chosen: string | null = null;
    for (const c of chairs) {
      const realBusy = hasReal[c] && free[c] > t;
      const clash = apptIv[c].some((x) => t < x.end && e > x.start);
      if (!realBusy && !clash && !brkHit) { chosen = c; break; }
    }
    if (chosen == null) chosen = earliestFree();               // احتياطًا: أقربُ كرسيٍّ (قد يتأخّر)
    const s = Math.max(t, hasReal[chosen] ? free[chosen] : t);
    lanes[chosen].push({ start: s, end: s + est, kind: p.status === 'na' ? 'na' : 'fut', p });
    apptIv[chosen].push({ start: s, end: s + est });
  }
  // يدفعُ بدايةَ المنتظِرِ العاديِّ إلى ما بعدِ أيِّ موعدٍ محجوزٍ يتداخلُ معه
  const avoidAppts = (s: number, est: number, ivs: { start: number; end: number }[]): number => {
    let x = s;
    for (let g = 0; g < 16; g++) {
      let moved = false;
      for (const iv of ivs) if (x < iv.end && x + est > iv.start) { x = iv.end; moved = true; }
      if (!moved) break;
    }
    return x;
  };

  // المنتظِرون العاديّون: ذوو الأولويّة (كبارُ السنّ + الاحتياجاتُ الخاصّة) إلى المقدّمة، ثمّ ترتيبُ الدور
  flowWaiting.sort((a, b) => (isPriority(b) ? 1 : 0) - (isPriority(a) ? 1 : 0) || a.queue_number - b.queue_number);
  for (const p of flowWaiting) {
    const est = estMinutes(p);
    const na = p.status === 'na';
    const pri = !na && isPriority(p);                      // غيرُ المتاحِ لا أولويّةَ له — يبقى في ترتيبِ دورِه
    const lane = pri ? earliestFree()
      : (isRealClinic(p.clinic) && lanes[p.clinic!] ? p.clinic! : earliestFree());
    flushBreaks(lane);                                     // بريكاتٌ مستحقّةٌ قبلَ هذا المريض
    const s = avoidAppts(free[lane], est, apptIv[lane]);   // تجنَّبِ المواعيدَ المحجوزة
    lanes[lane].push({ start: s, end: s + est, kind: na ? 'na' : (pri ? 'eld' : 'fut'), p });
    free[lane] = s + est; firstWait[lane] = false;         // يحجزُ دورَه فلا يقفزُ ولا يتراكبُ مع مَن بعده
  }

  // بريكاتٌ متبقّيةٌ بعدَ آخرِ مريضٍ في كلِّ عيادة (أو عياداتٌ بلا منتظِرين)
  for (const c of chairs) {
    while (bp[c] < brs.length) {
      const br = brs[bp[c]];
      const s = Math.max(br.start, free[c]);
      const d = Math.max(1, br.end - br.start);
      lanes[c].push({ start: s, end: s + d, kind: 'break', p: BREAK_P, orig: br.start });
      free[c] = s + d; bp[c]++;
    }
  }

  const laneList: Lane[] = chairs.map((c) => ({
    clinic: c,
    short: c.match(/\d+/) ? 'C' + c.match(/\d+/)![0] : c.slice(0, 3),
    blocks: lanes[c].sort((a, b) => a.start - b.start),
  }));

  // النافذةُ الثابتة: ٧ صباحًا (٤٢٠) → ٩ مساءً (١٢٦٠)، وتتّسعُ فقط إن تجاوزتها البيانات
  let minS = 7 * 60, maxE = 21 * 60;
  for (const l of laneList) for (const b of l.blocks) { minS = Math.min(minS, b.start); maxE = Math.max(maxE, b.end); }
  maxE = Math.max(maxE, nowMin + 30);
  return { lanes: laneList, dayStart: Math.min(7 * 60, Math.floor(minS / 60) * 60), dayEnd: Math.max(21 * 60, Math.ceil(maxE / 60) * 60) };
}

// ── ألوانُ الحالات ──
const VIS: { [k in Kind]: { bg: string; ink: string; border?: string; dashed?: boolean } } = {
  done: { bg: 'rgba(148,163,184,0.30)', ink: '#475569' },                          // منجَزٌ في وقته — رماديّ
  cur: { bg: '#7DD3C0', ink: '#08312a' },                                          // جارٍ ضمن المدّة — أخضر
  over: { bg: '#EF4444', ink: '#FFFFFF', border: '#DC2626' },                      // الطبيبُ متأخّر — أحمرُ كامل
  lateDone: { bg: 'rgba(239,68,68,0.55)', ink: '#7F1D1D', border: '#EF4444' },     // أُنجزَ متأخّرًا — يبقى أحمر
  fut: { bg: 'rgba(125,211,192,0.30)', ink: '#0E7C66', border: 'rgba(13,124,102,0.55)', dashed: true }, // منتظِرٌ — تنبّؤٌ أمامَ الخطّ
  eld: { bg: '#FBBF24', ink: '#7c2d12' },                                          // كبيرُ سنٍّ منتظِر
  break: { bg: 'rgba(100,116,139,0.16)', ink: '#475569', border: 'rgba(100,116,139,0.5)', dashed: true }, // استراحةٌ — كتلةٌ لكلِّ عيادة
  na: { bg: 'rgba(148,163,184,0.20)', ink: '#94a3b8', border: 'rgba(148,163,184,0.45)', dashed: true },  // غيرُ متاحٍ — باهتٌ ولا يحجزُ وقتًا
};
const TEAL_INK = '#0E7C66';
const BG_COLORS: [string, string, string] = ['#F0F4F8', '#E8EDF3', '#F5F0F8'];

// ═══════════════ محاكاةٌ افتراضيّةٌ تفاعليّةٌ معزولةٌ عن الوقتِ الفعليّ (بيئةُ عملٍ للتجربة 7ص→9م) ═══════════════
// عالَمٌ افتراضيٌّ قائمٌ بذاته يأخذُ مرضاك **الحقيقيّين** (أسماؤهم/علاجُهم/مدّتُهم) ويتجاهلُ
// أوقاتَهم الحقيقيّةَ تمامًا. **لا شيءَ تلقائيّ**: المريضُ يبقى منتظِرًا حتّى تُدخِلَه أنتَ للعيادةِ
// (بنقرِه على المخطّط) ثمّ تُنهيه — كالعملِ الحقيقيّ لكن بساعةٍ مسرَّعة. (الربطُ الحيُّ لاحقًا، بنفسِ المنطق.)
export type SimAct = { enter?: number; chair?: number; done?: number; na?: boolean };

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
    if (naEff) return { ...p, status: 'na', clinic_entry_at: undefined, completed_at: undefined } as Patient;
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

const SIM_SPEEDS = [3, 10, 30, 90]; // دقائقُ افتراضيّةٌ لكلِّ ثانيةٍ حقيقيّة (3 = أبطأ)

// ═══════════════ المصغّر (في موضع الإحصاء) ═══════════════
function MiniTimeline({ data, nowMin, simOn }: { data: TimelineData; nowMin: number; simOn?: boolean }) {
  const { lanes, dayStart, dayEnd } = data;
  const span = Math.max(1, dayEnd - dayStart);
  const pct = (m: number) => `${Math.max(0, Math.min(100, ((m - dayStart) / span) * 100))}%`;
  const wpct = (a: number, b: number) =>
    `${Math.max(2, ((Math.min(b, dayEnd) - Math.max(a, dayStart)) / span) * 100)}%`;
  const total = lanes.reduce((n, l) => n + l.blocks.length, 0);

  return (
    <View style={mini.card}>
      <View style={mini.expIcon}><Text style={mini.expTxt}>⤢</Text></View>
      {simOn && <View style={mini.simBadge}><Text style={mini.simBadgeTxt}>SIM {fmtHM(nowMin)}</Text></View>}
      <View style={mini.body}>
        <View style={mini.labels}>
          {lanes.map((l) => (
            <View key={l.clinic} style={mini.labelCell}><Text style={mini.lbl}>{l.short}</Text></View>
          ))}
        </View>
        <View style={mini.tracks}>
          {lanes.map((l) => (
            <View key={l.clinic} style={mini.trackRow}>
              {l.blocks.map((b, i) => {
                if (b.kind === 'break') {
                  return (
                    <View key={i} style={[mini.blk, { backgroundColor: VIS.break.bg, left: pct(b.start) as any, width: wpct(b.start, b.end) as any, minWidth: scale(8), borderWidth: scale(1), borderColor: VIS.break.border!, borderStyle: 'dashed' }]} />
                  );
                }
                const digits = String(b.p.queue_number).length;
                return (
                  <View key={i} style={[mini.blk, { backgroundColor: VIS[b.kind].bg, left: pct(b.start) as any, width: wpct(b.start, b.end) as any, minWidth: scale(14 + digits * 9) },
                    VIS[b.kind].border ? { borderWidth: scale(1), borderColor: VIS[b.kind].border!, borderStyle: VIS[b.kind].dashed ? 'dashed' : 'solid' } : null]}>
                    <Text style={[mini.q, { color: VIS[b.kind].ink }]} numberOfLines={1}>{b.p.queue_number}</Text>
                  </View>
                );
              })}
            </View>
          ))}
          <View pointerEvents="none" style={[mini.nowLine, { left: pct(nowMin) as any }]}>
            <View style={mini.nowDot} />
          </View>
          {total === 0 && <Text style={mini.empty}>لا مرضى بعد</Text>}
        </View>
      </View>
      <View style={mini.ruler}>
        <View style={{ width: scale(30) }} />
        <View style={mini.rulerTicks}>
          <Text style={mini.tick}>{fmtHM(dayStart)}</Text>
          <Text style={mini.tick}>{fmtHM((dayStart + dayEnd) / 2)}</Text>
          <Text style={mini.tick}>{fmtHM(dayEnd)}</Text>
        </View>
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
  const naFlag = b.kind === 'na';
  const pending = b.kind === 'fut' || b.kind === 'eld';   // شارةٌ مجوّفةٌ للمنتظِر (غيرُ المتاحِ يبقى بشارةٍ مصمتةٍ فلا يبدو خافتًا)
  const est = estMinutes(b.p);
  // وقتُ الحالةِ المحدَّدُ (الدخول + المدّةُ المقدَّرة) ثابتٌ لا يتغيّرُ حتّى لو أنهى الطبيبُ أبكرَ — يُعرَضُ كما حُدِّد
  const dur = est;
  const endMin = b.start + est;
  const caseType = (b.p.treatment && b.p.treatment !== 'Treatment') ? b.p.treatment : 'Treatment';
  // حاويةُ الوقتِ أمامَ الحالة: المدّةُ المحدَّدةُ للحالة، وتُستبدَلُ بالمتبقّي أثناءَ العلاج (والتأخيرِ إن زاد)
  const pillText = (b.kind === 'cur' || b.kind === 'over') ? chipOf(b, nowMin) : `${dur} min`;
  // بعدَ الإنجاز: وسمٌ أعلى يمينِ الكرتِ بجانبِ الاسم يوضّحُ الوقتَ الفعليَّ (دونَ المساسِ بالوقتِ المحدَّد) — بلا وحدةِ min
  const actualMin = Math.round(b.end - b.start);
  const showActual = (b.kind === 'done' || b.kind === 'lateDone');
  const actualTagText = b.kind === 'lateDone' ? `+${Math.max(0, actualMin - est)}` : `${actualMin}`;   // متأخّرٌ «+N» أو الوقتُ المستغرَقُ فقط «N»
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
        ) : (b.kind === 'eld' || b.kind === 'na') ? (
          <View style={cs.chip}>
            <Text style={[cs.chipTxt, { color: v.ink }]} numberOfLines={1}>{chipOf(b, nowMin)}</Text>
          </View>
        ) : null}
      </View>
      {/* تحتَ الاسم: حاويةُ الوقتِ أمامَ نوعِ الحالة (Filling / Extraction …) — وسطرُ End time يبقى مكانَه بالأسفل */}
      {naFlag ? (
        <Text style={[cs.meta, { color: v.ink }]} numberOfLines={1}>patient away</Text>
      ) : (
        <View style={cs.metaRow}>
          <Text style={[cs.mCase, { color: v.ink }]} numberOfLines={1}>{caseType}</Text>
          <View style={[cs.tPill, { backgroundColor: v.trk }]}>
            <Text style={[cs.tPillTxt, { color: v.ink }]} numberOfLines={1}>{pillText}</Text>
          </View>
        </View>
      )}
      <View style={[cs.bar, { backgroundColor: v.trk }]}>
        {!bar.empty ? <View style={[cs.barFill, { width: `${bar.fill}%` as any, backgroundColor: v.fil }]} /> : null}
        {!bar.empty && bar.tick >= 0 && bar.tick < 99.5 ? <View style={[cs.barTick, { left: `${bar.tick}%` as any, backgroundColor: v.ink }]} /> : null}
      </View>
      {!naFlag ? (
        <Text style={[cs.time, { color: v.ink }]} numberOfLines={1}>{b.p.appointment_min != null ? '🕐 ' : ''}End time {fmtHM(endMin)}</Text>
      ) : null}
      {b.p.doctor_name && !naFlag ? (
        <View style={cs.docRow}>
          <Ionicons name="person" size={scale(9)} color={v.ink} />
          <Text style={[cs.doc, { color: v.ink }]} numberOfLines={1}>{b.p.doctor_name}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ═══════════════ المكبّر (ملء الشاشة) ═══════════════
function FullTimeline({ visible, onClose, data, nowMin, topInset, bottomInset, sim, breaks, onSaveBreaks, actions }:
  { visible: boolean; onClose: () => void; data: TimelineData; nowMin: number; topInset: number; bottomInset: number;
    sim: { on: boolean; playing: boolean; speed: number; toggle: () => void; playPause: () => void; cycleSpeed: () => void; reset: () => void };
    breaks: Break[]; onSaveBreaks: (b: Break[]) => void; actions: BlockActions }) {
  const { lanes, dayStart, dayEnd } = data;
  const [actionId, setActionId] = useState<string | null>(null);   // المريضُ المفتوحةُ نافذتُه
  const [editingBreaks, setEditingBreaks] = useState(false);
  const [draft, setDraft] = useState<Break[]>([]);
  const openEditor = () => { setDraft(breaks.map((b) => ({ ...b }))); setEditingBreaks(true); };
  const saveEditor = () => { onSaveBreaks(draft.filter((b) => b.end > b.start).sort((a, b) => a.start - b.start)); setEditingBreaks(false); };
  const HOUR_W = scale(200);                        // اتّساعُ الساعةِ الواحدة — أوسعُ كي يقتربَ عرضُ الكرتِ من امتدادِه الزمنيِّ الحقيقيّ (فيبقى داخلَ نطاقِ ساعتِه)
  // topH = رأسُ الجدول: شريطٌ عريضٌ يحملُ محورَ الأوقاتِ الثابت (7:00 8:00 …) مرجعًا للكلِّ العيادات
  const laneH = scale(96), stripH = scale(17), topH = scale(38), labelW = scale(64);
  const unitH = stripH + laneH;                    // شريطُ الأوقات + كروتُ العيادة = وحدةٌ واحدة
  const GAP = scale(8);                             // فجوةٌ دنيا بين كلِّ كرتَين متجاورَين (كي لا تلتصقَ الكروت)
  const IDLE_GAP = scale(30);                       // مسافةٌ محجوزةٌ بعدَ كلِّ فراغٍ زمنيٍّ (≥5د) كي يظهرَ خيطُ الفراغِ المنقّطُ بوضوح
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
        // وإن سبقَه فراغٌ زمنيٌّ حقيقيٌّ (≥5د — كأن ينتهيَ مريضٌ ثمّ يتأخّرَ دخولُ التالي) نحجزُ مسافةً إضافيّةً
        // كي لا يلتصقَ الكرتان ويظهرَ خيطُ الفراغِ المنقّطُ الدالُّ على المدّةِ الضائعة.
        const idleRoom = (p.end < t && t - p.end >= 5) ? IDLE_GAP : 0;
        const cand = p.end < t
          ? Math.max(xpS + minWOf(p.kind) + GAP + idleRoom, (xm.get(p.end) as number) + GAP + idleRoom)
          : Math.max(xpS + minWOf(p.kind) + GAP, xpS + ((p.end - p.start) / 60) * HOUR_W + GAP);
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
  useEffect(() => {
    if (actionId) { sheetAnim.setValue(0); Animated.timing(sheetAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
  }, [actionId, sheetAnim]);
  useEffect(() => {
    if (editingBreaks) { editAnim.setValue(0); Animated.timing(editAnim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
  }, [editingBreaks, editAnim]);
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
  const laidLanes = lanes.map((l) =>
    l.blocks.map((b, i) => {
      const left = xAt(b.start);
      const succ = l.blocks[i + 1];
      const rawW = Math.max(minWOf(b.kind), xAt(b.end) - left);
      const capW = succ ? (xAt(succ.start) - GAP - left) : Infinity;   // لا يتجاوزُ بدايةَ تاليه
      const width = Math.max(minWOf(b.kind), Math.min(rawW, capW));
      const prev = i > 0 ? l.blocks[i - 1] : null;
      const prevEnd = prev ? ((prev.kind === 'cur' || prev.kind === 'over') ? Math.max(prev.end, prev.start + estMinutes(prev.p)) : prev.end) : -Infinity;
      const idle = prev ? (b.start - prevEnd) : 0;   // فراغٌ زمنيٌّ قبلَها (لخيطِ الفراغِ المنقّط)
      return { b, left, width, idle };
    })
  );
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
              <Text style={full.eyebrow}>{fmtToday()}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={[full.iconBtn, full.breakBtn]} onPress={openEditor}><Text style={full.breakBtnTxt}>☕ Break</Text></TouchableOpacity>
              <TouchableOpacity style={full.iconBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={full.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <View style={full.titleRow}>
              <View style={{ flexShrink: 1 }}>
                <Text style={full.title}>Today's chairs</Text>
                <Text style={full.sub}>{lanes.length} clinics · {fmtHM(dayStart)} – {fmtHM(dayEnd)}</Text>
              </View>
              <View style={full.clockWrap}>
                <Text style={full.clockT}>{fmtHM(nowMin)}</Text>
                <View style={full.clockL}>
                  <View style={full.clockDotWrap}>
                    <Animated.View pointerEvents="none" style={[full.clockRing, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} />
                    <View style={full.clockDot} />
                  </View>
                  <Text style={full.clockLTxt}>{sim.on ? 'SIM' : 'LIVE'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* شريطُ المحاكاة (مسرِّعٌ زمنيّ للاختبار) */}
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
          {sim.on && (
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
              <ScrollView horizontal style={{ flex: 1 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: contentW }}>
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
                          {/* عيادةٌ بلا مرضى */}
                          {laid.length === 0 ? (
                            <View style={[full.vacant, { left: scale(8), width: contentW - scale(16) }]}>
                              <View style={[full.vacantPill, { left: Math.max(scale(4), nowX - scale(104)) }]}>
                                <Ionicons name="bed-outline" size={scale(14)} color="#8CA0A8" />
                                <Text style={full.vacantTxt}>Chair free</Text>
                              </View>
                            </View>
                          ) : null}
                          {/* خيوطُ الفراغِ الصامتةُ بين مريضَين — نقاطٌ صغيرةٌ لا خطّ (البورد المتقطّعُ يُرسَمُ صلبًا في RN) */}
                          {laid.map((o, i) => {
                            if (i === 0 || o.idle < 5) return null;
                            const prev = laid[i - 1];
                            const gx = prev.left + prev.width;
                            const gw = o.left - gx;
                            if (gw < scale(10)) return null;
                            const n = Math.min(40, Math.max(2, Math.floor((gw - scale(8)) / scale(7))));
                            return (
                              <View key={'idle' + i} pointerEvents="none" style={{ position: 'absolute', left: gx + scale(4), width: gw - scale(8), top: laneH / 2 - scale(1), height: scale(2), flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
                                {Array.from({ length: n }).map((_, d) => <View key={d} style={full.idleDot} />)}
                              </View>
                            );
                          })}
                          {/* الكتل: استراحةٌ كريميّةٌ أو كرتُ مريض */}
                          {laid.map(({ b, left, width }, i) => {
                            if (b.kind === 'break') {
                              const moved = b.orig != null && b.orig !== b.start;
                              return (
                                <View key={i} pointerEvents="none" style={[full.brk, { left, width }]}>
                                  <View style={full.brkChip}><Text style={full.brkChipTxt}>☕</Text></View>
                                  <Text style={full.brkS}>{fmtHM(b.start)} · {Math.round(b.end - b.start)} min</Text>
                                  {moved ? <Text style={full.brkMoved}>was <Text style={full.brkMovedOld}>{fmtHM(b.orig!)}</Text></Text> : null}
                                </View>
                              );
                            }
                            return <Card key={i} b={b} left={left} width={width} nowMin={nowMin} onPress={() => setActionId(b.p.id)} />;
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
                {sim.on && <Text style={full.actSimNote}>محاكاة — إجراءٌ افتراضيٌّ لا يُحفَظ</Text>}

                {/* ١ — إدخالُ العيادة: كلُّ كرسيٍّ يقولُ حالَه، والمشغولُ معطَّل */}
                <Text style={full.shLabel}>Enter clinic</Text>
                <View style={full.chairRow}>
                  {lanes.map((l, li) => {
                    const cst = chairStatus[li];
                    const on = actEntered && actP.clinic === l.clinic;
                    const disabled = actNA || (!cst.free && !on);
                    return (
                      <TouchableOpacity key={l.clinic} disabled={disabled}
                        style={[full.chair, on && full.chairOn, disabled && full.chairOff]}
                        onPress={() => { actions.onEnterClinic(actP.id, l.clinic); setActionId(null); }}>
                        <Text style={[full.chairN, on && { color: '#05302A' }]}>{clinicNum(l.clinic) || (li + 1)}</Text>
                        <Text style={[full.chairS, cst.free ? full.chairSfree : full.chairSbusy, on && { color: 'rgba(5,48,42,0.7)' }]}>{cst.free ? 'free' : 'busy'}</Text>
                        <Text style={[full.chairT, on && { color: 'rgba(5,48,42,0.7)' }]}>{cst.free ? 'now' : (cst.till && cst.till > nowMin ? `till ${fmtHM(cst.till)}` : 'overdue')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ٢ — غيرُ متاح (تبديل) */}
                <TouchableOpacity style={[full.actBtn, actNA && full.actBtnNAOn]} onPress={() => { actions.onToggleNA(actP.id); setActionId(null); }}>
                  <Text style={[full.actBtnTxt, actNA && full.actBtnNAOnTxt]}>{actNA ? 'Patient available' : 'Patient not available'}</Text>
                </TouchableOpacity>

                {/* ٣ — إنهاء (نفسُ مسارِ زرِّ Done) */}
                <TouchableOpacity style={[full.actDone, (!actEntered || actNA) && full.actDoneOff]} disabled={!actEntered || actNA}
                  onPress={() => { setActionId(null); actions.onDone(actP.id); }}>
                  <Text style={full.actDoneTxt}>Done</Text>
                </TouchableOpacity>
                {!actEntered && !actNA ? <Text style={full.hint}>اختَرْ عيادةً لإدخالِ المريضِ أوّلًا</Text> : null}
                {actNA ? <Text style={full.hint}>المريضُ خارجَ الدورِ الآن</Text> : null}

                <TouchableOpacity style={full.actClose} onPress={() => setActionId(null)}><Text style={full.actCloseTxt}>إغلاق</Text></TouchableOpacity>
              </Animated.View>
              </View>
            </View>
          )}

          {/* محرِّرُ أوقاتِ البريك (لوحٌ كريميٌّ في القلب — إعدادٌ لا إجراءٌ على مريض) */}
          {editingBreaks && (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={24} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={full.editScrim}>
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setEditingBreaks(false)} />
              <Animated.View style={[full.editCard, { opacity: editAnim, transform: [{ translateY: editAnim.interpolate({ inputRange: [0, 1], outputRange: [scale(14), 0] }) }] }]}>
                <View style={full.editHd}>
                  <View style={full.editHdIcon}><Text style={{ fontSize: scale(14) }}>☕</Text></View>
                  <View>
                    <Text style={full.editHdT}>أوقاتُ الاستراحة</Text>
                    <Text style={full.editHdS}>لكلِّ العيادات · تُطبَّقُ فورًا</Text>
                  </View>
                </View>
                <ScrollView style={{ maxHeight: scale(216) }}>
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
export function QueueTimelinePager({ patients, clinicId, statsNode, currentDoctorName, onSchedule, onEnterClinic, onToggleNA, onDone }:
  { patients: Patient[]; clinicId?: string | null; statsNode: React.ReactNode; currentDoctorName?: string;
    onSchedule?: (lanes: Lane[], chairCount: number, breaks: Break[]) => void;
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
    clinicCount >= 1 ? Array.from({ length: clinicCount }, (_, i) => `Clinic ${i + 1}`) : [],
    [clinicCount]);

  // ساعةُ المحاكاة: تتقدّمُ بسرعةٍ مختارةٍ حتّى 9م ثمّ تتوقّف
  const simSpeed = SIM_SPEEDS[simSpeedIdx];
  useEffect(() => {
    if (!simOn || !simPlaying) return;
    const id = setInterval(() => {
      setSimNowMin((m) => Math.min(21 * 60, m + simSpeed * 0.25));
    }, 250);
    return () => clearInterval(id);
  }, [simOn, simPlaying, simSpeed]);

  // بياناتٌ فعّالة:
  //  • المحاكاة (تجربة) = عالَمٌ افتراضيٌّ معزول: الحالةُ من إجراءاتِك أنتَ (applySimActs)، والوقتُ
  //    من ساعتِها الافتراضيّة — تجاهلٌ تامٌّ لأوقاتِ المرضى الحقيقيّة، فلا يتسرّبُ الوقتُ الفعليّ.
  //  • بدون محاكاة = الوقتُ الفعليُّ والحالةُ الحقيقيّة (يأتي ربطُه حيًّا لاحقًا).
  const simChairs = chairs.length ? chairs : ['Clinic 1', 'Clinic 2', 'Clinic 3'];
  const effNow = simOn ? Math.round(simNowMin) : nowMin;
  const effPatients = useMemo(
    () => (simOn ? applySimActs(patients, simActs, currentDoctorName) : patients),
    [simOn, patients, simActs, currentDoctorName],
  );
  const effChairs = simOn ? simChairs : chairs;
  const data = useMemo(() => buildLanes(effPatients, effNow, effChairs, breaks), [effPatients, effNow, effChairs, breaks]);

  // نُبلّغُ الشاشةَ بالجدولِ الحاليِّ نفسِه المعروضِ (محاكاةً كان أو وقتًا فعليًّا) كي يعتمدَه
  // فحصُ توفّرِ حجزِ موعدِ الدخول في الكروت — فيطابقُ الحجزُ ما تراه على المخطّطِ تمامًا.
  useEffect(() => { onSchedule?.(data.lanes, effChairs.length, breaks); }, [data, effChairs, breaks, onSchedule]);

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
          return { ...prev, [id]: { ...prev[id], na: !nowNA } };
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

      <FullTimeline visible={showFull} onClose={() => setShowFull(false)} data={data} nowMin={effNow} topInset={insets.top} bottomInset={insets.bottom} sim={simApi} breaks={breaks} onSaveBreaks={onSaveBreaks} actions={actions} />
    </View>
  );
}

const mini = scaledStyleSheet({
  card: { minHeight: 150, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', paddingVertical: 12, paddingHorizontal: 14, justifyContent: 'center' },
  expIcon: { position: 'absolute', top: 8, right: 12, zIndex: 3 },
  expTxt: { fontSize: 15, color: '#64748b' },
  body: { flexDirection: 'row', flex: 1, alignItems: 'center' },
  labels: { justifyContent: 'center' },
  labelCell: { width: 34, height: 27, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  lbl: { fontSize: 12, fontWeight: '800', color: '#334155' },
  tracks: { flex: 1, position: 'relative', paddingLeft: 6 },
  trackRow: { height: 27, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 8, position: 'relative', overflow: 'hidden' },
  blk: { position: 'absolute', top: 3, bottom: 3, paddingHorizontal: 4, borderRadius: 5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  q: { fontSize: 13, fontWeight: '800' },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#0E7C66' },
  nowDot: { position: 'absolute', top: -3, left: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#0E7C66' },
  empty: { position: 'absolute', alignSelf: 'center', top: '42%', fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  ruler: { flexDirection: 'row', marginTop: 5 },
  rulerTicks: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 6 },
  tick: { fontSize: 10, color: '#94a3b8', fontWeight: '600' },
  simBadge: { position: 'absolute', top: 8, left: 12, zIndex: 3, backgroundColor: '#0E7C66', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  simBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },
}) as any;

const full = scaledStyleSheet({
  // ── الرأس ──
  head: { paddingHorizontal: 22, paddingTop: 4 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: '#8CA0A8' },
  iconBtn: { height: 34, minWidth: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  breakBtn: { backgroundColor: 'rgba(248,236,214,0.72)', borderColor: 'rgba(212,186,148,0.6)' },
  breakBtnTxt: { fontSize: 12, fontWeight: '800', color: '#7A6446' },
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
  // ── الاستراحة (كريميّة) ──
  brk: { position: 'absolute', top: 13, bottom: 13, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 3, overflow: 'hidden', backgroundColor: 'rgba(250,239,220,0.82)', borderWidth: 1, borderColor: 'rgba(212,186,148,0.5)' },
  brkChip: { width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  brkChipTxt: { fontSize: 11 },
  brkS: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4, color: '#7A6446' },
  brkMoved: { fontSize: 7.5, fontWeight: '800', color: '#6B3E0B', backgroundColor: 'rgba(251,191,36,0.34)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  brkMovedOld: { textDecorationLine: 'line-through', color: '#8A6A2E' },
  // ── خطُّ الآن ──
  nowPill: { position: 'absolute', top: 4, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#0E7C66' },
  nowPillTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  // ── نافذةُ الإجراءات (لوحٌ سفليّ) ──
  sheetScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(10,32,38,0.26)' },
  sheet: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 22, marginHorizontal: 11, marginBottom: 11, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(90,112,121,0.32)', alignSelf: 'center', marginBottom: 13 },
  shHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7DD3C0' },
  shBadgeHollow: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(14,124,102,0.5)', borderStyle: 'dashed' },
  shBadgeNA: { borderColor: 'rgba(120,124,160,0.6)' },
  shBadgeTxt: { fontSize: 14, fontWeight: '800' },
  shName: { fontSize: 16, fontWeight: '800', color: '#12232A' },
  shMeta: { marginTop: 2, fontSize: 10.5, fontWeight: '600', color: '#5A7079' },
  shState: { marginLeft: 'auto', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(140,160,168,0.16)' },
  shStateLive: { backgroundColor: 'rgba(125,211,192,0.28)' },
  shStateLate: { backgroundColor: 'rgba(239,68,68,0.16)' },
  shStateTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  actSimNote: { marginTop: 11, textAlign: 'center', fontSize: 10.5, fontWeight: '800', color: '#0E7C66', backgroundColor: 'rgba(125,211,192,0.2)', borderRadius: 9, paddingVertical: 7, overflow: 'hidden' },
  shLabel: { marginTop: 15, marginBottom: 8, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, color: '#8CA0A8' },
  chairRow: { flexDirection: 'row', gap: 6 },
  chair: { flex: 1, paddingVertical: 9, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.32)' },
  chairOn: { backgroundColor: '#7DD3C0', borderColor: '#0E7C66' },
  chairOff: { opacity: 0.42 },
  chairN: { fontSize: 15, fontWeight: '800', color: '#31454D' },
  chairS: { marginTop: 4, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  chairSfree: { color: '#0E7C66' },
  chairSbusy: { color: '#8CA0A8' },
  chairT: { marginTop: 1, fontSize: 8, fontWeight: '700', color: '#8CA0A8' },
  actBtn: { marginTop: 15, paddingVertical: 12, borderRadius: 15, alignItems: 'center', backgroundColor: 'rgba(140,160,168,0.13)', borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.36)' },
  actBtnTxt: { fontSize: 13.5, fontWeight: '800', color: '#31454D' },
  actBtnNAOn: { backgroundColor: '#5A7079', borderColor: '#31454D' },
  actBtnNAOnTxt: { color: '#fff' },
  actDone: { marginTop: 9, paddingVertical: 13, borderRadius: 15, alignItems: 'center', backgroundColor: '#0E7C66' },
  actDoneOff: { backgroundColor: 'rgba(140,160,168,0.35)' },
  actDoneTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  hint: { marginTop: 7, fontSize: 10, fontWeight: '700', textAlign: 'center', color: '#8CA0A8' },
  actClose: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  actCloseTxt: { fontSize: 13.5, fontWeight: '700', color: '#6B7280' },
  // ── محرِّرُ البريك (كريميّ في القلب) ──
  editScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(10,32,38,0.26)' },
  editCard: { width: '100%', maxWidth: 360, padding: 17, borderRadius: 26, backgroundColor: 'rgba(253,247,238,0.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  editHd: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  editHdIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  editHdT: { fontSize: 15, fontWeight: '800', color: '#5F4E36' },
  editHdS: { marginTop: 1, fontSize: 9.5, fontWeight: '700', color: '#9A8564' },
  editEmpty: { fontSize: 12, color: '#A8926F', textAlign: 'center', paddingVertical: 22 },
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
