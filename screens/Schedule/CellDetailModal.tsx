import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { scale } from '../../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScheduleSlot, DayOfWeek, DoctorStatus, DAYS, STATUS_CONFIG } from './types';
import { supabase } from '../../lib/supabase';
import { upsertScheduleSlot, deleteScheduleSlot } from '../../lib/database';
import { getTemplateByName, sortByTemplateOrder } from '../../lib/algorithms/groupTemplates';

interface CellDetailModalProps {
  visible: boolean;
  day: DayOfWeek | null;
  period: number | null;
  slots: ScheduleSlot[];
  clinicCount: number;
  clinicId: string | null;
  weekStart: string;
  userId?: string;
  /** القائد (قروب صلاحيّات القائد) يختارُ أيَّ طبيبٍ لخانةِ EX؛ الطبيبُ العاديّ يرى خيارات الحالة لنفسه مباشرةً. */
  isLeader?: boolean;
  userName?: string;
  onClose: () => void;
  onSaved: () => void;
  onChangePeriod?: (period: number) => void;
  /** غيابٌ يدويّ (طبيّة/تفرّغ/استئذان) من الجدول → يُعالَج كطلبٍ من الذكاء تمامًا:
   *  تغطية + موازنة عبر الأيّام + سؤال الإبلاغ في المحادثة. يُرجِع نجاحًا/خطأً للعرض. */
  onStatusRequest?: (req: {
    doctorId: string; doctorName: string; day: DayOfWeek;
    status: DoctorStatus; shift: 'morning' | 'evening';
  }) => Promise<{ ok: boolean; error?: string }>;
  /** إلغاءُ غيابٍ يدويًّا (X على كرت EX لطبيّة/تفرّغ/استئذان) → يمرّ بخطّ الإلغاء (استرداد
   *  جراحيّ + رفع تغطية + موازنة) كإلغاءٍ من الذكاء — لا حذفٌ خامٌّ يُخلّف يتامى. */
  onStatusCancel?: (req: {
    doctorId: string; doctorName: string; day: DayOfWeek; status: DoctorStatus;
  }) => Promise<{ ok: boolean; error?: string }>;
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

export function CellDetailModal({ visible, day, period, slots, clinicCount, clinicId, weekStart, userId, isLeader, userName, onClose, onSaved, onChangePeriod, onStatusRequest, onStatusCancel }: CellDetailModalProps) {
  const [selectingFor, setSelectingFor] = useState<{ role: 'clinic' | 'delegator'; clinicNumber: number } | null>(null);
  const [pickerGroups, setPickerGroups] = useState<PickerGroup[]>([]);
  const [unassignedDoctors, setUnassignedDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // EX mode: select doctor → select status
  const [exMode, setExMode] = useState<'list' | 'doctor' | 'status'>('list');
  const [exSelectedDoctor, setExSelectedDoctor] = useState<DoctorOption | null>(null);

  if (!day || period === null || period === undefined) return null;

  const dayInfo = DAYS.find(d => d.key === day);
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

      // Load groups with members — نُبقي فقط القوالب الـ4 (AGD/A/B/Board)
      // ونتجاهل أي قروبات قديمة في DB
      const { data: groupsData } = await supabase
        .from('doctor_groups')
        .select('*, doctor_group_members(*)')
        .eq('clinic_id', clinicId);

      const validGroups = (groupsData || []).filter((g: any) => getTemplateByName(g.name));
      const orderedGroups = sortByTemplateOrder(validGroups);

      const assignedIds = new Set<string>();
      const groups: PickerGroup[] = orderedGroups.map((g: any) => {
        const template = getTemplateByName(g.name)!;
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
        return { id: g.id, name: g.name, colorIndex: template.colorIndex, doctors, isExpanded: false };
      });

      setPickerGroups(groups);
      setUnassignedDoctors(allDocs.filter(d => !assignedIds.has(d.id)));
    } catch (e) {
      console.error('Error loading doctors:', e);
    }
    setLoadingDoctors(false);
  };

