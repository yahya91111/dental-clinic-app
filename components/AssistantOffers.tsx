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
//  • announceOffer: غيابٌ ذاتيّ سُجّل ووصل القائدَ إشعارُه → «هل تُبلَّغ جهةٌ أخرى؟».
//  • swapOffer: تبديل القائد / حسم استئذان مبهم / تبديل فترة استئذانٍ متعارض.
//  • confirmOffer: تأكيد مسح الجدول.
// ═══════════════════════════════════════════════════════════════
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { ChatMessage } from './aiTypes';
import type { SwapOffer } from '../lib/ai_v2';
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
  const baseSwap = message.swapOffer;
  const confirmOffer = message.confirmOffer;
  const resolved = message.offerResolved;        // النتيجة المشتركة (مصدر الحقيقة)

  const [busy, setBusy] = useState(false);
  const [errText, setErrText] = useState<string | null>(null);  // فشلٌ يُبقي الأزرار (تبديل فقط)
  // بديلٌ يحلّ محلّ swapOffer محلّيًّا بعد حسم استئذانٍ مبهمٍ نتج عنه تعارض
  const [override, setOverride] = useState<SwapOffer | undefined>(undefined);

  const resolve = useCallback((text: string, done: boolean) => {
    onResolved?.(text, done);
  }, [onResolved]);

  const handleAnnounce = useCallback(async (choice: 'shift' | 'center' | 'none') => {
    if (!announceOffer || busy || resolved) return;
    if (choice === 'none') { resolve('حسنًا — بلا إبلاغ.', true); return; }
    setBusy(true);
    try {
      const { announceAbsence } = await import('../lib/ai_v2/tools_requests_v2');
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const res = await announceAbsence({
        clinicId: cid, sender: { id: user.id, name: user.name },
        audience: choice, message: announceOffer.message, subjectId: announceOffer.subjectId,
      });
      resolve(res.success ? (res.info || 'تمّ الإبلاغ.') : `تعذّر الإبلاغ: ${res.error || ''}`, res.success);
    } catch (e) {
      resolve(e instanceof Error ? e.message : 'خطأ غير متوقّع.', false);
    } finally {
      setBusy(false);
    }
  }, [announceOffer, busy, resolved, clinicId, user, resolve]);

  const handleSwap = useCallback(async (
    choice: 'request' | 'direct' | 'notify' | 'none' | 'perm_colleague' | 'perm_period' | 'perm_other'
      | 'perm_start' | 'perm_end',
  ) => {
    const offer = override ?? baseSwap;
    if (!offer || busy || resolved) return;
    if (choice === 'none') { resolve('حسنًا — بلا إبلاغ.', true); return; }
    // حسم استئذانٍ مبهم: بداية/نهاية → تسجيلٌ بالكود (بلا جولة نموذج)
    if (offer.kind === 'permission_clarify' && (choice === 'perm_start' || choice === 'perm_end')) {
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
        if (out.swapOffer) {           // تعارضٌ → أزرار تبديل الفترة في نفس الكرت
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
      return;
    }
    setBusy(true);
    try {
      const cid = clinicId || user.clinicId;
      if (!cid) throw new Error('لا توجد عيادة مرتبطة.');
      const mod = await import('../lib/ai_v2/tools_requests_v2');
      let res: { success: boolean; info?: string; error?: string } | null = null;
      if (offer.kind === 'ask_mode' && choice === 'request') {
        res = await mod.sendSwapRequestByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          targetId: offer.target.id, targetName: offer.target.name,
        });
      } else if (offer.kind === 'ask_mode' && choice === 'direct') {
        res = await mod.directSwapByCode({
          clinicId: cid, actor: { id: user.id, role: user.role },
          weekStart: offer.weekStart, day: offer.day,
          targetId: offer.target.id, targetName: offer.target.name,
          actorName: user.name,
        });
      } else if (offer.kind === 'offer_notify' && choice === 'notify') {
        res = await mod.notifySwappedPair({
          clinicId: cid, sender: { id: user.id, name: user.name },
          day: offer.day, a: offer.a, b: offer.b,
        });
      } else if (offer.kind === 'permission_fix' && choice === 'perm_colleague' && offer.colleague) {
        res = await mod.sendSwapRequestByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          targetId: offer.colleague.id, targetName: offer.colleague.name,
          perm: { blocked: offer.blocked, targetPeriod: offer.period, statusAr: offer.statusAr || 'استئذان', leaderIds: offer.leaderIds || [] },
        });
      } else if (offer.kind === 'permission_fix' && choice === 'perm_period' && offer.period) {
        res = await mod.sendSwapRequestModeByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          mode: { kind: 'period', period: offer.period },
          excludePeriods: offer.blocked,
          perm: { blocked: offer.blocked, targetPeriod: offer.period, statusAr: offer.statusAr || 'استئذان', leaderIds: offer.leaderIds || [] },
        });
      } else if (offer.kind === 'permission_fix' && choice === 'perm_other') {
        res = await mod.sendSwapRequestModeByCode({
          clinicId: cid, requester: { id: user.id, name: user.name },
          weekStart: offer.weekStart, day: offer.day,
          mode: { kind: 'other_shift' },
          excludePeriods: offer.blocked,
          perm: { blocked: offer.blocked, targetPeriod: offer.period, statusAr: offer.statusAr || 'استئذان', leaderIds: offer.leaderIds || [] },
        });
      }
      if (res) {
        if (res.success) resolve(res.info || 'تمّ.', true);
        else setErrText(`تعذّر: ${res.error || ''}`);   // فشل → تبقى الأزرار للمحاولة
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

  if (!announceOffer && !baseSwap && !confirmOffer) return null;

  const eff = override ?? baseSwap;

  // النوع/العنوان/الحالة — نفس لغة كرت النقص (شارة + عنوان + حبّة حالة)
  const kind: CardKind = resolved ? (resolved.done ? 'done' : 'swap') : confirmOffer ? 'coverage' : 'swap';
  const title = confirmOffer ? 'مسح الجدول' : announceOffer ? 'إبلاغ الزملاء' : 'تبديل';
  const pillText = resolved ? (resolved.done ? 'تمّ' : 'تعذّر') : confirmOffer ? 'تأكيد' : 'يحتاج قرارك';
  const live = !resolved;

  const Opt = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} disabled={busy} activeOpacity={0.85} style={st.opt}>
      <Text style={st.optTxt} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

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

          {/* النتيجة (محلولٌ) — تظهر داخل الكرت بشكلٍ أنيق */}
          {resolved ? <Text style={[st.note, { color: resolved.done ? '#A7F3D0' : '#FCA5A5' }]}>{resolved.text}</Text>
            : busy ? <ActivityIndicator color="#C4B0FF" style={{ marginTop: scale(8) }} />
              : (
                <>
                  {!!errText && <Text style={st.err}>{errText}</Text>}

                  {!!announceOffer && (
                    <>
                      <Text style={st.hint}>هل تريد إبلاغ جهةٍ أخرى؟</Text>
                      <Opt label="الشفت" onPress={() => handleAnnounce('shift')} />
                      <Opt label="المركز" onPress={() => handleAnnounce('center')} />
                      <Opt label="لا داعي" onPress={() => handleAnnounce('none')} />
                    </>
                  )}

                  {!!eff && (
                    eff.kind === 'permission_clarify' ? (
                      <>
                        <Opt label="بداية الدوام" onPress={() => handleSwap('perm_start')} />
                        <Opt label="نهاية الدوام" onPress={() => handleSwap('perm_end')} />
                      </>
                    ) : eff.kind === 'ask_mode' ? (
                      <>
                        <Opt label="أرسل طلبًا" onPress={() => handleSwap('request')} />
                        <Opt label="بدّل مباشرة" onPress={() => handleSwap('direct')} />
                      </>
                    ) : eff.kind === 'permission_fix' ? (
                      <>
                        {!!eff.colleague && <Opt label={`زميلك بالعيادة (${eff.colleague.name})`} onPress={() => handleSwap('perm_colleague')} />}
                        {!!eff.period && <Opt label="الفترة الأخرى" onPress={() => handleSwap('perm_period')} />}
                        {eff.otherShift && <Opt label="الشفت الثاني" onPress={() => handleSwap('perm_other')} />}
                      </>
                    ) : (
                      <>
                        <Text style={st.hint}>هل يُبلَّغ الطرفان بالتبديل؟</Text>
                        <Opt label="أبلغهما" onPress={() => handleSwap('notify')} />
                        <Opt label="لا داعي" onPress={() => handleSwap('none')} />
                      </>
                    )
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
