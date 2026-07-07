// ═══════════════════════════════════════════════════════════════
// ScheduleWizardCard — معالجُ إنشاءِ الجدولِ داخلَ المحادثة (كرتٌ تفاعليّ)
// ───────────────────────────────────────────────────────────────
// يظهرُ حين يطلبُ القائدُ من الذكاء بناءَ جدولٍ («ابني/سوّي/انشئ/وزّع جدول ...»).
// بتصميمِ الطلباتِ المتعدّدة: كرتٌ واحدٌ تتغيّرُ صفحاتُه خطوةً خطوة («الخطوة X من N»)،
// يجمعُ نفسَ مدخلاتِ صفحةِ الإنشاء، ثمّ يبني معاينةً ويحفظُها ويعرضُ سؤالَ الإبلاغ —
// **مكتفٍ بذاته** (يحملُ معاينتَه وحفظَه) فيعملُ في المحادثتَين معًا (صفحةُ الذكاء + الأورب).
// المنطقُ (بناء/حفظ) مشتركٌ مع صفحةِ الإنشاء عبرَ lib/algorithms/scheduleFlow.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { scale } from '../lib/scale';
import { GlassCard, CardBadge, Pill, cardStyles } from './AICard';
import { PreviewView } from './ScheduleWizard';
import {
  type DayKey, type ShiftValue, type TraineeConfig, type WizardResult, type FlowPreview, type WizardRoster,
  ALL_MORNING, snapToSunday, thisWeekSunday, nextWeekSunday, formatYMD,
  loadWizardRoster, parseResultExceptions, buildPreview, saveSchedule,
} from '../lib/algorithms/scheduleFlow';
import type { ParsedExceptions, Clarification, ResolvedClarification } from '../lib/ai_v2/parseExceptions';
import type { AssignedSlot, WeekDay } from '../lib/algorithms/schedule';
import { broadcastAnnouncement } from '../lib/ai_v2/tools_requests_v2';

export type ScheduleWizardSeed = { weekStart?: string; done?: boolean };
type User = { id: string; name: string; role: string; clinicId?: string | null };

