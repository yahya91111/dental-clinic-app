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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Animated, Easing, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { scale, scaledStyleSheet, SCREEN } from '../../lib/scale';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getScheduleSettings, updateScheduleBreaks, updateChartChairs } from '../../lib/database';
import { Patient, TREATMENT_DURATIONS } from './constants';

// قلبُ الترتيب في ملفٍّ مستقلٍّ بلا React — كي يُشغَّلَ ويُختبَرَ وحدَه.
// (scripts/test-timeline-wall.ts)
import {
  buildLanes, slotAvailable, shiftFit, snapshotChart, estMinutes, hasDuration, isPriority,
  minutesOfDay, isRealClinic, clinicNum, localDay, drawWindow, solveAxis, foldSide, foldLips, shiftWall,
} from './queueLanes';
import type { Kind, Blk, Lane, TimelineData, Break, DayChart, Claim } from './queueLanes';
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
//
// وهي **بيئةُ عملٍ لنا لا ميزةٌ للطبيب**: يُطوى شريطُها عن الإصدارِ حينَ لا نحتاجُه.
// مفتاحٌ واحدٌ لا حذف — يبقى عملُها كاملًا في الملفّ. (مفتوحٌ الآنَ لتجربةِ تصميمِ المخطّط.)
const SIM_ENABLED: boolean = true;

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

// المخطّطُ يُمرَّرُ أفقيًّا، وشريطُ اليومِ يقرأُ إزاحتَه. نقرؤها بالمحرّكِ الأصليِّ فلا إعادةَ
// رسمٍ لكلِّ إطار، وscrollTo يمرُّ عبرَ المرجعِ كما هو (createAnimatedComponent يُمرّرُ المراجع).
const AnimatedScrollView = Animated.ScrollView as unknown as typeof ScrollView;

// مادّةُ الصفحة — «مدخّن · عمق ٢٠»، القيمُ نفسُها في QueueBoard وPatientCardV2 وQueueStatsStrip
const MINI_SMOKE: [string, string] = ['rgba(209,219,222,0.49)', 'rgba(190,203,208,0.49)'];
const MINI_GLOSS: [string, string] = ['rgba(255,255,255,0.58)', 'rgba(255,255,255,0)'];
const MINI_FLOOR: [string, string] = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)'];
const MINI_RIM = 'rgba(255,255,255,0.80)';
const MINI_TEAL_G: [string, string] = ['#12B39D', '#0B7F71'];
const AMBER_G: [string, string] = ['#F0A93C', '#C97D14'];
// وَشْمُ البلاطة: يبدأُ من جهةِ الشارةِ (اليمين) ويفنى قِبَلَ الوقتِ — فلا حافّةَ له تُقرأُ صندوقًا
const MINI_TEAL_W: [string, string] = ['rgba(18,192,166,0.20)', 'rgba(18,192,166,0.02)'];
const MINI_AMBER_W: [string, string] = ['rgba(240,169,60,0.22)', 'rgba(240,169,60,0.02)'];

// ═══════════════ الورقةُ المطويّة — مادّةُ المخطّطِ المكبّر ═══════════════
// الزمنُ عُمق: ما مضى غاصَ في السطحِ وانطبقَ عليه، والجاري مستقرٌّ عليه، وما لم يأتِ يحومُ فوقَه.
// وخطُّ الآنَ ليس خطًّا مرسومًا بل **حافّةُ سطحٍ**: شفةٌ تلتقطُ الضوءَ وظلٌّ تُلقيه إلى الوراء،
// وحجابٌ فاتحٌ على كلِّ ما بعدَها. وتبديلُ الشفتِ **طيّةٌ** في الورقةِ لا كرتٌ يتكرّر.
const HEAD_G: [string, string] = ['rgba(255,255,255,0.66)', 'rgba(255,255,255,0.22)'];
const HOUR_ON: [string, string] = ['rgba(14,159,140,0.16)', 'rgba(14,159,140,0.02)'];
const CREASE = 'rgba(255,255,255,0.95)';
const HEAD_SHADE: [string, string] = ['rgba(10,35,45,0.13)', 'rgba(10,35,45,0)'];
// الحجاب: المستقبلُ نصفُ ورقةٍ أعلى — يفتحُ الأرضَ بعدَ الآنَ ولا يُغرِقُها
const VEIL: [string, string, string] = ['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.13)', 'rgba(255,255,255,0.07)'];
const BLOOM: [string, string, string] = ['rgba(14,159,140,0)', 'rgba(14,159,140,0.20)', 'rgba(14,159,140,0)'];
// تبديلُ الشفت: عمودٌ رفيعٌ هادئ. هالتُه **متماثلةٌ** على جانبَيه (فلا يبدو مضاءً من جهةٍ
// مظلمًا من أخرى)، وجسمُه يخفتُ عندَ طرفَيه فلا حافّةَ له تُقطَع، وشفةٌ بيضاءُ تُبقيه واضحًا.
const SEAM_HALO_L: [string, string] = ['rgba(96,116,126,0)', 'rgba(96,116,126,0.13)'];
const SEAM_HALO_R: [string, string] = ['rgba(96,116,126,0.13)', 'rgba(96,116,126,0)'];
// خاتمُ الورقة: يشتدُّ عندَ طرفِها ويخفتُ إلى داخلِها — يُقلَبُ اتّجاهُه بحسبِ الطرف
const SEAM_SEAL: [string, string, string] = ['rgba(78,98,108,0.36)', 'rgba(78,98,108,0.10)', 'rgba(78,98,108,0)'];
const SEAM_BODY: [string, string, string, string] =['rgba(108,128,138,0.06)', 'rgba(108,128,138,0.46)', 'rgba(108,128,138,0.46)', 'rgba(108,128,138,0.06)'];
// المَجْرى (البريكُ المرن): رمالٌ ناعمةٌ لا حفرةٌ داكنة — دفءٌ كهرمانيٌّ خفيفٌ يعلو قاعَه، بلا أيقونةٍ ولا ظلّ
const TROUGH_FILL: [string, string] = ['rgba(246,226,190,0.92)', 'rgba(236,208,163,0.92)'];
const TROUGH_GLOW: [string, string, string] = ['rgba(255,214,150,0.55)', 'rgba(255,224,176,0.18)', 'rgba(255,232,200,0)'];
// غِلالةُ الغائرِ: ظلٌّ من أعلاه وضوءُ الحافّةِ ينطبقُ على قاعِه
const SUNK_IN: [string, string, string] = ['rgba(10,35,45,0.22)', 'rgba(10,35,45,0)', 'rgba(255,255,255,0.30)'];
// ظلُّ الحائمِ على الورقة. الضبابُ الحقيقيُّ ثقيلٌ في الهاتف، فنصنعُه من ثلاثِ طبقاتٍ متراكزة:
// كلُّ طبقةٍ تخفتُ إلى حافّتَيها **عموديًّا** بتدرّجٍ، وتضيقُ عن التي تحتَها **أفقيًّا** — فيتلاشى
// الظلُّ في الاتّجاهَين معًا ويصيرُ لطخةً مستديرةً ليّنةً بلا حدٍّ يُرى.
const LAND_1: [string, string, string] = ['rgba(10,35,45,0)', 'rgba(10,35,45,0.06)', 'rgba(10,35,45,0)'];
const LAND_2: [string, string, string] = ['rgba(10,35,45,0)', 'rgba(10,35,45,0.08)', 'rgba(10,35,45,0)'];
const LAND_3: [string, string, string] = ['rgba(10,35,45,0)', 'rgba(10,35,45,0.10)', 'rgba(10,35,45,0)'];

