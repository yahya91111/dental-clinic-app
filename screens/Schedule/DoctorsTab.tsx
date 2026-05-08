import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Keyboard, TouchableWithoutFeedback, Alert, ActivityIndicator } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import {
  createDoctorGroup,
  updateDoctorGroup,
  deleteDoctorGroup as dbDeleteGroup,
  moveDoctorBetweenGroups,
  updateDoctorWorkStatus,
} from '../../lib/database';

const GROUP_COLORS = [
  { name: 'Blue', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)' },
  { name: 'Purple', color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)' },
  { name: 'Green', color: '#10B981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)' },
  { name: 'Orange', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)' },
  { name: 'Red', color: '#EF4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)' },
  { name: 'Teal', color: '#14B8A6', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.3)' },
  { name: 'Pink', color: '#EC4899', bg: 'rgba(236,72,153,0.15)', border: 'rgba(236,72,153,0.3)' },
  { name: 'Indigo', color: '#6366F1', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)' },
];

export type DoctorWorkStatus = 'active' | 'vacation' | 'light_duty';

const WORK_STATUS_CONFIG: Record<DoctorWorkStatus, { label: string; color: string; icon: string }> = {
  active: { label: 'Active', color: '#10B981', icon: 'checkmark-circle' },
  vacation: { label: 'Vacation', color: '#6B7280', icon: 'airplane' },
  light_duty: { label: 'Light Duty', color: '#F59E0B', icon: 'sunny' },
};

export interface DoctorItem {
  id: string;
  name: string;
  role?: string;
  workStatus?: DoctorWorkStatus;
}

export interface DoctorGroup {
  id: string;
  name: string;
  colorIndex: number;
  doctors: DoctorItem[];
  isExpanded: boolean;
}

interface DoctorsTabProps {
  clinicId: string | null;
}