const DAYS: { key: DayKey; short: string }[] = [
  { key: 'sunday', short: 'أحد' },
  { key: 'monday', short: 'اثنين' },
  { key: 'tuesday', short: 'ثلاثاء' },
  { key: 'wednesday', short: 'أربعاء' },
  { key: 'thursday', short: 'خميس' },
];
const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}
function weekLabel(ymd: string): string {
  const d = ymdToDate(ymd);
  return `أسبوع ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}
// يحاول قراءةَ تاريخٍ مكتوبٍ بصيغٍ شائعة → يُثبَّت على الأحد → YYYY-MM-DD
function parseTypedDate(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  let d: Date | null = null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  else if ((m = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/))) {
    const now = new Date();
    const yr = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    d = new Date(yr, +m[2] - 1, +m[1]);
  }
  if (!d || isNaN(d.getTime())) return null;
  return formatYMD(snapToSunday(d));
}

const isLeaderRole = (role: string) => ['team_leader', 'coordinator', 'super_admin', 'manager'].includes(role);

// ─── عناصرُ اختيارٍ زجاجيّة (بنبرةِ كروتِ القرار) ───
function Opt({ label, onPress, disabled, tone = 'plain' }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'plain' | 'primary' }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={[st.opt, tone === 'primary' && st.optPrimary, disabled && { opacity: 0.5 }]}>
      <Text style={[st.optTxt, tone === 'primary' && { color: '#fff' }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}
// شريحةُ اختيارٍ (مختارة = بنفسجيّ زاهٍ)
function Chip({ label, sel, onPress, flex }: { label: string; sel: boolean; onPress: () => void; flex?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[st.chip, flex && { flex: 1 }, sel ? st.chipSel : null]}>
      <Text style={[st.chipTxt, sel && { color: '#1B1340' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}
// شبكةُ الأيقونات: يومٌ = ☀ صباح / 🌙 مساء (يُقلَبُ بالنقر)
function ShiftGrid({ plan, onToggle }: { plan: Record<DayKey, ShiftValue>; onToggle: (d: DayKey) => void }) {
  return (
    <View style={{ flexDirection: 'row-reverse', gap: scale(6), marginTop: scale(10) }}>
      {DAYS.map((d) => {
        const morning = plan[d.key] === 'morning';
        return (
          <TouchableOpacity key={d.key} onPress={() => onToggle(d.key)} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', paddingVertical: scale(9), borderRadius: scale(12), backgroundColor: morning ? 'rgba(251,191,36,0.14)' : 'rgba(96,165,250,0.16)', borderWidth: scale(1), borderColor: morning ? 'rgba(251,191,36,0.4)' : 'rgba(96,165,250,0.45)' }}>
            <Text style={{ fontSize: scale(9.5), fontWeight: '700', color: 'rgba(233,222,255,0.75)', marginBottom: scale(4) }}>{d.short}</Text>
            <Ionicons name={morning ? 'sunny' : 'moon'} size={scale(18)} color={morning ? '#FBBF24' : '#93C5FD'} />
            <Text style={{ fontSize: scale(9.5), fontWeight: '800', color: morning ? '#FBBF24' : '#93C5FD', marginTop: scale(3) }}>{morning ? 'صباح' : 'مساء'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ScheduleWizardCard({ seed, clinicId, user, onAfterAction, onComplete }: {
  seed: ScheduleWizardSeed; clinicId?: string | null; user: User; onAfterAction?: () => void;
  /** يُستدعى مرّةً حين يكتمل الإنشاء — يثبّت «تمّ» في الرسالة فلا يعودُ الكرتُ فارغًا (كلّ النسخ) */
  onComplete?: () => void;
}) {
  const cid = clinicId ?? user.clinicId ?? null;
  const leader = isLeaderRole(user.role);

  // ── مدخلاتُ الاستبيان ──
  const [weekStart, setWeekStart] = useState<string>(seed.weekStart || formatYMD(nextWeekSunday()));
  const [dateText, setDateText] = useState('');
  const [shifts, setShifts] = useState<Record<DayKey, ShiftValue>>({ ...ALL_MORNING });
  const [boardPresent, setBoardPresent] = useState(true);
  const [boardShifts, setBoardShifts] = useState<Record<DayKey, ShiftValue>>({ ...ALL_MORNING });
  const [trainees, setTrainees] = useState<TraineeConfig[]>([]);
  const [exceptionsText, setExceptionsText] = useState('');

  // ── روستر العيادة (أسماء/قروبات/متدرّبون) ──
  const [roster, setRoster] = useState<WizardRoster | null>(null);
  useEffect(() => {
    if (!cid || !leader) return;
    let alive = true;
    loadWizardRoster(cid).then((r) => { if (alive) { setRoster(r); setTrainees(r.trainees); } }).catch(() => {});
    return () => { alive = false; };
  }, [cid, leader]);

  // ── حالةُ المعالج ──
  type Phase = 'form' | 'clarify' | 'announce' | 'done';
  const [phase, setPhase] = useState<Phase>(seed.done ? 'done' : 'form');
  const [stepIdx, setStepIdx] = useState(0);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<FlowPreview | null>(null);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedExceptions | null>(null);
  const [resolved, setResolved] = useState<ResolvedClarification[]>([]);
  const [clarQueue, setClarQueue] = useState<Clarification[]>([]);
  const [clarIdx, setClarIdx] = useState(0);
  const [doneText, setDoneText] = useState('تمّ إنشاءُ الجدول.');

  const steps = useMemo<Array<'week' | 'shifts' | 'board' | 'trainees' | 'exceptions'>>(
    () => ['week', 'shifts', 'board', ...(trainees.length ? ['trainees' as const] : []), 'exceptions'],
    [trainees.length],
  );
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  const collect = (): WizardResult => ({
    weekStart,
    aShiftPlan: shifts,
    board: { present: boardPresent, shiftPlan: boardShifts, inExRotation: false },
    trainees,
    exceptions: exceptionsText.trim() || undefined,
  });

  const toggleShift = (d: DayKey) => setShifts((p) => ({ ...p, [d]: p[d] === 'morning' ? 'evening' : 'morning' }));
  const toggleBoard = (d: DayKey) => setBoardShifts((p) => ({ ...p, [d]: p[d] === 'morning' ? 'evening' : 'morning' }));
  const patchTrainee = (id: string, patch: Partial<TraineeConfig>) => setTrainees((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // ── البناء ──
  const runBuild = async (p: ParsedExceptions, res: ResolvedClarification[]) => {
    if (!cid) { setError('لا توجد عيادة مرتبطة بك.'); return; }
    setBuilding(true); setError(null);
    const out = await buildPreview(collect(), cid, p, res);
    setBuilding(false);
    if (out.ok && out.preview) { setPreview(out.preview); setShowPreview(true); setPhase('form'); }
    else setError(out.error || 'تعذّر بناء الجدول.');
  };

  const onCreate = async () => {
    if (!cid || !roster) { setError('جارٍ تحميل بيانات العيادة…'); return; }
    setBuilding(true); setError(null);
    try {
      const p = await parseResultExceptions(collect(), roster.roster);
      setParsed(p);
      if (p.clarifications.length) { setBuilding(false); setClarQueue(p.clarifications); setClarIdx(0); setResolved([]); setPhase('clarify'); return; }
      await runBuild(p, []);
    } catch (e) {
      setBuilding(false);
      setError(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    }
  };

  const resolveClar = (c: Clarification, doctorId: string, day: WeekDay) => {
    const next = [...resolved, { clar: c, doctorId, day }];
    setResolved(next);
    if (clarIdx < clarQueue.length - 1) setClarIdx(clarIdx + 1);
    else if (parsed) { setPhase('form'); runBuild(parsed, next); }
  };

  const onSavePreview = async (finalSlots: AssignedSlot[]) => {
    if (!cid) return;
    setPreviewSaving(true); setPreviewError(null);
    const res = await saveSchedule(collect(), cid, finalSlots, roster?.roster ?? [], roster?.groupKeyById ?? new Map(), parsed, resolved);
    setPreviewSaving(false);
    if (res.success) { setShowPreview(false); onAfterAction?.(); setPhase('announce'); }
    else setPreviewError(res.error || 'تعذّر حفظ الجدول.');
  };

  const doAnnounce = async (audience: 'shift' | 'center' | null) => {
    if (audience && cid) {
      setBuilding(true);
      await broadcastAnnouncement({
        clinicId: cid,
        sender: { id: user.id, name: user.name },
        audience,
        title: 'جدولٌ جديد',
        message: `تمّ نشرُ جدولِ ${weekLabel(weekStart)}.`,
      }).catch(() => {});
      setBuilding(false);
      setDoneText(audience === 'shift' ? 'تمّ إنشاءُ الجدولِ وأُبلِغ الشفت.' : 'تمّ إنشاءُ الجدولِ وأُبلِغ المركز.');
    } else {
      setDoneText('تمّ إنشاءُ الجدول.');
    }
    setPhase('done');
    onComplete?.();   // ثبّتِ «تمّ» في الرسالة فلا يظهرُ كرتُ إنشاءٍ فارغٌ تلقائيًّا (كلّ النسخ)
  };

  // ── غيرُ القائد: لا يبني (حرّاسٌ دفاعيّ؛ الأداةُ محصورةٌ بالقائدِ أصلًا) ──
  if (!leader) {
    return (
      <View style={{ alignSelf: 'stretch', marginTop: scale(8) }}>
        <GlassCard kind="info">
          <Text style={{ fontSize: scale(13), color: '#E9DEFF', textAlign: 'right' }}>إنشاءُ الجدولِ الأسبوعيِّ من صلاحيّاتِ قائدِ الفريق.</Text>
        </GlassCard>
      </View>
    );
  }

  // ── الحالةُ النهائيّة (مصغّرة) ──
  if (phase === 'done') {
    return (
      <View style={{ alignSelf: 'flex-start', marginTop: scale(8), flexDirection: 'row-reverse', alignItems: 'center', gap: scale(7), maxWidth: '92%', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.10)', borderRadius: scale(13), paddingVertical: scale(7), paddingHorizontal: scale(12) }}>
        <Ionicons name="checkmark-circle" size={scale(16)} color="#34D399" />
        <Text style={{ fontSize: scale(12.5), color: '#A7F3D0', fontWeight: '700', textAlign: 'right', flexShrink: 1 }}>{doneText}</Text>
      </View>
    );
  }

  // ── رأسُ الكرت ──
  const total = steps.length;
  const pillText = phase === 'clarify' ? 'توضيحٌ مطلوب'
    : phase === 'announce' ? 'الإبلاغ'
    : `الخطوة ${stepIdx + 1} من ${total}`;

  return (
    <View style={{ alignSelf: 'stretch', marginTop: scale(8) }}>
      <GlassCard kind="decision" glow>
        <View style={cardStyles.head}>
          <CardBadge kind="decision" live />
          <View style={cardStyles.headTxt}>
            <Text style={cardStyles.cardTitle} numberOfLines={1}>إنشاءُ جدولِ {weekLabel(weekStart)}</Text>
            <Pill kind="decision" text={pillText} />
          </View>
        </View>

        <View style={cardStyles.covBody}>
          {phase === 'clarify' && clarQueue[clarIdx] && (
            <ClarifyStep c={clarQueue[clarIdx]} idx={clarIdx} total={clarQueue.length} onResolve={resolveClar} />
          )}

          {phase === 'announce' && (
            <>
              <Text style={st.q}>حُفِظ الجدول. تُبلِغُ عنه؟</Text>
              <Opt label="أبلِغِ الشفت" tone="primary" onPress={() => doAnnounce('shift')} disabled={building} />
              <Opt label="أبلِغِ المركز" onPress={() => doAnnounce('center')} disabled={building} />
              <Opt label="لا داعي" onPress={() => doAnnounce(null)} disabled={building} />
            </>
          )}

          {phase === 'form' && (
            <>
              {/* ── الأسبوع ── */}
              {step === 'week' && (
                <>
                  <Text style={st.q}>أيُّ أسبوع؟</Text>
                  <View style={{ flexDirection: 'row-reverse', gap: scale(8) }}>
                    <Chip flex label="الأسبوع الحالي" sel={weekStart === formatYMD(thisWeekSunday())} onPress={() => setWeekStart(formatYMD(thisWeekSunday()))} />
                    <Chip flex label="الأسبوع القادم" sel={weekStart === formatYMD(nextWeekSunday())} onPress={() => setWeekStart(formatYMD(nextWeekSunday()))} />
                  </View>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(8), marginTop: scale(10) }}>
                    <TextInput
                      value={dateText}
                      onChangeText={setDateText}
                      placeholder="أو اكتب تاريخًا (12/7 أو 2026-07-12)"
                      placeholderTextColor="rgba(244,241,255,0.4)"
                      textAlign="right"
                      style={st.input}
                      onSubmitEditing={() => { const w = parseTypedDate(dateText); if (w) setWeekStart(w); }}
                    />
                    <TouchableOpacity onPress={() => { const w = parseTypedDate(dateText); if (w) setWeekStart(w); }} activeOpacity={0.85} style={st.inputBtn}>
                      <Ionicons name="checkmark" size={scale(18)} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <Text style={st.hint}>المُختار: {weekLabel(weekStart)}</Text>
                </>
              )}

              {/* ── توزيع الشفتات ── */}
              {step === 'shifts' && (
                <>
                  <Text style={st.q}>توزيعُ الشفتات — القروب A</Text>
                  <ShiftGrid plan={shifts} onToggle={toggleShift} />
                  <Text style={st.hint}>انقر يومًا ليتبدّل — القروب B يأخذُ العكس.</Text>
                </>
              )}

              {/* ── البورد ── */}
              {step === 'board' && (
                <>
                  <Text style={st.q}>البورد هذا الأسبوع؟</Text>
                  <View style={{ flexDirection: 'row-reverse', gap: scale(8) }}>
                    <Chip flex label="موجودون" sel={boardPresent} onPress={() => setBoardPresent(true)} />
                    <Chip flex label="غير موجودين" sel={!boardPresent} onPress={() => setBoardPresent(false)} />
                  </View>
                  {boardPresent && (
                    <>
                      <Text style={[st.hint, { marginTop: scale(12), marginBottom: 0 }]}>أوقاتُ عملهم:</Text>
                      <ShiftGrid plan={boardShifts} onToggle={toggleBoard} />
                    </>
                  )}
                </>
              )}

              {/* ── المتدرّبون ── */}
              {step === 'trainees' && (
                <>
                  <Text style={st.q}>المتدرّبون</Text>
                  {trainees.map((t) => (
                    <View key={t.id} style={st.trainee}>
                      <Text style={st.traineeName} numberOfLines={1}>{t.name}</Text>
                      <View style={{ flexDirection: 'row-reverse', gap: scale(6), marginTop: scale(7) }}>
                        <Chip flex label="Beginner" sel={t.mode === 'beginner'} onPress={() => patchTrainee(t.id, { mode: 'beginner' })} />
                        <Chip flex label="Independent" sel={t.mode === 'independent'} onPress={() => patchTrainee(t.id, { mode: 'independent' })} />
                      </View>
                      {t.mode === 'independent' && (
                        <View style={{ flexDirection: 'row-reverse', gap: scale(6), marginTop: scale(6) }}>
                          <Chip flex label="يدخل الاحتياط" sel={t.inReserve} onPress={() => patchTrainee(t.id, { inReserve: !t.inReserve })} />
                          <Chip flex label="يدخل الدليقيتر" sel={t.inDelegator} onPress={() => patchTrainee(t.id, { inDelegator: !t.inDelegator })} />
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}

              {/* ── الاستثناءات ── */}
              {step === 'exceptions' && (
                <>
                  <Text style={st.q}>استثناءاتُ هذا الأسبوع؟ (اختياري)</Text>
                  <TextInput
                    value={exceptionsText}
                    onChangeText={setExceptionsText}
                    placeholder={'مثال:\n• د. محمد متفرّغ الثلاثاء\n• الخميس عطلة'}
                    placeholderTextColor="rgba(244,241,255,0.4)"
                    textAlign="right"
                    multiline
                    style={[st.input, { minHeight: scale(78), textAlignVertical: 'top', paddingTop: scale(9) }]}
                  />
                </>
              )}

              {!!error && <Text style={st.err}>{error}</Text>}

              {/* ── التنقّل (رجوع يمينًا · التالي/إنشاء يسارًا) ── */}
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(8), marginTop: scale(12) }}>
                {stepIdx > 0 && <Opt label="‹ رجوع" onPress={() => { setError(null); setStepIdx((i) => Math.max(i - 1, 0)); }} />}
                {stepIdx < steps.length - 1 ? (
                  <Opt tone="primary" label="التالي ›" onPress={() => { setError(null); setStepIdx((i) => Math.min(i + 1, steps.length - 1)); }} />
                ) : (
                  <Opt tone="primary" label={building ? 'جارٍ الإنشاء…' : 'إنشاءُ الجدول'} disabled={building} onPress={onCreate} />
                )}
                {building && <ActivityIndicator size="small" color="#C4B0FF" />}
              </View>
            </>
          )}
        </View>
      </GlassCard>

      {/* ── المعاينة (Modal مكتفٍ بذاته — يعملُ في المحادثتَين) ── */}
      <Modal transparent visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={['#1E1B4B', '#312E81', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {preview && (
            <PreviewView
              preview={{ slots: preview.slots, absences: preview.absences, clinicCount: preview.clinicCount, summary: preview.summary, warnings: preview.warnings }}
              building={previewSaving}
              error={previewError}
              onSave={onSavePreview}
              onEdit={() => setShowPreview(false)}
              hideEdit
            />
          )}
          <TouchableOpacity onPress={() => setShowPreview(false)} activeOpacity={0.85} style={{ position: 'absolute', top: scale(48), left: scale(16), zIndex: 30, padding: scale(6) }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={scale(28)} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// خطوةُ التوضيح (اسمٌ مبهم و/أو يومٌ ناقص) — نفسُ لغةِ كروتِ التوضيح
function ClarifyStep({ c, idx, total, onResolve }: { c: Clarification; idx: number; total: number; onResolve: (c: Clarification, doctorId: string, day: WeekDay) => void }) {
  const ambiguous = c.candidates.length > 1;
  const needsDay = !!c.needsDay;
  const [docId, setDocId] = useState<string | null>(ambiguous ? null : (c.candidates[0]?.id ?? null));
  const [day, setDay] = useState<WeekDay | null>(needsDay ? null : ((c.day as WeekDay) ?? null));
  const kindLabel = c.kind === 'permission' ? 'استئذان' : 'غياب';
  const tryResolve = (d: string | null, dy: WeekDay | null) => { if (d && dy) onResolve(c, d, dy); };
  return (
    <>
      {total > 1 && <Text style={st.hint}>توضيح {idx + 1} من {total}</Text>}
      <Text style={st.q}>«{c.mention}» — {kindLabel}</Text>
      {ambiguous && (
        <>
          <Text style={st.sub}>من تقصد؟</Text>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(6) }}>
            {c.candidates.map((cand) => (
              <Chip key={cand.id} label={cand.name} sel={docId === cand.id} onPress={() => { setDocId(cand.id); tryResolve(cand.id, day); }} />
            ))}
          </View>
        </>
      )}
      {needsDay && (
        <>
          <Text style={st.sub}>أيّ يوم؟</Text>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: scale(6) }}>
            {DAYS.map((d) => (
              <Chip key={d.key} label={DAY_AR[d.key]} sel={day === (d.key as WeekDay)} onPress={() => { setDay(d.key as WeekDay); tryResolve(docId, d.key as WeekDay); }} />
            ))}
          </View>
        </>
      )}
    </>
  );
}

const st = StyleSheet.create({
  q: { fontSize: scale(14), color: '#F4F1FF', textAlign: 'right', fontWeight: '800', marginBottom: scale(8), lineHeight: scale(21) },
  sub: { fontSize: scale(11.5), color: 'rgba(214,196,255,0.72)', textAlign: 'right', marginTop: scale(10), marginBottom: scale(6), fontWeight: '700' },
  hint: { fontSize: scale(11), color: 'rgba(214,196,255,0.62)', textAlign: 'right', marginTop: scale(9), fontWeight: '600' },
  err: { fontSize: scale(12), color: '#FCA5A5', textAlign: 'right', marginTop: scale(9), fontWeight: '700' },
  opt: { alignSelf: 'stretch', marginTop: scale(7), paddingVertical: scale(9), paddingHorizontal: scale(12), borderRadius: scale(10), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: scale(1), borderColor: 'rgba(167,139,250,0.30)' },
  optPrimary: { backgroundColor: 'rgba(124,58,237,0.9)', borderColor: 'rgba(196,176,255,0.6)' },
  optTxt: { fontSize: scale(13.5), color: '#F1EAFF', textAlign: 'center', fontWeight: '800' },
  chip: { paddingHorizontal: scale(12), paddingVertical: scale(9), borderRadius: scale(11), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)', alignItems: 'center' },
  chipSel: { backgroundColor: 'rgba(167,139,250,0.92)', borderColor: '#C4B0FF' },
  chipTxt: { fontSize: scale(13), color: '#EDE7FF', fontWeight: '700' },
  input: { flex: 1, minHeight: scale(44), borderRadius: scale(12), paddingHorizontal: scale(13), paddingVertical: scale(9), fontSize: scale(13.5), color: '#fff', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.18)' },
  inputBtn: { width: scale(44), height: scale(44), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,58,237,0.85)', borderWidth: scale(1), borderColor: 'rgba(196,176,255,0.5)' },
  trainee: { marginTop: scale(9), paddingVertical: scale(9), paddingHorizontal: scale(10), borderRadius: scale(13), backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.10)' },
  traineeName: { fontSize: scale(13), color: '#F2ECFF', fontWeight: '800', textAlign: 'right' },
});
