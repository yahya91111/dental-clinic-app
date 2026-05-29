import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import {
  moveDoctorBetweenGroups,
  updateDoctorWorkStatus,
} from '../../lib/database';
import { TEMPLATE_NAMES, GROUP_TEMPLATES } from '../../lib/algorithms/groupTemplates';

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

export type DoctorWorkStatus = 'active' | 'vacation' | 'light_duty' | 'trainee';

const WORK_STATUS_CONFIG: Record<DoctorWorkStatus, { label: string; color: string; icon: string }> = {
  active:     { label: 'Active',     color: '#10B981', icon: 'checkmark-circle' },
  vacation:   { label: 'Vacation',   color: '#6B7280', icon: 'airplane' },
  light_duty: { label: 'Light Duty', color: '#F59E0B', icon: 'sunny' },
  trainee:    { label: 'Trainee',    color: '#10B981', icon: 'school' },
};

export interface DoctorItem {
  id: string;
  name: string;
  role?: string;
  workStatus?: DoctorWorkStatus;
  supervisorDoctorId?: string | null;
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

  // Doctor action modal (move + status + pick supervisor for trainee)
  const [selectedDoctor, setSelectedDoctor] = useState<{ doctor: DoctorItem; fromGroupId: string | null } | null>(null);
  const [doctorActionMode, setDoctorActionMode] = useState<'menu' | 'move' | 'status' | 'pick_supervisor'>('menu');

  // Unassigned section
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

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

