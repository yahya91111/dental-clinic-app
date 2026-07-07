import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, TouchableWithoutFeedback, ActivityIndicator, ScrollView, Animated, Easing } from 'react-native';
import { scale } from '../../lib/scale';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import {
  moveDoctorBetweenGroups,
  updateDoctorWorkStatus,
} from '../../lib/database';
import { TEMPLATE_NAMES, GROUP_TEMPLATES } from '../../lib/algorithms/groupTemplates';
import { useAuth } from '../../AuthContext';

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

// ─── لوحةُ الألوان الفاتحة (تطابقُ خلفيّةَ صفحةِ الجدول) ───
const INK = '#20233A';
const SOFT = '#4C5069';
const MUTED = '#7C8098';
const FAINT = '#A9ADC4';
const HAIR = 'rgba(35,32,74,0.08)';
const CARD_FILL = 'rgba(255,255,255,0.62)';
const CARD_BORDER = 'rgba(255,255,255,0.75)';
const AV_FILL = '#ECEFF6';

// ظِلٌّ ناعمٌ موحّدٌ (نفسُ الشكلِ على iOS و Android)
const softShadow = {
  shadowColor: '#3C3278',
  shadowOffset: { width: 0, height: scale(10) },
  shadowOpacity: 0.10,
  shadowRadius: scale(20),
  elevation: 3,
} as const;

// ─── أدواتُ ألوانٍ خالصة (بلا Date/Random) ───
const clampC = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const hexToRgba = (hex: string, a: number) => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const lighten = (hex: string, amt: number) => {
  const [r, g, b] = parseHex(hex);
  return `rgb(${clampC(r + (255 - r) * amt)},${clampC(g + (255 - g) * amt)},${clampC(b + (255 - b) * amt)})`;
};
const darken = (hex: string, amt: number) => {
  const [r, g, b] = parseHex(hex);
  return `rgb(${clampC(r * (1 - amt))},${clampC(g * (1 - amt))},${clampC(b * (1 - amt))})`;
};

export type DoctorWorkStatus = 'active' | 'vacation' | 'light_duty' | 'trainee';

const WORK_STATUS_CONFIG: Record<DoctorWorkStatus, { label: string; color: string; icon: string }> = {
  active:     { label: 'Active',     color: '#10B981', icon: 'checkmark-circle' },
  vacation:   { label: 'Vacation',   color: '#6B7280', icon: 'airplane' },
  light_duty: { label: 'Light Duty', color: '#F59E0B', icon: 'sunny' },
  trainee:    { label: 'Trainee',    color: '#14B8A6', icon: 'school' },
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

// ─── صورةُ الطبيبِ: أيقونةُ شخصٍ احترافيّة + حلقةُ الحالة + نقطةُ الحضور ───
function DoctorAvatar({ status, size }: { status: DoctorWorkStatus; size: number }) {
  const isLight = status === 'light_duty';
  const isTrainee = status === 'trainee';
  const isVac = status === 'vacation';
  const ring = isLight
    ? { borderWidth: scale(2), borderColor: hexToRgba('#F59E0B', 0.9) }
    : isTrainee
    ? { borderWidth: scale(2), borderColor: hexToRgba('#14B8A6', 0.85) }
    : { borderWidth: scale(1), borderColor: HAIR };
  const iconColor = isVac ? MUTED : isLight ? darken('#F59E0B', 0.18) : isTrainee ? darken('#14B8A6', 0.2) : '#7E86A2';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: AV_FILL,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isVac ? 0.6 : 1,
        ...ring,
      }}
    >
      <Ionicons name="person" size={size * 0.52} color={iconColor} />
      {status === 'active' && (
        <View
          style={{
            position: 'absolute',
            bottom: -scale(1),
            left: -scale(1),
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: '#10B981',
            borderWidth: scale(2),
            borderColor: '#F1F4FA',
          }}
        />
      )}
    </View>
  );
}

