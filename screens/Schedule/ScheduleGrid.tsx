import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DAYS, PERIODS, ScheduleSlot, DayOfWeek, STATUS_CONFIG, ROLE_CONFIG } from './types';

interface ScheduleGridProps {
  slots: ScheduleSlot[];
  clinicCount: number;
  onCellPress: (day: DayOfWeek, period: number) => void;
  userId?: string;
}

export function ScheduleGrid({ slots, clinicCount, onCellPress, userId }: ScheduleGridProps) {
  const [expandAll, setExpandAll] = useState(false);

  const getSlots = (day: DayOfWeek, period: number) =>
    slots.filter(s => s.day === day && s.period === period);

  // Filter slots: show only current user's slots, unless expanded
  const getVisibleSlots = (day: DayOfWeek, period: number) => {
    const all = getSlots(day, period);
    if (!userId || expandAll) return all;
    return all.filter(s => s.doctorId === userId);
  };

  // Check if user has any assignment on this day
  const userHasSlotOnDay = (dayKey: DayOfWeek) => {
    return slots.some(s => s.day === dayKey && s.doctorId === userId);
  };

  return (
    <View style={{ gap: scale(16) }}>
      {DAYS.map(day => {
        return (
        <View key={day.key} style={{
          borderRadius: scale(18),
          overflow: 'hidden',
          backgroundColor: 'rgba(255, 255, 255, 0.35)',
          borderWidth: scale(2.5),
          borderColor: 'rgba(255, 255, 255, 0.7)',
          shadowColor: Platform.OS === 'android' ? 'transparent' : '#5B9FED',
          shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : scale(2) },
          shadowOpacity: Platform.OS === 'android' ? 0 : 0.1,
          shadowRadius: Platform.OS === 'android' ? 0 : scale(8),
          elevation: Platform.OS === 'android' ? 0 : 3,
        }}>

          {/* Row 1: Day + Periods with doctors */}
          <View style={{ flexDirection: 'row' }}>
            {/* Periods */}
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, flexDirection: 'row' }}
            >
              {(() => {
                // Determine which clinics to show
                const showAllClinics = !userId || expandAll;
                const visibleClinicNums = showAllClinics
                  ? Array.from({ length: clinicCount }, (_, i) => i + 1)
                  : (() => {
                      const nums = new Set<number>();
                      for (const p of PERIODS) {
                        const s = slots.filter(sl => sl.day === day.key && sl.period === p.id && sl.doctorId === userId && sl.role === 'clinic');
                        s.forEach(sl => nums.add(sl.clinicNumber));
                      }
                      return Array.from(nums).sort();
                    })();

                const lineH = scale(14);
                // Period pairs: [P4,P3] and [P2,P1]
                const PAIRS: [typeof PERIODS[0], typeof PERIODS[0]][] = [[PERIODS[0], PERIODS[1]], [PERIODS[2], PERIODS[3]]];

                // Helper: get doctor IDs for a clinic in a period
                const getDoctorIds = (periodId: number, clinicNum: number) =>
                  slots.filter(s => s.day === day.key && s.period === periodId && s.role === 'clinic' && s.clinicNumber === clinicNum)
                    .map(s => s.doctorId).sort().join(',');
                // كل الـ doctor IDs في الدليقيتر لفترة معيّنة، مرتبة (لمقارنة المطابقة بين P1/P2)
                // مهم لدعم تريني beginner + المدرب في نفس الخانة
                const getDelegatorId = (periodId: number) =>
                  slots.filter(s => s.day === day.key && s.period === periodId && s.role === 'delegator')
                    .map(s => s.doctorId).sort().join(',');

                return PAIRS.map(([pA, pB], pairIndex) => (
                  <View key={pairIndex} style={{
                    flex: 2,
                    borderRightWidth: pairIndex < PAIRS.length - 1 ? scale(2) : 0,
                    borderRightColor: 'rgba(255,255,255,0.6)',
                  }}>
                    {/* Period headers */}
                    <View style={{ flexDirection: 'row', marginBottom: scale(6) }}>
                      {[pA, pB].map((p, i) => (
                        <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => onCellPress(day.key, p.id)} style={{ flex: 1 }}>
                          <LinearGradient
                            colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{
                              paddingVertical: scale(4),
                              alignItems: 'center',
                              borderBottomWidth: scale(1.5),
                              borderBottomColor: 'rgba(255,255,255,0.5)',
                              borderRightWidth: i === 0 ? scale(1) : 0,
                              borderRightColor: 'rgba(255,255,255,0.4)',
                            }}
                          >
                            <Text style={{ fontSize: scale(9), fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(88,74,126,0.5)', textShadowOffset: { width: 0, height: scale(1) }, textShadowRadius: scale(2) }}>P{p.id}</Text>
                            <Text style={{ fontSize: scale(7), fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>{p.start}-{p.end}</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Clinic cards - merged or split */}
                    <View style={{ paddingHorizontal: scale(3), position: 'relative' }}>
                    {/* Center divider line - extends from headers through content */}
                    <View style={{ position: 'absolute', left: '50%', top: scale(-6), bottom: 0, width: scale(1.5), backgroundColor: 'rgba(255,255,255,0.6)', zIndex: 1 }} />
                      {visibleClinicNums.map(clinicNum => {
                        const slotsA = getVisibleSlots(day.key, pA.id).filter(s => s.role === 'clinic' && s.clinicNumber === clinicNum);
                        const slotsB = getVisibleSlots(day.key, pB.id).filter(s => s.role === 'clinic' && s.clinicNumber === clinicNum);
                        const idsA = getDoctorIds(pA.id, clinicNum);
                        const idsB = getDoctorIds(pB.id, clinicNum);
                        const isMerged = idsA.length > 0 && idsA === idsB;
                        const userInA = !userId || showAllClinics || slotsA.some(s => s.doctorId === userId);
                        const userInB = !userId || showAllClinics || slotsB.some(s => s.doctorId === userId);

                        if (isMerged) {
                          // Merged card spanning both periods
                          return (
                            <TouchableOpacity key={`c${clinicNum}`} activeOpacity={0.7} onPress={() => onCellPress(day.key, pA.id)} style={{
                              flexDirection: 'row',
                              marginBottom: scale(3),
                              borderRadius: scale(6),
                              overflow: 'hidden',
                              borderWidth: scale(1),
                              borderColor: userInA ? 'rgba(255,255,255,0.6)' : 'transparent',
                              backgroundColor: userInA ? 'rgba(255,255,255,0.25)' : 'transparent',
                              minHeight: lineH + scale(6),
                            }}>
                              {userInA ? (<>
                                <View style={{ flex: 1, paddingVertical: scale(3), paddingHorizontal: scale(6), justifyContent: 'center' }}>
                                  {slotsA.map(s => (
                                    <Text key={s.id} style={{ fontSize: scale(8), fontWeight: '700', color: '#3B5998', textAlign: 'right' }} numberOfLines={1}>{s.doctorName}</Text>
                                  ))}
                                </View>
                                <LinearGradient
                                  colors={['rgba(71,118,186,0.45)', 'rgba(120,160,210,0.3)', 'rgba(120,160,210,0.3)', 'rgba(71,118,186,0.45)']}
                                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                  style={{ paddingHorizontal: scale(4), justifyContent: 'center', alignItems: 'center', borderLeftWidth: scale(1), borderLeftColor: 'rgba(255,255,255,0.5)' }}
                                >
                                  <Text style={{ fontSize: scale(6), fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(50,80,140,0.5)', textShadowOffset: { width: 0, height: scale(0.5) }, textShadowRadius: scale(1) }}>CL{clinicNum}</Text>
                                </LinearGradient>
                              </>) : null}
                            </TouchableOpacity>
                          );
                        }

                        // Split: two individual cards side by side
                        return (
                          <View key={`c${clinicNum}`} style={{ flexDirection: 'row', marginBottom: scale(3), gap: scale(2) }}>
                            {[{ sl: slotsA, p: pA, visible: userInA }, { sl: slotsB, p: pB, visible: userInB }].map(({ sl, p, visible }) => (
                              <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => onCellPress(day.key, p.id)} style={{
                                flex: 1,
                                flexDirection: 'row',
                                borderRadius: scale(6),
                                overflow: 'hidden',
                                borderWidth: scale(1),
                                borderColor: visible ? 'rgba(255,255,255,0.6)' : 'transparent',
                                backgroundColor: visible ? 'rgba(255,255,255,0.2)' : 'transparent',
                                minHeight: lineH + scale(6),
                              }}>
                                {visible ? (<>
                                  <View style={{ flex: 1, paddingVertical: scale(3), paddingHorizontal: scale(3), justifyContent: 'center' }}>
                                    {sl.length > 0 ? sl.map(s => (
                                      <Text key={s.id} style={{ fontSize: scale(8), fontWeight: '700', color: '#3B5998', textAlign: 'right' }} numberOfLines={1}>{s.doctorName}</Text>
                                    )) : (
                                      <Text style={{ fontSize: scale(8), fontWeight: '700', color: '#CBD5E0', textAlign: 'right' }}>—</Text>
                                    )}
                                  </View>
                                  <LinearGradient
                                    colors={['rgba(71,118,186,0.45)', 'rgba(120,160,210,0.3)', 'rgba(120,160,210,0.3)', 'rgba(71,118,186,0.45)']}
                                    start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                    style={{ paddingHorizontal: scale(3), justifyContent: 'center', alignItems: 'center', borderLeftWidth: scale(1), borderLeftColor: 'rgba(255,255,255,0.5)' }}
                                  >
                                    <Text style={{ fontSize: scale(5), fontWeight: '800', color: '#FFFFFF' }}>CL{clinicNum}</Text>
                                  </LinearGradient>
                                </>) : null}
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })}

                      {/* Delegator - merged or split (hidden in personal view if user is not delegator) */}
                      {(() => {
                        const dlgA = getVisibleSlots(day.key, pA.id).filter(s => s.role === 'delegator');
                        const dlgB = getVisibleSlots(day.key, pB.id).filter(s => s.role === 'delegator');

                        // In personal view, hide DLG section if user has no delegator assignment
                        if (!expandAll && userId && dlgA.length === 0 && dlgB.length === 0) return null;

                        const isPersonal = !expandAll && userId;
                        const dlgMerged = getDelegatorId(pA.id).length > 0 && getDelegatorId(pA.id) === getDelegatorId(pB.id);

                        // Personal view: show like clinic cards - split with visible/invisible
                        if (isPersonal) {
                          const userInA = dlgA.length > 0;
                          const userInB = dlgB.length > 0;

                          if (dlgMerged) {
                            return (
                              <TouchableOpacity activeOpacity={0.7} onPress={() => onCellPress(day.key, pA.id)} style={{
                                flexDirection: 'row',
                                borderRadius: scale(6),
                                overflow: 'hidden',
                                borderWidth: scale(1),
                                borderColor: 'rgba(255,255,255,0.6)',
                                backgroundColor: 'rgba(255,255,255,0.2)',
                              }}>
                                <View style={{ flex: 1, paddingVertical: scale(3), paddingHorizontal: scale(6), justifyContent: 'center' }}>
                                  {dlgA.length > 0 ? dlgA.map(s => (
                                    <Text key={s.id} style={{ fontSize: scale(8), fontWeight: '700', color: '#6B4C9A', textAlign: 'right' }} numberOfLines={1}>{s.doctorName}</Text>
                                  )) : (
                                    <Text style={{ fontSize: scale(8), fontWeight: '700', color: '#CBD5E0', textAlign: 'right' }}>—</Text>
                                  )}
                                </View>
                                <LinearGradient
                                  colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                  style={{ paddingHorizontal: scale(4), justifyContent: 'center', alignItems: 'center', borderLeftWidth: scale(1), borderLeftColor: 'rgba(255,255,255,0.5)' }}
                                >
                                  <Text style={{ fontSize: scale(6), fontWeight: '800', color: '#FFFFFF' }}>DLG</Text>
                                </LinearGradient>
                              </TouchableOpacity>
                            );
                          }

                          return (
                            <View style={{ flexDirection: 'row', gap: scale(2) }}>
                              {[{ dl: dlgA, p: pA, visible: userInA }, { dl: dlgB, p: pB, visible: userInB }].map(({ dl, p, visible }) => (
                                <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => onCellPress(day.key, p.id)} style={{
                                  flex: 1,
                                  flexDirection: 'row',
                                  borderRadius: scale(6),
                                  overflow: 'hidden',
                                  borderWidth: scale(1),
                                  borderColor: visible ? 'rgba(255,255,255,0.6)' : 'transparent',
                                  backgroundColor: visible ? 'rgba(255,255,255,0.2)' : 'transparent',
                                }}>
                                  {visible ? (<>
                                    <View style={{ flex: 1, paddingVertical: scale(3), paddingHorizontal: scale(3), justifyContent: 'center' }}>
                                      {dl.map(s => (
                                        <Text key={s.id} style={{ fontSize: scale(8), fontWeight: '700', color: '#6B4C9A', textAlign: 'right' }} numberOfLines={1}>{s.doctorName}</Text>
                                      ))}
                                    </View>
                                    <LinearGradient
                                      colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                                      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                      style={{ paddingHorizontal: scale(3), justifyContent: 'center', alignItems: 'center', borderLeftWidth: scale(1), borderLeftColor: 'rgba(255,255,255,0.5)' }}
                                    >
                                      <Text style={{ fontSize: scale(5), fontWeight: '800', color: '#FFFFFF' }}>DLG</Text>
                                    </LinearGradient>
                                  </>) : null}
                                </TouchableOpacity>
                              ))}
                            </View>
                          );
                        }

                        return (
                          <>
                            {/* Divider */}
                            <View style={{ height: scale(1), backgroundColor: 'rgba(255,255,255,0.5)', marginVertical: scale(2) }} />
                            {dlgMerged ? (
                              <TouchableOpacity activeOpacity={0.7} onPress={() => onCellPress(day.key, pA.id)} style={{
                                flexDirection: 'row',
                                borderRadius: scale(6),
                                overflow: 'hidden',
                                borderWidth: scale(1),
                                borderColor: 'rgba(255,255,255,0.6)',
                                backgroundColor: 'rgba(255,255,255,0.2)',
                              }}>
                                <View style={{ flex: 1, paddingVertical: scale(3), paddingHorizontal: scale(6), justifyContent: 'center' }}>
                                  {dlgA.length > 0 ? dlgA.map(s => (
                                    <Text key={s.id} style={{ fontSize: scale(8), fontWeight: '700', color: '#6B4C9A', textAlign: 'right' }} numberOfLines={1}>{s.doctorName}</Text>
                                  )) : (
                                    <Text style={{ fontSize: scale(8), fontWeight: '700', color: '#CBD5E0', textAlign: 'right' }}>—</Text>
                                  )}
                                </View>
                                <LinearGradient
                                  colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                  style={{ paddingHorizontal: scale(4), justifyContent: 'center', alignItems: 'center', borderLeftWidth: scale(1), borderLeftColor: 'rgba(255,255,255,0.5)' }}
                                >
                                  <Text style={{ fontSize: scale(6), fontWeight: '800', color: '#FFFFFF' }}>DLG</Text>
                                </LinearGradient>
                              </TouchableOpacity>
                            ) : (
                              <View style={{ flexDirection: 'row', gap: scale(2) }}>
                                {[{ dl: dlgA, p: pA }, { dl: dlgB, p: pB }].map(({ dl, p }) => (
                                  <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => onCellPress(day.key, p.id)} style={{
                                    flex: 1,
                                    flexDirection: 'row',
                                    borderRadius: scale(6),
                                    overflow: 'hidden',
                                    borderWidth: scale(1),
                                    borderColor: 'rgba(255,255,255,0.6)',
                                    backgroundColor: 'rgba(255,255,255,0.2)',
                                  }}>
                                    <View style={{ flex: 1, paddingVertical: scale(3), paddingHorizontal: scale(3), justifyContent: 'center' }}>
                                      {dl.length > 0 ? dl.map(s => (
                                        <Text key={s.id} style={{ fontSize: scale(8), fontWeight: '700', color: '#6B4C9A', textAlign: 'right' }} numberOfLines={1}>{s.doctorName}</Text>
                                      )) : (
                                        <Text style={{ fontSize: scale(8), fontWeight: '700', color: '#CBD5E0', textAlign: 'right' }}>—</Text>
                                      )}
                                    </View>
                                    <LinearGradient
                                      colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                                      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                      style={{ paddingHorizontal: scale(3), justifyContent: 'center', alignItems: 'center', borderLeftWidth: scale(1), borderLeftColor: 'rgba(255,255,255,0.5)' }}
                                    >
                                      <Text style={{ fontSize: scale(5), fontWeight: '800', color: '#FFFFFF' }}>DLG</Text>
                                    </LinearGradient>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </>
                        );
                      })()}
                    <View style={{ height: scale(6) }} />
                    </View>
                  </View>
                ));
              })()}
            </LinearGradient>

            {/* Day label - right side (toggle) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setExpandAll(prev => !prev)}
              style={{ alignSelf: 'stretch' }}
            >
              <LinearGradient
                colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{
                  width: scale(45),
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderLeftWidth: scale(1.5),
                  borderLeftColor: 'rgba(255, 255, 255, 0.5)',
                }}
              >
                <Text style={{
                  fontSize: scale(11),
                  fontWeight: '800',
                  color: '#FFFFFF',
                  textShadowColor: 'rgba(88, 74, 126, 0.5)',
                  textShadowOffset: { width: 0, height: scale(1) },
                  textShadowRadius: scale(2),
                }}>{day.shortLabel}</Text>
                {userId && (
                  <Ionicons
                    name={expandAll ? 'people' : 'person'}
                    size={scale(10)}
                    color="rgba(255,255,255,0.7)"
                    style={{ marginTop: scale(3) }}
                  />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* EX section - only when expanded */}
          {(!userId || expandAll) && (
            <>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, height: scale(1.5), backgroundColor: 'rgba(255, 255, 255, 0.6)' }} />
                <View style={{ width: scale(45), height: scale(1.5), backgroundColor: 'rgba(255, 255, 255, 0.5)' }} />
              </View>
              <View style={{ flexDirection: 'row', minHeight: scale(40) }}>
                {/* EX content - split into two tappable halves */}
                <LinearGradient
                  colors={['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flex: 1, flexDirection: 'row' }}
                >
                  {(() => {
                    // EX يُحدَّد بالـ role لا بـ period (لأن الخوارزمية تكتب period=0 لكنه ليس شرطاً)
                    const exSlots = slots.filter(s => s.day === day.key && s.role === 'ex');
                    // الغياب (حالة غير active) يظهر أيضاً في صفّ الـ EX باسم الطبيب وكوده
                    // (SL/VC/PS/PE). غياب اليوم الكامل قد يولّد عدّة فترات → خانة واحدة
                    // لكل طبيب/جهة حتى لا يتكرّر الاسم.
                    const seenAbsent = new Set<string>();
                    const absentSlots = slots.filter(s => {
                      if (s.day !== day.key || s.status === 'active') return false;
                      const side = s.clinicNumber === 2 ? 'L' : 'R';
                      const k = `${s.doctorId}|${side}`;
                      if (seenAbsent.has(k)) return false;
                      seenAbsent.add(k);
                      return true;
                    });
                    const allEx = [...exSlots, ...absentSlots];
                    // clinicNumber 1 = right side, clinicNumber 2 = left side
                    const rightSlots = allEx.filter(s => s.clinicNumber === 1 || s.clinicNumber === 0);
                    const leftSlots = allEx.filter(s => s.clinicNumber === 2);

                    const renderExCard = (slot: ScheduleSlot) => {
                      // للـ EX: لون بنفسجي ثابت + ليبل "EX". لو الطبيب حالته
                      // غير active (غياب)، نستخدم لون الحالة بدلاً.
                      const statusConfig = STATUS_CONFIG[slot.status];
                      const isExRole = slot.role === 'ex';
                      const color = isExRole ? '#7C3AED' : statusConfig.color;
                      const shortLabel = isExRole ? 'EX' : statusConfig.shortLabel;
                      return (
                        <View key={slot.id} style={{
                          flexDirection: 'row',
                          alignSelf: 'stretch',
                          marginBottom: scale(3),
                          borderRadius: scale(6),
                          overflow: 'hidden',
                          borderWidth: scale(1),
                          borderColor: 'rgba(255,255,255,0.6)',
                          backgroundColor: 'rgba(255,255,255,0.2)',
                        }}>
                          <Text style={{
                            flex: 1,
                            fontSize: scale(8),
                            fontWeight: '700',
                            color,
                            paddingVertical: scale(3),
                            paddingHorizontal: scale(4),
                            textAlign: 'right',
                          }} numberOfLines={1}>{slot.doctorName}</Text>
                          <LinearGradient
                            colors={[color + '90', color + '50', color + '50', color + '90']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={{
                              paddingHorizontal: scale(4),
                              justifyContent: 'center',
                              alignItems: 'center',
                              borderLeftWidth: scale(1),
                              borderLeftColor: 'rgba(255,255,255,0.5)',
                            }}
                          >
                            <Text style={{
                              fontSize: scale(6),
                              fontWeight: '800',
                              color: '#FFFFFF',
                              textShadowColor: color + '80',
                              textShadowOffset: { width: 0, height: scale(0.5) },
                              textShadowRadius: scale(1),
                            }}>{shortLabel}</Text>
                          </LinearGradient>
                        </View>
                      );
                    };

                    return (
                      <>
                        {/* Left half (P4-P3 side) - clinicNumber 2 */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => onCellPress(day.key, -2)}
                          style={{ flex: 1, padding: scale(4), justifyContent: 'center' }}
                        >
                          {leftSlots.length > 0 ? leftSlots.map(renderExCard) : (
                            <Text style={{ fontSize: scale(8), color: '#CBD5E0', textAlign: 'center' }}> </Text>
                          )}
                        </TouchableOpacity>
                        {/* Center divider */}
                        <View style={{ width: scale(1.5), backgroundColor: 'rgba(255,255,255,0.5)' }} />
                        {/* Right half (P2-P1 side) - clinicNumber 1 */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => onCellPress(day.key, -1)}
                          style={{ flex: 1, padding: scale(4), justifyContent: 'center' }}
                        >
                          {rightSlots.length > 0 ? rightSlots.map(renderExCard) : (
                            <Text style={{ fontSize: scale(8), color: '#CBD5E0', textAlign: 'center' }}> </Text>
                          )}
                        </TouchableOpacity>
                      </>
                    );
                  })()}
                </LinearGradient>
                {/* EX label */}
                <LinearGradient
                  colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={{
                    width: scale(45),
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderLeftWidth: scale(1.5),
                    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
                  }}
                >
                  <Text style={{
                    fontSize: scale(10),
                    fontWeight: '800',
                    color: '#FFFFFF',
                    textShadowColor: 'rgba(88, 74, 126, 0.5)',
                    textShadowOffset: { width: 0, height: scale(1) },
                    textShadowRadius: scale(2),
                  }}>EX</Text>
                </LinearGradient>
              </View>
            </>
          )}

        </View>
        );
      })}
    </View>
  );
}
