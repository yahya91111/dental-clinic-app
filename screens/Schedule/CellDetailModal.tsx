import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { scale } from '../../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScheduleSlot, DayOfWeek, DAYS, PERIODS } from './types';
import { supabase } from '../../lib/supabase';
import { upsertScheduleSlot, deleteScheduleSlot } from '../../lib/database';

interface CellDetailModalProps {
  visible: boolean;
  day: DayOfWeek | null;
  period: number | null;
  slots: ScheduleSlot[];
  clinicCount: number;
  clinicId: string | null;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
}

const GROUP_COLORS = [
  { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)' },
  { color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)' },
  { color: '#10B981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)' },
  { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)' },
  { color: '#EF4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)' },
  { color: '#14B8A6', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.3)' },
  { color: '#EC4899', bg: 'rgba(236,72,153,0.15)', border: 'rgba(236,72,153,0.3)' },
  { color: '#6366F1', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)' },
];

interface DoctorOption {
  id: string;
  name: string;
  workStatus?: string;
}

interface PickerGroup {
  id: string;
  name: string;
  colorIndex: number;
  doctors: DoctorOption[];
  isExpanded: boolean;
}

export function CellDetailModal({ visible, day, period, slots, clinicCount, clinicId, weekStart, onClose, onSaved }: CellDetailModalProps) {
  const [selectingFor, setSelectingFor] = useState<{ role: 'clinic' | 'delegator'; clinicNumber: number } | null>(null);
  const [pickerGroups, setPickerGroups] = useState<PickerGroup[]>([]);
  const [unassignedDoctors, setUnassignedDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  if (!day || period === null || period === undefined) return null;

  const dayInfo = DAYS.find(d => d.key === day);
  const periodInfo = PERIODS.find(p => p.id === period);
  const cellSlots = slots.filter(s => s.day === day && s.period === period);
  const clinicSlots = cellSlots.filter(s => s.role === 'clinic' && s.clinicNumber > 0);
  const delegatorSlot = cellSlots.find(s => s.role === 'delegator');

  const loadDoctors = async () => {
    if (!clinicId) return;
    setLoadingDoctors(true);
    try {
      // Load all clinic doctors
      const { data: pending } = await supabase
        .from('pending_doctors')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .in('role', ['doctor', 'coordinator', 'team_leader'])
        .order('name');
      const { data: assigned } = await supabase
        .from('doctors')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .in('role', ['doctor', 'coordinator', 'team_leader'])
        .order('name');
      const allDocs = [...(pending || []), ...(assigned || [])].map(d => ({ id: d.id, name: d.name || 'Unknown' }));

      // Load groups with members
      const { data: groupsData } = await supabase
        .from('doctor_groups')
        .select('*, doctor_group_members(*)')
        .eq('clinic_id', clinicId)
        .order('sort_order');

      const assignedIds = new Set<string>();
      const groups: PickerGroup[] = (groupsData || []).map((g: any) => {
        const members = (g.doctor_group_members || []) as any[];
        // Sort: active first, vacation/light_duty last
        const sorted = [...members].sort((a, b) => {
          const aVac = a.work_status !== 'active' ? 1 : 0;
          const bVac = b.work_status !== 'active' ? 1 : 0;
          return aVac - bVac;
        });
        const doctors: DoctorOption[] = sorted.map(m => {
          assignedIds.add(m.doctor_id);
          const doc = allDocs.find(d => d.id === m.doctor_id);
          return { id: m.doctor_id, name: doc?.name || m.doctor_name, workStatus: m.work_status };
        });
        return { id: g.id, name: g.name, colorIndex: g.color_index, doctors, isExpanded: false };
      });

      setPickerGroups(groups);
      setUnassignedDoctors(allDocs.filter(d => !assignedIds.has(d.id)));
    } catch (e) {
      console.error('Error loading doctors:', e);
    }
    setLoadingDoctors(false);
  };

  const handleSelectDoctor = async (doctor: DoctorOption) => {
    if (!selectingFor || !clinicId) return;
    await upsertScheduleSlot(
      clinicId,
      weekStart,
      day,
      period,
      selectingFor.role === 'delegator' ? 0 : selectingFor.clinicNumber,
      doctor.id,
      doctor.name,
      selectingFor.role,
      'active'
    );
    setSelectingFor(null);
    onSaved();
  };

  const handleRemoveSlot = (slot: ScheduleSlot) => {
    Alert.alert('Remove', `Remove ${slot.doctorName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await deleteScheduleSlot(slot.id);
          onSaved();
        },
      },
    ]);
  };

  const openDoctorPicker = (role: 'clinic' | 'delegator', clinicNumber: number) => {
    setSelectingFor({ role, clinicNumber });
    loadDoctors();
  };

  const togglePickerGroup = (groupId: string) => {
    setPickerGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g
    ));
  };

  // All slots for the same day (across all periods)
  const sameDaySlots = slots.filter(s => s.day === day);

  const renderDoctorRow = (doctor: DoctorOption) => {
    const assignedInCell = cellSlots.some(s => s.doctorId === doctor.id);
    const assignedInDay = !assignedInCell && sameDaySlots.some(s => s.doctorId === doctor.id);
    const isUsed = assignedInCell || assignedInDay;
    const isVacation = doctor.workStatus && doctor.workStatus !== 'active';
    return (
      <TouchableOpacity
        key={doctor.id}
        onPress={() => handleSelectDoctor(doctor)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: scale(10),
          paddingHorizontal: scale(12),
          borderRadius: scale(8),
          marginBottom: scale(3),
          backgroundColor: isUsed ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.5)',
          opacity: isUsed ? 0.5 : (doctor.workStatus === 'vacation') ? 0.5 : 1,
        }}
      >
        {isVacation && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: doctor.workStatus === 'vacation' ? 'rgba(107,114,128,0.12)' : 'rgba(245,158,11,0.12)',
            borderRadius: scale(6),
            paddingHorizontal: scale(5),
            paddingVertical: scale(1),
            marginRight: scale(6),
          }}>
            <Ionicons
              name={doctor.workStatus === 'vacation' ? 'airplane' : 'sunny'}
              size={scale(9)}
              color={doctor.workStatus === 'vacation' ? '#6B7280' : '#F59E0B'}
            />
          </View>
        )}
        <Text style={{
          flex: 1,
          fontSize: scale(13),
          fontWeight: '600',
          color: isUsed ? '#9CA3AF' : (doctor.workStatus === 'vacation') ? '#9CA3AF' : '#2D3748',
          textAlign: 'right',
        }}>{doctor.name}</Text>
        {assignedInCell && (
          <Ionicons name="checkmark-circle" size={scale(14)} color="#9CA3AF" style={{ marginLeft: scale(6) }} />
        )}
      </TouchableOpacity>
    );
  };

  // Doctor picker view
  if (selectingFor) {
    const label = selectingFor.role === 'delegator' ? 'Delegator' : `Clinic ${selectingFor.clinicNumber}`;
    const totalDoctors = pickerGroups.reduce((sum, g) => sum + g.doctors.length, 0) + unassignedDoctors.length;
    return (
      <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setSelectingFor(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{
            width: '85%',
            maxHeight: '75%',
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderRadius: scale(24),
            padding: scale(20),
            borderWidth: scale(2),
            borderColor: 'rgba(255,255,255,0.8)',
          }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(14) }}>
              <TouchableOpacity onPress={() => setSelectingFor(null)} style={{ marginRight: scale(10) }}>
                <Ionicons name="arrow-back" size={scale(22)} color="#6B7280" />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontSize: scale(16), fontWeight: '700', color: '#1E3A8A' }}>
                Select Doctor - {label}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingDoctors ? (
                <Text style={{ textAlign: 'center', color: '#9CA3AF', paddingVertical: scale(20) }}>Loading...</Text>
              ) : totalDoctors === 0 ? (
                <Text style={{ textAlign: 'center', color: '#9CA3AF', paddingVertical: scale(20) }}>No doctors found</Text>
              ) : (
                <>
                  {/* Groups */}
                  {pickerGroups.map(group => {
                    const gc = GROUP_COLORS[group.colorIndex % GROUP_COLORS.length];
                    return (
                      <View key={group.id} style={{ marginBottom: scale(8) }}>
                        {/* Group header */}
                        <TouchableOpacity
                          onPress={() => togglePickerGroup(group.id)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: scale(9),
                            paddingHorizontal: scale(10),
                            borderRadius: scale(10),
                            backgroundColor: gc.bg,
                            borderWidth: scale(1),
                            borderColor: gc.border,
                          }}
                        >
                          <View style={{
                            width: scale(8),
                            height: scale(8),
                            borderRadius: scale(4),
                            backgroundColor: gc.color,
                            marginRight: scale(8),
                          }} />
                          <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '700', color: gc.color }}>
                            {group.name}
                          </Text>
                          <Text style={{ fontSize: scale(11), fontWeight: '600', color: gc.color, marginRight: scale(6) }}>
                            {group.doctors.length}
                          </Text>
                          <Ionicons
                            name={group.isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={scale(16)}
                            color={gc.color}
                          />
                        </TouchableOpacity>

                        {/* Group doctors */}
                        {group.isExpanded && (
                          <View style={{ paddingLeft: scale(6), paddingTop: scale(4) }}>
                            {group.doctors.map(doc => renderDoctorRow(doc))}
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* Unassigned doctors hidden from picker */}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // Main cell detail view
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{
          width: '85%',
          maxHeight: '75%',
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderRadius: scale(24),
          padding: scale(20),
          borderWidth: scale(2),
          borderColor: 'rgba(255,255,255,0.8)',
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: scale(16),
            paddingBottom: scale(12),
            borderBottomWidth: scale(1.5),
            borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View>
              <Text style={{ fontSize: scale(18), fontWeight: '700', color: '#1E3A8A' }}>
                {dayInfo?.label} - P{period}
              </Text>
              <Text style={{ fontSize: scale(13), fontWeight: '600', color: '#667EEA', marginTop: scale(2) }}>
                {periodInfo?.start} - {periodInfo?.end}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{
              width: scale(36),
              height: scale(36),
              borderRadius: scale(18),
              backgroundColor: 'rgba(0,0,0,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="close" size={scale(20)} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Clinic Slots */}
            {Array.from({ length: clinicCount }, (_, i) => {
              const clinicNum = i + 1;
              const matchingSlots = clinicSlots.filter(s => s.clinicNumber === clinicNum);
              return (
                <View key={`c${clinicNum}`} style={{
                  marginBottom: scale(8),
                  borderRadius: scale(12),
                  overflow: 'hidden',
                  borderWidth: scale(1.5),
                  borderColor: matchingSlots.length > 0 ? 'rgba(59,130,246,0.25)' : 'rgba(0,0,0,0.06)',
                  backgroundColor: matchingSlots.length > 0 ? 'rgba(59,130,246,0.06)' : 'rgba(0,0,0,0.02)',
                }}>
                  {/* Header: CL label + Add button */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <LinearGradient
                      colors={['rgba(71,118,186,0.45)', 'rgba(120,160,210,0.3)']}
                      style={{
                        paddingHorizontal: scale(10),
                        paddingVertical: scale(10),
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: scale(10), fontWeight: '800', color: '#FFFFFF' }}>CL{clinicNum}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      onPress={() => openDoctorPicker('clinic', clinicNum)}
                      style={{ paddingHorizontal: scale(10), paddingVertical: scale(8) }}
                    >
                      <Ionicons name="add-circle" size={scale(20)} color="#3B82F6" />
                    </TouchableOpacity>
                  </View>

                  {/* Assigned doctors */}
                  {matchingSlots.length === 0 ? (
                    <TouchableOpacity
                      onPress={() => openDoctorPicker('clinic', clinicNum)}
                      style={{ paddingHorizontal: scale(12), paddingVertical: scale(8) }}
                    >
                      <Text style={{ fontSize: scale(13), color: '#9CA3AF', textAlign: 'right' }}>Tap to assign</Text>
                    </TouchableOpacity>
                  ) : (
                    matchingSlots.map(slot => (
                      <View key={slot.id} style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: scale(12),
                        paddingVertical: scale(6),
                        borderTopWidth: scale(1),
                        borderTopColor: 'rgba(0,0,0,0.04)',
                      }}>
                        <Text style={{
                          flex: 1,
                          fontSize: scale(13),
                          fontWeight: '600',
                          color: '#2D3748',
                          textAlign: 'right',
                        }}>{slot.doctorName}</Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveSlot(slot)}
                          style={{ paddingLeft: scale(8) }}
                        >
                          <Ionicons name="close-circle" size={scale(18)} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              );
            })}

            {/* Divider */}
            <View style={{ height: scale(1), backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: scale(8) }} />

            {/* Delegator Slot */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: scale(8),
              borderRadius: scale(12),
              overflow: 'hidden',
              borderWidth: scale(1.5),
              borderColor: delegatorSlot ? 'rgba(124,108,180,0.25)' : 'rgba(0,0,0,0.06)',
              backgroundColor: delegatorSlot ? 'rgba(124,108,180,0.06)' : 'rgba(0,0,0,0.02)',
            }}>
              <LinearGradient
                colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)']}
                style={{
                  paddingHorizontal: scale(10),
                  paddingVertical: scale(12),
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: scale(10),
                  fontWeight: '800',
                  color: '#FFFFFF',
                }}>DLG</Text>
              </LinearGradient>

              <TouchableOpacity
                style={{ flex: 1, paddingHorizontal: scale(10), paddingVertical: scale(12) }}
                onPress={() => {
                  if (delegatorSlot) return;
                  openDoctorPicker('delegator', 0);
                }}
                onLongPress={() => { if (delegatorSlot) handleRemoveSlot(delegatorSlot); }}
                activeOpacity={0.7}
              >
                <Text style={{
                  fontSize: scale(14),
                  fontWeight: '600',
                  color: delegatorSlot ? '#6B4C9A' : '#9CA3AF',
                  textAlign: 'right',
                }}>
                  {delegatorSlot ? delegatorSlot.doctorName : 'Tap to assign'}
                </Text>
              </TouchableOpacity>

              {delegatorSlot ? (
                <TouchableOpacity
                  onPress={() => handleRemoveSlot(delegatorSlot)}
                  style={{ paddingHorizontal: scale(10) }}
                >
                  <Ionicons name="close-circle" size={scale(20)} color="#EF4444" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => openDoctorPicker('delegator', 0)}
                  style={{ paddingHorizontal: scale(10) }}
                >
                  <Ionicons name="add-circle" size={scale(20)} color="#7C3AED" />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
