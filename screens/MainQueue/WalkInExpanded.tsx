import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { scale } from '../../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { slotAvailable, Lane } from './QueueTimeline';

// رأسُ كرت الووك-إن الموسّع — بنفس أسلوب رأس المريض الدائم الموسّع تمامًا:
// شريطُ رأسٍ فيه زرُّ الإغلاق والاسمُ في الوسط، ثمّ شبكةُ أيقوناتٍ (90×90) تبدأ بـ«الوقت»
// (ونضيف أيقوناتٍ أخرى بجانبها لاحقًا). «الوقت» = المدّةُ المطلوبةُ في العيادة + موعدُ الدخولِ (اختياريّ) —
// والمدّةُ شرطُ ظهورِ المريضِ في مخطّط الدور.
const DURATIONS = [10, 15, 20, 30, 40, 45, 60];
const DAY_START = 7 * 60, DAY_END = 21 * 60, STEP = 15;   // نافذةُ اليوم + خطوةُ منتقي الموعد
const fmtHM = (min: number): string =>
  `${Math.floor(min / 60)}:${String(((min % 60) + 60) % 60).padStart(2, '0')}`;

type SectionType = 'time' | null;

export function WalkInExpanded({
  patientName, value, suggested, onSetDuration, onClose,
  appointment, onSetAppointment, avail, selfId,
}: {
  patientName: string;
  value?: number;
  suggested: number;
  onSetDuration: (minutes: number) => void;
  onClose: () => void;
  // موعدُ الدخول (اختياريّ)
  appointment?: number;
  onSetAppointment?: (min: number | null) => void;
  avail?: { chairCount: number; breaks: { start: number; end: number }[]; lanes: Lane[] };
  selfId?: string;
}) {
  const [section, setSection] = useState<SectionType>(null);
  const [sel, setSel] = useState<number | undefined>(value);
  const [apptTime, setApptTime] = useState<number>(appointment ?? 9 * 60);

  const pick = (m: number) => { setSel(m); onSetDuration(m); };

  // منتقي موعدِ الدخول: يعملُ فقط بعد تحديدِ المدّة (نحتاجُها لفحصِ توفّرِ النافذة)
  const maxT = Math.max(DAY_START, DAY_END - (sel ?? 30));
  const t = Math.min(Math.max(apptTime, DAY_START), maxT);
  const canBook = sel != null && !!onSetAppointment;
  const isFree = (sel != null && avail)
    ? slotAvailable(t, sel, avail.chairCount, avail.lanes, avail.breaks, selfId)
    : true;
  const stepAppt = (d: number) => setApptTime((v) => Math.min(Math.max(Math.min(Math.max(v, DAY_START), maxT) + d, DAY_START), maxT));

  const iconBg = 'rgba(255, 255, 255, 0.6)';
  // شبكةُ الأيقونات — تبدأ بـ«الوقت»، ومكانٌ جاهزٌ لأيقوناتٍ قادمة
  const icons = [
    { id: 'time' as const, label: 'Time', icon: 'time-outline' as const, color: '#0E7C66', badge: sel },
  ];

  // ── شبكةُ الأيقونات (كما في المريض الدائم) ──
  const renderGrid = () => (
    <View style={{ padding: scale(16) }}>
      {/* شريط الرأس: إغلاق + الاسم */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: scale(16),
        padding: scale(12), marginBottom: scale(20),
        borderWidth: scale(2), borderColor: 'rgba(255,255,255,0.35)',
      }}>
        <TouchableOpacity
          style={{ backgroundColor: 'rgba(255,255,255,0.3)', width: scale(36), height: scale(36), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' }}
          onPress={(e) => { e.stopPropagation(); onClose(); }}
        >
          <Ionicons name="chevron-up" size={scale(22)} color="#1E3A8A" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: scale(20), fontWeight: '800', color: '#1E3A8A' }} numberOfLines={1}>{patientName}</Text>
          <Text style={{ fontSize: scale(13), color: '#3B5998', marginTop: scale(2), fontWeight: '600' }}>Walk-in</Text>
        </View>

        <View style={{ width: scale(36) }} />
      </View>

      {/* الشبكة (3 أعمدة) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: scale(16) }}>
        {icons.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={{
              width: scale(90), height: scale(90), backgroundColor: iconBg, borderRadius: scale(20),
              alignItems: 'center', justifyContent: 'center', borderWidth: scale(2), borderColor: 'rgba(255,255,255,0.6)',
            }}
            onPress={(e) => { e.stopPropagation(); setSection(item.id); }}
          >
            {/* شارةُ القيمةِ الحاليّة */}
            {item.badge ? (
              <View style={{
                position: 'absolute', top: scale(-10), left: scale(-10),
                backgroundColor: '#0E7C66', borderRadius: scale(14), minWidth: scale(28), height: scale(28),
                alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(7),
                borderWidth: scale(2.5), borderColor: '#FFFFFF', zIndex: 10,
              }}>
                <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#FFFFFF' }}>{item.badge}</Text>
              </View>
            ) : null}
            <Ionicons name={item.icon} size={scale(32)} color={item.color} />
            <Text style={{ fontSize: scale(12), color: '#1E3A8A', marginTop: scale(8), fontWeight: '700' }}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── قسمُ «الوقت» (بزرِّ رجوعٍ كما في أقسام المريض الدائم): المدّةُ + موعدُ الدخول ──
  const renderTime = () => (
    <View style={{ flex: 1 }}>
      {/* شريطُ رأسِ القسم: رجوع + العنوان */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: scale(16),
        padding: scale(12), marginHorizontal: scale(16), marginTop: scale(12), marginBottom: scale(4),
        borderWidth: scale(2), borderColor: 'rgba(255,255,255,0.35)',
      }}>
        <TouchableOpacity
          style={{ backgroundColor: 'rgba(255,255,255,0.3)', width: scale(36), height: scale(36), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' }}
          onPress={(e) => { e.stopPropagation(); setSection(null); }}
        >
          <Ionicons name="chevron-back" size={scale(22)} color="#1E3A8A" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: scale(18), fontWeight: '800', color: '#1E3A8A', letterSpacing: scale(0.5) }}>Time</Text>
        </View>
        <View style={{ width: scale(36) }} />
      </View>

      {/* محتوى القسم */}
      <View style={{ padding: scale(16), gap: scale(14) }}>
        {/* منتقي المدّة */}
        <View style={{
          backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: scale(16), padding: scale(16),
          borderWidth: scale(2), borderColor: 'rgba(255,255,255,0.7)',
        }}>
          <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#1E3A8A', marginBottom: scale(12) }}>
            Time needed in clinic (min)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(10) }}>
            {DURATIONS.map((m) => {
              const on = sel === m;
              const isSuggested = m === suggested && !on;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={(e) => { e.stopPropagation(); pick(m); }}
                  style={{
                    paddingHorizontal: scale(18), paddingVertical: scale(12), borderRadius: scale(14),
                    backgroundColor: on ? '#0E7C66' : 'rgba(255,255,255,0.7)',
                    borderWidth: scale(1.5),
                    borderColor: on ? '#0E7C66' : (isSuggested ? 'rgba(13,124,102,0.55)' : 'rgba(255,255,255,0.85)'),
                  }}
                >
                  <Text style={{ fontSize: scale(16), fontWeight: '800', color: on ? '#FFFFFF' : '#1E3A8A' }}>
                    {m}{isSuggested ? ' •' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontSize: scale(12), color: sel ? '#0E7C66' : '#9CA3AF', marginTop: scale(14), fontWeight: '600' }}>
            {sel ? '✓ Added to the timeline.' : 'Set the time to add this patient to the timeline.'}
          </Text>
        </View>

        {/* منتقي موعدِ الدخول (اختياريّ) */}
        <View style={{
          backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: scale(16), padding: scale(16),
          borderWidth: scale(2), borderColor: 'rgba(255,255,255,0.7)', opacity: canBook ? 1 : 0.55,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(12) }}>
            <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#1E3A8A' }}>Entry time (optional)</Text>
            {appointment != null ? (
              <View style={{ backgroundColor: '#0E7C66', borderRadius: scale(10), paddingHorizontal: scale(10), paddingVertical: scale(4) }}>
                <Text style={{ fontSize: scale(12), fontWeight: '800', color: '#FFFFFF' }}>Booked {fmtHM(appointment)}</Text>
              </View>
            ) : null}
          </View>

          {!canBook ? (
            <Text style={{ fontSize: scale(12), color: '#9CA3AF', fontWeight: '600' }}>
              Set the duration first, then choose an entry time.
            </Text>
          ) : (
            <>
              {/* المنتقي: − الوقت + */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(14) }}>
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); stepAppt(-STEP); }}
                  style={{ width: scale(46), height: scale(46), borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: scale(1.5), borderColor: 'rgba(13,124,102,0.4)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: scale(24), fontWeight: '800', color: '#0E7C66' }}>−</Text>
                </TouchableOpacity>

                <View style={{ alignItems: 'center', minWidth: scale(96) }}>
                  <Text style={{ fontSize: scale(30), fontWeight: '800', color: isFree ? '#0E7C66' : '#DC2626', letterSpacing: scale(0.5) }}>{fmtHM(t)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4), marginTop: scale(2) }}>
                    <Ionicons name={isFree ? 'checkmark-circle' : 'close-circle'} size={scale(14)} color={isFree ? '#0E7C66' : '#DC2626'} />
                    <Text style={{ fontSize: scale(12), fontWeight: '800', color: isFree ? '#0E7C66' : '#DC2626' }}>
                      {isFree ? 'Available' : 'Occupied'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); stepAppt(STEP); }}
                  style={{ width: scale(46), height: scale(46), borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: scale(1.5), borderColor: 'rgba(13,124,102,0.4)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: scale(24), fontWeight: '800', color: '#0E7C66' }}>＋</Text>
                </TouchableOpacity>
              </View>

              {/* حجز / إلغاء (عودة للدور) */}
              <View style={{ flexDirection: 'row', gap: scale(10), marginTop: scale(14) }}>
                <TouchableOpacity
                  disabled={!isFree}
                  onPress={(e) => { e.stopPropagation(); onSetAppointment?.(t); }}
                  style={{
                    flex: 1, paddingVertical: scale(12), borderRadius: scale(12), alignItems: 'center',
                    backgroundColor: isFree ? '#0E7C66' : 'rgba(148,163,184,0.3)',
                  }}
                >
                  <Text style={{ fontSize: scale(14), fontWeight: '800', color: isFree ? '#FFFFFF' : '#94A3B8' }}>
                    Book entry time
                  </Text>
                </TouchableOpacity>
                {appointment != null ? (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); onSetAppointment?.(null); }}
                    style={{ paddingHorizontal: scale(16), paddingVertical: scale(12), borderRadius: scale(12), alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.06)' }}
                  >
                    <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#6B7280' }}>Queue</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={{ fontSize: scale(11), color: '#6B7280', marginTop: scale(10), fontWeight: '600' }}>
                {isFree ? 'This chair time is free — book it.' : 'All chairs busy at this time — pick another.'}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ marginBottom: scale(16) }}>
      {section === 'time' ? renderTime() : renderGrid()}
    </View>
  );
}
