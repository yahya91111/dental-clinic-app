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

  // Filter slots: show only current user + delegator, unless day is expanded
  const getVisibleSlots = (day: DayOfWeek, period: number) => {
    const all = getSlots(day, period);
    if (!userId || expandAll) return all;
    return all.filter(s => s.doctorId === userId || s.role === 'delegator');
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

                // Compute max doctors per clinic across all periods for this day
                const maxDoctorsPerClinic: Record<number, number> = {};
                for (const c of visibleClinicNums) {
                  let max = 1;
                  for (const p of PERIODS) {
                    const count = slots.filter(s => s.day === day.key && s.period === p.id && s.role === 'clinic' && s.clinicNumber === c).length;
                    if (count > max) max = count;
                  }
                  maxDoctorsPerClinic[c] = max;
                }
                const lineH = scale(14);

                return PERIODS.map((period, periodIndex) => {
                const cellSlots = getVisibleSlots(day.key, period.id);
                return (
                  <TouchableOpacity
                    key={period.id}
                    activeOpacity={0.7}
                    onPress={() => onCellPress(day.key, period.id)}
                    style={{
                      flex: 1,
                      paddingVertical: scale(10),
                      paddingHorizontal: scale(4),
                      minHeight: scale(90),
                      alignItems: 'stretch',
                      justifyContent: 'flex-start',
                      borderRightWidth: periodIndex < PERIODS.length - 1 ? scale(1.5) : 0,
                      borderRightColor: 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    {/* Period header */}
                    <LinearGradient
                      colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: scale(4),
                        marginBottom: scale(6),
                        marginTop: scale(-10),
                        marginHorizontal: scale(-4),
                        width: '115%',
                        alignItems: 'center',
                        borderBottomWidth: scale(1.5),
                        borderBottomColor: 'rgba(255, 255, 255, 0.5)',
                      }}
                    >
                      <Text style={{
                        fontSize: scale(9),
                        fontWeight: '800',
                        color: '#FFFFFF',
                        textShadowColor: 'rgba(88, 74, 126, 0.5)',
                        textShadowOffset: { width: 0, height: scale(1) },
                        textShadowRadius: scale(2),
                      }}>P{period.id}</Text>
                      <Text style={{
                        fontSize: scale(7),
                        fontWeight: '600',
                        color: 'rgba(255, 255, 255, 0.85)',
                      }}>{period.start}-{period.end}</Text>
                    </LinearGradient>

                    {/* Clinic rows - mini card style */}
                    {(() => {
                      const clinicSlots = cellSlots.filter(s => s.role === 'clinic' && s.clinicNumber > 0);
                      const delegatorSlots = cellSlots.filter(s => s.role === 'delegator');

                      return (
                        <>
                          {/* Clinic mini cards */}
                          {visibleClinicNums.map(clinicNum => {
                            const matchingSlots = clinicSlots.filter(s => s.clinicNumber === clinicNum);
                            // In filtered mode: hide card content if user not in this clinic for this period
                            const userInThisCell = !userId || showAllClinics || matchingSlots.some(s => s.doctorId === userId);
                            return (
                              <View key={`c${clinicNum}`} style={{
                                flexDirection: 'row',
                                alignSelf: 'stretch',
                                marginBottom: scale(3),
                                borderRadius: scale(6),
                                overflow: 'hidden',
                                borderWidth: scale(1),
                                borderColor: userInThisCell ? 'rgba(255,255,255,0.6)' : 'transparent',
                                backgroundColor: userInThisCell ? 'rgba(255,255,255,0.2)' : 'transparent',
                                minHeight: scale(6) + (maxDoctorsPerClinic[clinicNum] || 1) * lineH,
                              }}>
                                {userInThisCell ? (
                                <>
                                {/* Name(s) */}
                                <View style={{ flex: 1, paddingVertical: scale(3), paddingHorizontal: scale(4), justifyContent: 'center' }}>
                                  {matchingSlots.length > 0 ? matchingSlots.map(s => (
                                    <Text key={s.id} style={{
                                      fontSize: scale(8),
                                      fontWeight: '700',
                                      color: '#3B5998',
                                      textAlign: 'right',
                                    }} numberOfLines={1}>{s.doctorName}</Text>
                                  )) : (
                                    <Text style={{ fontSize: scale(8), fontWeight: '700', color: '#CBD5E0', textAlign: 'right' }}>—</Text>
                                  )}
                                </View>
                                {/* Clinic number - right side */}
                                <LinearGradient
                                  colors={['rgba(71,118,186,0.45)', 'rgba(120,160,210,0.3)', 'rgba(120,160,210,0.3)', 'rgba(71,118,186,0.45)']}
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
                                    textShadowColor: 'rgba(50, 80, 140, 0.5)',
                                    textShadowOffset: { width: 0, height: scale(0.5) },
                                    textShadowRadius: scale(1),
                                  }}>CL{clinicNum}</Text>
                                </LinearGradient>
                                </>) : null}
                              </View>
                            );
                          })}

                          {/* Divider */}
                          <View style={{
                            height: scale(1),
                            backgroundColor: 'rgba(255,255,255,0.5)',
                            alignSelf: 'stretch',
                            marginVertical: scale(2),
                          }} />

                          {/* Delegator mini card */}
                          <View style={{
                            flexDirection: 'row',
                            alignSelf: 'stretch',
                            borderRadius: scale(6),
                            overflow: 'hidden',
                            borderWidth: scale(1),
                            borderColor: 'rgba(255,255,255,0.6)',
                            backgroundColor: 'rgba(255,255,255,0.2)',
                          }}>
                            {/* Name */}
                            <Text style={{
                              flex: 1,
                              fontSize: scale(8),
                              fontWeight: '700',
                              color: delegatorSlots.length > 0 ? '#6B4C9A' : '#CBD5E0',
                              paddingVertical: scale(3),
                              paddingHorizontal: scale(4),
                              textAlign: 'right',
                            }} numberOfLines={1}>
                              {delegatorSlots.length > 0 ? delegatorSlots[0].doctorName : '—'}
                            </Text>
                            {/* DLG label - right side */}
                            <LinearGradient
                              colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
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
                                textShadowColor: 'rgba(88, 74, 126, 0.5)',
                                textShadowOffset: { width: 0, height: scale(0.5) },
                                textShadowRadius: scale(1),
                              }}>DLG</Text>
                            </LinearGradient>
                          </View>
                        </>
                      );
                    })()}
                  </TouchableOpacity>
                );
              });
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
                    const exSlots = slots.filter(s => s.day === day.key && s.period === 0);
                    // clinicNumber 1 = right side, clinicNumber 2 = left side
                    const rightSlots = exSlots.filter(s => s.clinicNumber === 1 || s.clinicNumber === 0);
                    const leftSlots = exSlots.filter(s => s.clinicNumber === 2);

                    const renderExCard = (slot: ScheduleSlot) => {
                      const config = STATUS_CONFIG[slot.status];
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
                            color: config.color,
                            paddingVertical: scale(3),
                            paddingHorizontal: scale(4),
                            textAlign: 'right',
                          }} numberOfLines={1}>{slot.doctorName}</Text>
                          <LinearGradient
                            colors={[config.color + '90', config.color + '50', config.color + '50', config.color + '90']}
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
                              textShadowColor: config.color + '80',
                              textShadowOffset: { width: 0, height: scale(0.5) },
                              textShadowRadius: scale(1),
                            }}>{config.shortLabel}</Text>
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