// ═══════════════ بطاقةُ المعلومات (في موضع الإحصاء) — لا مخطّطٌ مصغّر، بل «التالي في الدور» وملخّصٌ سريع ═══════════════
function MiniTimeline({ data, nowMin, simOn }: { data: TimelineData; nowMin: number; simOn?: boolean }) {
  const { lanes } = data;
  const flat = lanes.flatMap((l) => l.blocks.map((b) => ({ b, clinic: l.short })));
  const serving = flat.filter((x) => x.b.kind === 'cur' || x.b.kind === 'over');
  const upcoming = flat.filter((x) => x.b.kind === 'fut' || x.b.kind === 'eld').sort((a, b) => a.b.start - b.b.start);
  const naCount = flat.filter((x) => x.b.kind === 'na').length;
  // ── «التالي» أحقُّ مَن ينتظرُ لا أبكرُ مَن يبدأ ──
  // كبيرُ السنِّ وذو الاحتياجِ الخاصِّ يتقدّمانِ على الساعة: هما مَن يُنادى اسمُه أوّلًا وإن
  // فرغَ لسواهما كرسيٌّ قبلَ كرسيِّهما. وإن اجتمعَ أكثرُ من واحدٍ فليس بينهم إلّا رقمُ الدور.
  // ثمّ البقيّةُ بأوقاتِهم المتوقَّعةِ كما هي.
  const order = [...upcoming].sort((a, b) => {
    const pa = isPriority(a.b.p) ? 0 : 1, pb = isPriority(b.b.p) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (pa === 0) return (a.b.p.queue_number || 0) - (b.b.p.queue_number || 0);
    return a.b.start - b.b.start;
  });
  const next = order[0] ?? null;                    // التاليَ في الدور
  const then = order.slice(1, 3);                   // الذين بعده (اثنان)
  // متى يُغلَقُ البابُ فعلًا: نهايةُ آخرِ علاجٍ على أيِّ كرسيّ. البريكُ ليس علاجًا،
  // و«غيرُ المتاح» لم يُعالَجْ أصلًا — فلا يمدُّ أحدُهما اليومَ ولا يُحسَبُ آخِرَه.
  const lastEnd = flat.reduce(
    (m, x) => (x.b.kind === 'break' || x.b.kind === 'na') ? m : Math.max(m, x.b.end), -1);
  const caseOf = (p: Patient) => (p.treatment && p.treatment !== 'Treatment') ? p.treatment : 'Treatment';

  const eld = next?.b.kind === 'eld';

  return (
    <View style={mini.card}>
      {/* المادّةُ نفسُها: قاعدةٌ مدخّنة، ثمّ بريقُ الحافّةِ العليا وضوءُ القاع */}
      <LinearGradient colors={MINI_SMOKE} start={{ x: 0.16, y: 0 }} end={{ x: 0.84, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={MINI_GLOSS} style={mini.gloss} pointerEvents="none" />
      <LinearGradient colors={MINI_FLOOR} style={mini.floor} pointerEvents="none" />

      <View style={mini.head}>
        <Text style={mini.eyebrow}>{next ? 'NEXT UP' : 'QUEUE'}</Text>
        {simOn && <View style={mini.simBadge}><Text style={mini.simBadgeTxt}>SIM</Text></View>}
        <Text style={mini.clock}>{fmtHM(nowMin)}</Text>
        <View style={mini.exp}><Text style={mini.expTxt}>⤢</Text></View>
      </View>

      {next ? (
        <>
          {/* بلاطةُ التالي: مرفوعةٌ عن السطحِ بوَشْمٍ فيروزيٍّ خفيف، والرقمُ يمينَ الاسمِ كما في الكرت */}
          <View style={mini.slab}>
            <LinearGradient
              colors={eld ? MINI_AMBER_W : MINI_TEAL_W}
              start={{ x: 0.9, y: 0 }} end={{ x: 0.1, y: 1 }}
              style={StyleSheet.absoluteFill} pointerEvents="none"
            />
            <LinearGradient colors={eld ? AMBER_G : MINI_TEAL_G} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={mini.badge}>
              <Text style={mini.badgeTxt}>{next.b.p.queue_number}</Text>
            </LinearGradient>
            <View style={mini.who}>
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
              {then.map((x, i) => (
                <View key={i} style={mini.thenChip}>
                  <View style={mini.thenNumBox}><Text style={mini.thenNum}>{x.b.p.queue_number}</Text></View>
                  <Text style={mini.thenName} numberOfLines={1}>{x.b.p.name}</Text>
                </View>
              ))}
              {then.length === 1 ? <View style={mini.thenGhost} /> : null}
            </View>
          ) : null}
        </>
      ) : (
        <View style={mini.emptyWrap}>
          <Text style={mini.emptyBig}>{serving.length ? 'No one waiting' : 'No patients yet'}</Text>
          <Text style={mini.emptySub}>
            {serving.length ? `${serving.length} patient${serving.length > 1 ? 's' : ''} in the chair now` : "Add patients to see who's next"}
          </Text>
        </View>
      )}

      <View style={mini.statsRow}>
        <View style={mini.stat}><View style={[mini.dot, mini.dotServing]} /><Text style={mini.statTxt}>{serving.length} IN CHAIR</Text></View>
        <View style={mini.stat}><View style={[mini.dot, mini.dotWait]} /><Text style={mini.statTxt}>{upcoming.length} WAITING</Text></View>
        {lastEnd >= 0 ? <View style={mini.stat}><View style={[mini.dot, mini.dotEnd]} /><Text style={mini.statTxt} numberOfLines={1}>ENDS {fmtHM(lastEnd)}</Text></View> : null}
        {naCount ? <View style={mini.stat}><View style={[mini.dot, mini.dotAway]} /><Text style={mini.statTxt}>{naCount} AWAY</Text></View> : null}
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
  // مريضٌ له ملفٌّ دائم: يُفتَحُ ملفُّه من المخطّطِ مباشرةً كما يُفتَحُ من كرتِ الدور
  onProfile?: (patientId: string) => void;
};

// ═══════════════ الكروت: ثلاثةُ أعماقٍ لا ثمانيةُ ألوان ═══════════════
// depth = موضعُ الكرتِ من سطحِ الورقة، وهو الفرقُ الأوّلُ الذي تراه العين:
//   sunk = غاصَ في السطحِ وانطبقَ عليه ضوءُ الحافّة (ما مضى)
//   rest = مستقرٌّ على السطحِ بظلٍّ قصيرٍ ووهجٍ من حالتِه (ما يجري الآن)
//   air  = يحومُ فوقَه شفّافًا، وكلّما بَعُدَ دورُه ارتفعَ أكثرَ وخفَّ ظلُّه (ما لم يأتِ)
// والحبرُ واحدٌ في الثلاثة، فالاسمُ يُقرأُ في كلِّ حال — واللونُ للحالةِ لا للخلفيّة.
type Depth = 'sunk' | 'rest' | 'air';
type CardVis = {
  depth: Depth; bg?: string; grad?: [string, string]; glow?: [string, string];
  border: string; ink: string; sub: string;
  badgeBg?: string; badgeGrad?: [string, string]; badgeDash?: string; badgeInk: string;
  trk: string; fil: string;
};
// ألوانُ شريطِ اليوم: أثرٌ واحدٌ لكلِّ كتلةٍ بلونِ حالتِها — اليومُ كلُّه يُقرأُ في سطر
const RIB_C: { [k in Kind]: string } = {
  done: 'rgba(147,165,173,0.75)', lateDone: 'rgba(217,83,79,0.80)', cur: '#0E9F8C', over: '#E1483C',
  fut: 'rgba(14,124,102,0.40)', eld: '#E0A32E', na: 'rgba(124,129,168,0.70)', break: 'rgba(212,186,148,0.95)',
};

const CARD: { [k in Kind]?: CardVis } = {
  done:     { depth: 'sunk', bg: 'rgba(176,190,196,0.55)', border: 'rgba(255,255,255,0.35)',
              ink: '#43585F', sub: '#6C838B', badgeBg: 'rgba(255,255,255,0.55)', badgeInk: '#5A7079',
              trk: 'rgba(10,35,45,0.13)', fil: 'rgba(90,112,121,0.55)' },
  lateDone: { depth: 'sunk', bg: 'rgba(206,160,155,0.52)', border: 'rgba(255,255,255,0.40)',
              ink: '#6E2B26', sub: '#8A5A54', badgeBg: 'rgba(217,83,79,0.80)', badgeInk: '#FFFFFF',
              trk: 'rgba(110,43,38,0.14)', fil: 'rgba(178,60,54,0.60)' },
  cur:      { depth: 'rest', grad: ['rgba(255,255,255,0.94)', 'rgba(238,247,246,0.88)'],
              glow: ['rgba(18,192,166,0.22)', 'rgba(18,192,166,0)'], border: 'rgba(255,255,255,0.95)',
              ink: '#06322A', sub: '#3F6B62', badgeGrad: ['#12B39D', '#0B7F71'], badgeInk: '#FFFFFF',
              trk: 'rgba(6,50,42,0.12)', fil: '#0E9F8C' },
  over:     { depth: 'rest', grad: ['rgba(255,255,255,0.94)', 'rgba(250,240,238,0.90)'],
              glow: ['rgba(238,84,68,0.26)', 'rgba(238,84,68,0)'], border: 'rgba(255,255,255,0.95)',
              ink: '#5E1710', sub: '#8A4238', badgeGrad: ['#F4695C', '#C3311F'], badgeInk: '#FFFFFF',
              trk: 'rgba(94,23,16,0.14)', fil: '#D9534F' },
  fut:      { depth: 'air', bg: 'rgba(255,255,255,0.42)', border: 'rgba(255,255,255,0.92)',
              ink: '#22434C', sub: '#5A7079', badgeBg: 'rgba(255,255,255,0.72)',
              badgeDash: 'rgba(14,124,102,0.50)', badgeInk: '#0B7F71',
              trk: 'rgba(18,35,42,0.10)', fil: 'transparent' },
  // الأولويّة (كبيرُ السنّ / الاحتياجاتُ الخاصّة): ذهبيٌّ صريحٌ يُعرَفُ من بعيد — كانَ باهتًا فلا يُقرأ
  eld:      { depth: 'air', bg: 'rgba(253,232,190,0.86)', border: 'rgba(222,163,44,0.95)',
              ink: '#5A3E08', sub: '#87621A', badgeBg: 'rgba(255,255,255,0.78)',
              badgeDash: 'rgba(176,126,18,0.85)', badgeInk: '#7A5410',
              trk: 'rgba(122,84,16,0.18)', fil: 'transparent' },
  // غيرُ المتاحِ: يحومُ كغيرِه من المنتظِرين — بنفسجيٌّ صريحٌ لا شبحيّ، فلا يختفي ولا يخفت
  na:       { depth: 'air', bg: 'rgba(223,224,244,0.88)', border: 'rgba(122,127,188,0.92)',
              ink: '#31355C', sub: '#575C93', badgeBg: 'rgba(255,255,255,0.78)',
              badgeDash: 'rgba(92,97,157,0.85)', badgeInk: '#454A79',
              trk: 'rgba(59,63,99,0.17)', fil: 'transparent' },
};

// ── الأولويّةُ صفةُ الإنسانِ لا صفةُ حالتِه ──
// اللونُ في هذا المخطّطِ للحالة، والذهبيُّ وحدَه للأولويّة — وقد كانا يتنازعانِ الكرتَ الواحد:
// فإذا أُنجِزَ كبيرُ السنِّ غلبتِ الحالةُ فصارَ رماديًّا كسائرِ المنجَزين، وضاعَ من الصفحةِ أنّه
// كان صاحبَ أولويّة. ولا يصحُّ: مضى العلاجُ ولم تمضِ صفتُه.
//   • المنجَزُ منهم → غائرٌ **ذهبيٌّ خافت**: عمقُ المنجَزِ نفسُه ولونُ الأولويّةِ مطفأً فيه،
//     فيُقرأُ «انتهى» و«كان أَولى» معًا في نظرةٍ واحدة.
//   • والمتأخّرُ منهم يبقى أحمرَ — فتأخيرُه خبرٌ أهمُّ من صفتِه — وتبقى **شارةُ رقمِه** ذهبيّةً
//     محدَّدةً بخطٍّ متقطّع، وهي وسمُ الأولويّةِ نفسُه في كلِّ حالاتِه، فلا يضيعُ الرجلُ في الخبر.
const DONE_ELD: CardVis = {
  depth: 'sunk', bg: 'rgba(214,190,140,0.55)', border: 'rgba(255,255,255,0.40)',
  ink: '#5A4712', sub: '#87703A', badgeBg: 'rgba(255,255,255,0.60)', badgeInk: '#7A5410',
  trk: 'rgba(70,52,10,0.15)', fil: 'rgba(150,116,40,0.55)',
};
const ELD_BADGE = { badgeBg: 'rgba(255,255,255,0.78)', badgeDash: 'rgba(176,126,18,0.85)', badgeInk: '#7A5410', badgeGrad: undefined };
const visOf = (b: Blk): CardVis => {
  const v = CARD[b.kind] ?? CARD.fut!;
  if (!isPriority(b.p)) return v;
  if (b.kind === 'done') return DONE_ELD;
  if (b.kind === 'lateDone') return { ...v, ...ELD_BADGE };
  return v;
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

// ظلٌّ ليّنٌ مستديرٌ يقعُ على الورقةِ تحتَ ما يحومُ فوقَها — والفُرجةُ بينَه وبينَ صاحبِه هي ما يجعلُه يُقرأُ طائرًا
function SoftShadow({ left, width, top }: { left: number; width: number; top: number }) {
  return (
    <View pointerEvents="none" style={[cs.landWrap, { left, width, top }]}>
      <LinearGradient colors={LAND_1} style={[cs.land1, { width }]} />
      <LinearGradient colors={LAND_2} style={[cs.land2, { left: width * 0.10, width: width * 0.80 }]} />
      <LinearGradient colors={LAND_3} style={[cs.land3, { left: width * 0.23, width: width * 0.54 }]} />
    </View>
  );
}

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
// الكروتُ كلُّها على سطرٍ واحدٍ وارتفاعٍ واحد. العمقُ يقولُه الظلُّ والمادّة:
// الغائرُ بلا ظلٍّ أصلًا، والمستقرُّ ظلُّه قصيرٌ كثيف، والحائمُ له **ظلٌّ منفصلٌ تحتَه** يبعدُ عنه
// فيبدو معلَّقًا في الهواءِ فوقَ الورقة.
function Card({ b, left, width, top, height, nowMin, onPress, onBarY }:
  { b: Blk; left: number; width: number; top: number; height: number;
    nowMin: number; onPress: () => void; onBarY?: (y: number) => void }) {
  const v = visOf(b);
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
  // الظلُّ يقولُ الارتفاع: الغائرُ بلا ظلٍّ أصلًا، والمستقرُّ ظلُّه قصيرٌ كثيف، والحائمُ ظلُّه
  // يطولُ ويخفتُ كلّما ارتفع. ونُخفّتُ الحائمَ البعيدَ قليلًا كي يُقرأَ الارتفاعُ على أندرويد أيضًا.
  const shade = v.depth === 'sunk'
    ? { shadowOpacity: 0, elevation: 0 }
    : v.depth === 'rest'
      ? { shadowColor: '#08202A', shadowOpacity: 0.30, shadowRadius: scale(20), shadowOffset: { width: 0, height: scale(11) }, elevation: 8 }
      : { shadowColor: '#08202A', shadowOpacity: 0.22, shadowRadius: scale(26), shadowOffset: { width: 0, height: scale(20) }, elevation: 5 };
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress}
      style={[cs.card, { left, width, top, height, borderColor: v.border },
        v.depth === 'sunk' ? cs.sunk : null, shade]}>
      {/* طبقةٌ داخليّةٌ تُقصُّ (overflow) لتحتضنَ الخلفيّةَ دونَ أن تبتلعَ ظلَّ الكرتِ الخارجيّ */}
      <View pointerEvents="none" style={[cs.clip, v.bg ? { backgroundColor: v.bg } : null]}>
        {v.grad ? <LinearGradient colors={v.grad} start={{ x: 0.16, y: 0 }} end={{ x: 0.84, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
        {/* الغائرُ: ظلٌّ ينسكبُ من حافّتِه العليا، وضوءُ السطحِ ينطبقُ على قاعِه */}
        {v.depth === 'sunk'
          ? <LinearGradient colors={SUNK_IN} locations={[0, 0.42, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          : null}
        {/* المستقرُّ: وهجُ حالتِه من ركنِه الأعلى */}
        {v.glow ? <LinearGradient colors={v.glow} start={{ x: 0.1, y: 0 }} end={{ x: 0.72, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
        {v.depth !== 'sunk' ? <View style={cs.gloss} /> : null}
      </View>
      <View style={cs.row1}>
        <Text style={[cs.name, { color: v.ink }]} numberOfLines={1}>{b.p.name}</Text>
        {/* الرقمُ يمينَ الاسمِ كما في كرتِ الدورِ واللوح */}
        <View style={[cs.badge, v.badgeDash
          ? { borderWidth: scale(1.3), borderStyle: 'dashed', borderColor: v.badgeDash, backgroundColor: v.badgeBg }
          : v.badgeGrad ? null : { backgroundColor: v.badgeBg }]}>
          {v.badgeGrad ? <LinearGradient colors={v.badgeGrad} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={cs.badgeFill} /> : null}
          <Text style={[cs.badgeTxt, { color: v.badgeInk }]}>{b.p.queue_number}</Text>
        </View>
      </View>
      {/* تحتَ الاسم: حاويةُ الوقتِ أمامَ نوعِ الحالة (Filling / Extraction …) — وسطرُ End time يبقى مكانَه بالأسفل. */}
      <View style={cs.metaRow}>
        <Text style={[cs.mCase, { color: v.sub }]} numberOfLines={1}>{caseType}</Text>
        {/* بعدَ الإنجاز: الوقتُ المستغرَقُ فعلًا (أو +التأخير) **أمامَ** المدّةِ المحدَّدة لا بدلًا منها —
            فمقارنةُ «كم قدّرتُ» بـ«كم استغرقتُ» هي الفائدةُ كلُّها، وحذفُ أحدِهما يُلغيها. */}
        {showActual ? (
          <View style={[cs.tPill, b.kind === 'lateDone' ? cs.actualLate : cs.actualEarly]}>
            <Text style={[cs.tPillTxt, { color: '#FFFFFF' }]} numberOfLines={1}>{actualTagText}</Text>
          </View>
        ) : null}
        <View style={[cs.tPill, { backgroundColor: v.trk }]}>
          <Text style={[cs.tPillTxt, { color: v.sub }]} numberOfLines={1}>{pillText}</Text>
        </View>
      </View>
      {/* شريطُ الوقتِ المتبقّي — ويُبلِّغُ ارتفاعَه مرّةً واحدةً كي يمتدَّ خيطُ الفراغِ على استقامتِه */}
      <View style={[cs.bar, { backgroundColor: v.trk }]}
        onLayout={onBarY ? (e) => onBarY(e.nativeEvent.layout.y) : undefined}>
        {!bar.empty ? <View style={[cs.barFill, { width: `${bar.fill}%` as any, backgroundColor: v.fil }]} /> : null}
        {!bar.empty && bar.tick >= 0 && bar.tick < 99.5 ? <View style={[cs.barTick, { left: `${bar.tick}%` as any, backgroundColor: v.ink }]} /> : null}
      </View>
      {b.kind === 'na'
        ? <Text style={[cs.time, { color: v.sub }]} numberOfLines={1}>{naMin != null ? `Called ${fmtHM(naMin)}` : 'Not available'}</Text>
        : <Text style={[cs.time, { color: v.sub }]} numberOfLines={1}>{b.p.appointment_min != null ? '🕐 ' : ''}End time {fmtHM(endMin)}</Text>}
      {/* صفُّ الطبيبِ يُحجَزُ دائمًا وإن خلا: الكروتُ متساويةُ المحتوى فيقعُ شريطُها كلِّها
          على ارتفاعٍ واحد — وعليه يستقيمُ خيطُ الفراغِ بينها امتدادًا لا كسرًا. */}
      <View style={cs.docRow}>
        {b.p.doctor_name ? (
          <>
            <Ionicons name="person" size={scale(9)} color={v.sub} />
            <Text style={[cs.doc, { color: v.sub }]} numberOfLines={1}>{b.p.doctor_name}</Text>
          </>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════ قاعدةُ الرسم: المساحةُ تُفهِم، والرقمُ يُخبِر ═══════════════
// لا مسافةَ في هذا المخطّطِ تساوي زمنًا. كان العرضُ يُشتَقُّ من المدّةِ فيتصادمُ مع
// أصغرِ عرضٍ يُقرأُ، فيزحفُ المنجَزُ يسارًا ويدفعُ ما قبلَه، ويختلفُ صفٌّ عن صفٍّ
// وقد تساوى وقتُهما. فصارتِ القاعدةُ: **كلُّ عنصرٍ يأخذُ ما يكفي ليُقرَأ**، وزيادةً
// **مضغوطةً** تُوحي بطولِه لا تُطابقُه، و**الرقمُ المكتوبُ عليه هو الحقيقة**.
// فالخواءُ الطويلُ يُطوى مهما طال، والمزدحمُ يتّسعُ بقدرِ ما فيه، والترتيبُ لا يكذبُ أبدًا.
const STEP = scale(7);              // أدنى تباعدٍ بين مرساتَين متجاورتَين
// ── مسافةُ الساعةِ الافتراضيّة ──
// طيُّ الخواءِ إلى خطوةٍ واحدةٍ أخفى نصفَ ساعاتِ اليوم، **وأوقفَ خطَّ الآنَ عندَ بدايةِ الكرت**:
// إن لم يشغلْ ربعُ الساعةِ مسافةً فلا مسافةَ يمشي عليها الخطُّ وهو يعالج. فللساعةِ الآنَ
// مسافةٌ افتراضيّةٌ **تكفي لظهورِ رقمِها**، والمحورُ يتوسّعُ فوقَها حيثُ يلزم. الاستثناءُ
// الوحيدُ داخلَ تبديلِ الشفت: وقتٌ لا عملَ فيه ولا رقمَ يُقرأُ فوقَه، فيبقى مطويًّا.
const HOUR_NOM = scale(58);
const CARD_MIN = scale(132);        // أرضيّةُ الكرت: ما يكفي لاسمِه ووقتِه وعلاجِه — لا يُقَصُّ دونَها أبدًا
const CUR_MIN = scale(120);
const FLEX_MIN = scale(96);         // البريكُ المرن يبقى مَجْرًى له حضورُه — لا يُختزَلُ خطًّا
const SEAM_W = scale(13);           // البريكُ الثابت (تبديلُ الشفت): عمودٌ رفيعٌ لحافّتَيه بدايةٌ ونهايةٌ بيضاوان
// إيحاءُ الطول: جذرٌ لا خطّ — علاجُ ساعةٍ أعرضُ من علاجِ عشرِ دقائقَ بفارقٍ يُلحَظُ ولا يُثقِل
const HINT = (min: number): number => Math.round(scale(20) * Math.sqrt(Math.max(0, min) / 10));
const drawnW = (b: Blk): number =>
  b.kind === 'break'
    ? (b.fixed ? SEAM_W : FLEX_MIN + Math.min(scale(40), HINT(b.end - b.start)))
    : ((b.kind === 'cur' || b.kind === 'over') ? CUR_MIN : CARD_MIN) + Math.min(scale(72), HINT(estMinutes(b.p)));

// ── الفراغُ بين مريضَين ──
// خيطٌ **متّصلٌ** من كرتٍ إلى كرتٍ يقرأُه الطرفُ صفًّا واحدًا لا قطعًا متناثرة، **رماديٌّ**
// وحدَه فلا لونَ يُنازعُ الكروتَ على الانتباه. ويظهرُ **دائمًا** ما دامَ حقيقيًّا — لم يعُدْ
// فضلةً تبقى بعدَ الكروتِ فيظهرَ مرّةً ويغيبَ مرّة. وطولُه ثلاثُ درجاتٍ **حدُّها الأدنى**
// يُحجَزُ في المحور: الأطولُ أطولُ قليلًا، ولا أحدَ منها يُطيلُ المخطّط.
const IDLE_MIN = [
  { max: 10, w: scale(54) },        // حتّى عشرِ دقائق
  { max: 30, w: scale(70) },        // إلى نصفِ ساعة
  { max: Infinity, w: scale(88) },  // فما فوق
];
const idleTier = (min: number) => IDLE_MIN.find((t) => min <= t.max) as typeof IDLE_MIN[0];
// أضيقُ ما يسعُ الرقمَ كاملًا («1hr 30min») — لا يضيقُ الوسمُ عنه ولو انعدمتِ المسافة
const IDLE_LBL = scale(54);
// إزاحةُ لوحةِ وقتِ الدخولِ عن حافّةِ كرتِها: خطوةٌ واحدةٌ إلى اليمين — بها يقعُ **رقمُها**
// على استقامةِ حرفِ الكرتِ الأوّل (حشوةُ اللوحةِ ٦ + هذه ٦ = حشوةُ الكرتِ اليسرى ١٢)،
// فتُقرأُ اللوحةُ والكرتُ عمودًا واحدًا لا حافّتَين متزاحمتَين.
const E_TAG_IN = scale(6);

// قاعدةُ حاجزِ التبديلِ (drawWindow) في queueLanes — زمنيّةٌ محضةٌ فتُختبَرُ وحدَها
// والجاري يُقاسُ بمدّتِه المتوقّعةِ لا بما مضى منها: عليها يمشي خطُّ الآنَ داخلَ كرتِه
const spanOf = (b: Blk): Blk =>
  (b.kind === 'cur' || b.kind === 'over')
    ? ({ ...b, end: Math.max(b.end, b.start + estMinutes(b.p)) } as Blk)
    : b;

// ═══════════════ المكبّر (ملء الشاشة) ═══════════════
// readOnly: عرضُ يومٍ مضى من الأرشيف. المخطّطُ نفسُه بلا يدٍ تُغيّره — لا محاكاةَ ولا
// تحريرَ بريكاتٍ ولا إجراءاتِ مريض. اليومُ انتهى، وما يُعرَضُ خبرٌ عنه لا تحكُّمٌ فيه.
// instant: فُتِحَ استئنافًا (عائدًا من ملفِّ مريضٍ دخلتَه من هنا) — فلا مقدّماتٍ ولا تلاشٍ:
// يُرسَمُ في مكانِه من أوّلِ إطارٍ كأنّك لم تغادرْه.
// pull: سحبٌ إلى الأسفلِ فيُسألُ الخادمُ الآن. اليومُ المحفوظُ لا يُسأل.
function FullTimeline({ visible, onClose, data, nowMin, topInset, bottomInset, sim, breaks, onSaveBreaks, chairCount, onSetChairCount, actions, readOnly, title, subtitle, instant, pull }:
  { visible: boolean; onClose: () => void; data: TimelineData; nowMin: number; topInset: number; bottomInset: number;
    sim: { on: boolean; playing: boolean; speed: number; toggle: () => void; playPause: () => void; cycleSpeed: () => void; reset: () => void };
    breaks: Break[]; onSaveBreaks: (b: Break[]) => void;
    chairCount: number; onSetChairCount: (n: number) => void; actions: BlockActions;
    readOnly?: boolean; title?: string; subtitle?: string; instant?: boolean;
    pull?: { refreshing: boolean; onRefresh: () => void } }) {
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
  // topH = رأسُ الجدول: حافّةٌ مطويّةٌ فوقَ الورقةِ تحملُ الساعاتِ — وهي الآنَ **علاماتٌ تطفو**
  // حيثُ تقعُ فعلًا (تتقاربُ في الهدوءِ وتتباعدُ في الزحام)، لا شبكةً متساويةً مفروضةً على الكروت
  // laneH اتّسعَ عن ٩٦: الكرتُ الحائمُ يرتفعُ عن مستقرِّه، فيلزمُه فراغٌ فوقَه لا يخرجُ منه إلى صفِّ الأوقات
  // بطاقةُ وقتِ الدخولِ تجلسُ في **قاعِ** الشريطِ (bottom) لا في رأسِه، والكرتُ رُفِعَ إليها
  // (CARD_TOP صغُر) — فيلتقيان ويُقرآنِ شيئًا واحدًا. وما فضلَ من الصفِّ يذهبُ إلى أسفلِ
  // الكرتِ حيثُ يقعُ ظلُّ الحائم، وهو أولى به.
  //
  // ⚠️ وارتفاعُ الشريطِ لا ينزلُ عن ٢٣: الرأسُ يُلقي تحتَ كسرتِه ظلًّا (shadeBand) بعمقِ ٦
  // داخلَ جسمِ الجدول، فبطاقةُ العيادةِ الأولى — وهي وحدَها الملاصقةُ للرأس — كانت تقعُ تحتَه
  // فتُقرأُ متداخلةً معه. فالفرقُ بين الشريطِ والبطاقةِ فُرجةٌ تُجاوِزُ ذلك الظلَّ وتخلُصُ منه.
  const laneH = scale(106), stripH = scale(23), topH = scale(46), labelW = scale(64);
  // كلُّ الكروتِ على سطرٍ واحدٍ وارتفاعٍ واحد — العمقُ يقولُه الظلُّ والمادّةُ لا موضعُ الكرتِ في صفِّه
  const CARD_H = scale(84);
  const CARD_TOP = scale(2);   // ملاصقٌ لبطاقتِه من فوق؛ وما فضلَ إلى أسفلِه حيثُ يقعُ ظلُّ الحائم
  // ── خيطُ الفراغِ امتدادٌ لشريطِ الكرت ──
  // ارتفاعُ الشريطِ داخلَ الكرتِ يعتمدُ على ارتفاعِ نصوصِه، وهو يختلفُ بين المنصّات — فلا
  // يُحسَبُ بالحسابِ بل يُقاسُ: أوّلُ كرتٍ يُرسَمُ يُبلِّغُ موضعَ شريطِه مرّةً واحدة، ثمّ يمتدُّ
  // الخيطُ على استقامتِه. (كلُّ الكروتِ متساويةُ المحتوى فقياسُ واحدٍ يكفيها.)
  const BAR_H = scale(3.5);
  const barYRef = useRef<number | null>(null);
  const [barY, setBarY] = useState<number | null>(null);
  const reportBarY = useCallback((y: number) => {
    if (barYRef.current != null) return;
    barYRef.current = y;
    setBarY(y);
  }, []);
  const threadTop = CARD_TOP + (barY ?? (CARD_H * 0.57));
  const TROUGH_H = scale(44);                        // المَجْرى أقصرُ من الكرتِ فيُقرأُ حفرًا لا صندوقًا
  const NOW_PAD = scale(12);                         // فُرجةٌ بينَ حدِّ الماءِ ومَن يبدأُ عنده، كي يُقرأَ وقتُ دخولِه
  const unitH = stripH + laneH;                    // شريطُ الأوقات + كروتُ العيادة = وحدةٌ واحدة
  const GAP = scale(8);                             // فجوةٌ دنيا بين كلِّ كرتَين متجاورَين (كي لا تلتصقَ الكروت)
  const CHIP_W = scale(44);                         // شارةُ «خلفَ الشفت» — يُحجَزُ لها مكانُها قبلَ التبديل
  const hours: number[] = [];
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h);

  // ═══ محورٌ واحدٌ لكلِّ العيادات — بالحجزِ لا بالتناسب ═══
  // كان التباعدُ خطّيًّا بالوقتِ ثمّ يُوسَّعُ عند التزاحم؛ وكان المنجَزُ مُستثنًى من الحجزِ لأنّه
  // «يقترضُ» من يسارِه — فيومُ الأرشيفِ كلُّه منجَزٌ فلا يتّسعُ شيءٌ أبدًا، وينزلقُ الصفُّ كلُّه.
  // والدفعُ كان يتراكمُ **داخلَ كلِّ عيادةٍ وحدَها**، فمريضانِ عليهما الدورُ في اللحظةِ نفسِها
  // يقعانِ في موضعَين — أحدُهما قريبٌ من خطِّ الآنَ والآخرُ بعيد، بلا سببٍ إلّا ازدحامَ صفِّه قبلَ ساعة.
  //
  // فصارَ المحورُ يُحصي **حجوزًا**: «من هذه المرساةِ إلى تلك لا بدَّ من كذا بكسلًا» —
  // كتلةٌ تسعُ نفسَها، وفراغٌ يسعُ وسمَه. وما لم يُحجَزْ له شيءٌ يأخذُ خطوةً صغيرةً ثابتة،
  // فتُطوى الساعاتُ الخاويةُ مهما طالت. ولأنّ الحجزَ يجري على المحورِ المشتركِ لا داخلَ الصفّ،
  // فما تساوى وقتُه تحاذى رأسيًّا مهما اختلفت عيادتُه وازدحامُها.
  const axis = useMemo(() => {
    const anchorSet = new Set<number>([dayStart, dayEnd, nowMin]);
    for (const l of lanes) for (const b of l.blocks) { anchorSet.add(b.start); anchorSet.add(b.end); }
    for (let h = dayStart / 60; h <= dayEnd / 60; h++) anchorSet.add(h * 60);
    const anchors = Array.from(anchorSet).sort((a, b) => a - b);

    const need: Claim[] = [];
    // كتلٌ متداخلةٌ في الوقتِ (مريضانِ سُجّلا في كرسيٍّ واحدٍ معًا) لا حجزَ لها — يتكفّلُ بها دفعُ الرسم
    const claim = (from: number, to: number, w: number) => { if (to > from) need.push({ from, to, w }); };
    for (const l of lanes) {
      const seams = l.blocks.filter((b) => b.kind === 'break' && b.fixed);
      const chipWall = l.beyond.length > 0 ? shiftWall(seams, nowMin) : undefined;
      for (let i = 0; i < l.blocks.length; i++) {
        const b = l.blocks[i];
        // الجاري يُحجَزُ عرضُه على **مدّتِه المتوقّعة** لا على ما مضى منها، فيقطعُه خطُّ الآنَ
        // بقدرِ ما قُطِعَ من العلاج — كشريطِ التقدُّمِ داخلَ الكرتِ سواءً بسواء.
        const w = drawWindow(spanOf(b), seams);
        claim(w.ds, w.de, drawnW(b));       // الكرتُ يسعُ داخلَ نافذتِه — فلا يعبرُ حاجزًا
        const nx = l.blocks[i + 1];
        if (!nx) continue;
        const idle = nx.start - b.end;
        claim(w.de, drawWindow(nx, seams).ds, (idle >= 1 ? idleTier(idle).w : GAP) + (nx === chipWall ? CHIP_W + GAP : 0));
      }
    }

    // وقتُ تبديلِ الشفتِ وحدَه يبقى مطويًّا — وما سواه له مسافتُه الافتراضيّة
    const seamIv = (lanes[0]?.blocks ?? [])
      .filter((b) => b.kind === 'break' && b.fixed)
      .map((b) => [b.start, b.end] as [number, number]);
    const folded = (a: number, z: number) => seamIv.some(([s, e]) => a >= s && z <= e);

    // والحجزُ يُوزَّعُ على الزمنِ لا يُصرَفُ كلُّه عندَ آخرِه (solveAxis) — فخطُّ «الآنَ» يقطعُ
    // الكرتَ الجاريَ بقدرِ ما قُطِعَ من علاجِه، لا يقفُ عندَ أوّلِه ثمّ يثبُ إلى آخره.
    const xm = solveAxis(anchors, need,
      (pt, t) => (folded(pt, t) ? STEP : Math.max(STEP, ((t - pt) / 60) * HOUR_NOM)));
    return { anchors, xm };
  }, [lanes, dayStart, dayEnd, nowMin, GAP, CHIP_W]);

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
  // في الاستئنافِ لا يكفي أن نمرّرَ بعدَ الرسم — يُرى إطارٌ عندَ الحافّةِ اليسرى ثمّ يقفز. فنضعُ
  // الإزاحةَ **قبلَ أوّلِ رسمة**. ومرجعٌ لا يتغيّرُ كي لا تُخطَفَ يدُك مع كلِّ دقيقةٍ بعدَ ذلك.
  const bootX = useRef(Math.max(0, nowX - scale(90)));

  // الكتلةُ (والمريضُ) المفتوحةُ نافذتُها — تُقرأُ من المساراتِ الحيّةِ لا من لقطة، فتعكسُ الحالةَ اللحظيّة.
  // ومَن كان «خلفَ الشفت» لا كتلةَ له في الجدول، فنقرؤه من قائمةِ الراحلين — كي تُفتَحَ له
  // النافذةُ نفسُها بإجراءاتِها كلِّها حينَ تنقرُ اسمَه في شارةِ «+N».
  const actBlk = actionId ? (lanes.flatMap((l) => l.blocks).find((b) => b.p.id === actionId) ?? null) : null;
  const actBeyond = (!actBlk && actionId) ? (lanes.flatMap((l) => l.beyond).find((p) => p.id === actionId) ?? null) : null;
  const actP = actBlk?.p ?? actBeyond ?? null;
  const actNA = actBlk ? actBlk.kind === 'na' : actP?.status === 'na';
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

  // ═══ تخطيطُ الصفوف: كلُّ كتلةٍ في موضعِ دقيقتِها، وعرضُها عرضُها ═══
  // المحورُ حجزَ لها سلفًا، فلا قصَّ ولا اقتراضَ ولا دفعَ متراكم. و`floor` باقٍ حارسًا أخيرًا:
  // لا يعملُ إلّا حيثُ تتداخلُ كتلتانِ في الوقتِ حقًّا (مريضانِ سُجّلا في كرسيٍّ واحدٍ معًا).
  const laidLanes = lanes.map((l) => {
    const seams = l.blocks.filter((b) => b.kind === 'break' && b.fixed);
    const chipWall = l.beyond.length > 0 ? shiftWall(seams, nowMin) : undefined;
    let floor = -Infinity;
    return l.blocks.map((b, i) => {
      // حدُّ الماءِ يقعُ عندَ nowX بشفتِه وظلِّه ووسمِه، فمَن يبدأُ عندَه تمامًا يختفي وقتُ دخولِه
      // خلفَه. ندفعُه فُرجةً صغيرةً إلى اليمين — دفعُ رسمٍ لا تغييرَ في جدولِه، ويسري على
      // كلِّ العياداتِ سواءً فلا يكسرُ التحاذي.
      const w = drawWindow(b, seams);
      const x0 = xAt(w.ds);
      const base = (b.kind !== 'done' && b.kind !== 'lateDone' && b.kind !== 'break'
        && x0 >= nowX - scale(2) && x0 < nowX + NOW_PAD) ? nowX + NOW_PAD : x0;
      const left = Math.max(base, floor);
      const width = drawnW(b);
      const succ = l.blocks[i + 1];
      const chipRoom = (succ && succ === chipWall) ? CHIP_W + GAP : 0;
      floor = left + width + GAP + chipRoom;
      const prev = i > 0 ? l.blocks[i - 1] : null;
      const prevEnd = prev ? ((prev.kind === 'cur' || prev.kind === 'over') ? Math.max(prev.end, prev.start + estMinutes(prev.p)) : prev.end) : -Infinity;
      const idle = prev ? (b.start - prevEnd) : 0;   // فراغٌ زمنيٌّ قبلَها (لخيطِ الفراغ)
      return { b, left, width, idle, moved: w.moved };
    });
  });

  // ── طيّاتُ الورقة: تبديلُ الشفت ──
  // البريكُ الثابتُ واحدٌ لكلِّ العياداتِ في وقتِه نفسِه، فلا معنى لرسمِه كرتًا يتكرّرُ في كلِّ
  // صفّ — هو **حدٌّ** لا استراحة. نأخذُه من أوّلِ عيادةٍ ونرسمُه عمودًا واحدًا يعبرُ الصفوفَ
  // كلَّها كطيّةٍ في الورقة.
  //
  // وموضعُه من الورقةِ يُغيِّرُ معناه: تبديلٌ يبدأُ مع اليومِ (٠٠:٠٠ ← ٧:٠٠) أو ينتهي بانتهائه
  // (٢٠:٠٠ ← ٠٠:٠٠) ليس حدًّا **في** الورقةِ بل حدٌّ **لها**: يختمُها. والفصلُ بينهما بالوقتِ
  // لا بالبكسل — فاليومُ من منتصفِ ليلٍ إلى منتصفِ ليلٍ دائمًا (DAY_START/DAY_END)، وهو حكمٌ
  // قاطعٌ لا يتبدّلُ بتزاحمِ الرسمِ ولا بهامشِ الورقة.
  const folds = (lanes[0]?.blocks ?? []).filter((b) => b.kind === 'break' && b.fixed);
  const sideOf = (fb: Blk) => foldSide(fb, dayStart, dayEnd);
  const sealsEnd = folds.some((fb) => sideOf(fb) === 'end');

  const maxRight = laidLanes.reduce((mx, arr) => arr.reduce((m, p) => Math.max(m, p.left + p.width), mx), 0);
  // وحيثُ يختمُ الطرفَ لا يبقى بعدَه هامشٌ من ورق: الخاتمُ آخرُ الصفحةِ لا شيءَ خلفَه
  const contentW = Math.max(xAt(dayEnd), maxRight + (sealsEnd ? 0 : scale(24)));

  // ═══ الساعاتُ علاماتٌ تطفو ═══
  // ما دامتِ المسافةُ لا تساوي الزمنَ فمسافاتٌ متساويةٌ بين الساعاتِ كذبةٌ صريحة. فالساعةُ
  // تُرسَمُ حيثُ تقعُ فعلًا على المحور: تتباعدُ حيثُ ازدحمَ الشغلُ وتتقاربُ حيثُ هدأ. وحينَ
  // تتلاصقُ في الساعاتِ الخاويةِ يُخفى المتزاحمُ ويبقى واحدٌ يدلُّ — وهي القاعدةُ نفسُها التي
  // يمشي عليها شريطُ كلِّ عيادةٍ (LBL_GAP). و`wide` = هل بعدَها متّسعٌ لعلاماتِ الرُّبعِ والنصف.
  // ساعاتُ اليومِ كلُّها ظاهرة: لكلٍّ مسافتُها الافتراضيّةُ في المحورِ فلا تتزاحمُ ولا تُطوى.
  // ولا يسقطُ منها إلّا ما وقعَ **داخلَ** تبديلِ الشفت — وقتٌ مطويٌّ في عمودٍ رفيع، فرقمُه
  // يسقطُ فوقَ العمودِ ووسمِه فيبدو كأنّ في التبديلِ ساعةَ دخول. (وحارسُ التزاحمِ يبقى احتياطًا.)
  const seamRanges = (lanes[0]?.blocks ?? [])
    .filter((b) => b.kind === 'break' && b.fixed)
    .map((b) => [b.start, b.end] as [number, number]);
  const inSeam = (t: number) => seamRanges.some(([s, e]) => t > s && t < e);
  const HOUR_GAP = scale(30);
  const hourMarks: { h: number; x: number; wide: boolean }[] = [];
  {
    let lastX = -Infinity;
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i], x = xAt(h * 60);
      if (inSeam(h * 60) || x - lastX < HOUR_GAP) continue;
      const nx = i + 1 < hours.length ? xAt(hours[i + 1] * 60) : x;
      hourMarks.push({ h, x, wide: nx - x >= scale(96) });
      lastX = x;
    }
  }

  // ═══ شريطُ اليوم: اليومُ كلُّه في سطرٍ تحتَ الجدول ═══
  // المخطّطُ يتمدّدُ لساعاتٍ وأنتَ ترى منه شبرًا. الشريطُ يُريكَ شكلَ اليومِ كلِّه — أينَ الازدحامُ
  // وأينَ الفراغُ وأينَ الطيّة — و**تسحبُه فينتقلُ المخطّطُ معك**. ونافذةُ نظرِك مرسومةٌ عليه:
  // تُترجَمُ عن إزاحةِ التمريرِ بالمحرّكِ الأصليِّ مباشرةً، فلا إعادةَ رسمٍ مع كلِّ إطار.
  const [portW, setPortW] = useState(0);
  const [ribW, setRibW] = useState(0);
  const ribX = useRef(new Animated.Value(0)).current;
  const onHScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: ribX } } }], { useNativeDriver: true }),
    [ribX]);
  const ribShift = useMemo(
    () => ribX.interpolate({ inputRange: [0, Math.max(1, contentW)], outputRange: [0, ribW], extrapolate: 'clamp' }),
    [ribX, contentW, ribW]);
  const ribViewW = (contentW > 0 && ribW > 0 && portW > 0) ? Math.max(scale(16), (portW / contentW) * ribW) : 0;
  const ribRowGap = scale(3);
  const ribRowH = Math.max(scale(3), Math.min(scale(7),
    (scale(28) - (lanes.length - 1) * ribRowGap) / Math.max(1, lanes.length)));
  const ribTrackH = lanes.length * ribRowH + Math.max(0, lanes.length - 1) * ribRowGap;
  const ribAt = (px: number) => (contentW > 0 ? (px / contentW) * ribW : 0);
  const ribJump = (e: any) => {
    if (!ribW || !contentW || !portW) return;
    const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / ribW));
    hScroll.current?.scrollTo({ x: Math.max(0, Math.min(contentW - portW, p * contentW - portW / 2)), animated: false });
  };

  // شريطُ أوقاتٍ خاصٌّ بكلِّ عيادة: بداياتُ كروتِها فوقَها (متحرِّكةٌ مع الدور)، أو الساعاتُ الافتراضيّة إن كانت فارغة.
  // ومَن أزاحَه تبديلُ الشفتِ (دخلَ داخلَه فرُسِمَ بعدَه) **لا يُسقَطُ وسمُه أبدًا** ولو تزاحمَ:
  // موضعُه لم يعُدْ يقولُ ساعتَه، فالرقمُ وحدَه يقولُها — وهو أحقُّ ما يُعرَض.
  // والبريكُ لا وقتَ دخولٍ له: وقتُ التبديلِ مكتوبٌ في وسمِه فوقَ العمود، ووقتُ الاستراحةِ
  // المرنةِ محفورٌ في مَجْراها — فإقحامُه هنا يُقرأُ «مريضٌ دخلَ في البريك».
  const LBL_GAP = scale(40);
  const strips = laidLanes.map((laid) => {
    if (!laid.length) return null;
    const ticks: { left: number; label: string }[] = [];
    let lastR = -Infinity;
    for (const { b, left, moved } of laid) {
      if (b.kind === 'break') continue;
      if (!moved && left < lastR + LBL_GAP) continue;
      ticks.push({ left, label: fmtHM(b.start) });
      lastR = left;
    }
    return ticks;
  });

  // طيّاتُ الورقة: البريكُ الثابتُ (تبديلُ الشفت) واحدٌ لكلِّ العياداتِ في وقتِه نفسِه، فلا معنى
  // لرسمِه كرتًا يتكرّرُ في كلِّ صفّ — هو **حدٌّ** لا استراحة. نأخذُه من أوّلِ عيادةٍ ونرسمُه
  // عمودًا واحدًا يعبرُ الصفوفَ كلَّها كطيّةٍ في الورقة.
  // الخاتمُ يُرسَمُ خاتمًا لا فاصلًا: يملأُ ارتفاعَ الورقةِ كلَّه بلا انحسارٍ عندَ طرفَيه، وشفتُه
  // البيضاءُ من **جهةِ الورقةِ وحدَها** (وما وراءَه ليس ورقةً، فلا شفةَ هناك ولا هالةَ تخفتُ في
  // شيء)، ويشتدُّ لونُه نحوَ الطرفِ فيُقرأُ طيًّا تنتهي عندَه الصفحةُ لا خطًّا مرسومًا عليها.
  // والهندسةُ تُحسَبُ **مرّةً واحدةً** هنا: يقرؤها العمودُ في الجسمِ ووسمُه في المسطرة، فلا
  // يفترقُ موضعُ أحدِهما عن الآخر.
  const foldGeom = folds.map((fb) => {
    const fx = xAt(fb.start);
    return { fb, fx, fw: Math.max(SEAM_W, xAt(fb.end) - fx), side: sideOf(fb), mid: fx + Math.max(SEAM_W, xAt(fb.end) - fx) / 2 };
  });
  // نطاقُ كلِّ عمودٍ بالبكسل — يُقتَطَعُ عندَه خيطُ الفراغِ فلا يدخلُه
  const seamBands: [number, number][] = foldGeom.map((g) => [g.fx, g.fx + g.fw] as [number, number]);

  // ── المَجْرى: البريكُ المرن ──
  // كان حفرةً داكنةً بشفتَينِ وظلٍّ تحتَها — ثقيلٌ على ورقةٍ فاتحة. صارَ **مَجْرًى رمليًّا
  // ناعمًا**: تعبئةٌ كهرمانيّةٌ خفيفةٌ بحدٍّ رقيقٍ من لونِها، وضوءٌ يعلو قاعَها بلا حدٍّ يُرى،
  // ولا ظلَّ تحتَه. ووقتُه محفورٌ في وسطِه — لا أيقونةَ فيه.
  // وإن أزاحَه انشغالٌ حقيقيٌّ **لم يترُكْ أثرًا خلفَه**: البريكُ حيثُ هو الآن، لا حيثُ كان.
  const renderTrough = (b: Blk, left: number, width: number, key: number) => {
    const tTop = (laneH - TROUGH_H) / 2;
    return (
      <TouchableOpacity key={key} activeOpacity={0.85} style={[full.trough, { left, width, top: tTop, height: TROUGH_H }]}
        onPress={() => { if (!readOnly) setBreakActionOrig(b.orig ?? b.start); }}>
        <LinearGradient colors={TROUGH_FILL} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={TROUGH_GLOW} locations={[0, 0.45, 1]} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
        <Text style={full.troughEyebrow} numberOfLines={1}>BREAK</Text>
        <Text style={full.troughTxt} numberOfLines={1}>{Math.round(b.end - b.start)} min</Text>
      </TouchableOpacity>
    );
  };

  // حِملُ كلِّ عيادة (نسبةُ امتلاءِ اليوم) + هل هي مشغولةٌ الآن — لعمودِ العياداتِ الأيسر
  const laneMeta = lanes.map((l) => {
    const busy = l.blocks.some((b) => b.kind === 'cur' || b.kind === 'over');
    const filled = l.blocks.reduce((s, b) => s + ((b.kind === 'break' || b.kind === 'na') ? 0 : (b.end - b.start)), 0);
    return { busy, load: Math.max(0, Math.min(1, filled / Math.max(1, dayEnd - dayStart))) };
  });

  return (
    <Modal visible={visible} animationType={instant ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onClose}>
      <LinearGradient colors={BG_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <BlobField />
        <View style={{ flex: 1, paddingTop: Math.max(topInset, scale(24)), paddingBottom: Math.max(bottomInset, scale(8)) }}>
          {/* الرأس: التاريخُ ثمّ العنوانُ والساعةُ الكبيرة */}
          <View style={full.head}>
            <View style={full.headTop}>
              <Text style={full.eyebrow}>{title ?? fmtToday()}</Text>
              <View style={{ flex: 1 }} />
              {!readOnly && (
                <TouchableOpacity style={full.iconBtn} activeOpacity={0.85} onPress={openEditor}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="settings-outline" size={scale(16)} color="#4A5568" />
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

          {/* شريطُ المحاكاة (مسرِّعٌ زمنيّ للاختبار) — لا معنى له في يومٍ مضى، ولا في الإصدار (SIM_ENABLED) */}
          {!readOnly && SIM_ENABLED && (
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
            <LinearGradient colors={MINI_SMOKE} start={{ x: 0.16, y: 0 }} end={{ x: 0.84, y: 1 }} style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={full.panelTopHi} />
            {/* ── سحبٌ إلى الأسفل: سؤالٌ مباشرٌ للخادمِ الآن ──
                الحيُّ (Realtime) لم يُمَسَّ ويبقى هو الأصل؛ وهذا لِلَحظةِ الشكِّ وحدَها — حينَ
                تعلمُ أنّ شيئًا وقعَ ولا تريدُ أن تنتظرَ أن يبلغَك. سحبُ اللوحِ عموديًّا لا يُنازِعُ
                تمريرَ المساراتِ أفقيًّا: لكلِّ اتّجاهٍ حارسُه. */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1 }}
              refreshControl={pull && !readOnly ? (
                <RefreshControl
                  refreshing={pull.refreshing}
                  onRefresh={pull.onRefresh}
                  tintColor={TEAL_INK}
                  colors={[TEAL_INK]}
                  progressBackgroundColor="#FFFFFF"
                />
              ) : undefined}
            >
            <View style={{ flexDirection: 'row', height: Math.max(topH + lanes.length * unitH, scale(1)) }}>
              {/* عمودُ العيادات: رقمٌ شبحيٌّ كبيرٌ + نقطةُ انشغالٍ + شريطُ امتلاء — بفاصلٍ رأسيٍّ عن الجدول */}
              <View style={[full.railCol, { width: labelW }]}>
                {/* ركنُ الرأس: نفسُ حافّةِ الأوقاتِ المطويّةِ كي يمتدَّ الرأسُ عرضَ الجدولِ كلِّه (يبقى ثابتًا عند التمرير) */}
                <View style={[full.railHead, { height: topH }]}>
                  <LinearGradient colors={HEAD_G} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Text style={full.cornerL}>CHAIRS</Text>
                  <View style={full.cornerRow}>
                    <Text style={full.cornerN}>{lanes.length}</Text>
                    <Text style={full.cornerS}>today</Text>
                  </View>
                  <View pointerEvents="none" style={full.headCrease} />
                </View>
                <LinearGradient pointerEvents="none" colors={HEAD_SHADE} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={[full.headShade, { top: topH }]} />
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
              <AnimatedScrollView
                ref={hScroll}
                horizontal
                style={{ flex: 1 }}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ width: contentW }}
                onScroll={onHScroll as any}
                scrollEventThrottle={16}
                onLayout={(e) => setPortW(e.nativeEvent.layout.width)}
                contentOffset={instant ? { x: bootX.current, y: 0 } : undefined}
              >
                <View style={{ width: contentW, height: topH + lanes.length * unitH }}>
                  {/* المستقبلُ نصفُ ورقةٍ أعلى: حجابٌ فاتحٌ يبدأُ عندَ الآنَ ويخفُّ سريعًا — يُفتِّحُ الأرضَ ولا يُغرِقُها */}
                  {contentW > nowX + 2 ? (
                    <LinearGradient pointerEvents="none" colors={VEIL} locations={[0, 0.14, 1]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ position: 'absolute', top: topH, left: nowX, width: contentW - nowX, height: lanes.length * unitH }} />
                  ) : null}
                  {/* رأسُ الجدول: حافّةٌ مطويّةٌ تحملُ الساعاتِ — علاماتٌ تطفو حيثُ تقعُ فعلًا، ويُخفى
                      المتزاحمُ منها. وعلاماتُ الرُّبعِ والنصفِ لا تُرسَمُ إلّا حيثُ اتّسعتِ الساعةُ لها. */}
                  <View pointerEvents="none" style={[full.ruler, { width: contentW, height: topH }]}>
                    <LinearGradient colors={HEAD_G} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                    {hourMarks.map(({ h, x: hx, wide }) => {
                      const on = h === Math.floor(nowMin / 60);
                      return (
                        <React.Fragment key={'r' + h}>
                          {on ? (
                            <LinearGradient colors={HOUR_ON} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                              style={[full.hourOn, { left: hx, width: Math.max(scale(20), xAt(Math.min(h * 60 + 60, dayEnd)) - hx) }]} />
                          ) : null}
                          <View style={[full.hNumWrap, { left: hx - scale(22) }]}>
                            <Text style={[full.hNum, on && full.hNumOn]} numberOfLines={1}>{h}</Text>
                            <Text style={[full.hMin, on && full.hMinOn]} numberOfLines={1}>00</Text>
                          </View>
                          {on ? <View style={[full.hUnder, { left: hx - scale(13) }]} /> : null}
                          <View style={[full.tickH, { left: hx }]} />
                          {wide && h * 60 + 30 <= dayEnd ? <View style={[full.tickM, { left: xAt(h * 60 + 30) }]} /> : null}
                          {wide && h * 60 + 15 <= dayEnd ? <View style={[full.tickQ, { left: xAt(h * 60 + 15) }]} /> : null}
                          {wide && h * 60 + 45 <= dayEnd ? <View style={[full.tickQ, { left: xAt(h * 60 + 45) }]} /> : null}
                        </React.Fragment>
                      );
                    })}
                    {/* أرقامُ تبديلِ الشفت: العمودُ رفيعٌ لا يسعُها، فترتفعُ إلى المسطرةِ فوقَه —
                        المساحةُ تقولُ «هنا تبديل»، والرقمُ يقولُ «من متى إلى متى». */}
                    {foldGeom.map(({ fb, fx, fw, side, mid: sx }, fi) => {
                      // الوسمُ يتوسّطُ عمودَه ما دامَ في الورقة، فإن ختمَ طرفَها لزمَ ذلك الطرفَ
                      // ولم يخرجْ عنه — ويبقى ذَنَبُه مصوَّبًا إلى العمودِ نفسِه أينما استقرَّ.
                      const TW = scale(90), pad = scale(3);
                      const left = side === 'start' ? pad
                        : side === 'end' ? Math.max(pad, contentW - TW - pad)
                        : Math.max(pad, Math.min(contentW - TW - pad, sx - TW / 2));
                      const tailX = Math.max(left + scale(8), Math.min(left + TW - scale(8), sx));
                      return (
                        <React.Fragment key={'sg' + fi}>
                          <View style={[full.seamTag, { left, width: TW }]}>
                            <View pointerEvents="none" style={full.seamTagGloss} />
                            <Text style={full.seamTagEye}>{side === 'mid' ? 'SHIFT' : side === 'start' ? 'DAY OPENS' : 'DAY CLOSES'}</Text>
                            <Text style={full.seamTagTx} numberOfLines={1}>{fmtHM(fb.start)} – {fmtHM(fb.end)}</Text>
                          </View>
                          <View style={[full.seamTagTail, { left: tailX, top: scale(36), height: topH - scale(36) }]} />
                        </React.Fragment>
                      );
                    })}
                  </View>
                  {/* الكسرةُ وظلُّها: بها يبدو الرأسُ مطويًّا فوقَ الجدولِ لا مرسومًا عليه */}
                  <View pointerEvents="none" style={[full.creaseLine, { top: topH - 1, width: contentW }]} />
                  <LinearGradient pointerEvents="none" colors={HEAD_SHADE} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                    style={[full.shadeBand, { top: topH, width: contentW }]} />
                  {/* خطوطُ التقسيم: أعمدةُ الساعاتِ الرأسيّةُ تمتدُّ من الرأسِ إلى أسفلِ الجدول (top:0) + فواصلُ العيادات الأفقيّة */}
                  {hourMarks.map(({ h, x }) => <View key={'gv' + h} pointerEvents="none" style={[full.gridV, { left: x, top: 0 }]} />)}
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
                                <View key={ti} style={[full.eTag, { left: tk.left + E_TAG_IN }]}>
                                  <LinearGradient colors={MINI_TEAL_G} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                                  <View pointerEvents="none" style={full.eTagGloss} />
                                  <Text style={full.eTagTx} numberOfLines={1}>{tk.label}</Text>
                                </View>
                              ))
                            : hourMarks.map(({ h, x }) => (
                                <Text key={h} style={[full.hourTick, { left: x }]}>{h}:00</Text>
                              ))}
                        </View>
                        {/* صفُّ العيادة */}
                        <View style={[full.laneRow, { top: uTop + stripH, height: laneH }]}>
                          {/* «خلفَ الشفت»: مَن انتهى شفتُه قبلَ أن يأتيَ دورُه — سيرحل. لا نرسمُ له
                              كرتًا في شفتٍ ليس شفتَه؛ شارةٌ ملاصقةٌ لكرتِ التبديلِ من اليسارِ
                              تقولُ كم هم، وبالنقرِ تظهرُ أسماؤهم. */}
                          {l.beyond.length > 0 && (() => {
                            // تلتصقُ بالتبديلِ الذي يختمُ **شفتَهم هم** من يسارِه: مَن تركتَه في شفتِ
                            // المساءِ يقفُ عندَ تبديلِ المساء، لا عندَ تبديلِ الظهرِ الذي مضى قبلَ ساعات.
                            // ومن يسارِه دائمًا لأنّها تقولُ «هؤلاء وقفوا هنا ولم يعبروا» — ولو رحلَتْ
                            // يمينَه لقالت عكسَ ذلك. (القاعدةُ في shiftWall، وهي زمنيّةٌ محضة.)
                            const wall = shiftWall(l.blocks.filter((b) => b.kind === 'break' && b.fixed), nowMin);
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
                          {/* ── الفراغُ بينَ مريضَين ──
                              خيطٌ **متّصلٌ** يمسُّ الكرتَين معًا فيُقرأُ الصفُّ خطًّا واحدًا لا قطعًا
                              متناثرة، رماديٌّ وحدَه لا لونَ فيه. ومكانُه محجوزٌ في المحورِ بحدٍّ أدنى
                              لدرجتِه، فيظهرُ **دائمًا** ما دامَ حقيقيًّا. والوسمُ لا يضيقُ عن رقمِه
                              كاملًا (IDLE_LBL) ولو انعدمتِ المسافة — الرقمُ هو الحقيقةُ فلا يُبتَر. */}
                          {laid.map((o, i) => {
                            if (i === 0 || o.idle < 1) return null;
                            const prev = laid[i - 1];
                            const gx = prev.left + prev.width;
                            const gw = o.left - gx;
                            if (gw <= 0) return null;
                            const lw = Math.max(gw, IDLE_LBL);
                            // ولا يدخلُ الخيطُ عمودَ التبديل: يُقتَطَعُ عندَه ويُستأنَفُ بعدَه.
                            // فالتبديلُ حدٌّ، والخيطُ يقولُ «كرسيٌّ فارغ» — ولا كرسيَّ في وقتِ التبديل.
                            const segs = seamBands.reduce<[number, number][]>((acc, [bs, be]) => acc.flatMap(([a, z]) =>
                              (be <= a || bs >= z) ? [[a, z] as [number, number]]
                                : ([[a, Math.min(z, bs)], [Math.max(a, be), z]] as [number, number][]).filter(([p, q]) => q - p > scale(3))
                            ), [[gx, gx + gw]]);
                            if (!segs.length) return null;
                            return (
                              <React.Fragment key={'idle' + i}>
                                <Text pointerEvents="none" numberOfLines={1} style={[full.idleLabel, { left: gx + (gw - lw) / 2, width: lw, top: threadTop - scale(14) }]}>{fmtGap(o.idle)}</Text>
                                {segs.map(([a, z], si) => (
                                  <View key={si} pointerEvents="none" style={[full.groove, { left: a, width: z - a, top: threadTop, height: BAR_H + 1.5 }]} />
                                ))}
                              </React.Fragment>
                            );
                          })}
                          {/* الكتل: مَجْرى الاستراحةِ المرنةِ أو كرتُ مريض — والبريكُ الثابتُ طيّةٌ تُرسَمُ فوقَ الصفوفِ كلِّها */}
                          {laid.map(({ b, left, width }, i) => {
                            if (b.kind === 'break') {
                              if (b.fixed) return null;        // الطيّةُ تُرسَمُ مرّةً واحدةً بعدَ الصفوف
                              return renderTrough(b, left, width, i);
                            }
                            return (
                              <Card key={i} b={b} left={left} width={width} top={CARD_TOP} height={CARD_H}
                                nowMin={nowMin} onPress={() => { if (!readOnly) setActionId(b.p.id); }}
                                onBarY={barY == null ? reportBarY : undefined} />
                            );
                          })}
                        </View>
                      </React.Fragment>
                    );
                  })}
                  {/* ═══ تبديلُ الشفت ═══
                      كان بلاطةً بعرضِ مدّتِه — بريكٌ إلى منتصفِ الليلِ يحتلُّ رُبعَ المخطّط. وهو
                      **حدٌّ** لا استراحة، فصارَ عمودًا رفيعًا هادئًا: هالةٌ ليّنةٌ متماثلةٌ تخفتُ
                      إلى جانبَيه (لا ظلٌّ من جهةٍ وضوءٌ من أخرى)، والعمودُ نفسُه يخفتُ عندَ طرفَيه
                      فلا حافّةَ له تُقطَع، وشفةٌ بيضاءُ رفيعةٌ تُبقيه واضحًا على الورقةِ الفاتحة.
                      وأرقامُه فوقَه في المسطرة. ومساحةُ النقرِ أوسعُ منه عمدًا كي تُصابَ بالإصبع. */}
                  {foldGeom.map(({ fb, fx, fw, side }, fi) => {
                    const fh = lanes.length * unitH;
                    const cap = side !== 'mid';   // خاتمُ الورقةِ لا فاصلٌ فيها
                    return (
                      <React.Fragment key={'fold' + fi}>
                        {/* الهالةُ إلى الورقةِ لا إلى الخارج: ما وراءَ الخاتمِ ليس ورقةً تخفتُ فيه */}
                        {foldLips(side).left ? (
                          <LinearGradient pointerEvents="none" colors={SEAM_HALO_L} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={{ position: 'absolute', left: Math.max(0, fx - scale(20)), width: scale(20), top: topH, height: fh }} />
                        ) : null}
                        {foldLips(side).right ? (
                          <LinearGradient pointerEvents="none" colors={SEAM_HALO_R} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={{ position: 'absolute', left: fx + fw, width: scale(20), top: topH, height: fh }} />
                        ) : null}
                        <View pointerEvents="none" style={[full.seam,
                          cap && (side === 'start' ? full.seamCapL : full.seamCapR),
                          { left: fx, width: fw, top: cap ? topH : topH + scale(4), height: cap ? fh : fh - scale(8) }]}>
                          <LinearGradient colors={SEAM_BODY} locations={[0, 0.18, 0.82, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                          {/* الخاتمُ يشتدُّ عندَ طرفِ الورقةِ ويخفتُ إلى داخلِها — طيّةٌ تنتهي عندَها الصفحة */}
                          {cap ? (
                            <LinearGradient pointerEvents="none" colors={SEAM_SEAL}
                              start={side === 'start' ? { x: 0, y: 0 } : { x: 1, y: 0 }}
                              end={side === 'start' ? { x: 1, y: 0 } : { x: 0, y: 0 }}
                              style={StyleSheet.absoluteFill} />
                          ) : null}
                          {/* بدايتُه ونهايتُه: حافّتانِ بيضاوانِ صريحتان — يُرى أينَ ابتدأَ وأينَ انتهى.
                              وللخاتمِ شفةٌ واحدةٌ: من جهةِ الورقةِ فقط (foldLips). */}
                          {foldLips(side).left ? <View style={[full.seamEdge, { left: 0 }]} /> : null}
                          {foldLips(side).right ? <View style={[full.seamEdge, { right: 0 }]} /> : null}
                        </View>
                        {/* مساحةُ النقرِ أوسعُ منه عمدًا — ولا تتجاوزُ الورقةَ إن ختمَ طرفَها */}
                        <TouchableOpacity activeOpacity={0.85} disabled={!!readOnly}
                          onPress={() => setBreakActionOrig(fb.orig ?? fb.start)}
                          style={{ position: 'absolute', left: Math.max(0, fx - scale(11)),
                            width: fw + (side === 'start' ? scale(11) : side === 'end' ? scale(11) : scale(22)),
                            top: topH, height: fh }} />
                      </React.Fragment>
                    );
                  })}

                  {/* ═══ حدُّ الماء (الخطُّ الزمنيّ) ═══
                      ليس خطًّا مرسومًا بل حافّةَ سطح: وهجٌ حولَها، وحلقاتُ تموُّجٍ في كلِّ صفّ،
                      ثمّ ظلُّها الرفيعُ إلى الوراءِ وشفتُها البيضاءُ تلتقطُ الضوء. */}
                  <LinearGradient pointerEvents="none" colors={BLOOM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ position: 'absolute', top: topH, height: lanes.length * unitH, left: nowX - scale(30), width: scale(60) }} />
                  {lanes.map((l, li) => {
                    const mid = topH + li * unitH + stripH + laneH / 2;
                    return [scale(20), scale(34), scale(50)].map((r, ri) => (
                      <View key={`rp${li}-${ri}`} pointerEvents="none"
                        style={[full.ripple, { left: nowX - r / 2, top: mid - r / 2, width: r, height: r, borderRadius: r / 2, opacity: 0.9 - ri * 0.26 }]} />
                    ));
                  })}
                  <View pointerEvents="none" style={[full.wBack, { left: nowX - scale(1.5), top: topH, height: lanes.length * unitH }]} />
                  <View pointerEvents="none" style={[full.wLip, { left: nowX, top: topH, height: lanes.length * unitH }]} />
                  <View pointerEvents="none" style={[full.wTip, { left: nowX - scale(4.5), top: topH - scale(11) }]} />
                  <LinearGradient pointerEvents="none" colors={['#12B39D', '#0B7A6C']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
                    style={[full.wMark, { left: Math.max(0, nowX - scale(27)), top: topH - scale(28) }]}>
                    <Text style={full.wMarkTxt}>{fmtHM(nowMin)}</Text>
                  </LinearGradient>
                </View>
              </AnimatedScrollView>
            </View>
            </ScrollView>
          </View>
          </View>

          {/* ═══ شريطُ اليوم ═══ اليومُ كلُّه في سطر، ونافذةُ نظرِك عليه — اسحبْه فينتقلَ المخطّطُ معك */}
          <View style={[full.rib, { height: scale(36) + Math.max(scale(6), ribTrackH) }]}>
            <LinearGradient colors={MINI_SMOKE} start={{ x: 0.16, y: 0 }} end={{ x: 0.84, y: 1 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={MINI_GLOSS} style={full.ribGloss} pointerEvents="none" />
            <LinearGradient colors={MINI_FLOOR} style={full.ribFloor} pointerEvents="none" />
            <View style={full.ribHead}>
              <Text style={full.ribEdge}>{fmtHM(dayStart)}</Text>
              <Text style={full.ribTitle}>THE WHOLE DAY</Text>
              <Text style={full.ribEdge}>{fmtHM(dayEnd)}</Text>
            </View>
            <View
              style={[full.ribTrack, { height: Math.max(scale(6), ribTrackH) }]}
              onLayout={(e) => setRibW(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={ribJump}
              onResponderMove={ribJump}
            >
              {laidLanes.map((laid, li) => (
                <React.Fragment key={'rb' + li}>
                  <View pointerEvents="none" style={[full.ribLane, { top: li * (ribRowH + ribRowGap), height: ribRowH, borderRadius: ribRowH / 2 }]} />
                  {laid.map((o, oi) => (o.b.kind === 'break' && o.b.fixed) ? null : (
                    <View key={oi} pointerEvents="none" style={{
                      position: 'absolute', top: li * (ribRowH + ribRowGap), height: ribRowH, borderRadius: ribRowH / 2,
                      left: ribAt(o.left), width: Math.max(scale(2), ribAt(o.width)),
                      backgroundColor: RIB_C[o.b.kind],
                    }} />
                  ))}
                </React.Fragment>
              ))}
              {folds.map((fb, fi) => (
                <View key={'rf' + fi} pointerEvents="none" style={[full.ribWall, { left: ribAt(xAt(fb.start)) }]} />
              ))}
              <View pointerEvents="none" style={[full.ribNow, { left: ribAt(nowX) }]} />
              {ribViewW > 0 ? (
                <Animated.View pointerEvents="none"
                  style={[full.ribView, { width: ribViewW, transform: [{ translateX: ribShift }] }]} />
              ) : null}
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
                {!actEntered && !actNA ? <Text style={full.hint}>Choose a chair to seat the patient first</Text> : null}
                {actNA ? <Text style={full.hint}>This patient is out of the queue right now</Text> : null}

                {/* ٤ — الملفُّ الدائم: يظهرُ لمن له ملفٌّ فقط، ويفتحُه كما يفتحُه كرتُ الدور */}
                {actP.permanent_patient_id && actions.onProfile ? (
                  <TouchableOpacity style={full.actProfile} activeOpacity={0.88}
                    onPress={() => { const id = actP.id; setActionId(null); actions.onProfile?.(id); }}>
                    <LinearGradient colors={['rgba(125,211,192,0.22)', 'rgba(125,211,192,0)']}
                      start={{ x: 0, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={['#12B39D', '#0B7F71']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
                      style={full.actProfileIcon}>
                      <Ionicons name="document-text" size={scale(17)} color="#FFFFFF" />
                    </LinearGradient>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={full.actProfileTxt} numberOfLines={1}>Patient file</Text>
                      <Text style={full.actProfileSub} numberOfLines={1}>
                        {actP.file_number ? `No. ${actP.file_number} · open the full record` : 'Open the full record'}
                      </Text>
                    </View>
                    <View style={full.actProfileGo}><Ionicons name="arrow-forward" size={scale(13)} color={TEAL_INK} /></View>
                  </TouchableOpacity>
                ) : null}

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

          {/* «خلفَ الشفت»: أسماءُ مَن لن يُدرِكَهم هذا الشفتُ في هذه العيادة.
              وليست قائمةَ خبرٍ فحسب: انقرِ اسمًا فتُفتَحَ نافذةُ إجراءاتِه نفسُها — لعلّه لم يعُدْ
              موجودًا، أو لعلّك أدخلتَه وأنهيتَه رغمَ التبديل. */}
          {beyondLane && (() => {
            const l = lanes.find((x) => x.clinic === beyondLane);
            if (!l) return null;
            return (
              <View style={StyleSheet.absoluteFill}>
                <BlurView intensity={24} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                <View style={full.sheetScrim}>
                  <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setBeyondLane(null)} />
                  <View style={full.sheet}>
                    <View style={full.sheetGlass}>
                      <LinearGradient colors={['rgba(255,255,255,0.82)', 'rgba(240,247,250,0.6)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                      <LinearGradient colors={['rgba(122,140,150,0.16)', 'rgba(122,140,150,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.55 }} style={StyleSheet.absoluteFill} />
                    </View>
                    <View pointerEvents="none" style={full.sheetTopHi} />
                    <View style={full.grab} />
                    <View style={full.shHead}>
                      <View style={full.byChip}><Text style={full.byChipTxt}>+{l.beyond.length}</Text></View>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={full.shName} numberOfLines={1}>Beyond the shift</Text>
                        <Text style={full.shMeta} numberOfLines={1}>Clinic {clinicNum(l.clinic) || l.short} · this shift won't reach them</Text>
                      </View>
                    </View>
                    <View style={full.shDivider} />
                    <Text style={full.shLabel}>TAP A NAME FOR ACTIONS</Text>
                    <ScrollView style={{ maxHeight: scale(230) }} showsVerticalScrollIndicator={false}>
                      {l.beyond.map((p) => {
                        // مَن جعلتَه «غيرَ متاح» يقولُ ذلك تحتَ اسمِه — فالقائمةُ تعكسُ ما فعلتَ لا ما كان
                        const na = p.status === 'na';
                        return (
                          <TouchableOpacity key={p.id} activeOpacity={0.8} style={[full.byRow, na && full.byRowNA]}
                            onPress={() => { setBeyondLane(null); setActionId(p.id); }}>
                            <View style={[full.byNo, na && full.byNoNA]}>
                              <Text style={[full.byNoTxt, na && full.byNoTxtNA]}>{p.queue_number}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={full.byName} numberOfLines={1}>{p.name}</Text>
                              {na ? (
                                <View style={full.byNaRow}>
                                  <View style={full.byNaDot} />
                                  <Text style={full.byNaTxt} numberOfLines={1}>Patient not available</Text>
                                </View>
                              ) : (
                                <Text style={full.byTx} numberOfLines={1}>
                                  {(p.treatment && p.treatment !== 'Treatment') ? p.treatment : 'Treatment'} · {estMinutes(p)} min
                                </Text>
                              )}
                            </View>
                            <Ionicons name="chevron-forward" size={scale(14)} color="#9AACB3" />
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity style={full.actClose} onPress={() => setBeyondLane(null)}>
                      <Text style={full.actCloseTxt}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* إعداداتُ المخطّط — نفسُ لوحِ المريضِ مادّةً وشكلًا: إعدادٌ لا إجراءٌ على مريض، لكنّه
              يخرجُ من المكانِ نفسِه ويُغلَقُ كما يُغلَق. */}
          {editingBreaks && (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={24} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={full.sheetScrim}>
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setEditingBreaks(false)} />
              <Animated.View style={[full.sheet, { opacity: editAnim, transform: [{ translateY: editAnim.interpolate({ inputRange: [0, 1], outputRange: [scale(340), 0] }) }] }]}>
                <View style={full.sheetGlass}>
                  <LinearGradient colors={['rgba(255,255,255,0.82)', 'rgba(240,247,250,0.6)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={['rgba(125,211,192,0.18)', 'rgba(125,211,192,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.55 }} style={StyleSheet.absoluteFill} />
                </View>
                <View pointerEvents="none" style={full.sheetTopHi} />
                <View style={full.grab} />
                <View style={full.shHead}>
                  <View style={full.setChip}><Ionicons name="settings-outline" size={scale(17)} color={TEAL_INK} /></View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={full.shName} numberOfLines={1}>Chart setup</Text>
                    <Text style={full.shMeta} numberOfLines={1}>Applies to every clinic · saved at once</Text>
                  </View>
                </View>
                <View style={full.shDivider} />

                {/* عددُ الكراسي — لِمخطّطِ الدورِ وحدَه. الجدولُ الأسبوعيُّ شيءٌ آخر:
                    قد تفتحُ عيادةً إضافيّةً اليومَ أو تُغلقَ واحدةً، وليس على المخطّطِ
                    أن ينتظرَ تعديلَ الجدولِ كي يعكسَ ما هو قائمٌ فعلًا. */}
                <Text style={full.shLabel}>OPEN CHAIRS</Text>
                <View style={full.cntRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={full.cntT}>Chairs working today</Text>
                    <Text style={full.cntS}>Independent of the weekly schedule</Text>
                  </View>
                  <TouchableOpacity style={[full.cntBtn, chairDraft <= 1 && full.cntBtnOff]} activeOpacity={0.8}
                    disabled={chairDraft <= 1} onPress={() => setChairDraft((n) => Math.max(1, n - 1))}>
                    <Text style={full.cntBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={full.cntNum}>{chairDraft || 1}</Text>
                  <TouchableOpacity style={[full.cntBtn, chairDraft >= 12 && full.cntBtnOff]} activeOpacity={0.8}
                    disabled={chairDraft >= 12} onPress={() => setChairDraft((n) => Math.min(12, (n || 1) + 1))}>
                    <Text style={full.cntBtnTxt}>＋</Text>
                  </TouchableOpacity>
                </View>

                <Text style={full.shLabel}>BREAK TIMES</Text>
                <ScrollView style={{ maxHeight: scale(168) }} showsVerticalScrollIndicator={false}>
                  {draft.length === 0 && <Text style={full.editEmpty}>No breaks yet — add one below.</Text>}
                  {draft.map((b, i) => (
                    <View key={i} style={full.brRow}>
                      <TimeStepper value={b.start} onChange={(v) => setDraft((d) => d.map((x2, j) => (j === i ? { ...x2, start: v } : x2)))} />
                      <Text style={full.brArrow}>→</Text>
                      <TimeStepper value={b.end} onChange={(v) => setDraft((d) => d.map((x2, j) => (j === i ? { ...x2, end: v } : x2)))} />
                      <TouchableOpacity style={full.brDel} activeOpacity={0.8} onPress={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                        <Ionicons name="close" size={scale(13)} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity style={full.brAdd} activeOpacity={0.85} onPress={() => setDraft((d) => [...d, { start: 12 * 60, end: 12 * 60 + 30 }])}>
                  <Ionicons name="add" size={scale(14)} color={TEAL_INK} />
                  <Text style={full.brAddTxt}>Add a break</Text>
                </TouchableOpacity>
                <View style={full.editBtns}>
                  <TouchableOpacity style={full.editCancel} activeOpacity={0.85} onPress={() => setEditingBreaks(false)}>
                    <Text style={full.editCancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={full.editSave} activeOpacity={0.9} onPress={saveEditor}>
                    <LinearGradient colors={['#12B58C', '#0B7A5E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={full.actDoneFill} />
                    <Text style={full.editSaveTxt}>Save</Text>
                  </TouchableOpacity>
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

// ── الصفحةُ تبقى حيثُ تركتَها ──
// إن خرجتَ والمخطّطُ معروضٌ فالمخطّطُ هو ما يستقبلُك عندَ العودة، لا الإحصاءُ من جديد.
// وتُحفَظُ في الذاكرةِ لا في التخزينِ الدائم: قراءةُ التخزينِ غيرُ متزامنة، فتُرى الصفحةُ
// الأولى لحظةً ثمّ تقفز — وقفزةٌ مع كلِّ دخولٍ أسوأُ من نسيانٍ عندَ إعادةِ تشغيلِ التطبيق.
const lastPage: { [clinic: string]: number } = {};

// ── ويعودُ بك «رجوع» إلى حيثُ دخلت ──
// ملفُّ المريضِ صفحةٌ تحلُّ محلَّ الصفحةِ كلِّها، فتُهدَمُ هذه الشجرةُ وتُفقَدُ حالتُها. فلو دخلتَ
// الملفَّ من المخطّطِ ثمّ رجعتَ، لعُدتَ إلى صفحةِ الدورِ لا إلى المخطّطِ الذي جئتَ منه. نحفظُ
// النيّةَ خارجَ الشجرةِ (كما نحفظُ الصفحةَ الحاليّة) فيُستأنَفُ المخطّطُ عندَ العودةِ مفتوحًا.
const reopenChart: { [clinic: string]: boolean } = {};

export function QueueTimelinePager({ patients, clinicId, statsNode, currentDoctorName, onSchedule, onEnterClinic, onToggleNA, onDone, onProfile, onReload }:
  { patients: Patient[]; clinicId?: string | null; statsNode: React.ReactNode; currentDoctorName?: string;
    onSchedule?: (lanes: Lane[], chairCount: number, breaks: Break[], nowMin: number) => void;
    // إجراءاتُ صفحةِ الدور الحقيقيّة (نفسُها على الكرت) — تُستدعى خارجَ المحاكاة
    onEnterClinic?: (patientId: string, clinic: string) => void;
    onToggleNA?: (patientId: string) => void;
    onDone?: (patientId: string) => void;
    onProfile?: (patientId: string) => void;
    // إعادةُ جلبِ المرضى من الخادم (السحبُ للتحديث) — الحيُّ باقٍ، وهذا سؤالٌ بيدِك
    onReload?: () => Promise<void> | void }) {
  const W = SCREEN.width;
  const insets = useSafeAreaInsets();
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const pageKey = clinicId || '·';
  const [page, setPage] = useState(() => lastPage[pageKey] ?? 0);
  const pagerRef = useRef<ScrollView>(null);
  const restored = useRef(false);
  // لا يُكشَفُ الشريطُ إلّا وهو على صفحتِه — وإن لم يصلْ نداءُ القياسِ لسببٍ ما كشفناه بعدَ إطار
  const [ready, setReady] = useState(() => (lastPage[clinicId || '·'] ?? 0) === 0);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(id);
  }, [ready]);
  // إن كنتَ خرجتَ من هنا إلى ملفِّ مريضٍ، فالمخطّطُ هو ما يستقبلُك عندَ الرجوع — **بلا تلاشٍ
  // ولا تمريرٍ يُرى**: استئنافٌ لا فتحٌ جديد. وإلّا لمحتَ صفحةَ الدورِ بينهما فبدا الأمرُ تعثُّرًا.
  const resumed = useRef(!!reopenChart[clinicId || '·']);
  const [showFull, setShowFull] = useState(() => resumed.current);
  useEffect(() => { delete reopenChart[pageKey]; }, [pageKey]);
  const closeFull = () => { resumed.current = false; setShowFull(false); };
  const [clinicCount, setClinicCount] = useState(0);
  // ── عددُ كراسي المخطّط: رقمُ **المركز** لا رقمُ الهاتف ──
  // المخطّطُ يصفُ اليومَ كما هو قائمٌ فعلًا — قد تُفتَحُ عيادةٌ إضافيّةٌ اليومَ أو تُغلَقُ واحدةٌ —
  // ولا ينبغي أن ينتظرَ تعديلَ الجدولِ الأسبوعيِّ ليقولَ ذلك. فرقمُه رقمُه (`chart_chairs`)،
  // **ولا يمسُّ `clinic_count`** الذي يُبنى عليه جدولُ الدوام: كتابةٌ هنا لا تُغيّرُ هناك شيئًا.
  // ومن كتبَه رآه كلُّ مَن في المركز — تصلُه القراءةُ الدوريّةُ (٣٠ث) أو سحبةُ التحديث.
  // والتخزينُ المحلّيُّ باقٍ **مرآةً** لا مصدرًا: يُرسَمُ منه قبلَ أن يصلَ ردُّ الخادمِ (وإن
  // تعذّرَتِ الكتابةُ — قبلَ تشغيلِ المهاجرةِ أو بلا شبكةٍ — بقيَ الرقمُ عندَك ولم يضِعْ عملُك).
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
  // رقمُ المركزِ إن وصلَ يَجُبُّ المرآةَ ويُثبَّتُ فيها، فلا يبقى رقمانِ يتنازعان
  const adoptCentreChairs = (n: number | null) => {
    if (!n || n < 1) return;
    setChairOverride((cur) => (cur === n ? cur : n));
    if (chairKey) AsyncStorage.setItem(chairKey, String(n));
  };
  const setChairCount = (n: number) => {
    setChairOverride(n);                                   // تفاؤليّ: يُرسَمُ الآن
    if (chairKey) AsyncStorage.setItem(chairKey, String(n));
    if (clinicId) { updateChartChairs(clinicId, n).catch(() => {}); }   // وللمركز
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
  // ويُحدَّثُ كلَّ نصفِ دقيقةٍ ليظهرَ أيُّ تغييرٍ في العددِ فورًا تقريبًا — ومع كلِّ سحبةِ تحديث.
  // آخرُ نداءٍ هو الذي يُكتَب: الأقدمُ إن تأخّرَ ردُّه سقطَ، فلا يعودُ مركزٌ سابقٌ فوقَ الحاليّ.
  const setRun = useRef(0);
  const loadSettings = useCallback(async () => {
    const run = ++setRun.current;
    const put = (count: number, brs: Break[]) => { if (setRun.current === run) { setClinicCount(count); setBreaks(brs); } };
    if (!clinicId) { put(0, []); return; }
    try {
      const { data } = await getScheduleSettings(clinicId);
      put(Number(data?.clinic_count) || 0, Array.isArray(data?.breaks) ? data.breaks : []);
      // رقمُ كراسي المخطّطِ للمركز (إن وُجد؛ وقبلَ المهاجرةِ يعودُ undefined فلا يتغيّرُ شيء)
      if (setRun.current === run) adoptCentreChairs(Number(data?.chart_chairs) || null);
    } catch { put(0, []); }
  }, [clinicId]);
  const tick = useCallback(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, []);
  useEffect(() => {
    loadSettings(); tick();
    const id = setInterval(() => { tick(); loadSettings(); }, 30000);
    return () => clearInterval(id);
  }, [loadSettings, tick]);

  // ── السحبُ للتحديث ──
  // الاشتراكُ الحيُّ (Realtime) لم يُمَسَّ وهو الأصل. وهذه يدُك حينَ لا تريدُ أن تنتظرَ:
  // المرضى من الخادم، وإعداداتُ المركز، والساعةُ — في نداءٍ واحد. ولها أرضيّةٌ زمنيّةٌ
  // قصيرة: ردٌّ يعودُ في مئةِ جزءٍ من الثانيةِ يجعلُ الدوّارَ ومضةً تُقرأُ عطلًا لا تحديثًا.
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    tick();
    const floor = new Promise((r) => setTimeout(r, 350));
    try { await Promise.all([Promise.resolve(onReload?.()), loadSettings(), floor]); } catch {}
    setRefreshing(false);
  }, [onReload, loadSettings, tick]);
  const pull = useMemo(() => ({ refreshing, onRefresh: doRefresh }), [refreshing, doRefresh]);

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
      else { closeFull(); setTimeout(() => onDone?.(id), 350); }
    },
    // الملفُّ صفحةٌ **تحلُّ محلَّ** الصفحةِ كلِّها، فهذه الشجرةُ — والمخطّطُ معها — تُهدَمُ في الحال.
    // فلا نُغلِقُه أوّلًا ثمّ ننتظرُ: الإغلاقُ ثمّ الانتظارُ هو ما كان يُظهِرُ صفحةَ الدورِ بينهما.
    // ونُسجّلُ أنّنا خرجنا من المخطّطِ كي يستقبلَنا مفتوحًا حينَ نضغطُ «رجوع» في الملفّ.
    onProfile: (id) => { reopenChart[pageKey] = true; onProfile?.(id); },
  }), [simOn, simNowMin, simActs, simChairs.length, patients, onEnterClinic, onToggleNA, onDone, onProfile, pageKey]);

  const simApi = {
    on: simOn, playing: simPlaying, speed: simSpeed,
    toggle: () => {
      if (!SIM_ENABLED) return;   // مطفأةٌ من مفتاحٍ واحد: لا بابَ إليها ولو نُوديَ عليها
      setSimOn((v) => { const nx = !v; if (nx) { setSimNowMin(7 * 60); setSimPlaying(true); setSimActs({}); } return nx; });
    },
    playPause: () => setSimPlaying((v) => !v),
    cycleSpeed: () => setSimSpeedIdx((i) => (i + 1) % SIM_SPEEDS.length),
    reset: () => { setSimNowMin(7 * 60); setSimActs({}); },
  };

  return (
    <View>
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // الإزاحةُ الابتدائيّةُ تُوضَعُ قبلَ أوّلِ رسمةٍ فلا تُرى الصفحةُ الأولى أصلًا.
        // والقفزُ عندَ قياسِ المحتوى احتياطٌ لا أكثر، وحجبُ الشريطِ حتّى تستقرَّ الإزاحةُ
        // يضمنُ ألّا يُرى انتقالٌ في أسوأِ الحالات: إطارٌ فارغٌ أهونُ من إطارٍ كاذب.
        contentOffset={{ x: page * W, y: 0 }}
        style={{ opacity: ready ? 1 : 0 }}
        onContentSizeChange={() => {
          if (restored.current) return;
          restored.current = true;
          if (page > 0) pagerRef.current?.scrollTo({ x: page * W, animated: false });
          setReady(true);
        }}
        onMomentumScrollEnd={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / W);
          lastPage[pageKey] = p;
          setPage(p);
        }}
      >
        <View style={{ width: W, paddingHorizontal: scale(24) }}>
          <View style={{ flexDirection: 'row', gap: scale(16) }}>{statsNode}</View>
        </View>
        <TouchableOpacity activeOpacity={0.9} style={{ width: W, paddingHorizontal: scale(24) }} onPress={() => setShowFull(true)}>
          <MiniTimeline data={data} nowMin={effNow} simOn={simOn} />
        </TouchableOpacity>
      </ScrollView>

      {/* لا نُقَطَ صفحاتٍ تحتَ اللوح: مساحتُها صارت له، والصفحةُ الثانيةُ تُعرَفُ بالسحب */}

      <FullTimeline visible={showFull} onClose={closeFull} instant={resumed.current} data={data} nowMin={effNow} topInset={insets.top} bottomInset={insets.bottom} sim={simApi} breaks={breaks} onSaveBreaks={onSaveBreaks} chairCount={effChairs.length} onSetChairCount={setChairCount} actions={actions} pull={pull} />
    </View>
  );
}

const mini = scaledStyleSheet({
  // يُطابقُ ارتفاعَ اللوحِ في الصفحةِ الأولى، فلا تعلو صفحةٌ على أختِها في الصفّاحة،
  // ومادّتُه مادّتُه: قاعدةٌ مدخّنةٌ وحافّةٌ مضيئةٌ وظلٌّ من حبرِه.
  card: {
    height: 180, borderRadius: 26, overflow: 'hidden',
    borderWidth: 1.5, borderColor: MINI_RIM,
    paddingTop: 18, paddingHorizontal: 20, paddingBottom: 13,
    shadowColor: '#08202A', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.27, shadowRadius: 14, elevation: 5,
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 20 },
  floor: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 54 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 7, zIndex: 3 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.9, color: '#5A7079' },
  clock: { marginLeft: 'auto', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, color: '#5A7079' },
  exp: {
    width: 19, height: 19, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: MINI_RIM,
  },
  expTxt: { fontSize: 9, color: '#8FA3AC', fontWeight: '800' },
  simBadge: { backgroundColor: '#0B7F71', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  simBadgeTxt: { fontSize: 8, fontWeight: '800', letterSpacing: 1, color: '#fff' },

  // بلاطةُ التالي — الرقمُ يمينَ الاسم (صفٌّ معكوس)، ووَشْمُها يذوبُ فلا حدَّ لها
  slab: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 11,
    height: 54, marginTop: 11, borderRadius: 17, overflow: 'hidden',
    paddingHorizontal: 11,
    borderWidth: 1, borderColor: MINI_RIM,
    shadowColor: '#08202A', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16, shadowRadius: 9, elevation: 3,
  },
  badge: {
    width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#09705C', shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  badgeTxt: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 15.5, fontWeight: '800', color: '#12232A', letterSpacing: -0.3, textAlign: 'right' },
  sub: { marginTop: 2, fontSize: 10.5, fontWeight: '600', color: '#5A7079', textAlign: 'left' },
  timeCol: { alignItems: 'flex-start' },
  timeBig: { fontSize: 14.5, fontWeight: '800', color: '#0B7F71', letterSpacing: -0.3 },
  timeSub: { marginTop: 1, fontSize: 8.5, fontWeight: '800', letterSpacing: 1, color: '#5A7079' },

  // الاثنانِ بعدَه: حبّتانِ متساويتانِ، الرقمُ يمينَ الاسمِ فيهما أيضًا.
  // والصفُّ معكوسٌ كذلك، فالأقربُ دورًا يقعُ يمينًا والذي يليه يساره — يُقرأُ الدورُ من
  // اليمينِ إلى اليسارِ كما تُقرأُ الأسماءُ عليه.
  thenRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 9 },
  thenChip: {
    flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 7,
    height: 30, borderRadius: 12, paddingHorizontal: 7,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
  },
  thenGhost: { flex: 1 },
  thenNumBox: {
    minWidth: 20, height: 20, borderRadius: 7, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(18,35,42,0.08)',
  },
  thenNum: { fontSize: 10.5, fontWeight: '800', color: '#0B7F71' },
  thenName: { flex: 1, fontSize: 11, fontWeight: '700', color: '#31454D', textAlign: 'right' },

  emptyWrap: { flex: 1, justifyContent: 'center' },
  emptyBig: { fontSize: 17, fontWeight: '800', color: '#12232A', letterSpacing: -0.4 },
  emptySub: { marginTop: 4, fontSize: 11.5, fontWeight: '600', color: '#5A7079' },

  // الفجوةُ ١١ لا ١٣: «ENDS 17:40» أطولُ ممّا كان مكانَه، والسطرُ لا يحتملُ التفافًا
  statsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 'auto',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(18,35,42,0.10)',
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6.5, height: 6.5, borderRadius: 4 },
  dotServing: { backgroundColor: '#8A5CD6' },
  dotWait: { backgroundColor: 'rgba(18,35,42,0.28)' },
  dotEnd: { backgroundColor: '#D08A1E' },
  dotAway: { backgroundColor: '#93A5AD' },
  statTxt: { fontSize: 8.5, fontWeight: '800', letterSpacing: 1.1, color: '#5A7079' },
}) as any;

const full = scaledStyleSheet({
  // ── الرأس ──
  head: { paddingHorizontal: 22, paddingTop: 4 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: '#8CA0A8' },
  iconBtn: { height: 34, minWidth: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  // (حُذفَ breakBtn وأخواتُه: زرُّ البريكِ الكهرمانيُّ في الرأس — صارَ التحريرُ كلُّه خلفَ الترس)
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
  // marginTop: كان شريطُ المحاكاةِ يفصلُ اللوحَ عن الرأسِ بجسمِه؛ وقد طُويَ، فالفصلُ الآنَ فراغٌ مقصود
  panelShadow: { flex: 1, marginHorizontal: 14, marginTop: 14, marginBottom: 12, borderRadius: 28, shadowColor: '#0A2834', shadowOpacity: 0.32, shadowRadius: 22, shadowOffset: { width: 0, height: 16 }, elevation: 10 },
  panel: { flex: 1, borderRadius: 28, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.80)' },
  panelTopHi: { position: 'absolute', top: 0, left: 22, right: 22, height: 1, backgroundColor: 'rgba(255,255,255,0.9)', zIndex: 5 },
  gridV: { position: 'absolute', bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(18,58,68,0.05)' },

  // ── رأسُ الجدول: حافّةٌ مطويّةٌ تحملُ الساعاتِ الثابتة ──
  // الساعةُ رقمٌ محفورٌ (حبرٌ داكنٌ وضوءٌ أبيضُ تحتَه) ودقائقُها صغيرةٌ مرفوعةٌ بجانبِه، فتُقرأُ في لمحة.
  ruler: { position: 'absolute', top: 0, left: 0 },
  hourOn: { position: 'absolute', top: 0, bottom: 0, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  hNumWrap: { position: 'absolute', top: 7, width: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  hNum: { fontSize: 15, lineHeight: 17, fontWeight: '800', letterSpacing: -0.6, color: '#2A3E46',
    textShadowColor: 'rgba(255,255,255,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  hNumOn: { color: '#0B7F71' },
  hMin: { marginLeft: 1.5, fontSize: 8.5, lineHeight: 10, fontWeight: '800', letterSpacing: 0.3, color: '#93A6AD' },
  hMinOn: { color: '#4FA898' },
  hUnder: { position: 'absolute', top: 27, width: 26, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(14,159,140,0.55)' },
  tickH: { position: 'absolute', top: 33, width: 1, height: 11, backgroundColor: 'rgba(18,58,68,0.26)' },
  tickM: { position: 'absolute', top: 37, width: 1, height: 7, backgroundColor: 'rgba(18,58,68,0.13)' },
  tickQ: { position: 'absolute', top: 40, width: 1, height: 4, backgroundColor: 'rgba(18,58,68,0.07)' },
  // الكسرةُ وظلُّها — بها يبدو الرأسُ مطويًّا فوقَ الورقةِ لا مرسومًا عليها
  creaseLine: { position: 'absolute', left: 0, height: 1, backgroundColor: CREASE, zIndex: 2 },
  shadeBand: { position: 'absolute', left: 0, height: 6, zIndex: 2 },
  headCrease: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: CREASE },
  headShade: { position: 'absolute', left: 0, right: 0, height: 6, zIndex: 2 },
  // ركنُ الرأس: كم كرسيًّا يعملُ اليوم
  cornerL: { marginTop: 9, marginLeft: 12, fontSize: 6.5, fontWeight: '800', letterSpacing: 1.5, color: '#93A6AD' },
  cornerRow: { flexDirection: 'row', alignItems: 'baseline', marginLeft: 12, marginTop: 2 },
  cornerN: { fontSize: 15, lineHeight: 17, fontWeight: '800', letterSpacing: -0.5, color: '#2A3E46',
    textShadowColor: 'rgba(255,255,255,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  cornerS: { marginLeft: 3, fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 0.6, color: '#93A6AD' },

  railCol: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(18,58,68,0.09)' },
  railHead: { overflow: 'hidden' },
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
  // بداياتُ المرضى خفتَتْ عمدًا: الساعاتُ الثابتةُ في الرأسِ هي المرجع، وهذه تفصيلٌ تحتَها لا يزاحمُها
  strip: { position: 'absolute', left: 0 },
  // ── وقتُ دخولِ المريض: لوحةٌ خضراءُ فوقَ الكرتِ من يسارِه ──
  // مُحاذاةٌ لحافّةِ الكرتِ اليسرى مُزاحةً خطوةً إلى الداخل (E_TAG_IN)، فيستقيمُ **رقمُها** مع
  // حرفِ الكرتِ الأوّل. وركنُها الأسفلُ الأيسرُ **قائمٌ بلا استدارة** وحدَه — فتُقرأُ لسانًا
  // نازلًا على الكرتِ لا لوحةً تحومُ فوقَه. والأركانُ الثلاثةُ الباقيةُ
  // مستديرة، فلا تصيرُ اللوحةُ صندوقًا. وحرفُها أبيضُ كاملٌ بحجمٍ واحد — الساعةُ والدقائقُ سواء.
  eTag: {
    position: 'absolute', bottom: 0, height: 15, minWidth: 34, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomRightRadius: 5, borderBottomLeftRadius: 0,
  },
  // بريقُ الحافّةِ العليا — المادّةُ نفسُها التي في الكرتِ واللوح، فتنتمي إليهما
  eTagGloss: { position: 'absolute', top: 0, left: 4, right: 4, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  eTagTx: { fontSize: 9.5, lineHeight: 11, fontWeight: '800', letterSpacing: -0.2, color: '#FFFFFF' },
  hourTick: { position: 'absolute', top: 2, fontSize: 10, fontWeight: '800', color: '#8CA0A8' },
  laneRow: { position: 'absolute', left: 0, right: 0 },
  // ── عيادةٌ فارغة + خيطُ الفراغ ──
  vacant: { position: 'absolute', top: 7, bottom: 7, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.36)', borderStyle: 'dashed' },
  vacantPill: { position: 'absolute', top: '50%', marginTop: -14, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  vacantTxt: { fontSize: 10.5, fontWeight: '800', color: '#5A7079' },
  // مدّةُ الفراغِ فوقَ خيطِه — لا يضيقُ عن رقمِه كاملًا مهما ضاقتِ الفجوة
  idleLabel: { position: 'absolute', textAlign: 'center', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.2, color: '#93A3AA',
    textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  // خيطُ الفراغ: هو **شريطُ الكرتِ نفسُه** ممتدًّا — نفسُ السماكةِ ونفسُ الاستدارةِ ونفسُ
  // الارتفاع، رماديٌّ فارغٌ لا يمتلئ. فيُقرأُ الصفُّ خطًّا واحدًا يمرُّ من كرتٍ إلى كرت.
  //
  // وهو **محفورٌ** في الورقةِ لا مرسومٌ فوقَها (تصميمُ الورقةِ المطويّة): مَجْرًى داكنٌ تلمعُ
  // حافّتُه السفلى حيثُ يقعُ عليها ضوءُ السطح — كما تلمعُ شفةُ كلِّ طيّةٍ في هذه الصفحة.
  // والشفةُ **تحتَ** قاعِ المَجْرى لا داخلَه، فيبقى الجزءُ الداكنُ بسماكةِ شريطِ الكرتِ
  // تمامًا ومحاذيًا له، ولا يكسبُ الخيطُ إلّا عمقَه.
  groove: { position: 'absolute', borderRadius: 3, backgroundColor: 'rgba(10,35,45,0.11)',
    borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.65)' },

  // ── ④ المَجْرى: البريكُ المرن — رمالٌ ناعمةٌ بلا ظلٍّ ولا شفاهٍ حادّة ──
  trough: { position: 'absolute', borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(206,171,116,0.45)' },
  troughEyebrow: { fontSize: 7, lineHeight: 8.5, fontWeight: '800', letterSpacing: 2.2, color: 'rgba(150,113,52,0.70)' },
  troughTxt: { marginTop: 1.5, fontSize: 11.5, lineHeight: 13, fontWeight: '800', letterSpacing: -0.2, color: '#8A6524' },

  // ── ③ تبديلُ الشفت: عمودٌ رفيعٌ وأرقامُه في المسطرةِ فوقَه ──
  seam: { position: 'absolute', borderRadius: 5, overflow: 'hidden', zIndex: 3 },
  // الخاتم: ركناهُ من جهةِ الورقةِ مستديران، ومن جهةِ الطرفِ قائمانِ — فينتهي عندَه الورقُ
  // انتهاءً حادًّا لا يُلمِّحُ إلى شيءٍ بعدَه، ويلينُ من الداخلِ حيثُ يستمرُّ الجدول.
  seamCapL: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  seamCapR: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  seamEdge: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(255,255,255,0.92)' },
  // وسمُ التبديلِ في المسطرة: حبّةٌ زجاجيّةٌ هادئةٌ تحملُ «من – إلى» ولها كلمتُها فوقَ الرقم،
  // وذَنَبٌ رفيعٌ ينزلُ منها إلى العمودِ فتُقرأُ ملتصقةً به لا طافيةً بجانبِه. وشعرةُ ضوءٍ
  // على حافّتِها العليا — مادّةُ الكرتِ ولوحِ الدخولِ نفسُها، فتنتمي إليهما لا تُقحَمُ عليهما.
  seamTag: { position: 'absolute', top: 7, alignItems: 'center', justifyContent: 'center',
    paddingTop: 3, paddingBottom: 3.5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1, borderColor: 'rgba(108,128,138,0.28)', overflow: 'hidden',
    shadowColor: '#0A2834', shadowOpacity: 0.10, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  seamTagGloss: { position: 'absolute', top: 0, left: 7, right: 7, height: 1, backgroundColor: 'rgba(255,255,255,0.85)' },
  seamTagEye: { fontSize: 6, lineHeight: 7.5, fontWeight: '800', letterSpacing: 1.7, color: '#93A5AD' },
  seamTagTx: { marginTop: 1, fontSize: 9.5, lineHeight: 11, fontWeight: '800', letterSpacing: -0.1, color: '#46585F' },
  seamTagTail: { position: 'absolute', width: 1, backgroundColor: 'rgba(108,128,138,0.34)' },

  // ── شريطُ اليوم ──
  rib: {
    marginHorizontal: 14, marginBottom: 12, height: 64, borderRadius: 20, overflow: 'hidden',
    paddingHorizontal: 11, paddingTop: 8, paddingBottom: 8,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.80)',
    shadowColor: '#08202A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.20, shadowRadius: 12, elevation: 4,
  },
  ribGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 16 },
  ribFloor: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 20 },
  ribHead: { flexDirection: 'row', alignItems: 'center' },
  ribEdge: { fontSize: 7, lineHeight: 9, fontWeight: '800', letterSpacing: 1.1, color: '#5A7079' },
  ribTitle: { flex: 1, textAlign: 'center', fontSize: 7, lineHeight: 9, fontWeight: '800', letterSpacing: 1.5, color: '#8CA0A8' },
  ribTrack: { marginTop: 8 },
  ribLane: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(18,35,42,0.07)' },
  ribWall: { position: 'absolute', top: -2, bottom: -2, width: 2, borderRadius: 1, backgroundColor: 'rgba(99,116,152,0.80)' },
  ribNow: {
    position: 'absolute', top: -4, bottom: -4, width: 2, borderRadius: 1, backgroundColor: '#0E7C66',
    shadowColor: '#0E7C66', shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  ribView: {
    position: 'absolute', top: -5, bottom: -5, left: 0, borderRadius: 8,
    borderWidth: 1.5, borderColor: 'rgba(11,127,113,0.85)', backgroundColor: 'rgba(255,255,255,0.30)',
  },

  // ── ① حدُّ الماء: الخطُّ الزمنيّ ──
  ripple: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(14,159,140,0.26)', borderLeftColor: 'transparent' },
  wBack: { position: 'absolute', width: 1.5, backgroundColor: 'rgba(10,35,45,0.24)' },
  wLip: { position: 'absolute', width: 1.5, backgroundColor: 'rgba(255,255,255,0.97)',
    shadowColor: '#FFFFFF', shadowOpacity: 0.75, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: 3 },
  wTip: { position: 'absolute', width: 9, height: 9, borderRadius: 2, backgroundColor: '#0B7A6C', transform: [{ rotate: '45deg' }], zIndex: 6 },
  wMark: { position: 'absolute', height: 22, borderRadius: 11, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', zIndex: 7,
    shadowColor: '#09705C', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  wMarkTxt: { fontSize: 10, lineHeight: 12, fontWeight: '800', letterSpacing: 0.2, color: '#FFFFFF' },
  // (حُذفَ لباسُ الاستراحةِ الكريميِّ القديم — brk وأخواتُها: صارَ المرنُ مَجْرًى والثابتُ طيّة.
  //  ومعه nowPill: خطُّ الآنَ صارَ حافّةَ سطحٍ بوسمِها لا حبّةً فوقَ خطّ.)
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
  // ملفُّ المريضِ الدائم — يظهرُ لمن له ملفٌّ وحدَه
  actProfile: {
    flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12, padding: 10, borderRadius: 18,
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#08202A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
  },
  actProfileIcon: {
    width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#09705C', shadowOpacity: 0.42, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  actProfileTxt: { fontSize: 14, lineHeight: 16, fontWeight: '800', color: '#06322A', letterSpacing: -0.2 },
  actProfileSub: { marginTop: 2, fontSize: 10, lineHeight: 12, fontWeight: '700', color: '#5A7079' },
  actProfileGo: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,159,140,0.16)', borderWidth: 1, borderColor: 'rgba(14,124,102,0.24)',
  },
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
  // ── إعداداتُ المخطّط (لوحٌ سفليٌّ كلوحِ المريض) ──
  // (حُذفَ editScrim: كان اللوحُ في وسطِ الشاشةِ خلفَ عتمة، فصارَ يصعدُ من أسفلِها كأخيه)
  setChip: {
    width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(125,211,192,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
  },
  editEmpty: { fontSize: 11.5, fontWeight: '600', color: '#8CA0A8', textAlign: 'center', paddingVertical: 20 },

  // شارةُ «خلفَ الشفت» ولوحُ أسمائِها — رماديّةٌ هادئة: هؤلاء ليسوا جدولًا، بل تنبيهٌ
  beyond: {
    position: 'absolute', top: 26, bottom: 26,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: 'rgba(122,140,150,0.16)',
    borderWidth: 1.5, borderColor: 'rgba(122,140,150,0.4)', borderStyle: 'dashed',
  },
  beyondN: { fontSize: 15, fontWeight: '800', color: '#5A7079', letterSpacing: -0.4 },
  beyondL: { marginTop: 1, fontSize: 7.5, fontWeight: '800', letterSpacing: 0.8, color: '#8CA0A8' },
  byChip: {
    width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(122,140,150,0.20)', borderWidth: 1.5, borderColor: 'rgba(122,140,150,0.45)', borderStyle: 'dashed',
  },
  byChipTxt: { fontSize: 14, fontWeight: '800', color: '#5A7079', letterSpacing: -0.4 },
  byRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 7,
    paddingVertical: 9, paddingHorizontal: 10, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
  },
  byNo: {
    width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(122,140,150,0.16)',
  },
  byNoTxt: { fontSize: 13, fontWeight: '800', color: '#5A7079' },
  byName: { fontSize: 13.5, fontWeight: '800', color: '#12232A' },
  byTx: { marginTop: 1.5, fontSize: 10.5, fontWeight: '600', color: '#8CA0A8' },
  // «غيرُ متاح» في قائمةِ خلفَ الشفت — بنفسجيُّ الكرتِ نفسُه، فالحالةُ واحدةٌ أينما قُرِئت
  byRowNA: { backgroundColor: 'rgba(223,224,244,0.78)', borderColor: 'rgba(122,127,188,0.55)' },
  byNoNA: { backgroundColor: 'rgba(122,127,188,0.22)' },
  byNoTxtNA: { color: '#454A79' },
  byNaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  byNaDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7A7FBC' },
  byNaTxt: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2, color: '#575C93' },

  // عددُ العيادات — صفٌّ واحدٌ بارزٌ فوقَ فتراتِ الاستراحة
  cntRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.30)',
  },
  cntT: { fontSize: 13, fontWeight: '800', color: '#22434C' },
  cntS: { marginTop: 1.5, fontSize: 9.5, fontWeight: '700', color: '#8CA0A8' },
  cntBtn: {
    width: 32, height: 32, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.5, borderColor: 'rgba(14,124,102,0.30)',
  },
  cntBtnOff: { opacity: 0.32 },
  cntBtnTxt: { fontSize: 17, lineHeight: 19, fontWeight: '800', color: TEAL_INK, marginTop: -1 },
  cntNum: { minWidth: 26, textAlign: 'center', fontSize: 19, lineHeight: 21, fontWeight: '800', color: '#12232A', letterSpacing: -0.5 },

  brRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8, padding: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  brArrow: { fontSize: 12, fontWeight: '800', color: '#9AACB3' },
  brDel: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(220,38,38,0.10)' },
  brAdd: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 15, backgroundColor: 'rgba(125,211,192,0.14)', borderWidth: 1.5, borderColor: 'rgba(14,124,102,0.34)', borderStyle: 'dashed' },
  brAddTxt: { fontSize: 12.5, fontWeight: '800', color: TEAL_INK, letterSpacing: 0.2 },
  editBtns: { flexDirection: 'row', gap: 9, marginTop: 14 },
  editCancel: { flex: 1, paddingVertical: 13, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 1.5, borderColor: 'rgba(140,160,168,0.34)' },
  editCancelTxt: { fontSize: 13.5, fontWeight: '800', color: '#31454D' },
  editSave: {
    flex: 1.4, paddingVertical: 13, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: '#0B7A5E', shadowOpacity: 0.32, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 5,
  },
  editSaveTxt: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  // ── منتقي الوقت (البريك) ──
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 3, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(140,160,168,0.26)' },
  stepBtn: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(125,211,192,0.20)' },
  stepSign: { fontSize: 15, lineHeight: 17, fontWeight: '800', color: TEAL_INK },
  stepVal: { fontSize: 14, lineHeight: 16, fontWeight: '800', color: '#12232A', letterSpacing: -0.3 },
}) as any;

// ── كرتُ المريضِ في المخطّطِ المكبّر ──
const cs = scaledStyleSheet({
  // موضعُ الكرتِ في صفِّه يقولُ عمقَه (top يُحسَبُ في الصفّ)، وارتفاعُه ثابتٌ في الحالاتِ كلِّها
  card: { position: 'absolute', borderRadius: 16, paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 10, borderWidth: 1, justifyContent: 'center' },
  sunk: { transform: [{ scale: 0.965 }] },        // الغائرُ ينحسرُ قليلًا عن حدودِه فيبدو داخلَ السطح
  // ظلُّ الحائمِ على الورقة: مفصولٌ عنه بفُرجةٍ فيبدو معلَّقًا فوقَها لا واقعًا عليها
  landWrap: { position: 'absolute', height: 16 },
  land1: { position: 'absolute', left: 0, top: 0, height: 16, borderRadius: 8 },
  land2: { position: 'absolute', top: 2.5, height: 11, borderRadius: 5.5 },
  land3: { position: 'absolute', top: 4.5, height: 7, borderRadius: 3.5 },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 15, overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 8, right: 8, height: 1, backgroundColor: 'rgba(255,255,255,0.85)' },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 7, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  badgeTxt: { fontSize: 9.5, lineHeight: 11, fontWeight: '800' },
  name: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: -0.1 },
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
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, height: 12 },
  doc: { flex: 1, fontSize: 8.5, fontWeight: '800', opacity: 0.82 },
}) as any;

// (حُذفَ dots: نُقَطُ الصفحاتِ تحتَ اللوح — مساحتُها صارت له، والصفحةُ الثانيةُ تُعرَفُ بالسحب)
