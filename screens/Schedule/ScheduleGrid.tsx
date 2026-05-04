import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';
import { DAYS, PERIODS, ScheduleSlot, DayOfWeek, STATUS_CONFIG, ROLE_CONFIG } from './types';

interface ScheduleGridProps {
  slots: ScheduleSlot[];
  onCellPress: (day: DayOfWeek, period: number) => void;
}

export function ScheduleGrid({ slots, onCellPress }: ScheduleGridProps) {
  const getSlots = (day: DayOfWeek, period: number) =>
    slots.filter(s => s.day === day && s.period === period);

  return (
    <View style={{ gap: scale(16) }}>
      {DAYS.map(day => (
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
              {PERIODS.map((period, periodIndex) => {
                const cellSlots = getSlots(day.key, period.id);
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
                      alignItems: 'center',
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
                      const maxClinic = Math.max(2, ...clinicSlots.map(s => s.clinicNumber));

                      return (
                        <>
                          {/* Clinic mini cards */}
                          {Array.from({ length: maxClinic }, (_, i) => {
                            const clinicNum = i + 1;
                            const slot = clinicSlots.find(s => s.clinicNumber === clinicNum);
                            const isSpecial = slot && slot.status !== 'active';
                            const nameColor = slot
                              ? (isSpecial ? STATUS_CONFIG[slot.status].color : '#2D3748')
                              : '#CBD5E0';
                            return (
                              <View key={`c${clinicNum}`} style={{
                                flexDirection: 'row',
                                alignSelf: 'stretch',
                                marginBottom: scale(3),
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
                                  color: slot ? '#3B5998' : '#CBD5E0',
                                  paddingVertical: scale(3),
                                  paddingHorizontal: scale(4),
                                  textAlign: 'right',
                                }} numberOfLines={1}>{slot ? slot.doctorName : '—'}</Text>
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
              })}
            </LinearGradient>

            {/* Day label - right side */}
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
                fontSize: scale(11),
                fontWeight: '800',
                color: '#FFFFFF',
                textShadowColor: 'rgba(88, 74, 126, 0.5)',
                textShadowOffset: { width: 0, height: scale(1) },
                textShadowRadius: scale(2),
              }}>{day.shortLabel}</Text>
            </LinearGradient>
          </View>

          {/* Divider between Day row and EX row */}
          <View style={{ flexDirection: 'row' }}>
            <View style={{
              flex: 1,
              height: scale(1.5),
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
            }} />
            <View style={{
              width: scale(45),
              height: scale(1.5),
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
            }} />
          </View>

          {/* Row 2: EX + doctors area */}
          <View style={{ flexDirection: 'row', minHeight: scale(50) }}>
            {/* EX doctors content */}
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flex: 1,
                paddingVertical: scale(8),
                paddingHorizontal: scale(10),
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: scale(8),
                alignItems: 'center',
              }}>
              {(() => {
                const exSlots = slots.filter(s => s.day === day.key && s.period === 0);
                return exSlots.length > 0 ? exSlots.map(slot => {
                  const config = STATUS_CONFIG[slot.status];
                  return (
                    <Text key={slot.id} style={{
                      fontSize: scale(9),
                      fontWeight: '700',
                      color: config.color,
                    }}>{slot.doctorName}</Text>
                  );
                }) : (
                  <Text style={{ fontSize: scale(9), fontWeight: '600', color: '#9CA3AF' }}> </Text>
                );
              })()}
            </LinearGradient>

            {/* EX label - right side, same style as day */}
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

        </View>
      ))}
    </View>
  );
}
