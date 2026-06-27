// ═══════════════════════════════════════════════════════════════
// كرت خيارات الذكاء — **مكوّن مشترك** يستعمله كلا المحادثتين (لوحة صفحة الذكاء
// AISchedulePanel + محادثة الضغطة المطوّلة AIChatModal) فيتطابقان شكلًا وسلوكًا.
// يُعرض بنفس لغة كرت النقص (AICard): شارة + عنوان + حبّة حالة + سطح زجاجيّ.
//
//  • نصّ الذكاء (الوصف) جزءٌ من الكرت (لا فقاعة منفصلة).
//  • نتيجة الخيار تُخزَّن في الرسالة المشتركة (message.offerResolved) فتتزامن بين
//    المحادثتين: أيّ خيارٍ يُنفَّذ في إحداهما يظهر محلولًا في الأخرى بلا تكرار تنفيذ.
//
// عروضٌ ممكنة (تُنفَّذ **بالكود** — النموذج لا يسأل ولا يشارك):
//  • announceOffer: غيابٌ/إلغاءٌ ذاتيّ سُجّل ووصل القائدَ إشعارُه → «هل تُبلَّغ جهةٌ أخرى؟».
//  • swapOffer: حسم استئذانٍ مبهم (بداية/نهاية).
//  • confirmOffer: تأكيد مسح الجدول.
// ═══════════════════════════════════════════════════════════════
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { ChatMessage } from './aiTypes';
import type { SwapOffer } from '../lib/ai_v2';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard, CardBadge, Pill, cardStyles, type CardKind } from './AICard';
import { scale } from '../lib/scale';

type OffersUser = { id: string; name: string; role: string; clinicId?: string | null };