export function DoctorsTab({ clinicId }: DoctorsTabProps) {
  const [loading, setLoading] = useState(true);
  const [allDoctors, setAllDoctors] = useState<DoctorItem[]>([]);
  const [groups, setGroups] = useState<DoctorGroup[]>([]);

  // Modal states
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Doctor action modal (move + status)
  const [selectedDoctor, setSelectedDoctor] = useState<{ doctor: DoctorItem; fromGroupId: string | null } | null>(null);
  const [doctorActionMode, setDoctorActionMode] = useState<'menu' | 'move' | 'status'>('menu');

  // Group menu (three dots)
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);

  // Unassigned section
  const [unassignedExpanded, setUnassignedExpanded] = useState(true);

  // Load clinic doctors from Supabase (filtered by clinic_id)
  const loadDoctors = useCallback(async () => {
    if (!clinicId) return [];
    try {
      const { data: pendingData } = await supabase
        .from('pending_doctors')
        .select('id, name, role')
        .eq('clinic_id', clinicId)
        .in('role', ['doctor', 'coordinator', 'team_leader'])
        .order('name');

      const { data: assignedData } = await supabase
        .from('doctors')
        .select('id, name, role')
        .eq('clinic_id', clinicId)
        .in('role', ['doctor', 'coordinator', 'team_leader'])
        .order('name');

      const combined = [...(pendingData || []), ...(assignedData || [])];
      const doctors: DoctorItem[] = combined.map(d => ({
        id: d.id,
        name: d.name || 'Unknown',
        role: d.role,
      }));
      setAllDoctors(doctors);
      return doctors;
    } catch (error) {
      console.error('Error loading doctors:', error);
      return [];
    }
  }, []);

  // Load groups + all members in ONE query
  const loadGroups = useCallback(async (doctors: DoctorItem[]) => {
    if (!clinicId) return;
    try {
      // Single query: groups with their members embedded
      const { data: groupsData } = await supabase
        .from('doctor_groups')
        .select('*, doctor_group_members(*)')
        .eq('clinic_id', clinicId)
        .order('sort_order');

      if (!groupsData) return;

      const prevExpanded = groups.reduce<Record<string, boolean>>((acc, g) => { acc[g.id] = g.isExpanded; return acc; }, {});

      const loadedGroups: DoctorGroup[] = groupsData.map((g: any, idx: number) => {
        const members = g.doctor_group_members || [];
        const groupDoctors: DoctorItem[] = members.map((m: any) => {
          const doc = doctors.find(d => d.id === m.doctor_id);
          return {
            id: m.doctor_id,
            name: doc?.name || m.doctor_name,
            role: doc?.role,
            workStatus: m.work_status as DoctorWorkStatus,
          };
        });
        return {
          id: g.id,
          name: g.name,
          colorIndex: g.color_index,
          doctors: groupDoctors,
          isExpanded: prevExpanded[g.id] ?? idx === 0,
        };
      });
      setGroups(loadedGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  }, [clinicId]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const doctors = await loadDoctors();
      await loadGroups(doctors);
      setLoading(false);
    };
    init();
  }, [clinicId]);

  // Reload helper
  const reload = async () => {
    const doctors = await loadDoctors();
    await loadGroups(doctors);
  };

  // Get assigned doctor IDs
  const assignedIds = new Set(groups.flatMap(g => g.doctors.map(d => d.id)));
  const unassignedDoctors = allDoctors.filter(d => !assignedIds.has(d.id));

  const toggleExpand = (groupId: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g
    ));
  };

  const addGroup = async () => {
    if (!newGroupName.trim() || !clinicId) return;
    if (editingGroupId) {
      await updateDoctorGroup(editingGroupId, newGroupName.trim(), selectedColorIndex);
      setEditingGroupId(null);
    } else {
      await createDoctorGroup(clinicId, newGroupName.trim(), selectedColorIndex, groups.length);
    }
    setNewGroupName('');
    setShowAddGroup(false);
    await reload();
  };

  const deleteGroup = (groupId: string) => {
    Alert.alert('Delete Group', 'Doctors will be moved to Unassigned.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await dbDeleteGroup(groupId);
          await reload();
        },
      },
    ]);
  };

  const moveDoctor = async (toGroupId: string | null) => {
    if (!selectedDoctor) return;
    const { doctor, fromGroupId } = selectedDoctor;
    await moveDoctorBetweenGroups(doctor.id, fromGroupId, toGroupId, doctor.name);
    setSelectedDoctor(null);
    setDoctorActionMode('menu');
    await reload();
  };

  const handleUpdateStatus = async (status: DoctorWorkStatus) => {
    if (!selectedDoctor) return;
    const { doctor, fromGroupId } = selectedDoctor;
    if (fromGroupId) {
      await updateDoctorWorkStatus(fromGroupId, doctor.id, status);
    }
    setSelectedDoctor(null);
    setDoctorActionMode('menu');
    await reload();
  };

  const openEditGroup = (group: DoctorGroup) => {
    setEditingGroupId(group.id);
    setNewGroupName(group.name);
    setSelectedColorIndex(group.colorIndex);
    setShowAddGroup(true);
  };

  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingTop: scale(60) }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={{ fontSize: scale(13), color: '#9CA3AF', marginTop: scale(10) }}>Loading...</Text>
      </View>
    );
  }

  const renderGroupCard = (group: DoctorGroup) => {
    const gc = GROUP_COLORS[group.colorIndex % GROUP_COLORS.length];
    return (
      <View key={group.id} style={{
        borderRadius: scale(16),
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.35)',
        borderWidth: scale(2),
        borderColor: 'rgba(255,255,255,0.7)',
        marginBottom: scale(12),
      }}>
        {/* Group Header */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleExpand(group.id)}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <LinearGradient
            colors={[gc.border, gc.bg, gc.bg, gc.border]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: scale(12),
              paddingHorizontal: scale(14),
            }}
          >
            <View style={{
              width: scale(10),
              height: scale(10),
              borderRadius: scale(5),
              backgroundColor: gc.color,
              marginRight: scale(10),
            }} />
            <Text style={{
              flex: 1,
              fontSize: scale(14),
              fontWeight: '700',
              color: gc.color,
            }}>{group.name}</Text>
            <View style={{
              backgroundColor: gc.bg,
              borderRadius: scale(10),
              paddingHorizontal: scale(8),
              paddingVertical: scale(2),
              borderWidth: scale(1),
              borderColor: gc.border,
              marginRight: scale(8),
            }}>
              <Text style={{ fontSize: scale(12), fontWeight: '700', color: gc.color }}>
                {group.doctors.length}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setMenuGroupId(menuGroupId === group.id ? null : group.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={scale(18)} color={gc.color} />
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>

        {/* Doctors List */}
        {group.isExpanded && (
          <View style={{ paddingHorizontal: scale(10), paddingVertical: scale(8) }}>
            {group.doctors.length === 0 ? (
              <Text style={{
                fontSize: scale(12),
                color: '#9CA3AF',
                textAlign: 'center',
                paddingVertical: scale(10),
                fontStyle: 'italic',
              }}>No doctors in this group</Text>
            ) : (
              group.doctors.map((doctor, idx) => {
                const status = doctor.workStatus || 'active';
                const statusCfg = WORK_STATUS_CONFIG[status];
                return (
                  <TouchableOpacity
                    key={doctor.id}
                    activeOpacity={0.7}
                    onPress={() => { setDoctorActionMode('menu'); setSelectedDoctor({ doctor, fromGroupId: group.id }); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: scale(8),
                      paddingHorizontal: scale(8),
                      borderBottomWidth: idx < group.doctors.length - 1 ? scale(1) : 0,
                      borderBottomColor: 'rgba(0,0,0,0.04)',
                    }}
                  >
                    {status !== 'active' && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: statusCfg.color + '15',
                        borderRadius: scale(8),
                        paddingHorizontal: scale(6),
                        paddingVertical: scale(2),
                        marginRight: scale(6),
                      }}>
                        <Ionicons name={statusCfg.icon as any} size={scale(10)} color={statusCfg.color} />
                        <Text style={{ fontSize: scale(8), fontWeight: '600', color: statusCfg.color, marginLeft: scale(3) }}>
                          {statusCfg.label}
                        </Text>
                      </View>
                    )}
                    <Text style={{
                      flex: 1,
                      fontSize: scale(13),
                      fontWeight: '600',
                      color: status === 'active' ? '#2D3748' : statusCfg.color,
                      textAlign: 'right',
                    }}>{doctor.name}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: scale(12) }}>
      {/* Groups */}
      {groups.map(group => renderGroupCard(group))}

      {/* Unassigned */}
      <View style={{
        borderRadius: scale(16),
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.35)',
        borderWidth: scale(2),
        borderColor: 'rgba(255,255,255,0.7)',
        marginBottom: scale(12),
      }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setUnassignedExpanded(!unassignedExpanded)}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <LinearGradient
            colors={['rgba(156,163,175,0.3)', 'rgba(156,163,175,0.1)', 'rgba(156,163,175,0.1)', 'rgba(156,163,175,0.3)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: scale(12),
              paddingHorizontal: scale(14),
            }}
          >
            <View style={{
              width: scale(10),
              height: scale(10),
              borderRadius: scale(5),
              backgroundColor: '#9CA3AF',
              marginRight: scale(10),
            }} />
            <Text style={{
              flex: 1,
              fontSize: scale(14),
              fontWeight: '700',
              color: '#6B7280',
            }}>Unassigned</Text>
            <View style={{
              backgroundColor: 'rgba(156,163,175,0.15)',
              borderRadius: scale(10),
              paddingHorizontal: scale(8),
              paddingVertical: scale(2),
              borderWidth: scale(1),
              borderColor: 'rgba(156,163,175,0.3)',
              marginRight: scale(8),
            }}>
              <Text style={{ fontSize: scale(12), fontWeight: '700', color: '#6B7280' }}>
                {unassignedDoctors.length}
              </Text>
            </View>
            <Ionicons
              name={unassignedExpanded ? 'chevron-up' : 'chevron-down'}
              size={scale(18)}
              color="#6B7280"
            />
          </LinearGradient>
        </TouchableOpacity>

        {unassignedExpanded && (
          <View style={{ paddingHorizontal: scale(10), paddingVertical: scale(8) }}>
            {unassignedDoctors.length === 0 ? (
              <Text style={{
                fontSize: scale(12),
                color: '#9CA3AF',
                textAlign: 'center',
                paddingVertical: scale(10),
                fontStyle: 'italic',
              }}>All doctors are assigned</Text>
            ) : (
              unassignedDoctors.map((doctor, idx) => (
                <TouchableOpacity
                  key={doctor.id}
                  activeOpacity={0.7}
                  onPress={() => { setDoctorActionMode('menu'); setSelectedDoctor({ doctor, fromGroupId: null }); }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: scale(8),
                    paddingHorizontal: scale(8),
                    borderBottomWidth: idx < unassignedDoctors.length - 1 ? scale(1) : 0,
                    borderBottomColor: 'rgba(0,0,0,0.04)',
                  }}
                >
                  <Text style={{
                    flex: 1,
                    fontSize: scale(13),
                    fontWeight: '600',
                    color: '#6B7280',
                    textAlign: 'right',
                  }}>{doctor.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </View>

      {/* Add Group Button */}
      <TouchableOpacity
        onPress={() => {
          setEditingGroupId(null);
          setNewGroupName('');
          setSelectedColorIndex(groups.length % GROUP_COLORS.length);
          setShowAddGroup(true);
        }}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: scale(14),
          borderRadius: scale(14),
          backgroundColor: 'rgba(255,255,255,0.35)',
          borderWidth: scale(2),
          borderColor: 'rgba(255,255,255,0.7)',
          borderStyle: 'dashed',
          gap: scale(8),
        }}
      >
        <Ionicons name="add-circle-outline" size={scale(20)} color="#8B5CF6" />
        <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#8B5CF6' }}>Add Group</Text>
      </TouchableOpacity>

      {/* Group Menu Modal (three dots) */}
      <Modal transparent visible={menuGroupId !== null} animationType="fade" onRequestClose={() => setMenuGroupId(null)}>
        <TouchableWithoutFeedback onPress={() => setMenuGroupId(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{
              width: '65%',
              backgroundColor: 'rgba(30, 30, 40, 0.95)',
              borderRadius: scale(16),
              padding: scale(6),
              borderWidth: scale(1),
              borderColor: 'rgba(255,255,255,0.15)',
            }}>
              <TouchableOpacity
                onPress={() => {
                  const group = groups.find(g => g.id === menuGroupId);
                  setMenuGroupId(null);
                  if (group) openEditGroup(group);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: scale(10),
                  paddingVertical: scale(13),
                  paddingHorizontal: scale(14),
                  borderRadius: scale(10),
                }}
              >
                <Ionicons name="pencil-outline" size={scale(17)} color="#A5B4FC" />
                <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#FFFFFF' }}>Edit</Text>
              </TouchableOpacity>
              <View style={{ height: scale(1), backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: scale(10) }} />
              <TouchableOpacity
                onPress={() => {
                  const gId = menuGroupId;
                  setMenuGroupId(null);
                  if (gId) deleteGroup(gId);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: scale(10),
                  paddingVertical: scale(13),
                  paddingHorizontal: scale(14),
                  borderRadius: scale(10),
                }}
              >
                <Ionicons name="trash-outline" size={scale(17)} color="#F87171" />
                <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#F87171' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Add/Edit Group Modal */}
      <Modal transparent visible={showAddGroup} animationType="fade" onRequestClose={() => setShowAddGroup(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{
              width: '80%',
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: scale(20),
              padding: scale(24),
              borderWidth: scale(2),
              borderColor: 'rgba(255,255,255,0.8)',
            }}>
              <Text style={{
                fontSize: scale(16),
                fontWeight: '700',
                color: '#1E3A8A',
                textAlign: 'center',
                marginBottom: scale(16),
              }}>
                {editingGroupId ? 'Edit Group' : 'New Group'}
              </Text>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Group name"
                placeholderTextColor="#A0AEC0"
                style={{
                  fontSize: scale(16),
                  fontWeight: '600',
                  color: '#2D3748',
                  textAlign: 'center',
                  backgroundColor: 'rgba(0,0,0,0.04)',
                  borderRadius: scale(14),
                  paddingVertical: scale(12),
                  borderWidth: scale(2),
                  borderColor: 'rgba(102,126,234,0.3)',
                  marginBottom: scale(16),
                }}
                autoFocus
              />

              {/* Color Picker */}
              <Text style={{
                fontSize: scale(12),
                fontWeight: '600',
                color: '#6B7280',
                marginBottom: scale(8),
                textAlign: 'center',
              }}>Color</Text>
              <View style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: scale(8),
                flexWrap: 'wrap',
                marginBottom: scale(20),
              }}>
                {GROUP_COLORS.map((gc, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setSelectedColorIndex(i)}
                    style={{
                      width: scale(32),
                      height: scale(32),
                      borderRadius: scale(16),
                      backgroundColor: gc.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: selectedColorIndex === i ? scale(3) : 0,
                      borderColor: '#FFFFFF',
                      shadowColor: selectedColorIndex === i ? gc.color : 'transparent',
                      shadowOffset: { width: 0, height: scale(2) },
                      shadowOpacity: 0.5,
                      shadowRadius: scale(4),
                      elevation: selectedColorIndex === i ? 4 : 0,
                    }}
                  >
                    {selectedColorIndex === i && (
                      <Ionicons name="checkmark" size={scale(16)} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: scale(10) }}>
                <TouchableOpacity
                  onPress={() => { setShowAddGroup(false); setEditingGroupId(null); }}
                  style={{
                    flex: 1,
                    paddingVertical: scale(12),
                    borderRadius: scale(12),
                    backgroundColor: 'rgba(0,0,0,0.06)',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#6B7280' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={addGroup}
                  style={{
                    flex: 1,
                    paddingVertical: scale(12),
                    borderRadius: scale(12),
                    backgroundColor: '#667EEA',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#FFFFFF' }}>
                    {editingGroupId ? 'Save' : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Doctor Action Modal */}
      <Modal transparent visible={selectedDoctor !== null} animationType="fade" onRequestClose={() => { setSelectedDoctor(null); setDoctorActionMode('menu'); }}>
        <TouchableWithoutFeedback onPress={() => { setSelectedDoctor(null); setDoctorActionMode('menu'); }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableWithoutFeedback>
              <View style={{
                width: '80%',
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderRadius: scale(20),
                padding: scale(20),
                borderWidth: scale(2),
                borderColor: 'rgba(255,255,255,0.8)',
                maxHeight: '70%',
              }}>
                {/* Doctor Name Header */}
                <Text style={{
                  fontSize: scale(16),
                  fontWeight: '700',
                  color: '#1E3A8A',
                  textAlign: 'center',
                  marginBottom: scale(16),
                }}>{selectedDoctor?.doctor.name}</Text>

                {/* Main Menu */}
                {doctorActionMode === 'menu' && (
                  <View style={{ gap: scale(8) }}>
                    <TouchableOpacity
                      onPress={() => setDoctorActionMode('move')}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: scale(10),
                        paddingVertical: scale(13),
                        paddingHorizontal: scale(14),
                        borderRadius: scale(12),
                        backgroundColor: 'rgba(99,102,241,0.1)',
                        borderWidth: scale(1),
                        borderColor: 'rgba(99,102,241,0.2)',
                      }}
                    >
                      <Ionicons name="swap-horizontal-outline" size={scale(20)} color="#6366F1" />
                      <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#6366F1' }}>Move to Group</Text>
                    </TouchableOpacity>
                    {selectedDoctor?.fromGroupId && (
                      <TouchableOpacity
                        onPress={() => setDoctorActionMode('status')}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: scale(10),
                          paddingVertical: scale(13),
                          paddingHorizontal: scale(14),
                          borderRadius: scale(12),
                          backgroundColor: 'rgba(245,158,11,0.1)',
                          borderWidth: scale(1),
                          borderColor: 'rgba(245,158,11,0.2)',
                        }}
                      >
                        <Ionicons name="flag-outline" size={scale(20)} color="#F59E0B" />
                        <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#F59E0B' }}>Change Status</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Move to Group */}
                {doctorActionMode === 'move' && (
                  <View>
                    <TouchableOpacity
                      onPress={() => setDoctorActionMode('menu')}
                      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(12) }}
                    >
                      <Ionicons name="arrow-back" size={scale(18)} color="#6B7280" />
                      <Text style={{ fontSize: scale(13), fontWeight: '600', color: '#6B7280', marginLeft: scale(6) }}>Back</Text>
                    </TouchableOpacity>
                    {groups.map(group => {
                      const gc = GROUP_COLORS[group.colorIndex % GROUP_COLORS.length];
                      const isCurrentGroup = group.id === selectedDoctor?.fromGroupId;
                      return (
                        <TouchableOpacity
                          key={group.id}
                          disabled={isCurrentGroup}
                          onPress={() => moveDoctor(group.id)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: scale(10),
                            paddingHorizontal: scale(12),
                            borderRadius: scale(10),
                            marginBottom: scale(6),
                            backgroundColor: isCurrentGroup ? 'rgba(0,0,0,0.04)' : gc.bg,
                            borderWidth: scale(1),
                            borderColor: isCurrentGroup ? 'rgba(0,0,0,0.06)' : gc.border,
                            opacity: isCurrentGroup ? 0.5 : 1,
                          }}
                        >
                          <View style={{
                            width: scale(8),
                            height: scale(8),
                            borderRadius: scale(4),
                            backgroundColor: gc.color,
                            marginRight: scale(10),
                          }} />
                          <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '600', color: gc.color }}>
                            {group.name}
                          </Text>
                          {isCurrentGroup && (
                            <Text style={{ fontSize: scale(10), color: '#9CA3AF' }}>Current</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {selectedDoctor?.fromGroupId !== null && (
                      <TouchableOpacity
                        onPress={() => moveDoctor(null)}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: scale(10),
                          paddingHorizontal: scale(12),
                          borderRadius: scale(10),
                          marginBottom: scale(6),
                          backgroundColor: 'rgba(156,163,175,0.1)',
                          borderWidth: scale(1),
                          borderColor: 'rgba(156,163,175,0.3)',
                        }}
                      >
                        <View style={{
                          width: scale(8),
                          height: scale(8),
                          borderRadius: scale(4),
                          backgroundColor: '#9CA3AF',
                          marginRight: scale(10),
                        }} />
                        <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '600', color: '#6B7280' }}>Unassigned</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Change Status */}
                {doctorActionMode === 'status' && (
                  <View>
                    <TouchableOpacity
                      onPress={() => setDoctorActionMode('menu')}
                      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(12) }}
                    >
                      <Ionicons name="arrow-back" size={scale(18)} color="#6B7280" />
                      <Text style={{ fontSize: scale(13), fontWeight: '600', color: '#6B7280', marginLeft: scale(6) }}>Back</Text>
                    </TouchableOpacity>
                    {(Object.keys(WORK_STATUS_CONFIG) as DoctorWorkStatus[]).map(statusKey => {
                      const cfg = WORK_STATUS_CONFIG[statusKey];
                      const isCurrent = (selectedDoctor?.doctor.workStatus || 'active') === statusKey;
                      return (
                        <TouchableOpacity
                          key={statusKey}
                          disabled={isCurrent}
                          onPress={() => handleUpdateStatus(statusKey)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: scale(11),
                            paddingHorizontal: scale(12),
                            borderRadius: scale(10),
                            marginBottom: scale(6),
                            backgroundColor: isCurrent ? 'rgba(0,0,0,0.04)' : cfg.color + '15',
                            borderWidth: scale(1),
                            borderColor: isCurrent ? 'rgba(0,0,0,0.06)' : cfg.color + '30',
                            opacity: isCurrent ? 0.5 : 1,
                          }}
                        >
                          <Ionicons name={cfg.icon as any} size={scale(18)} color={cfg.color} />
                          <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '600', color: cfg.color, marginLeft: scale(10) }}>
                            {cfg.label}
                          </Text>
                          {isCurrent && (
                            <Text style={{ fontSize: scale(10), color: '#9CA3AF' }}>Current</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Cancel */}
                <TouchableOpacity
                  onPress={() => { setSelectedDoctor(null); setDoctorActionMode('menu'); }}
                  style={{ paddingVertical: scale(10), alignItems: 'center', marginTop: scale(10) }}
                >
                  <Text style={{ fontSize: scale(13), fontWeight: '600', color: '#9CA3AF' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
