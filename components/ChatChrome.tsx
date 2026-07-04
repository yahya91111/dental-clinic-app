// ═══════════════════════════════════════════════════════════════
// ChatChrome — مكوّناتُ محادثةِ الذكاء المشتركة (مصدرٌ واحد)
// ═══════════════════════════════════════════════════════════════
// تُستعمَل في **المكانين** بنفسِها تمامًا (لا نسخَ يدويّ ولا انحراف):
//   • صفحةُ الذكاء المنزلقة (AISchedulePanel)
//   • محادثةُ الضغطةِ المطوّلة (AIChatModal)
// فأيُّ تعديلٍ على رأسِ المحادثة/الفقاعات/خانةِ الإدخال/الإضاءاتِ يسري على الاثنين.
//
// وحدةٌ محايدةٌ عمدًا: لا تستوردُ من AISchedulePanel ولا AIChatModal (تفاديًا
// لأيِّ تبعيّةٍ دائريّة) — الاثنان يستورِدان منها.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  Animated, Easing, StyleSheet, Keyboard, Platform, Dimensions,
} from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale } from '../lib/scale';
import { GlassCard, CardBadge, Pill, cardStyles } from './AICard';
import AssistantOffers from './AssistantOffers';
import { ChatMessage } from './aiTypes';

const { width: W, height: H } = Dimensions.get('window');

// Detects a trailing block of [choice] [choice] tokens at the end of an assistant message
// and splits it off so we can render them as tappable chips.
export function parseChoices(content: string): { text: string; choices: string[] } {
  const trimmed = content.trimEnd();
  const tailMatch = trimmed.match(/((?:\[[^\[\]\n]+\][ \t]*\n?[ \t]*)+)\s*$/);
  if (!tailMatch) return { text: content, choices: [] };
  const tail = tailMatch[1];
  const choices = Array.from(tail.matchAll(/\[([^\[\]\n]+)\]/g)).map((m) => m[1].trim());
  if (choices.length < 2) return { text: content, choices: [] };
  const text = trimmed.slice(0, trimmed.length - tailMatch[0].length).trimEnd();
  return { text, choices };
}

// Soft drifting "smoke" — kept CHEAP: all puffs of a layer live in ONE rasterized Svg that drifts
// as a single unit. Two counter-drifting layers => organic motion at only ~2 composited layers.
const SMOKE_LAYERS = [
  {
    dx: scale(36), dy: scale(26), dur: 12000, op: [0.30, 0.5] as [number, number],
    blobs: [
      { x: W * 0.24, y: H * 0.30, r: scale(230), c: '#7C4DDB' },
      { x: W * 0.80, y: H * 0.64, r: scale(250), c: '#9333EA' },
    ],
  },
  {
    dx: -scale(42), dy: scale(30), dur: 15000, op: [0.26, 0.46] as [number, number],
    blobs: [
      { x: W * 0.74, y: H * 0.26, r: scale(220), c: '#A78BFA' },
      { x: W * 0.30, y: H * 0.74, r: scale(210), c: '#6D28D9' },
    ],
  },
];