export default function AssistantOffers({ message, user, clinicId, onResolved, onDone }: {
  message: ChatMessage;
  user: OffersUser;
  clinicId?: string | null;
  light?: boolean; // (مُتجاهَل) الكرت داكنٌ دائمًا — نفس كرت النقص في الصفحتين
  /** يُخزّن النتيجة في الرسالة المشتركة فتتزامن بين المحادثتين */
  onResolved?: (text: string, done: boolean) => void;
  /** بعد إجراءٍ غيّر الجدول (مسح) — لإنعاش الأب */
  onDone?: () => void;
}) {
  const announceOffer = message.announceOffer;
  // طابورُ الإبلاغ: طلبٌ مركّبٌ (طبيّة يومًا + استئذان يومًا آخر) قد يحمل عدّةَ عروض —
  // نعرضها واحدةً واحدة. المفردُ (announceOffer) مُبقًى للتوافق فيُلَفّ في قائمة.
  const announceList = message.announceOffers && message.announceOffers.length
    ? message.announceOffers
    : (announceOffer ? [announceOffer] : []);
  const baseSwap = message.swapOffer;
  const confirmOffer = message.confirmOffer;
  const resolved = message.offerResolved;        // النتيجة المشتركة (مصدر الحقيقة)

  const [busy, setBusy] = useState(false);
  const [errText, setErrText] = useState<string | null>(null);  // فشلٌ يُبقي الأزرار (تبديل فقط)
  // بديلٌ يحلّ محلّ swapOffer محلّيًّا بعد حسم استئذانٍ مبهمٍ نتج عنه تعارض
  const [override, setOverride] = useState<SwapOffer | undefined>(undefined);
  // موضعُ الطابور (أيُّ عرضٍ معروضٌ الآن) ونتائجُ ما حُسِم منه — نتيجةٌ مجمّعةٌ واحدةٌ
  // تُكتَب في offerResolved عند انتهاء الطابور فتتزامن وتختفي البطاقة.
  const [annIdx, setAnnIdx] = useState(0);
  const [annResults, setAnnResults] = useState<{ name: string; announced: boolean; ok: boolean; text: string }[]>([]);

  const resolve = useCallback((text: string, done: boolean) => {
    onResolved?.(text, done);
  }, [onResolved]);

  // ينهي الطابور: نتيجةٌ واحدةٌ تُكتَب في offerResolved. عرضٌ واحد → نصُّه كما هو (توافق)؛
  // عدّة عروض → ملخّصٌ مقتضب (أُبلغ عن س · تُرك ص بلا إبلاغ · تعذّر ع).
  const finalizeAnnounce = useCallback((results: { name: string; announced: boolean; ok: boolean; text: string }[]) => {
    if (results.length <= 1) { const r = results[0]; resolve(r?.text || 'تمّ.', r ? r.ok : true); return; }
    const okAll = results.every((r) => r.ok);
    const annc = results.filter((r) => r.announced && r.ok).length;
    const skip = results.filter((r) => !r.announced).length;
    const failn = results.filter((r) => !r.ok).length;
    const text = [annc ? `أُبلغ عن ${annc}` : null, skip ? `تُرك ${skip} بلا إبلاغ` : null, failn ? `تعذّر ${failn}` : null]
      .filter(Boolean).join(' · ') || 'تمّ.';
    resolve(text, okAll);
  }, [resolve]);

  const handleAnnounce = useCallback(async (choice: 'shift' | 'center' | 'none') => {
    if (busy || resolved) return;
    const cur = announceList[annIdx];
    if (!cur) return;
    let result: { name: string; announced: boolean; ok: boolean; text: string };
    if (choice === 'none') {
      result = { name: cur.subjectName, announced: false, ok: true, text: 'حسنًا — بلا إبلاغ.' };
    } else {
      setBusy(true);
      try {
        const { announceAbsence } = await import('../lib/ai_v2/tools_requests_v2');
        const cid = clinicId || user.clinicId;
        if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
        const res = await announceAbsence({
          clinicId: cid, sender: { id: user.id, name: user.name },
          audience: choice, message: cur.message, subjectId: cur.subjectId,
        });
        result = { name: cur.subjectName, announced: true, ok: !!res.success, text: res.success ? (res.info || 'تمّ الإبلاغ.') : `تعذّر الإبلاغ: ${res.error || ''}` };
      } catch (e) {
        result = { name: cur.subjectName, announced: true, ok: false, text: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
      } finally {
        setBusy(false);
      }
    }
    const all = [...annResults, result];
    if (annIdx < announceList.length - 1) { setAnnResults(all); setAnnIdx(annIdx + 1); } // العرض التالي
    else finalizeAnnounce(all);                                                          // انتهى الطابور
  }, [busy, resolved, announceList, annIdx, annResults, clinicId, user, finalizeAnnounce]);

  // «تخطّي البقيّة»: تُحسَم العروضُ المتبقّية كلُّها «بلا إبلاغ» دفعةً واحدةً.
  const handleSkipRest = useCallback(() => {
    if (busy || resolved) return;
    const rest = announceList.slice(annIdx).map((o) => ({ name: o.subjectName, announced: false, ok: true, text: 'حسنًا — بلا إبلاغ.' }));
    finalizeAnnounce([...annResults, ...rest]);
  }, [busy, resolved, announceList, annIdx, annResults, finalizeAnnounce]);

  const handleSwap = useCallback(async (choice: 'perm_start' | 'perm_end') => {
    const offer = override ?? baseSwap;
    if (!offer || busy || resolved || offer.kind !== 'permission_clarify') return;
    // حسم استئذانٍ مبهم: بداية/نهاية → تسجيلٌ بالكود (بلا جولة نموذج)
    setBusy(true);
    try {
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const out = await mod.resolvePermissionByCode({
        clinicId: cid, user: { id: user.id, name: user.name, role: user.role },
        doctorId: offer.doctorId, doctorName: offer.doctorName,
        weekStart: offer.weekStart, day: offer.day,
        status: choice === 'perm_start' ? 'permission_start' : 'permission_end',
        shift: offer.shift,
      });
      if (out.swapOffer) {           // (نادر) عرضٌ بديلٌ ناتج → أزرار في نفس الكرت
        setOverride(out.swapOffer);
        setErrText(out.text);
      } else {
        resolve(out.text, true);
      }
    } catch (e) {
      setErrText(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
    } finally {
      setBusy(false);
    }
  }, [override, baseSwap, busy, resolved, clinicId, user, resolve]);

  const handleConfirm = useCallback(async (yes: boolean) => {
    if (!confirmOffer || busy || resolved) return;
    if (!yes) { resolve('حسنًا — لم يُمسح الجدول.', true); return; }
    setBusy(true);
    try {
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      const res = await mod.clearWeekByCode({
        clinicId: cid, actor: { id: user.id, role: user.role }, weekStart: confirmOffer.weekStart,
      });
      resolve(res.success ? (res.info || 'تمّ المسح.') : `تعذّر: ${res.error || ''}`, res.success);
      if (res.success) onDone?.();
    } catch (e) {
      resolve(e instanceof Error ? e.message : 'خطأ غير متوقّع.', false);
    } finally {
      setBusy(false);
    }
  }, [confirmOffer, busy, resolved, clinicId, user, resolve, onDone]);

  if (announceList.length === 0 && !baseSwap && !confirmOffer) return null;

  const eff = override ?? baseSwap;
  const hasAnnounce = announceList.length > 0;
  const cur = announceList[annIdx];

  // النوع/العنوان/الحالة — نفس لغة كرت النقص (شارة + عنوان + حبّة حالة)
  const kind: CardKind = resolved ? (resolved.done ? 'done' : 'swap') : confirmOffer ? 'coverage' : 'swap';
  const title = confirmOffer ? 'مسح الجدول' : hasAnnounce ? 'إبلاغ الزملاء' : 'تبديل';
  const pillText = resolved ? (resolved.done ? 'تمّ' : 'تعذّر') : confirmOffer ? 'تأكيد' : 'يحتاج قرارك';
  const live = !resolved;

  const Opt = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} disabled={busy} activeOpacity={0.85} style={st.opt}>
      <Text style={st.optTxt} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

  // بعد الحلّ: كرتٌ نحيفٌ شفّاف — أيقونة + عنوان + نتيجة مختصرة (لا يبقى ضخمًا يزعج العين)
  if (resolved) {
    const okDone = resolved.done;
    return (
      <View style={st.wrap}>
        <View style={st.slim}>
          <Ionicons
            name={okDone ? 'checkmark-circle' : 'close-circle'}
            size={scale(16)}
            color={okDone ? '#34D399' : '#F87171'}
          />
          <Text style={st.slimTitle} numberOfLines={1}>{title}</Text>
          <Text style={[st.slimNote, { color: okDone ? '#A7F3D0' : '#FCA5A5' }]} numberOfLines={1}>
            {resolved.text}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      <GlassCard kind={kind} glow={live}>
        <View style={cardStyles.head}>
          <CardBadge kind={kind} live={live} />
          <View style={cardStyles.headTxt}>
            <Text style={cardStyles.cardTitle} numberOfLines={1}>{title}</Text>
            <Pill kind={kind} text={pillText} />
          </View>
        </View>

        <View style={cardStyles.covBody}>
          {/* نصّ الذكاء (الوصف) — جزءٌ من الكرت */}
          {!!message.content && <Text style={st.body}>{message.content}</Text>}

          {/* الحلّ يُعرَض في الكرت المختصر المبكّر أعلاه — هنا فقط الحالة الحيّة (أزرار/تحميل) */}
          {busy ? <ActivityIndicator color="#C4B0FF" style={{ marginTop: scale(8) }} />
            : (
                <>
                  {!!errText && <Text style={st.err}>{errText}</Text>}

                  {hasAnnounce && (
                    <>
                      {/* طلبٌ مركّب: مؤشّرُ موضع الطابور + سطرُ العرض الحاليّ (مَن/أيُّ يوم) */}
                      {announceList.length > 1 && (
                        <Text style={st.hint}>القرار {annIdx + 1} من {announceList.length} — {cur?.message}</Text>
                      )}
                      <Text style={st.hint}>هل تريد إبلاغ جهةٍ أخرى؟</Text>
                      <Opt label="الشفت" onPress={() => handleAnnounce('shift')} />
                      <Opt label="المركز" onPress={() => handleAnnounce('center')} />
                      <Opt label="لا داعي" onPress={() => handleAnnounce('none')} />
                      {announceList.length > 1 && annIdx < announceList.length - 1 && (
                        <Opt label="تخطّي البقيّة بلا إبلاغ" onPress={handleSkipRest} />
                      )}
                    </>
                  )}

                  {!!eff && eff.kind === 'permission_clarify' && (
                    <>
                      <Opt label="بداية الدوام" onPress={() => handleSwap('perm_start')} />
                      <Opt label="نهاية الدوام" onPress={() => handleSwap('perm_end')} />
                    </>
                  )}

                  {!!confirmOffer && (
                    <>
                      <Opt label="نعم، امسح" onPress={() => handleConfirm(true)} />
                      <Opt label="تراجع" onPress={() => handleConfirm(false)} />
                    </>
                  )}
                </>
              )}
        </View>
      </GlassCard>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: scale(8), marginBottom: scale(2) },
  // الكرت المختصر بعد الحلّ — نحيفٌ شفّافٌ مريحٌ للعين، محاذٍ لليمين (RTL)
  slim: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: scale(7), alignSelf: 'flex-start',
    maxWidth: '92%', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.10)', borderRadius: scale(13),
    paddingVertical: scale(6), paddingHorizontal: scale(11),
  },
  slimTitle: { fontSize: scale(12), color: '#E9E4FF', fontWeight: '700' },
  slimNote: { fontSize: scale(11.5), fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  body: { fontSize: scale(13.5), color: '#F4F1FF', textAlign: 'right', lineHeight: scale(21), fontWeight: '500', marginBottom: scale(2) },
  hint: { fontSize: scale(11.5), color: 'rgba(214,196,255,0.7)', textAlign: 'right', marginTop: scale(8), marginBottom: scale(2) },
  note: { fontSize: scale(13), color: '#A7F3D0', textAlign: 'right', fontWeight: '700', lineHeight: scale(20), marginTop: scale(8) },
  err: { fontSize: scale(12.5), color: '#FCA5A5', textAlign: 'right', fontWeight: '700', marginTop: scale(6), marginBottom: scale(2) },
  // حاويةٌ أصغر من حلول كرت النقص — زرٌّ مدمج مكدّس
  opt: {
    alignSelf: 'stretch', marginTop: scale(7), paddingVertical: scale(8), paddingHorizontal: scale(12),
    borderRadius: scale(10), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.16)',
  },
  optTxt: { fontSize: scale(13), color: '#F4F1FF', textAlign: 'right', fontWeight: '700' },
});