      // فلترة وترتيب: فقط القروبات الـ4 من القوالب الثابتة، بترتيبها
      const templateOrderMap = new Map(
        GROUP_TEMPLATES.map((t) => [t.name, t.sortOrder]),
      );
      const loadedGroups: DoctorGroup[] = groupsData
        .filter((g: any) => TEMPLATE_NAMES.has(g.name))
        .sort((a: any, b: any) => {
          const aOrder = templateOrderMap.get(a.name) ?? 999;
          const bOrder = templateOrderMap.get(b.name) ?? 999;
          return aOrder - bOrder;
        })
        .map((g: any) => {
          const members = g.doctor_group_members || [];
          const groupDoctors: DoctorItem[] = members.map((m: any) => {
            const doc = doctors.find(d => d.id === m.doctor_id);
            return {
              id: m.doctor_id,
              name: doc?.name || m.doctor_name,
              role: doc?.role,
              workStatus: m.work_status as DoctorWorkStatus,
              supervisorDoctorId: m.supervisor_doctor_id ?? null,
            };
          });
          return {
            id: g.id,
            name: g.name,
            colorIndex: g.color_index,
            doctors: groupDoctors,
            isExpanded: prevExpanded[g.id] ?? false,
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
    // trainee يحتاج اختيار مدرّب أولاً
    if (status === 'trainee') {
      setDoctorActionMode('pick_supervisor');
      return;
    }
    const { doctor, fromGroupId } = selectedDoctor;
    if (fromGroupId) {
      await updateDoctorWorkStatus(fromGroupId, doctor.id, status, null);
    }
    setSelectedDoctor(null);
    setDoctorActionMode('menu');
    await reload();
  };

  const handlePickSupervisor = async (supervisorDoctorId: string) => {
    if (!selectedDoctor) return;
    const { doctor, fromGroupId } = selectedDoctor;
    if (fromGroupId) {
      await updateDoctorWorkStatus(fromGroupId, doctor.id, 'trainee', supervisorDoctorId);
    }
    setSelectedDoctor(null);
    setDoctorActionMode('menu');
    await reload();
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
        backgroundColor: 'rgba(255,255,255,0.55)',
        borderWidth: scale(1),
        borderColor: 'rgba(255,255,255,0.2)',
        marginBottom: scale(12),
      }}>
        {/* Group Header */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleExpand(group.id)}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <View
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
              borderRadius: scale(10),
              paddingHorizontal: scale(8),
              paddingVertical: scale(2),
              marginRight: scale(8),
            }}>
              <Text style={{ fontSize: scale(12), fontWeight: '700', color: gc.color }}>
                {group.doctors.length}
              </Text>
            </View>
          </View>
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
              (() => {
                // ─── ترتيب الأطباء: التريني يظهر تحت اسم مدرّبه ───
                // 1. غير-التريني بترتيبهم الأصلي
                // 2. التريني الذي مدرّبه في نفس القروب: يُلصق تحت المدرّب (indented)
                // 3. التريني الذي مدرّبه في قروب آخر (أو بدون): في نهاية القائمة مع label
                // الفيكيشن دائماً في الأسفل
                const onVacation = group.doctors.filter(d => d.workStatus === 'vacation');
                const notOnVacation = group.doctors.filter(d => d.workStatus !== 'vacation');

                const nonTrainees = notOnVacation.filter(d => d.workStatus !== 'trainee');
                const trainees = notOnVacation.filter(d => d.workStatus === 'trainee');

                const traineesBySupervisor = new Map<string, DoctorItem[]>();
                for (const t of trainees) {
                  if (t.supervisorDoctorId) {
                    const arr = traineesBySupervisor.get(t.supervisorDoctorId) || [];
                    arr.push(t);
                    traineesBySupervisor.set(t.supervisorDoctorId, arr);
                  }
                }

                // قائمة الأطباء عبر كل القروبات (للبحث عن مدرّب في قروب آخر)
                const allDoctorsById = new Map<string, { name: string; groupName: string }>();
                groups.forEach(g => g.doctors.forEach(d => {
                  allDoctorsById.set(d.id, { name: d.name, groupName: g.name });
                }));

                type Item = {
                  doctor: DoctorItem;
                  indented: boolean;
                  externalSupervisor?: { name: string; groupName: string };
                };
                const items: Item[] = [];

                // 1. الأطباء العاديون مع التريني تحت مدرّبيهم
                for (const d of nonTrainees) {
                  items.push({ doctor: d, indented: false });
                  const sub = traineesBySupervisor.get(d.id) || [];
                  for (const t of sub) {
                    items.push({ doctor: t, indented: true });
                  }
                }
                // 2. التريني بدون مدرّب في نفس القروب
                for (const t of trainees) {
                  const supId = t.supervisorDoctorId;
                  const supInSameGroup = supId && nonTrainees.find(d => d.id === supId);
                  if (!supInSameGroup) {
                    const supInfo = supId ? allDoctorsById.get(supId) : undefined;
                    items.push({ doctor: t, indented: false, externalSupervisor: supInfo });
                  }
                }
                // 3. الفيكيشن في الأسفل
                for (const d of onVacation) {
                  items.push({ doctor: d, indented: false });
                }

                return items.map((item, idx) => {
                  const doctor = item.doctor;
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
                        paddingLeft: item.indented ? scale(28) : scale(8),
                        borderBottomWidth: idx < items.length - 1 ? scale(1) : 0,
                        borderBottomColor: 'rgba(0,0,0,0.04)',
                      }}
                    >
                      {item.indented && (
                        <Ionicons
                          name="return-down-forward"
                          size={scale(12)}
                          color={WORK_STATUS_CONFIG.trainee.color}
                          style={{ marginRight: scale(6) }}
                        />
                      )}
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
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: scale(13),
                          fontWeight: '600',
                          color: status === 'active' ? '#2D3748' : statusCfg.color,
                          textAlign: 'right',
                        }}>{doctor.name}</Text>
                        {item.externalSupervisor && (
                          <Text style={{
                            fontSize: scale(9),
                            color: WORK_STATUS_CONFIG.trainee.color,
                            textAlign: 'right',
                            marginTop: scale(1),
                          }}>
                            تريني عند د. {item.externalSupervisor.name} ({item.externalSupervisor.groupName})
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()
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

      {/* Doctor Action Modal */}
      <Modal transparent visible={selectedDoctor !== null} animationType="fade" onRequestClose={() => { setSelectedDoctor(null); setDoctorActionMode('menu'); }}>
        <TouchableWithoutFeedback onPress={() => { setSelectedDoctor(null); setDoctorActionMode('menu'); }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableWithoutFeedback>
              <View style={{
                width: '85%',
                backgroundColor: 'rgba(30, 25, 50, 0.55)',
                borderRadius: scale(20),
                padding: scale(16),
                borderWidth: scale(2),
                borderColor: 'rgba(255,255,255,0.35)',
                shadowColor: 'rgba(255,255,255,0.4)',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: scale(15),
                elevation: 10,
                maxHeight: '70%',
              }}>
                {/* Doctor Name Header */}
                <View style={{
                  alignItems: 'center',
                  marginBottom: scale(10),
                  paddingBottom: scale(8),
                  borderBottomWidth: scale(1),
                  borderBottomColor: 'rgba(255,255,255,0.15)',
                }}>
                  <Text style={{
                    fontSize: scale(16),
                    fontWeight: '700',
                    color: '#FFFFFF',
                    textAlign: 'center',
                  }}>{selectedDoctor?.doctor.name}</Text>
                </View>

                {/* Main Menu */}
                {doctorActionMode === 'menu' && (
                  <View style={{ gap: scale(8) }}>
                    {/* إرجاع سريع للعمل — يظهر فقط لطبيب بإجازة، بنقرة واحدة */}
                    {selectedDoctor?.fromGroupId && selectedDoctor.doctor.workStatus === 'vacation' && (
                      <TouchableOpacity
                        onPress={() => handleUpdateStatus('active')}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: scale(10),
                          paddingVertical: scale(13),
                          paddingHorizontal: scale(14),
                          borderRadius: scale(12),
                          backgroundColor: 'rgba(16,185,129,0.15)',
                          borderWidth: scale(1),
                          borderColor: 'rgba(16,185,129,0.3)',
                        }}
                      >
                        <Ionicons name="arrow-undo-outline" size={scale(20)} color="#34D399" />
                        <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#FFFFFF' }}>إرجاع للعمل</Text>
                      </TouchableOpacity>
                    )}
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
                        backgroundColor: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <Ionicons name="swap-horizontal-outline" size={scale(20)} color="#A5B4FC" />
                      <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#FFFFFF' }}>Move to Group</Text>
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
                          backgroundColor: 'rgba(255,255,255,0.06)',
                        }}
                      >
                        <Ionicons name="flag-outline" size={scale(20)} color="#FCD34D" />
                        <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#FFFFFF' }}>Change Status</Text>
                      </TouchableOpacity>
                    )}
                    {selectedDoctor?.fromGroupId && selectedDoctor.doctor.workStatus === 'trainee' && (
                      <>
                        <TouchableOpacity
                          onPress={() => setDoctorActionMode('pick_supervisor')}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: scale(10),
                            paddingVertical: scale(13),
                            paddingHorizontal: scale(14),
                            borderRadius: scale(12),
                            backgroundColor: 'rgba(16,185,129,0.12)',
                            borderWidth: scale(1),
                            borderColor: 'rgba(16,185,129,0.25)',
                          }}
                        >
                          <Ionicons name="school-outline" size={scale(20)} color={WORK_STATUS_CONFIG.trainee.color} />
                          <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#FFFFFF' }}>Change Supervisor</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleUpdateStatus('active')}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: scale(10),
                            paddingVertical: scale(13),
                            paddingHorizontal: scale(14),
                            borderRadius: scale(12),
                            backgroundColor: 'rgba(255,255,255,0.06)',
                          }}
                        >
                          <Ionicons name="person-remove-outline" size={scale(20)} color="#F87171" />
                          <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#FFFFFF' }}>Remove Trainee</Text>
                        </TouchableOpacity>
                      </>
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
                      <Ionicons name="arrow-back" size={scale(18)} color="rgba(255,255,255,0.6)" />
                      <Text style={{ fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginLeft: scale(6) }}>Back</Text>
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
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            opacity: isCurrentGroup ? 0.4 : 1,
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
                            <Text style={{ fontSize: scale(10), color: 'rgba(255,255,255,0.4)' }}>Current</Text>
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
                          backgroundColor: 'rgba(255,255,255,0.06)',
                        }}
                      >
                        <View style={{
                          width: scale(8),
                          height: scale(8),
                          borderRadius: scale(4),
                          backgroundColor: '#9CA3AF',
                          marginRight: scale(10),
                        }} />
                        <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>Unassigned</Text>
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
                      <Ionicons name="arrow-back" size={scale(18)} color="rgba(255,255,255,0.6)" />
                      <Text style={{ fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginLeft: scale(6) }}>Back</Text>
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
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            opacity: isCurrent ? 0.4 : 1,
                          }}
                        >
                          <Ionicons name={cfg.icon as any} size={scale(18)} color={cfg.color} />
                          <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '600', color: cfg.color, marginLeft: scale(10) }}>
                            {cfg.label}
                          </Text>
                          {isCurrent && (
                            <Text style={{ fontSize: scale(10), color: 'rgba(255,255,255,0.4)' }}>Current</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Pick Supervisor (trainee flow) — أطباء نفس القروب فقط */}
                {doctorActionMode === 'pick_supervisor' && (
                  <View>
                    <TouchableOpacity
                      onPress={() => setDoctorActionMode('menu')}
                      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(12) }}
                    >
                      <Ionicons name="arrow-back" size={scale(18)} color="rgba(255,255,255,0.6)" />
                      <Text style={{ fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginLeft: scale(6) }}>Back</Text>
                    </TouchableOpacity>
                    <Text style={{
                      fontSize: scale(13),
                      fontWeight: '600',
                      color: 'rgba(255,255,255,0.85)',
                      marginBottom: scale(12),
                      textAlign: 'center',
                    }}>
                      اختر الطبيب المسؤول عن التريني
                    </Text>
                    {(() => {
                      // فقط الأطباء النشطين في نفس قروب التريني
                      const traineeGroup = groups.find(g => g.id === selectedDoctor?.fromGroupId);
                      const candidates = traineeGroup
                        ? traineeGroup.doctors.filter(d =>
                            d.workStatus !== 'trainee' &&
                            d.workStatus !== 'vacation' &&
                            d.id !== selectedDoctor?.doctor.id,
                          )
                        : [];
                      const currentSupervisorId = selectedDoctor?.doctor.supervisorDoctorId;
                      const accentColor = WORK_STATUS_CONFIG.trainee.color;

                      if (candidates.length === 0) {
                        return (
                          <Text style={{
                            fontSize: scale(12),
                            color: 'rgba(255,255,255,0.5)',
                            textAlign: 'center',
                            paddingVertical: scale(16),
                            fontStyle: 'italic',
                          }}>
                            لا يوجد أطباء متاحون في هذا القروب
                          </Text>
                        );
                      }
                      return candidates.map((doctor) => {
                        const isCurrent = doctor.id === currentSupervisorId;
                        return (
                          <TouchableOpacity
                            key={doctor.id}
                            onPress={() => handlePickSupervisor(doctor.id)}
                            activeOpacity={0.7}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: scale(14),
                              paddingHorizontal: scale(14),
                              borderRadius: scale(14),
                              marginBottom: scale(8),
                              backgroundColor: isCurrent
                                ? 'rgba(16,185,129,0.18)'
                                : 'rgba(255,255,255,0.08)',
                              borderWidth: scale(1),
                              borderColor: isCurrent
                                ? 'rgba(16,185,129,0.45)'
                                : 'rgba(255,255,255,0.06)',
                            }}
                          >
                            <Ionicons
                              name={isCurrent ? 'checkmark-circle' : 'person-circle-outline'}
                              size={scale(24)}
                              color={isCurrent ? accentColor : 'rgba(255,255,255,0.6)'}
                              style={{ marginRight: scale(12) }}
                            />
                            <Text style={{
                              flex: 1,
                              fontSize: scale(15),
                              fontWeight: '600',
                              color: '#FFFFFF',
                              textAlign: 'right',
                            }}>
                              {doctor.name}
                            </Text>
                            {isCurrent ? (
                              <Text style={{
                                fontSize: scale(10),
                                fontWeight: '700',
                                color: accentColor,
                                marginLeft: scale(6),
                              }}>
                                الحالي
                              </Text>
                            ) : (
                              <Ionicons
                                name="chevron-back"
                                size={scale(16)}
                                color="rgba(255,255,255,0.35)"
                              />
                            )}
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </View>
                )}

                {/* Cancel */}
                <TouchableOpacity
                  onPress={() => { setSelectedDoctor(null); setDoctorActionMode('menu'); }}
                  style={{ paddingVertical: scale(10), alignItems: 'center', marginTop: scale(10) }}
                >
                  <Text style={{ fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