export function Smoke() {
  const vals = useRef(SMOKE_LAYERS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const ls = SMOKE_LAYERS.map((L, i) => Animated.loop(Animated.sequence([
      Animated.timing(vals[i], { toValue: 1, duration: L.dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(vals[i], { toValue: 0, duration: L.dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])));
    ls.forEach((l) => l.start());
    return () => ls.forEach((l) => l.stop());
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SMOKE_LAYERS.map((L, i) => {
        const tx = vals[i].interpolate({ inputRange: [0, 1], outputRange: [0, L.dx] });
        const ty = vals[i].interpolate({ inputRange: [0, 1], outputRange: [0, L.dy] });
        const sc = vals[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
        const op = vals[i].interpolate({ inputRange: [0, 1], outputRange: L.op });
        return (
          <Animated.View
            key={i}
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={[StyleSheet.absoluteFill, { opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }]}
          >
            <Svg width={W} height={H}>
              <Defs>
                {L.blobs.map((b, j) => (
                  <RadialGradient key={j} id={`sm${i}_${j}`} cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={b.c} stopOpacity="0.55" />
                    <Stop offset="0.6" stopColor={b.c} stopOpacity="0.2" />
                    <Stop offset="1" stopColor={b.c} stopOpacity="0" />
                  </RadialGradient>
                ))}
              </Defs>
              {L.blobs.map((b, j) => (
                <Circle key={j} cx={b.x} cy={b.y} r={b.r} fill={`url(#sm${i}_${j})`} />
              ))}
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

// نصٌّ بحدودٍ بيضاء حول لونٍ بنفسجيّ — تُحاكى الحدود بنُسخٍ بيضاء مزاحةٍ خلف النصّ (٨ اتّجاهات).
export function OutlinedText({ text, color = '#7C3AED', outline = '#FFFFFF', size, weight = '900', spacing = 0, glow }:
  { text: string; color?: string; outline?: string; size: number; weight?: any; spacing?: number; glow?: string }) {
  const d = scale(1.4);
  const offs: [number, number][] = [[-d, -d], [d, -d], [-d, d], [d, d], [0, -d], [0, d], [-d, 0], [d, 0]];
  const base = { fontSize: size, fontWeight: weight, letterSpacing: spacing } as const;
  const glowStyle = glow ? { textShadowColor: glow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: scale(13) } : null;
  return (
    <View>
      {offs.map(([x, y], i) => (
        <Text key={i} style={{ position: 'absolute', left: x, top: y, color: outline, ...base }}>{text}</Text>
      ))}
      <Text style={{ color, ...base, ...glowStyle }}>{text}</Text>
    </View>
  );
}

// ارتفاع لوحة المفاتيح — داخل Modal لا تتقلّص الشاشة تلقائيًّا، فنرفع المحادثة/الإدخال يدويًّا فوقها
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setH(e.endCoordinates?.height ?? 0));
    const hd = Keyboard.addListener(hideEvt, () => setH(0));
    return () => { s.remove(); hd.remove(); };
  }, []);
  return h;
}

// ---- bottom chat input bar (WhatsApp-style glass pill + circular ">" send button) ----
export function ChatInputBar({ onSend, light, bottomInset = 0, sideInset = 0 }: { onSend?: (text: string) => void; light?: boolean; bottomInset?: number; sideInset?: number }) {
  const kb = useKeyboardHeight();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend?.(t);
    setText('');
  };
  const pillBg = light ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.10)';
  const pillBorder = light ? 'rgba(124,58,237,0.20)' : 'rgba(255,255,255,0.22)';
  const inputColor = light ? '#2A2350' : '#fff';
  const placeholderColor = light ? 'rgba(60,46,102,0.45)' : 'rgba(255,255,255,0.45)';
  // bottomInset: تصحيحٌ للسياقاتِ المنبثقة (بطاقةٌ لا تلامسُ أسفلَ الشاشة) — تستقرُّ الخانةُ فوقَ الكيبورد مباشرةً
  const lift = kb > 0 ? Math.max(scale(6), kb + bottomInset) : 0;
  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom: lift, zIndex: 8 }}
      pointerEvents="box-none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(10), paddingHorizontal: scale(14) + sideInset, paddingBottom: kb > 0 ? scale(8) : scale(26) }}>
        {/* the glass pill */}
        <View
          style={{
            flex: 1, minHeight: scale(50), maxHeight: scale(120), justifyContent: 'center',
            borderRadius: scale(26), paddingHorizontal: scale(18), paddingVertical: scale(5),
            backgroundColor: pillBg, borderWidth: scale(1), borderColor: pillBorder,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="اكتب رسالتك..."
            placeholderTextColor={placeholderColor}
            multiline
            textAlign="right"
            style={{ color: inputColor, fontSize: scale(15), maxHeight: scale(110), paddingTop: scale(7), paddingBottom: scale(7), textAlignVertical: 'center' }}
            onSubmitEditing={send}
          />
        </View>
        {/* circular ">" send button */}
        <TouchableOpacity activeOpacity={0.85} onPress={send} disabled={!canSend}>
          <LinearGradient
            colors={canSend ? ['#A78BFA', '#7C3AED'] : ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.10)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: scale(50), height: scale(50), borderRadius: scale(25), alignItems: 'center', justifyContent: 'center', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.28)' }}
          >
            <Ionicons
              name="chevron-forward"
              size={scale(24)}
              color="#fff"
              style={{ marginLeft: scale(2), textShadowColor: 'rgba(196,176,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: scale(8) }}
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Scrollable chat transcript (bubbles + answer chips). Shared by the orbit chat
// view and the slide-in chat panel so both render the same conversation.
export function ChatBody({ messages, isLoading, onSend, style, light, header, user, clinicId, onPatchMessage, onAfterAction, bottomInset = 0, sideInset = 0 }: {
  messages: ChatMessage[]; isLoading?: boolean; onSend: (text: string) => void; style?: any; light?: boolean; header?: React.ReactNode;
  user?: { id: string; name: string; role: string; clinicId?: string | null }; clinicId?: string | null;
  onPatchMessage?: (id: string, patch: Partial<ChatMessage>) => void; onAfterAction?: () => void; bottomInset?: number; sideInset?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const kb = useKeyboardHeight();
  // ترفع المنطقة فوق لوحة المفاتيح، وتُنزل آخر رسالةٍ لتبقى ظاهرةً
  useEffect(() => {
    if (kb > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [kb]);
  const t = light
    ? { userBg: '#7C3AED', userBorder: 'rgba(255,255,255,0.32)', userText: '#fff',
        botBg: '#FFFFFF', botBorder: 'rgba(124,58,237,0.12)', botText: '#352B5C',
        chipBg: 'rgba(255,255,255,0.95)', chipBorder: 'rgba(124,58,237,0.4)', chipText: '#6D4FB8',
        loadBg: '#FFFFFF', loadText: '#6B6486', spinner: '#7C3AED' }
    : { userBg: 'rgba(124,58,237,0.85)', userBorder: 'rgba(167,139,250,0.6)', userText: '#fff',
        botBg: 'rgba(255,255,255,0.12)', botBorder: 'rgba(255,255,255,0.18)', botText: '#fff',
        chipBg: 'rgba(255,255,255,0.10)', chipBorder: 'rgba(167,139,250,0.5)', chipText: '#E9DEFF',
        loadBg: 'rgba(255,255,255,0.12)', loadText: 'rgba(255,255,255,0.7)', spinner: '#C4B0FF' };
  return (
    <ScrollView
      ref={scrollRef}
      style={[style, { bottom: kb > 0 ? Math.max(0, kb + bottomInset) : 0 }]}
      contentContainerStyle={{ paddingHorizontal: scale(14) + sideInset, paddingBottom: kb > 0 ? scale(64) : scale(90), gap: scale(10) }}
      onContentSizeChange={() => { if (!header) scrollRef.current?.scrollToEnd({ animated: true }); }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {header}
      {messages.map((m, mi) => {
        const isUser = m.role === 'user';
        const isLastAssistant = !isUser && mi === messages.length - 1;
        const { text, choices } = isLastAssistant && !isLoading ? parseChoices(m.content) : { text: m.content, choices: [] as string[] };
        // رسالةٌ تحمل عرضًا → كرتٌ كامل (نصّها + أزرارها) بلا فقاعة منفصلة، يتزامن مع الضغطة المطوّلة
        const hasOffer = !isUser && (!!m.announceOffer || !!m.swapOffer || !!m.confirmOffer);
        if (hasOffer && user) {
          return (
            <AssistantOffers
              key={m.id}
              message={m}
              user={user}
              clinicId={clinicId}
              onResolved={(rtext, done) => onPatchMessage?.(m.id, { offerResolved: { text: rtext, done } })}
              onDone={onAfterAction}
            />
          );
        }
        // سؤالٌ بخيارات (`[..]`) → كرتٌ كامل بلغة Aurora (decision) — مطابقٌ للضغطة المطوّلة
        // تمامًا: ما يجري هنا يجري هناك. الكرت داكنٌ دائمًا (لا فقاعة).
        if (choices.length > 0) {
          return (
            <View key={m.id}>
              <GlassCard kind="decision" glow>
                <View style={cardStyles.head}>
                  <CardBadge kind="decision" live />
                  <View style={cardStyles.headTxt}>
                    <Text style={cardStyles.cardTitle} numberOfLines={1}>سؤال</Text>
                    <Pill kind="decision" text="يحتاج قرارك" />
                  </View>
                </View>
                <View style={cardStyles.covBody}>
                  {!!text && (
                    <Text style={{ fontSize: scale(13.5), color: '#F4F1FF', textAlign: 'right', lineHeight: scale(21), fontWeight: '500', marginBottom: scale(2) }}>{text}</Text>
                  )}
                  {choices.map((c, ci) => (
                    <TouchableOpacity
                      key={ci}
                      activeOpacity={0.85}
                      onPress={() => onSend(c)}
                      style={{ alignSelf: 'stretch', marginTop: scale(7), paddingVertical: scale(9), paddingHorizontal: scale(12), borderRadius: scale(10), backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: scale(1), borderColor: 'rgba(167,139,250,0.30)' }}
                    >
                      <Text style={{ fontSize: scale(13.5), color: '#F1EAFF', fontWeight: '800', textAlign: 'center' }} numberOfLines={2}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </GlassCard>
            </View>
          );
        }
        return (
          <View key={m.id}>
            <View style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '80%',
              backgroundColor: isUser ? t.userBg : t.botBg,
              borderWidth: scale(1), borderColor: isUser ? t.userBorder : t.botBorder,
              borderRadius: scale(20),
              // ذيلٌ خفيف: الزاوية السفليّة القريبة من المُرسِل أحدّ
              borderBottomRightRadius: isUser ? scale(6) : scale(20),
              borderBottomLeftRadius: isUser ? scale(20) : scale(6),
              paddingHorizontal: scale(15), paddingVertical: scale(11),
              shadowColor: '#2A1A52', shadowOpacity: 0.13, shadowRadius: scale(6), shadowOffset: { width: 0, height: scale(2) },
              elevation: 2,
            }}>
              <Text style={{ color: isUser ? t.userText : t.botText, fontSize: scale(14.5), lineHeight: scale(21) }}>{text}</Text>
            </View>
          </View>
        );
      })}
      {isLoading && (
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: scale(8), backgroundColor: t.loadBg, borderRadius: scale(18), paddingHorizontal: scale(14), paddingVertical: scale(10) }}>
          <ActivityIndicator size="small" color={t.spinner} />
          <Text style={{ color: t.loadText, fontSize: scale(13) }}>…</Text>
        </View>
      )}
    </ScrollView>
  );
}
