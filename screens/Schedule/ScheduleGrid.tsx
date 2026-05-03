import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { scale } from '../../lib/scale';
import { DAYS, PERIODS, ScheduleSlot, DayOfWeek, STATUS_CONFIG, ROLE_CONFIG } from './types';

interface ScheduleGridProps {
  slots: ScheduleSlot[];
  onCellPress: (day: DayOfWeek, period: number) => void;
}

// Mini badge for doctor name inside grid cell
const MiniBadge = ({ slot }: { slot: ScheduleSlot }) => {
  const isSpecialStatus = slot.status !== 'active';
  const config = isSpecialStatus ? STATUS_CONFIG[slot.status] : ROLE_CONFIG[slot.role];

  return (
    <View style={{
      width: '100%',
      paddingVertical: scale(2),
      paddingHorizontal: scale(3),
      borderRadius: scale(5),
      backgroundColor: config.bgColor,
      borderWidth: scale(1),
      borderColor: config.borderColor,
      marginBottom: scale(2),
    }}>
      <Text style={{
        fontSize: scale(8),
        fontWeight: '700',
        color: config.color,
        textAlign: 'center',
      }} numberOfLines={1}>
        {slot.role === 'delegator' && slot.status === 'active' ? '📋' : ''}
        {isSpecialStatus ? STATUS_CONFIG[slot.status].icon : ''}
        {slot.doctorName}
      </Text>
    </View>
  );
};

// Empty slot placeholder
const EmptyBadge = () => (
  <View style={{
    width: '100%',
    paddingVertical: scale(4),
    borderRadius: scale(5),
    borderWidth: scale(1),
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(0,0,0,0.02)',
  }}>
    <Text style={{
      fontSize: scale(8),
      color: '#CBD5E0',
      textAlign: 'center',
      fontWeight: '600',
    }}>+</Text>
  </View>
);

export function ScheduleGrid({ slots, onCellPress }: ScheduleGridProps) {
  const getSlots = (day: DayOfWeek, period: number) =>
    slots.filter(s => s.day === day && s.period === period);

  return (
    <View style={{ marginBottom: scale(12) }}>
      {/* Header Row - Days */}
      <View style={{ flexDirection: 'row', gap: scale(3), marginBottom: scale(3) }}>
        {/* Corner - empty */}
        <View style={{ width: scale(48) }} />
        {DAYS.map(day => (
          <View key={day.key} style={{
            flex: 1,
            backgroundColor: 'rgba(102,126,234,0.15)',
            borderRadius: scale(10),
            paddingVertical: scale(8),
            alignItems: 'center',
            borderWidth: scale(1.5),
            borderColor: 'rgba(102,126,234,0.25)',
          }}>
            <Text style={{
              fontSize: scale(10),
              fontWeight: '800',
              color: '#667EEA',
            }}>{day.shortLabel}</Text>
          </View>
        ))}
      </View>

      {/* Period Rows */}
      {PERIODS.map(period => (
        <View key={period.id} style={{
          flexDirection: 'row',
          gap: scale(3),
          marginBottom: scale(3),
        }}>
          {/* Time Column */}
          <View style={{
            width: scale(48),
            backgroundColor: 'rgba(255,255,255,0.35)',
            borderRadius: scale(10),
            paddingVertical: scale(6),
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: scale(1.5),
            borderColor: 'rgba(255,255,255,0.5)',
          }}>
            <Text style={{ fontSize: scale(14) }}>{period.icon}</Text>
            <Text style={{ fontSize: scale(7), fontWeight: '700', color: '#4A5568', marginTop: scale(2) }}>
              {period.start}
            </Text>
            <Text style={{ fontSize: scale(7), fontWeight: '700', color: '#4A5568' }}>
              {period.end}
            </Text>
          </View>

          {/* Day Cells */}
          {DAYS.map(day => {
            const cellSlots = getSlots(day.key, period.id);
            const hasSlots = cellSlots.length > 0;

            return (
              <TouchableOpacity
                key={`${day.key}-${period.id}`}
                activeOpacity={0.7}
                onPress={() => onCellPress(day.key, period.id)}
                style={{
                  flex: 1,
                  backgroundColor: hasSlots
                    ? 'rgba(255,255,255,0.45)'
                    : 'rgba(255,255,255,0.25)',
                  borderRadius: scale(10),
                  padding: scale(4),
                  minHeight: scale(70),
                  justifyContent: cellSlots.length > 0 ? 'flex-start' : 'center',
                  alignItems: 'center',
                  borderWidth: scale(1.5),
                  borderColor: hasSlots
                    ? 'rgba(255,255,255,0.6)'
                    : 'rgba(255,255,255,0.4)',
                }}
              >
                {cellSlots.length > 0
                  ? cellSlots.map(slot => <MiniBadge key={slot.id} slot={slot} />)
                  : <EmptyBadge />
                }
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