// ─── شارةُ الحالة (Light / Vacation / Trainee / Active) ───
function StatusChip({ status }: { status: DoctorWorkStatus }) {
  const cfg = WORK_STATUS_CONFIG[status];
  const c = darken(cfg.color, 0.12);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(5),
        paddingVertical: scale(4),
        paddingHorizontal: scale(9),
        borderRadius: scale(999),
        backgroundColor: hexToRgba(cfg.color, 0.13),
        borderWidth: scale(1),
        borderColor: hexToRgba(cfg.color, 0.32),
      }}
    >
      <Ionicons name={cfg.icon as any} size={scale(11)} color={c} />
      <Text style={{ fontSize: scale(10), fontWeight: '800', color: c }}>{cfg.label}</Text>
    </View>
  );
}

export function DoctorsTab({ clinicId }: DoctorsTabProps) {
  // صلاحيّة: القائدُ فقط (لا الطبيبُ العادي) يُدير القروبات — تغييرُ الحالة والنقلُ بينها.
  // للطبيبِ العادي الصفحةُ للاطّلاعِ فقط: لا تُفتَحُ ورقةُ الإجراءات، والدوالُّ محروسة.
  const { user } = useAuth();
  const isLeader = !!user && ['team_leader', 'coordinator', 'super_admin', 'manager'].includes(user.role);

  const [loading, setLoading] = useState(true);
  const [allDoctors, setAllDoctors] = useState<DoctorItem[]>([]);
  const [groups, setGroups] = useState<DoctorGroup[]>([]);

  // Doctor action modal (move + status + pick supervisor for trainee)
  const [selectedDoctor, setSelectedDoctor] = useState<{ doctor: DoctorItem; fromGroupId: string | null } | null>(null);
  const [doctorActionMode, setDoctorActionMode] = useState<'menu' | 'move' | 'status' | 'pick_supervisor'>('menu');

  // Unassigned section
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

  // حركةُ صعودِ الورقةِ السفليّة (native-driver)
  const sheetAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (selectedDoctor) {
      sheetAnim.setValue(0);
      Animated.timing(sheetAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [selectedDoctor, sheetAnim]);
  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [scale(360), 0] });

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

  const closeSheet = () => { setSelectedDoctor(null); setDoctorActionMode('menu'); };

  const moveDoctor = async (toGroupId: string | null) => {
    if (!selectedDoctor || !isLeader) return;
    const { doctor, fromGroupId } = selectedDoctor;
    await moveDoctorBetweenGroups(doctor.id, fromGroupId, toGroupId, doctor.name);
    closeSheet();
    await reload();
  };

  const handleUpdateStatus = async (status: DoctorWorkStatus) => {
    if (!selectedDoctor || !isLeader) return;
    // trainee يحتاج اختيار مدرّب أولاً
    if (status === 'trainee') {
      setDoctorActionMode('pick_supervisor');
      return;
    }
    const { doctor, fromGroupId } = selectedDoctor;
    if (fromGroupId) {
      await updateDoctorWorkStatus(fromGroupId, doctor.id, status, null);
    }
    closeSheet();
    await reload();
  };

  const handlePickSupervisor = async (supervisorDoctorId: string) => {
    if (!selectedDoctor || !isLeader) return;
    const { doctor, fromGroupId } = selectedDoctor;
    if (fromGroupId) {
      await updateDoctorWorkStatus(fromGroupId, doctor.id, 'trainee', supervisorDoctorId);
    }
    closeSheet();
    await reload();
  };

  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingTop: scale(60) }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={{ fontSize: scale(13), color: MUTED, marginTop: scale(10) }}>Loading...</Text>
      </View>
    );
  }

  // ─── ملخّصُ الفريق (Pulse) ───
  let tActive = 0, tLight = 0, tTrainee = 0, tVac = 0;
  groups.forEach(g => g.doctors.forEach(d => {
    const s = d.workStatus || 'active';
    if (s === 'vacation') tVac++;
    else if (s === 'light_duty') tLight++;
    else if (s === 'trainee') tTrainee++;
    else tActive++;
  }));
  const totalDocs = groups.reduce((n, g) => n + g.doctors.length, 0);

  const renderTally = (color: string, label: string, n: number) => (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: scale(7) }}>
      <View style={{ width: scale(8), height: scale(8), borderRadius: scale(4), backgroundColor: color }} />
      <Text style={{ fontSize: scale(11.5), fontWeight: '600', color: SOFT }}>{label}</Text>
      {/* الرقمُ ملاصقٌ للكلمةِ وبلونِ فئتِه = واضحٌ لأيِّ عنوانٍ ينتمي */}
      <Text style={{ fontSize: scale(14), fontWeight: '800', color: darken(color, 0.12), marginLeft: scale(3) }}>{n}</Text>
    </View>
  );

  const renderGroupCard = (group: DoctorGroup) => {
    const gc = GROUP_COLORS[group.colorIndex % GROUP_COLORS.length];
    const accent = gc.color;
    const isBoard = group.name.toLowerCase() === 'board';
    const badgeLabel = group.name.replace(/^Group\s+/i, '');

    // عنوانٌ فرعيٌّ حقيقيّ: ملخّصُ حالاتِ القروب
    let a = 0, l = 0, t = 0, v = 0;
    group.doctors.forEach(d => {
      const s = d.workStatus || 'active';
      if (s === 'vacation') v++;
      else if (s === 'light_duty') l++;
      else if (s === 'trainee') t++;
      else a++;
    });
    const activeCount = a + l; // التخفيفُ يُحسبُ ضمنَ الأكتف (طبيبٌ يعملُ بدوامٍ مخفّف)
    const parts: string[] = [];
    if (activeCount) parts.push(`${activeCount} active`);
    if (t) parts.push(`${t} trainee`);
    if (v) parts.push(`${v} off`);
    const subtitle = group.doctors.length === 0 ? 'No doctors yet' : parts.join('  ·  ');

    const stackDocs = group.doctors.slice(0, 3);
    const extra = group.doctors.length - 3;

    return (
      <View key={group.id} style={{ marginBottom: scale(14), borderRadius: scale(22), backgroundColor: CARD_FILL, borderWidth: scale(1), borderColor: CARD_BORDER, ...softShadow }}>
        <View style={{ borderRadius: scale(22), overflow: 'hidden' }}>
          {/* وهجُ القمّةِ للقروبِ المفتوح */}
          {group.isExpanded && (
            <LinearGradient
              pointerEvents="none"
              colors={[hexToRgba(accent, 0.13), 'transparent']}
              start={{ x: 0.8, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: scale(120) }}
            />
          )}
          {/* خطُّ القمّةِ الملوّن */}
          <View style={{ height: scale(3), marginHorizontal: scale(22), marginTop: scale(3), borderRadius: scale(2), overflow: 'hidden' }}>
            <LinearGradient colors={['transparent', accent, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </View>

          {/* رأسُ القروب */}
          <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(group.id)}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(12), paddingHorizontal: scale(16), paddingVertical: scale(14) }}>
              <LinearGradient
                colors={[accent, lighten(accent, 0.45)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: scale(46), height: scale(46), borderRadius: scale(15), alignItems: 'center', justifyContent: 'center' }}
              >
                {isBoard ? (
                  <Ionicons name="star" size={scale(22)} color="#2A2350" />
                ) : (
                  <Text style={{ fontSize: badgeLabel.length > 1 ? scale(12) : scale(18), fontWeight: '800', color: '#2A2350' }}>{badgeLabel}</Text>
                )}
              </LinearGradient>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: scale(18), fontWeight: '800', color: INK, textAlign: 'right', letterSpacing: -0.2 }}>{group.name}</Text>
                <Text style={{ fontSize: scale(11.5), fontWeight: '600', color: MUTED, textAlign: 'right', marginTop: scale(3) }}>{subtitle}</Text>
              </View>

              {!group.isExpanded && group.doctors.length > 0 && (
                <View style={{ flexDirection: 'row' }}>
                  {stackDocs.map((d, i) => (
                    <View key={d.id} style={{ width: scale(30), height: scale(30), borderRadius: scale(15), backgroundColor: '#EDF0F7', borderWidth: scale(2), borderColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center', marginLeft: i === 0 ? 0 : -scale(10) }}>
                      <Ionicons name="person" size={scale(15)} color="#9AA0B8" />
                    </View>
                  ))}
                  {extra > 0 && (
                    <View style={{ width: scale(30), height: scale(30), borderRadius: scale(15), backgroundColor: accent, borderWidth: scale(2), borderColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center', marginLeft: -scale(10) }}>
                      <Text style={{ fontSize: scale(10), fontWeight: '800', color: '#fff' }}>+{extra}</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={{ alignItems: 'center', minWidth: scale(30) }}>
                <Text style={{ fontSize: scale(30), fontWeight: '800', color: darken(accent, 0.1), lineHeight: scale(31) }}>{group.doctors.length}</Text>
                <Text style={{ fontSize: scale(8), fontWeight: '700', color: MUTED, letterSpacing: 1, marginTop: scale(3) }}>DOCS</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* قائمةُ الأطباء */}
          {group.isExpanded && (
            <View style={{ paddingHorizontal: scale(10), paddingBottom: scale(10) }}>
              {group.doctors.length === 0 ? (
                <Text style={{ fontSize: scale(12), color: MUTED, textAlign: 'center', paddingVertical: scale(12), fontStyle: 'italic' }}>No doctors in this group</Text>
              ) : (
                (() => {
                  // ─── ترتيب الأطباء: التريني يظهر تحت اسم مدرّبه ───
                  const onVacation = group.doctors.filter(d => d.workStatus === 'vacation');
                  const notOnVacation = group.doctors.filter(d => d.workStatus !== 'vacation');

                  const nonTrainees = notOnVacation.filter(d => d.workStatus !== 'trainee');
                  const trainees = notOnVacation.filter(d => d.workStatus === 'trainee');

                  const traineesBySupervisor = new Map<string, DoctorItem[]>();
                  for (const tr of trainees) {
                    if (tr.supervisorDoctorId) {
                      const arr = traineesBySupervisor.get(tr.supervisorDoctorId) || [];
                      arr.push(tr);
                      traineesBySupervisor.set(tr.supervisorDoctorId, arr);
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

                  for (const d of nonTrainees) {
                    items.push({ doctor: d, indented: false });
                    const sub = traineesBySupervisor.get(d.id) || [];
                    for (const tr of sub) items.push({ doctor: tr, indented: true });
                  }
                  for (const tr of trainees) {
                    const supId = tr.supervisorDoctorId;
                    const supInSameGroup = supId && nonTrainees.find(d => d.id === supId);
                    if (!supInSameGroup) {
                      const supInfo = supId ? allDoctorsById.get(supId) : undefined;
                      items.push({ doctor: tr, indented: false, externalSupervisor: supInfo });
                    }
                  }
                  for (const d of onVacation) items.push({ doctor: d, indented: false });

                  return items.map((item, idx) => {
                    const doctor = item.doctor;
                    const status = doctor.workStatus || 'active';
                    const superviseeCount = traineesBySupervisor.get(doctor.id)?.length || 0;
                    const supName = item.indented && doctor.supervisorDoctorId ? allDoctorsById.get(doctor.supervisorDoctorId)?.name : undefined;

                    // السطرُ الفرعيُّ تحتَ الاسم
                    let sub: React.ReactNode = null;
                    if (item.externalSupervisor) {
                      sub = (
                        <Text style={{ fontSize: scale(10.5), fontWeight: '700', color: darken('#14B8A6', 0.15), textAlign: 'right', marginTop: scale(2) }} numberOfLines={1}>
                          Under Dr. {item.externalSupervisor.name} · {item.externalSupervisor.groupName}
                        </Text>
                      );
                    } else if (item.indented) {
                      sub = (
                        <Text style={{ fontSize: scale(10.5), fontWeight: '700', color: darken('#14B8A6', 0.15), textAlign: 'right', marginTop: scale(2) }} numberOfLines={1}>
                          {supName ? `Under Dr. ${supName}` : 'Trainee'}
                        </Text>
                      );
                    } else if (status === 'active' && superviseeCount > 0) {
                      sub = (
                        <Text style={{ fontSize: scale(10.5), fontWeight: '600', color: MUTED, textAlign: 'right', marginTop: scale(2) }} numberOfLines={1}>
                          Supervisor · {superviseeCount} trainee{superviseeCount > 1 ? 's' : ''}
                        </Text>
                      );
                    }

                    return (
                      <TouchableOpacity
                        key={doctor.id}
                        activeOpacity={isLeader ? 0.7 : 1}
                        disabled={!isLeader}
                        onPress={() => { setDoctorActionMode('menu'); setSelectedDoctor({ doctor, fromGroupId: group.id }); }}
                        style={{
                          flexDirection: 'row-reverse',
                          alignItems: 'center',
                          gap: scale(12),
                          paddingVertical: scale(11),
                          paddingHorizontal: scale(6),
                          paddingRight: item.indented ? scale(30) : scale(6),
                          borderBottomWidth: idx < items.length - 1 ? scale(1) : 0,
                          borderBottomColor: HAIR,
                        }}
                      >
                        <DoctorAvatar status={status} size={item.indented ? scale(37) : scale(44)} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{ fontSize: scale(15.5), fontWeight: '700', color: status === 'vacation' ? MUTED : INK, textAlign: 'right', letterSpacing: -0.2 }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >{doctor.name}</Text>
                          {sub}
                        </View>
                        {status !== 'active' && <StatusChip status={status} />}
                      </TouchableOpacity>
                    );
                  });
                })()
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  // زرُّ الرجوعِ داخلَ الورقة
  const backButton = (
    <TouchableOpacity
      onPress={() => setDoctorActionMode('menu')}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginBottom: scale(14), alignSelf: 'flex-end' }}
    >
      <Ionicons name="arrow-back" size={scale(18)} color={MUTED} />
      <Text style={{ fontSize: scale(13), fontWeight: '600', color: MUTED }}>Back</Text>
    </TouchableOpacity>
  );

  // صفُّ إجراءٍ في القائمة الرئيسية
  const actionRow = (opts: { icon: string; color: string; label: string; sub?: string; onPress: () => void; danger?: boolean }) => (
    <TouchableOpacity
      onPress={opts.onPress}
      activeOpacity={0.7}
      style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(14), paddingVertical: scale(12), paddingHorizontal: scale(8), borderRadius: scale(16) }}
    >
      <View style={{ width: scale(42), height: scale(42), borderRadius: scale(14), backgroundColor: hexToRgba(opts.color, 0.14), alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={opts.icon as any} size={scale(20)} color={opts.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: scale(15), fontWeight: '700', color: opts.danger ? '#DE457A' : INK, textAlign: 'right' }}>{opts.label}</Text>
        {opts.sub ? <Text style={{ fontSize: scale(11.5), fontWeight: '600', color: MUTED, textAlign: 'right', marginTop: scale(2) }}>{opts.sub}</Text> : null}
      </View>
      <Ionicons name="chevron-back" size={scale(18)} color={FAINT} />
    </TouchableOpacity>
  );

  const currentGroupName = selectedDoctor?.fromGroupId
    ? (groups.find(g => g.id === selectedDoctor.fromGroupId)?.name || 'Group')
    : 'Unassigned';
  const currentSupName = selectedDoctor?.doctor.supervisorDoctorId
    ? groups.flatMap(g => g.doctors).find(d => d.id === selectedDoctor.doctor.supervisorDoctorId)?.name
    : undefined;

  return (
    <View>
      {/* ملخّصُ الفريق */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(14), paddingVertical: scale(14), paddingHorizontal: scale(16), borderRadius: scale(20), backgroundColor: CARD_FILL, borderWidth: scale(1), borderColor: CARD_BORDER, marginBottom: scale(14), ...softShadow }}>
        <View style={{ flex: 1, gap: scale(9) }}>
          <View style={{ flexDirection: 'row', gap: scale(14) }}>
            {renderTally('#10B981', 'Active', tActive)}
            {renderTally('#F59E0B', 'Light', tLight)}
          </View>
          <View style={{ flexDirection: 'row', gap: scale(14) }}>
            {renderTally('#14B8A6', 'Trainee', tTrainee)}
            {renderTally('#8A90A6', 'Vacation', tVac)}
          </View>
        </View>
        <View style={{ paddingLeft: scale(14), borderLeftWidth: scale(1), borderLeftColor: HAIR, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: scale(28), fontWeight: '800', color: INK, lineHeight: scale(30) }}>{totalDocs}</Text>
          <Text style={{ fontSize: scale(11), fontWeight: '600', color: MUTED }}>doctors · {groups.length} groups</Text>
        </View>
      </View>

      {/* Groups */}
      {groups.map(group => renderGroupCard(group))}

      {/* Unassigned */}
      <View style={{ marginBottom: scale(14), borderRadius: scale(22), backgroundColor: 'rgba(255,255,255,0.42)', borderWidth: scale(1), borderColor: 'rgba(255,255,255,0.6)' }}>
        <View style={{ borderRadius: scale(22), overflow: 'hidden' }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setUnassignedExpanded(!unassignedExpanded)}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(12), paddingHorizontal: scale(16), paddingVertical: scale(14) }}>
              <View style={{ width: scale(46), height: scale(46), borderRadius: scale(15), backgroundColor: '#E5E8F0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: scale(20), fontWeight: '800', color: '#9498B0' }}>?</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: scale(16), fontWeight: '800', color: SOFT, textAlign: 'right' }}>Unassigned</Text>
                <Text style={{ fontSize: scale(11.5), fontWeight: '600', color: MUTED, textAlign: 'right', marginTop: scale(3) }}>Tap a doctor to place in a group</Text>
              </View>
              <Text style={{ fontSize: scale(26), fontWeight: '800', color: '#9498B0' }}>{unassignedDoctors.length}</Text>
              <Ionicons name={unassignedExpanded ? 'chevron-up' : 'chevron-down'} size={scale(18)} color={MUTED} />
            </View>
          </TouchableOpacity>

          {unassignedExpanded && (
            <View style={{ paddingHorizontal: scale(10), paddingBottom: scale(10) }}>
              {unassignedDoctors.length === 0 ? (
                <Text style={{ fontSize: scale(12), color: MUTED, textAlign: 'center', paddingVertical: scale(12), fontStyle: 'italic' }}>All doctors are assigned</Text>
              ) : (
                unassignedDoctors.map((doctor, idx) => (
                  <TouchableOpacity
                    key={doctor.id}
                    activeOpacity={isLeader ? 0.7 : 1}
                    disabled={!isLeader}
                    onPress={() => { setDoctorActionMode('menu'); setSelectedDoctor({ doctor, fromGroupId: null }); }}
                    style={{
                      flexDirection: 'row-reverse',
                      alignItems: 'center',
                      gap: scale(12),
                      paddingVertical: scale(11),
                      paddingHorizontal: scale(6),
                      borderBottomWidth: idx < unassignedDoctors.length - 1 ? scale(1) : 0,
                      borderBottomColor: HAIR,
                    }}
                  >
                    <DoctorAvatar status="active" size={scale(44)} />
                    <Text style={{ flex: 1, fontSize: scale(15.5), fontWeight: '700', color: SOFT, textAlign: 'right' }} numberOfLines={1}>{doctor.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      </View>

      {/* ─── الورقةُ السفليّةُ (نافذةُ إجراءاتِ الطبيب) ─── */}
      <Modal transparent visible={selectedDoctor !== null} animationType="none" onRequestClose={closeSheet}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback onPress={closeSheet}>
            <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(40,42,70,0.30)', opacity: sheetAnim }} />
          </TouchableWithoutFeedback>

          <Animated.View
            style={{
              transform: [{ translateY: sheetTranslate }],
              backgroundColor: 'rgba(255,255,255,0.97)',
              borderTopLeftRadius: scale(30),
              borderTopRightRadius: scale(30),
              paddingTop: scale(10),
              paddingHorizontal: scale(20),
              paddingBottom: scale(28),
              maxHeight: '82%',
              shadowColor: '#3A3278',
              shadowOffset: { width: 0, height: -scale(8) },
              shadowOpacity: 0.16,
              shadowRadius: scale(24),
              elevation: 24,
            }}
          >
            <View style={{ width: scale(44), height: scale(5), borderRadius: scale(3), backgroundColor: 'rgba(35,32,74,0.18)', alignSelf: 'center', marginBottom: scale(14) }} />

            {selectedDoctor && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* رأسُ الورقة: الطبيب */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(14), paddingBottom: scale(16), borderBottomWidth: scale(1), borderBottomColor: HAIR, marginBottom: scale(14) }}>
                  <DoctorAvatar status={selectedDoctor.doctor.workStatus || 'active'} size={scale(56)} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: scale(19), fontWeight: '800', color: INK, textAlign: 'right' }} numberOfLines={1}>{selectedDoctor.doctor.name}</Text>
                    <View style={{ flexDirection: 'row-reverse', marginTop: scale(8) }}>
                      <StatusChip status={selectedDoctor.doctor.workStatus || 'active'} />
                    </View>
                  </View>
                </View>

                {/* القائمةُ الرئيسية */}
                {doctorActionMode === 'menu' && (
                  <View style={{ gap: scale(2) }}>
                    {selectedDoctor.fromGroupId && selectedDoctor.doctor.workStatus === 'vacation' &&
                      actionRow({ icon: 'arrow-undo-outline', color: '#10B981', label: 'Return to Work', sub: 'Back to active duty', onPress: () => handleUpdateStatus('active') })}
                    {actionRow({ icon: 'swap-horizontal-outline', color: '#3AA9D8', label: 'Move to Group', sub: currentGroupName, onPress: () => setDoctorActionMode('move') })}
                    {selectedDoctor.fromGroupId &&
                      actionRow({ icon: 'options-outline', color: '#8B5CF6', label: 'Change Status', sub: 'Active · Light · Vacation · Trainee', onPress: () => setDoctorActionMode('status') })}
                    {selectedDoctor.fromGroupId && selectedDoctor.doctor.workStatus === 'trainee' && (
                      <>
                        {actionRow({ icon: 'school-outline', color: '#14B8A6', label: 'Change Supervisor', sub: currentSupName ? `Dr. ${currentSupName}` : undefined, onPress: () => setDoctorActionMode('pick_supervisor') })}
                        {actionRow({ icon: 'person-remove-outline', color: '#F06292', label: 'Remove Trainee', sub: 'Returns as a full doctor', danger: true, onPress: () => handleUpdateStatus('active') })}
                      </>
                    )}
                  </View>
                )}

                {/* نقلٌ إلى قروب */}
                {doctorActionMode === 'move' && (
                  <View>
                    {backButton}
                    {groups.map(group => {
                      const gc = GROUP_COLORS[group.colorIndex % GROUP_COLORS.length];
                      const isCurrentGroup = group.id === selectedDoctor.fromGroupId;
                      return (
                        <TouchableOpacity
                          key={group.id}
                          disabled={isCurrentGroup}
                          onPress={() => moveDoctor(group.id)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            gap: scale(10),
                            paddingVertical: scale(12),
                            paddingHorizontal: scale(12),
                            borderRadius: scale(14),
                            marginBottom: scale(8),
                            backgroundColor: hexToRgba(gc.color, 0.09),
                            borderWidth: scale(1),
                            borderColor: hexToRgba(gc.color, 0.22),
                            opacity: isCurrentGroup ? 0.45 : 1,
                          }}
                        >
                          <View style={{ width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: gc.color }} />
                          <Text style={{ flex: 1, fontSize: scale(14), fontWeight: '700', color: darken(gc.color, 0.12), textAlign: 'right' }}>{group.name}</Text>
                          {isCurrentGroup && <Text style={{ fontSize: scale(10), fontWeight: '700', color: MUTED }}>Current</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    {selectedDoctor.fromGroupId !== null && (
                      <TouchableOpacity
                        onPress={() => moveDoctor(null)}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: scale(10), paddingVertical: scale(12), paddingHorizontal: scale(12), borderRadius: scale(14), marginBottom: scale(8), backgroundColor: 'rgba(138,144,166,0.1)', borderWidth: scale(1), borderColor: 'rgba(138,144,166,0.25)' }}
                      >
                        <View style={{ width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: '#9498B0' }} />
                        <Text style={{ flex: 1, fontSize: scale(14), fontWeight: '700', color: SOFT, textAlign: 'right' }}>Unassigned</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* تغييرُ الحالة */}
                {doctorActionMode === 'status' && (
                  <View>
                    {backButton}
                    {(Object.keys(WORK_STATUS_CONFIG) as DoctorWorkStatus[]).map(statusKey => {
                      const cfg = WORK_STATUS_CONFIG[statusKey];
                      const isCurrent = (selectedDoctor.doctor.workStatus || 'active') === statusKey;
                      return (
                        <TouchableOpacity
                          key={statusKey}
                          disabled={isCurrent}
                          onPress={() => handleUpdateStatus(statusKey)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row-reverse',
                            alignItems: 'center',
                            gap: scale(12),
                            paddingVertical: scale(12),
                            paddingHorizontal: scale(12),
                            borderRadius: scale(14),
                            marginBottom: scale(8),
                            backgroundColor: hexToRgba(cfg.color, 0.1),
                            borderWidth: scale(1),
                            borderColor: hexToRgba(cfg.color, 0.24),
                            opacity: isCurrent ? 0.45 : 1,
                          }}
                        >
                          <Ionicons name={cfg.icon as any} size={scale(18)} color={cfg.color} />
                          <Text style={{ flex: 1, fontSize: scale(14), fontWeight: '700', color: darken(cfg.color, 0.1), textAlign: 'right' }}>{cfg.label}</Text>
                          {isCurrent && <Text style={{ fontSize: scale(10), fontWeight: '700', color: MUTED }}>Current</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* اختيارُ المدرّبِ للتريني — أطباءُ نفسِ القروب فقط */}
                {doctorActionMode === 'pick_supervisor' && (
                  <View>
                    {backButton}
                    <Text style={{ fontSize: scale(13), fontWeight: '700', color: SOFT, marginBottom: scale(14), textAlign: 'center' }}>
                      Choose the trainee's supervisor
                    </Text>
                    {(() => {
                      const traineeGroup = groups.find(g => g.id === selectedDoctor.fromGroupId);
                      const candidates = traineeGroup
                        ? traineeGroup.doctors.filter(d =>
                            d.workStatus !== 'trainee' &&
                            d.workStatus !== 'vacation' &&
                            d.id !== selectedDoctor.doctor.id,
                          )
                        : [];
                      const currentSupervisorId = selectedDoctor.doctor.supervisorDoctorId;
                      const accentColor = WORK_STATUS_CONFIG.trainee.color;

                      if (candidates.length === 0) {
                        return (
                          <Text style={{ fontSize: scale(12), color: MUTED, textAlign: 'center', paddingVertical: scale(16), fontStyle: 'italic' }}>
                            No available doctors in this group
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
                              flexDirection: 'row-reverse',
                              alignItems: 'center',
                              gap: scale(12),
                              paddingVertical: scale(12),
                              paddingHorizontal: scale(12),
                              borderRadius: scale(14),
                              marginBottom: scale(8),
                              backgroundColor: isCurrent ? hexToRgba(accentColor, 0.14) : 'rgba(35,32,74,0.04)',
                              borderWidth: scale(1),
                              borderColor: isCurrent ? hexToRgba(accentColor, 0.4) : HAIR,
                            }}
                          >
                            <DoctorAvatar status={doctor.workStatus || 'active'} size={scale(40)} />
                            <Text style={{ flex: 1, fontSize: scale(15), fontWeight: '700', color: INK, textAlign: 'right' }} numberOfLines={1}>{doctor.name}</Text>
                            {isCurrent ? (
                              <Text style={{ fontSize: scale(10), fontWeight: '800', color: darken(accentColor, 0.12) }}>Current</Text>
                            ) : (
                              <Ionicons name="chevron-back" size={scale(16)} color={FAINT} />
                            )}
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </View>
                )}

                {/* إلغاء */}
                <TouchableOpacity onPress={closeSheet} style={{ paddingVertical: scale(12), alignItems: 'center', marginTop: scale(8) }}>
                  <Text style={{ fontSize: scale(13), fontWeight: '700', color: MUTED }}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