  // وَسْمُ «يومٍ عدّله القائد يدويًّا»: أيُّ تعديلٍ مباشرٍ على خانات هذا اليوم يَسِمُه
  // لحمايته من موازنة العدل التلقائيّة (تُستأذَن قبل تعديله — كرت «موازنةُ يومٍ عدّلتَه»).
  // تحسينٌ لا يُفشِل الحفظ: يفشل بصمتٍ إن غاب المستخدم/العيادة/اليوم.
  const markDayEdited = async () => {
    if (!clinicId || !day || !userId) return;
    try {
      const { markLeaderEditedDay } = await import('../../lib/algorithms/leader_marks');
      await markLeaderEditedDay({ clinicId, weekStart, day: day as any, byId: userId });
    } catch { /* الوسم تحسينٌ — لا يُفشِل التعديل */ }
  };

  const handleSelectDoctor = async (doctor: DoctorOption) => {
    if (!selectingFor || !clinicId) return;
    const currentClinicNum = selectingFor.clinicNumber;
    const currentRole = selectingFor.role;

    await upsertScheduleSlot(
      clinicId,
      weekStart,
      day,
      period,
      currentRole === 'delegator' ? 0 : currentClinicNum,
      doctor.id,
      doctor.name,
      currentRole,
      'active'
    );
    await markDayEdited();
    onSaved();

    // Auto-advance: clinic → next clinic → next period CL1 → done
    if (currentRole === 'clinic' && currentClinicNum < clinicCount) {
      setSelectingFor({ role: 'clinic', clinicNumber: currentClinicNum + 1 });
    } else if (currentRole === 'clinic' && period && period < 4 && onChangePeriod) {
      // Last clinic done, move to next period CL1
      onChangePeriod(period + 1);
      setSelectingFor({ role: 'clinic', clinicNumber: 1 });
    } else {
      setSelectingFor(null);
    }
  };

  const handleRemoveSlot = (slot: ScheduleSlot) => {
    // إلغاءُ غيابٍ (طبيّة/تفرّغ/استئذان) يمرّ بخطّ الإلغاء كاملًا (استرداد + رفع تغطية +
    // موازنة) كإلغاءٍ من الذكاء — لا حذفٌ خامٌّ. وضعُ عيادة/دليقيتر يبقى حذفًا يدويًّا.
    const PIPELINE: DoctorStatus[] = ['sick_leave', 'vacation', 'permission_start', 'permission_end'];
    const isAbsenceCancel = PIPELINE.includes(slot.status) && !!onStatusCancel && !!day;
    Alert.alert('Remove', `Remove ${slot.doctorName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          if (isAbsenceCancel) {
            // أغلِق فورًا — الاستردادُ والموازنة في الخلفيّة، والشاشةُ تنعش الجدولَ عند الانتهاء.
            onClose();
            void onStatusCancel!({ doctorId: slot.doctorId, doctorName: slot.doctorName, day: day!, status: slot.status });
            return;
          }
          await deleteScheduleSlot(slot.id);
          await markDayEdited();
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
    const assignedSlot = cellSlots.find(s => s.doctorId === doctor.id);
    const assignedInCell = !!assignedSlot;
    const assignedInDay = !assignedInCell && sameDaySlots.some(s => s.doctorId === doctor.id);
    const isUsed = assignedInCell || assignedInDay;
    return (
      <View
        key={doctor.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: scale(8),
          paddingHorizontal: scale(10),
          borderRadius: scale(6),
          marginBottom: scale(2),
          opacity: (assignedInDay && !assignedInCell) ? 0.4 : (doctor.workStatus === 'vacation' && !assignedInCell) ? 0.4 : 1,
        }}
      >
        {/* X button for assigned doctors */}
        {assignedInCell ? (
          <TouchableOpacity
            onPress={async () => {
              await deleteScheduleSlot(assignedSlot.id);
              await markDayEdited();
              onSaved();
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ marginRight: scale(6) }}
          >
            <Ionicons name="close-circle" size={scale(20)} color="#FF4444" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => handleSelectDoctor(doctor)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
            activeOpacity={0.7}
          >
            {doctor.workStatus && doctor.workStatus !== 'active' && (
              <Ionicons
                name={doctor.workStatus === 'vacation' ? 'airplane' : 'sunny'}
                size={scale(10)}
                color={doctor.workStatus === 'vacation' ? 'rgba(255,255,255,0.5)' : '#F59E0B'}
                style={{ marginRight: scale(6) }}
              />
            )}
            <Text style={{
              flex: 1,
              fontSize: scale(13),
              fontWeight: '600',
              color: isUsed ? 'rgba(255,255,255,0.35)' : (doctor.workStatus === 'vacation') ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)',
              textAlign: 'right',
            }}>{doctor.name}</Text>
          </TouchableOpacity>
        )}
        {assignedInCell && (
          <TouchableOpacity
            onPress={() => handleSelectDoctor(doctor)}
            style={{ flex: 1 }}
            activeOpacity={0.7}
          >
            <Text style={{
              fontSize: scale(13),
              fontWeight: '600',
              color: 'rgba(255,255,255,0.35)',
              textAlign: 'right',
            }}>{doctor.name}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Doctor picker view
  if (selectingFor) {
    const label = selectingFor.role === 'delegator' ? 'Delegator' : `CL${selectingFor.clinicNumber}`;
    const totalDoctors = pickerGroups.reduce((sum, g) => sum + g.doctors.length, 0) + unassignedDoctors.length;
    return (
      <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setSelectingFor(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <View style={{
              width: '85%',
              maxHeight: '75%',
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
            }}
          >
            {/* Header */}
            <View style={{
              alignItems: 'center',
              marginBottom: scale(10),
              paddingBottom: scale(8),
              borderBottomWidth: scale(1),
              borderBottomColor: 'rgba(255,255,255,0.15)',
            }}>
              <TouchableOpacity
                onPress={() => setSelectingFor(null)}
                style={{ position: 'absolute', left: 0, top: 0, padding: scale(4) }}
              >
                <Ionicons name="arrow-back" size={scale(20)} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              {/* Clinic navigation: RTL arrows + label */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                <TouchableOpacity
                  onPress={() => {
                    if (!selectingFor || selectingFor.role !== 'clinic') return;
                    if (selectingFor.clinicNumber < clinicCount) setSelectingFor({ role: 'clinic', clinicNumber: selectingFor.clinicNumber + 1 });
                  }}
                  disabled={!selectingFor || selectingFor.role !== 'clinic' || selectingFor.clinicNumber >= clinicCount}
                  style={{ padding: scale(2), opacity: selectingFor?.role === 'clinic' && selectingFor.clinicNumber < clinicCount ? 1 : 0.2 }}
                >
                  <Ionicons name="chevron-back" size={scale(20)} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <Text style={{ fontSize: scale(17), fontWeight: '800', color: '#E8DEFF' }}>
                  {label}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!selectingFor || selectingFor.role !== 'clinic') return;
                    if (selectingFor.clinicNumber > 1) setSelectingFor({ role: 'clinic', clinicNumber: selectingFor.clinicNumber - 1 });
                  }}
                  disabled={!selectingFor || selectingFor.role !== 'clinic' || selectingFor.clinicNumber <= 1}
                  style={{ padding: scale(2), opacity: selectingFor?.role === 'clinic' && selectingFor.clinicNumber > 1 ? 1 : 0.2 }}
                >
                  <Ionicons name="chevron-forward" size={scale(20)} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>

              {/* Period navigation: RTL arrows + text + dots */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: scale(6), gap: scale(6) }}>
                <TouchableOpacity
                  onPress={() => period && period < 4 && onChangePeriod?.(period + 1)}
                  disabled={!period || period >= 4}
                  style={{ padding: scale(2), opacity: period && period < 4 ? 1 : 0.2 }}
                >
                  <Ionicons name="chevron-back" size={scale(14)} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
                <Text style={{ fontSize: scale(12), fontWeight: '700', color: 'rgba(200,180,255,0.7)' }}>
                  Period {period}
                </Text>
                <TouchableOpacity
                  onPress={() => period && period > 1 && onChangePeriod?.(period - 1)}
                  disabled={!period || period <= 1}
                  style={{ padding: scale(2), opacity: period && period > 1 ? 1 : 0.2 }}
                >
                  <Ionicons name="chevron-forward" size={scale(14)} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
              {/* Period dots - RTL (P1 on right) */}
              <View style={{ flexDirection: 'row', marginTop: scale(4), gap: scale(5) }}>
                {[4, 3, 2, 1].map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => onChangePeriod?.(p)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <View style={{
                      width: p === period ? scale(14) : scale(7),
                      height: scale(6),
                      borderRadius: scale(3),
                      backgroundColor: p === period ? 'rgba(232,222,255,0.8)' : 'rgba(255,255,255,0.2)',
                    }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>


            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingDoctors ? (
                <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingVertical: scale(20) }}>Loading...</Text>
              ) : totalDoctors === 0 ? (
                <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingVertical: scale(20) }}>No doctors found</Text>
              ) : (
                <>
                  {/* Groups */}
                  {pickerGroups.map(group => {
                    const gc = GROUP_COLORS[group.colorIndex % GROUP_COLORS.length];
                    return (
                      <View key={group.id} style={{
                        marginBottom: scale(8),
                        borderRadius: scale(10),
                        borderWidth: scale(1),
                        borderColor: 'rgba(255,255,255,0.15)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                      }}>
                        {/* Group header */}
                        <TouchableOpacity
                          onPress={() => togglePickerGroup(group.id)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: scale(10),
                            paddingHorizontal: scale(12),
                          }}
                        >
                          <View style={{
                            width: scale(8),
                            height: scale(8),
                            borderRadius: scale(4),
                            backgroundColor: gc.color,
                            marginRight: scale(8),
                          }} />
                          <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>
                            {group.name}
                          </Text>
                          <Text style={{ fontSize: scale(11), fontWeight: '600', color: 'rgba(255,255,255,0.4)', marginRight: scale(6) }}>
                            {group.doctors.length}
                          </Text>
                          <Ionicons
                            name={group.isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={scale(14)}
                            color="rgba(255,255,255,0.4)"
                          />
                        </TouchableOpacity>

                        {/* Group doctors */}
                        {group.isExpanded && (
                          <View style={{
                            borderTopWidth: scale(1),
                            borderTopColor: 'rgba(255,255,255,0.1)',
                            paddingVertical: scale(4),
                            paddingHorizontal: scale(6),
                          }}>
                            {group.doctors.map(doc => renderDoctorRow(doc))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // EX statuses for picker
  const EX_STATUSES: { key: DoctorStatus; label: string; shortLabel: string; color: string }[] = [
    { key: 'sick_leave', label: 'Sick Leave', shortLabel: 'SL', color: '#DC2626' },
    { key: 'permission_start', label: 'Permission (Start)', shortLabel: 'PS', color: '#16A34A' },
    { key: 'permission_end', label: 'Permission (End)', shortLabel: 'PE', color: '#16A34A' },
    { key: 'vacation', label: 'Vacation', shortLabel: 'VC', color: '#EAB308' },
    { key: 'extra', label: 'Extra', shortLabel: 'EX', color: '#7C3AED' },
  ];

  // EX side: period -1 = right (clinicNumber 1), period -2 = left (clinicNumber 2)
  const isExMode = period !== null && period <= 0;
  const exClinicNumber = period === -1 ? 1 : period === -2 ? 2 : 1;
  // الطبيبُ العاديّ في خانةِ EX: خياراتُ الحالةِ مباشرةً لنفسِه (بلا قائمةِ أطباء). القائدُ يبقى كما هو.
  const isDoctorEx = isExMode && !isLeader && !!userId;
  const resolvedExDoctor: DoctorOption | null = isDoctorEx
    ? { id: userId!, name: userName || slots.find((s) => s.doctorId === userId)?.doctorName || 'Doctor' }
    : exSelectedDoctor;
  const handleExSelectStatus = async (status: DoctorStatus) => {
    if (!resolvedExDoctor || !clinicId || !day) return;

    // طبيّة/تفرّغ/استئذان: حدثُ غيابٍ يُعالَج بنفس خطّ الذكاء (تغطية + موازنة عبر الأيّام +
    // سؤال الإبلاغ في المحادثة) — لا كتابةٌ مباشرة ولا وسمُ يوم (حدثٌ لا ترتيبٌ يدويّ).
    // هذه الحالات لا تُكتب أبدًا كتابةً مباشرة: إن غاب خطّ المعالجة نعتذر ولا نكتب
    // (كي لا يتسرّب غيابٌ بلا تغطية/قيدِ ماضٍ).
    const PIPELINE: DoctorStatus[] = ['sick_leave', 'vacation', 'permission_start', 'permission_end'];
    if (PIPELINE.includes(status)) {
      if (!onStatusRequest) { Alert.alert('تعذّر', 'تعذّر تسجيل الحالة الآن.'); return; }
      const shift = exClinicNumber === 2 ? 'evening' : 'morning';
      const doc = resolvedExDoctor;
      // أغلِق المودال فورًا — التغطيةُ والموازنة تجريان في الخلفيّة، وتنعش الشاشةُ الجدولَ
      // عند الانتهاء وتعرض أيّ خطأ. (الخطّ ثقيلٌ بطبيعته فلا نُجمّد الواجهة بانتظاره.)
      setExSelectedDoctor(null);
      setExMode('list');
      onClose();
      void onStatusRequest({ doctorId: doc.id, doctorName: doc.name, day, status, shift });
      return;
    }

    // الاحتياط (extra) = ترتيبُ قائدٍ يدويّ: كتابةٌ مباشرة + وسمُ اليوم (حماية العدل — Card B).
    // يُخرَج الطبيبُ من عيادته ثمّ يُكتب صفُّ الاحتياط.
    if (status === 'extra') {
      const doctorDaySlots = slots.filter(
        s => s.day === day && s.period > 0 && s.doctorId === resolvedExDoctor.id
      );
      for (const slot of doctorDaySlots) {
        await deleteScheduleSlot(slot.id);
      }
    }

    await upsertScheduleSlot(
      clinicId, weekStart, day, 0, exClinicNumber,
      resolvedExDoctor.id, resolvedExDoctor.name,
      'clinic', status
    );
    setExSelectedDoctor(null);
    setExMode('list');
    await markDayEdited();
    onSaved();
  };

  // EX view
  if (isExMode) {
    const exSlots = slots.filter(s => s.day === day && s.period === 0 && s.clinicNumber === exClinicNumber);

    // Status selection: للطبيبِ العاديّ مباشرةً (isDoctorEx)، أو للقائدِ بعد اختيارِ طبيب.
    const goBackFromStatus = () => { if (isDoctorEx) { onClose(); } else { setExMode('doctor'); setExSelectedDoctor(null); } };
    if (resolvedExDoctor && (isDoctorEx || exMode === 'status')) {
      return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={goBackFromStatus}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <View style={{
              width: '85%',
              maxHeight: '75%',
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
            }}>
              {/* Header */}
              <View style={{
                alignItems: 'center',
                marginBottom: scale(14),
                paddingBottom: scale(10),
                borderBottomWidth: scale(1),
                borderBottomColor: 'rgba(255,255,255,0.15)',
              }}>
                <TouchableOpacity
                  onPress={goBackFromStatus}
                  style={{ position: 'absolute', left: 0, top: 0, padding: scale(4) }}
                >
                  <Ionicons name="arrow-back" size={scale(20)} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
                <Text style={{ fontSize: scale(15), fontWeight: '800', color: '#E8DEFF' }}>
                  {resolvedExDoctor.name}
                </Text>
                <Text style={{ fontSize: scale(11), fontWeight: '600', color: 'rgba(200,180,255,0.6)', marginTop: scale(2) }}>
                  Select Status
                </Text>
              </View>

              {/* Status options */}
              <View style={{ gap: scale(6) }}>
                {EX_STATUSES.map(st => (
                  <TouchableOpacity
                    key={st.key}
                    onPress={() => handleExSelectStatus(st.key)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: scale(8),
                      overflow: 'hidden',
                      borderWidth: scale(1),
                      borderColor: 'rgba(255,255,255,0.15)',
                      backgroundColor: 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <Text style={{
                      flex: 1,
                      fontSize: scale(13),
                      fontWeight: '600',
                      color: 'rgba(255,255,255,0.85)',
                      paddingVertical: scale(10),
                      paddingHorizontal: scale(12),
                      textAlign: 'right',
                    }}>{st.label}</Text>
                    <LinearGradient
                      colors={[st.color + '90', st.color + '50', st.color + '50', st.color + '90']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{
                        paddingHorizontal: scale(10),
                        paddingVertical: scale(10),
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderLeftWidth: scale(1),
                        borderLeftColor: 'rgba(255,255,255,0.3)',
                      }}
                    >
                      <Text style={{ fontSize: scale(10), fontWeight: '800', color: '#FFFFFF' }}>{st.shortLabel}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      );
    }

    // Doctor selection for EX
    if (exMode === 'doctor') {
      return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setExMode('list')}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <View style={{
              width: '85%',
              maxHeight: '75%',
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
            }}>
              {/* Header */}
              <View style={{
                alignItems: 'center',
                marginBottom: scale(12),
                paddingBottom: scale(10),
                borderBottomWidth: scale(1),
                borderBottomColor: 'rgba(255,255,255,0.15)',
              }}>
                <TouchableOpacity
                  onPress={() => setExMode('list')}
                  style={{ position: 'absolute', left: 0, top: 0, padding: scale(4) }}
                >
                  <Ionicons name="arrow-back" size={scale(20)} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
                <Text style={{ fontSize: scale(17), fontWeight: '800', color: '#E8DEFF' }}>
                  {dayInfo?.label}
                </Text>
                <Text style={{ fontSize: scale(11), fontWeight: '600', color: 'rgba(200,180,255,0.6)', marginTop: scale(2) }}>
                  Select Doctor
                </Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {loadingDoctors ? (
                  <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingVertical: scale(20) }}>Loading...</Text>
                ) : pickerGroups.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingVertical: scale(20) }}>No doctors found</Text>
                ) : (
                  pickerGroups.map(group => {
                    const gc = GROUP_COLORS[group.colorIndex % GROUP_COLORS.length];
                    return (
                      <View key={group.id} style={{
                        marginBottom: scale(8),
                        borderRadius: scale(10),
                        borderWidth: scale(1),
                        borderColor: 'rgba(255,255,255,0.15)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                      }}>
                        <TouchableOpacity
                          onPress={() => togglePickerGroup(group.id)}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: scale(10),
                            paddingHorizontal: scale(12),
                          }}
                        >
                          <View style={{
                            width: scale(8), height: scale(8), borderRadius: scale(4),
                            backgroundColor: gc.color, marginRight: scale(8),
                          }} />
                          <Text style={{ flex: 1, fontSize: scale(13), fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>
                            {group.name}
                          </Text>
                          <Text style={{ fontSize: scale(11), fontWeight: '600', color: 'rgba(255,255,255,0.4)', marginRight: scale(6) }}>
                            {group.doctors.length}
                          </Text>
                          <Ionicons name={group.isExpanded ? 'chevron-up' : 'chevron-down'} size={scale(14)} color="rgba(255,255,255,0.4)" />
                        </TouchableOpacity>
                        {group.isExpanded && (
                          <View style={{ borderTopWidth: scale(1), borderTopColor: 'rgba(255,255,255,0.1)', paddingVertical: scale(4), paddingHorizontal: scale(6) }}>
                            {group.doctors.map(doc => (
                              <TouchableOpacity
                                key={doc.id}
                                onPress={() => { setExSelectedDoctor(doc); setExMode('status'); }}
                                activeOpacity={0.7}
                                style={{ paddingVertical: scale(8), paddingHorizontal: scale(10), borderRadius: scale(6), marginBottom: scale(2) }}
                              >
                                <Text style={{ fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.9)', textAlign: 'right' }}>{doc.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      );
    }

    // EX list view (default)
    return (
      <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <TouchableOpacity activeOpacity={1} style={{
            width: '85%',
            maxHeight: '75%',
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
          }}>
            {/* Header */}
            <View style={{
              alignItems: 'center',
              marginBottom: scale(14),
              paddingBottom: scale(10),
              borderBottomWidth: scale(1),
              borderBottomColor: 'rgba(255,255,255,0.15)',
            }}>
              <Text style={{ fontSize: scale(20), fontWeight: '800', color: '#E8DEFF', letterSpacing: 0.5 }}>
                {dayInfo?.label}
              </Text>
              <Text style={{ fontSize: scale(14), fontWeight: '700', color: 'rgba(200,180,255,0.7)', marginTop: scale(2) }}>
                EX
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Existing EX slots as mini cards */}
              {exSlots.length > 0 ? exSlots.map(slot => {
                const config = STATUS_CONFIG[slot.status];
                if (!config) return null; // حالةٌ غير معروفة (صفٌّ داخليّ تسرّب) — لا تعرضها ولا تُعطِب
                return (
                  <View key={slot.id} style={{
                    flexDirection: 'row',
                    alignSelf: 'stretch',
                    marginBottom: scale(6),
                    borderRadius: scale(8),
                    overflow: 'hidden',
                    borderWidth: scale(1),
                    borderColor: 'rgba(255,255,255,0.3)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  }}>
                    <TouchableOpacity
                      onPress={() => handleRemoveSlot(slot)}
                      style={{ justifyContent: 'center', paddingHorizontal: scale(8) }}
                    >
                      <Ionicons name="close-circle" size={scale(16)} color="#FF4444" />
                    </TouchableOpacity>
                    <Text style={{
                      flex: 1,
                      fontSize: scale(12),
                      fontWeight: '700',
                      color: config.color,
                      paddingVertical: scale(8),
                      paddingHorizontal: scale(4),
                      textAlign: 'right',
                    }} numberOfLines={1}>{slot.doctorName}</Text>
                    <LinearGradient
                      colors={[config.color + '90', config.color + '50', config.color + '50', config.color + '90']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{
                        paddingHorizontal: scale(8),
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderLeftWidth: scale(1),
                        borderLeftColor: 'rgba(255,255,255,0.3)',
                      }}
                    >
                      <Text style={{ fontSize: scale(8), fontWeight: '800', color: '#FFFFFF' }}>{config.shortLabel}</Text>
                    </LinearGradient>
                  </View>
                );
              }) : (
                <Text style={{ fontSize: scale(12), color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingVertical: scale(10) }}>
                  No entries
                </Text>
              )}
            </ScrollView>

            {/* Add button */}
            <TouchableOpacity
              onPress={() => { setExMode('doctor'); loadDoctors(); }}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: scale(10),
                marginTop: scale(8),
                borderRadius: scale(10),
                borderWidth: scale(1),
                borderColor: 'rgba(255,255,255,0.2)',
                borderStyle: 'dashed',
                gap: scale(6),
              }}
            >
              <Ionicons name="add-circle-outline" size={scale(18)} color="rgba(255,255,255,0.5)" />
              <Text style={{ fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>Add</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  // Main cell detail view
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <TouchableOpacity activeOpacity={1} style={{
          width: '85%',
          maxHeight: '75%',
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
        }}>
          {/* Header - centered */}
          <View style={{
            alignItems: 'center',
            marginBottom: scale(14),
            paddingBottom: scale(10),
            borderBottomWidth: scale(1),
            borderBottomColor: 'rgba(255,255,255,0.15)',
          }}>
            <Text style={{
              fontSize: scale(20),
              fontWeight: '800',
              color: '#E8DEFF',
              letterSpacing: 0.5,
            }}>
              {dayInfo?.label}
            </Text>
            <Text style={{
              fontSize: scale(14),
              fontWeight: '700',
              color: 'rgba(200, 180, 255, 0.7)',
              marginTop: scale(2),
            }}>
              Period {period}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Clinic Slots - matching grid card style */}
            {Array.from({ length: clinicCount }, (_, i) => {
              const clinicNum = i + 1;
              const matchingSlots = clinicSlots.filter(s => s.clinicNumber === clinicNum);
              return (
                <View key={`c${clinicNum}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(6) }}>
                  {/* Card (زرُّ التبديلِ أُزيل — التبديلُ صار من درجِ الإعداداتِ «Swap») */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => openDoctorPicker('clinic', clinicNum)}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      borderRadius: scale(8),
                      overflow: 'hidden',
                      borderWidth: scale(1),
                      borderColor: 'rgba(255,255,255,0.6)',
                      backgroundColor: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <View style={{ flex: 1, paddingVertical: scale(6), paddingHorizontal: scale(8), justifyContent: 'center' }}>
                      {matchingSlots.length > 0 ? matchingSlots.map(slot => (
                        <View key={slot.id} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: scale(1) }}>
                          <TouchableOpacity
                            onPress={() => handleRemoveSlot(slot)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="close-circle" size={scale(14)} color="rgba(239,68,68,0.6)" />
                          </TouchableOpacity>
                          <Text style={{
                            flex: 1,
                            fontSize: scale(12),
                            fontWeight: '700',
                            color: '#3B5998',
                            textAlign: 'right',
                            marginLeft: scale(4),
                          }} numberOfLines={1}>{slot.doctorName}</Text>
                        </View>
                      )) : (
                        <Text style={{ fontSize: scale(11), fontWeight: '600', color: '#CBD5E0', textAlign: 'right' }}>—</Text>
                      )}
                    </View>
                    <LinearGradient
                      colors={['rgba(71,118,186,0.45)', 'rgba(120,160,210,0.3)', 'rgba(120,160,210,0.3)', 'rgba(71,118,186,0.45)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{
                        paddingHorizontal: scale(8),
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderLeftWidth: scale(1),
                        borderLeftColor: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      <Text style={{
                        fontSize: scale(9),
                        fontWeight: '800',
                        color: '#FFFFFF',
                        textShadowColor: 'rgba(50, 80, 140, 0.5)',
                        textShadowOffset: { width: 0, height: scale(0.5) },
                        textShadowRadius: scale(1),
                      }}>CL{clinicNum}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Divider */}
            <View style={{ height: scale(1), backgroundColor: 'rgba(255,255,255,0.5)', marginVertical: scale(4) }} />

            {/* Delegator Slot - matching grid card style (زرُّ التبديلِ أُزيل) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(6) }}>
              {/* Card */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  if (!delegatorSlot) openDoctorPicker('delegator', 0);
                }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  borderRadius: scale(8),
                  overflow: 'hidden',
                  borderWidth: scale(1),
                  borderColor: 'rgba(255,255,255,0.6)',
                  backgroundColor: 'rgba(255,255,255,0.3)',
                }}
              >
                <View style={{ flex: 1, paddingVertical: scale(6), paddingHorizontal: scale(8), justifyContent: 'center' }}>
                  {delegatorSlot ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => handleRemoveSlot(delegatorSlot)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close-circle" size={scale(14)} color="rgba(239,68,68,0.6)" />
                      </TouchableOpacity>
                      <Text style={{
                        flex: 1,
                        fontSize: scale(12),
                        fontWeight: '700',
                        color: '#6B4C9A',
                        textAlign: 'right',
                        marginLeft: scale(4),
                      }} numberOfLines={1}>{delegatorSlot.doctorName}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: scale(11), fontWeight: '600', color: '#CBD5E0', textAlign: 'right' }}>—</Text>
                  )}
                </View>
                <LinearGradient
                  colors={['rgba(124,108,180,0.4)', 'rgba(167,155,203,0.25)', 'rgba(167,155,203,0.25)', 'rgba(124,108,180,0.4)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={{
                    paddingHorizontal: scale(8),
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderLeftWidth: scale(1),
                    borderLeftColor: 'rgba(255,255,255,0.5)',
                  }}
                >
                  <Text style={{
                    fontSize: scale(9),
                    fontWeight: '800',
                    color: '#FFFFFF',
                    textShadowColor: 'rgba(88, 74, 126, 0.5)',
                    textShadowOffset: { width: 0, height: scale(0.5) },
                    textShadowRadius: scale(1),
                  }}>DLG</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
