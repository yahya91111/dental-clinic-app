import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Alert, StyleSheet } from 'react-native';
import { scale } from '../lib/scale';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { updateReferralStatus, createScalingRecord, getScalingRecords, getGeneralNotes, createGeneralNote, deleteGeneralNote, getPreviousTreatments, revertEditingRecord, deleteScalingRecord, PreviousTreatment } from '../lib/database';

// ═══════════════════════════════════════════════════════════════
// Expanded Patient Header Component - iPhone Style Grid
// Shows 6 icons in a grid, clicking opens full content view
// ═══════════════════════════════════════════════════════════════

interface DentalSummary {
  caries_count: number;
  caries_teeth: number[];
  rct_needed_count: number;
  rct_needed_teeth: number[];
  extraction_needed_count: number;
  extraction_needed_teeth: number[];
  broken_teeth_count: number;
  broken_teeth: number[];
  filling_done_count: number;
  filling_done_teeth: number[];
  total_issues: number;
}

interface PatientReferral {
  id: string;
  department?: string;
  referral_type?: string;
  tooth_number?: string | null;
  reason?: string;
  notes?: string;
  doctor_name?: string;
  created_at: string;
  timestamp?: string;
  status: string;
}

interface ToothNote {
  tooth_number: number | string;
  note: string;
  doctor_name?: string;
  timestamp?: string;
  created_at: string;
}

interface PatientConsent {
  consent_type: string;
  signed: boolean;
  signed_at?: string;
}

interface Patient {
  id: string;
  permanent_patient_id?: string;
  file_number?: string;
  name: string;
}

interface ExpandedPatientHeaderProps {
  patient: Patient;
  // Dental Data
  dentalSummary: DentalSummary | null;
  loadingDentalData: boolean;
  // Referrals
  patientReferrals: PatientReferral[];
  loadingReferrals: boolean;
  onLoadReferrals: () => void;
  // Notes
  toothNotes: ToothNote[];
  loadingToothNotes: boolean;
  onLoadToothNotes: () => void;
  // Hygiene
  lastFluorideDate?: Date;
  lastScalingDate?: Date;
  onFluoridePress: (patientId: string) => void;
  onScalingPress: (patientId: string) => void;
  // Consent
  patientConsents: PatientConsent[];
  onConsentPress: () => void;
  // Chart
  onOpenDentalChart: () => void;
  // Collapse
  onTogglePermanentExpansion: (patient: Patient) => void;
  // Tooth Edit
  onToothEditPress: (patientId: string, toothNumber: number) => void;
  // Patient Name Press
  onPatientNamePress?: (patientId: string, fileNumber: string) => void;
  // Doctor Name
  doctorName?: string;
  // General Notes
  generalNotes?: any[];
  onLoadGeneralNotes?: () => void;
  onAddGeneralNote?: (note: string) => void;
  onDeleteGeneralNote?: (noteId: string) => void;
  // Read-only mode (for archive)
  readOnly?: boolean;
  // Embedded in the patient card: the card already shows who this is, so the
  // name/file bar is dropped and the tiles are drawn as the card's own app icons.
  embedded?: boolean;
  // The card's header chevron is the only back button, so it needs a way in:
  // this holds a function that closes an open section and says whether it did.
  backRef?: React.MutableRefObject<(() => boolean) | null>;
  // undoing a chart treatment repaints the tooth, so the chart data the card
  // is holding is stale the moment it happens
  onDentalChanged?: () => void;
}

type SectionType = 'dental' | 'referrals' | 'hygiene' | 'notes' | 'consent' | 'general_notes' | null;

// past treatments: five rows on screen, the rest under the thumb
const PREV_VISIBLE = 5;
const PREV_ROW_H = scale(58);

// referrals: three cards on screen. Their height varies with the reason line, so
// the board is capped by height rather than by counting rows.
const REF_VISIBLE = 3;
const REF_BOARD_H = scale(348);

// tooth notes: three tooth-groups on screen. A group is as tall as what was
// written on that tooth, so this board is capped by height too.
const NOTE_VISIBLE = 3;
const NOTE_BOARD_H = scale(330);
const NOTE_TONE = '#6A4BC4';

// general notes: the composer is the section's head, so the list gets the rest
const GN_VISIBLE = 3;
const GN_BOARD_H = scale(300);
const GN_TONE = '#4360D0';

// A history is a chronology, so it is drawn as one: a spine with a node per entry.
// The node carries the tooth, and its ring says what was done to it — so the shape
// of a patient's past is legible before a single word is read.
const FAMILY: { test: RegExp; tone: string; glyph: string }[] = [
  // referral first: "Referral · Oral Surgery" must not be read as surgery
  { test: /referral/i, tone: '#EA580C', glyph: 'arrow-redo' },
  { test: /scal|clean|hygien/i, tone: '#0E9F8C', glyph: 'sparkles' },
  // the same thing keeps the same colour as in the findings chart below
  { test: /extract|removal/i, tone: '#7C8798', glyph: 'remove-circle-outline' },
  { test: /rct|root|pulp|endo/i, tone: '#7C4A2D', glyph: 'git-commit-outline' },
  { test: /fill|compos|amalgam|restor/i, tone: '#4360D0', glyph: 'layers-outline' },
  { test: /crown|bridge|cement/i, tone: '#E9A00C', glyph: 'diamond-outline' },
];
const familyOf = (t?: string) => FAMILY.find((f) => f.test.test(t || '')) || { tone: '#5A7079', glyph: 'ellipse-outline' };

// Each finding gets its own hue, so the five of them are told apart by colour
// before they are told apart by name.
const FINDING_TONE: Record<string, string> = {
  caries: '#E23B42',
  rct: '#7C4A2D',
  extraction: '#7C8798',
  broken: '#C2410C',
  filling: '#4360D0',
};
const FINDING_GLYPH: Record<string, string> = {
  caries: 'alert-circle',
  rct: 'git-commit',
  extraction: 'close-circle',
  broken: 'flash',
  filling: 'layers',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "3 JUN" — the year only shows when it is not this one, because that is the
// only time it carries information
const stampOf = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const tail = y === new Date().getFullYear() ? '' : ` ${String(y).slice(2)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${tail}`;
};

export function ExpandedPatientHeader({
  patient,
  dentalSummary,
  loadingDentalData,
  patientReferrals,
  loadingReferrals,
  onLoadReferrals,
  toothNotes,
  loadingToothNotes,
  onLoadToothNotes,
  lastFluorideDate,
  lastScalingDate,
  onFluoridePress,
  onScalingPress,
  patientConsents,
  onConsentPress,
  onOpenDentalChart,
  onTogglePermanentExpansion,
  onToothEditPress,
  onPatientNamePress,
  doctorName,
  generalNotes = [],
  onLoadGeneralNotes,
  onAddGeneralNote,
  onDeleteGeneralNote,
  readOnly = false,
  embedded = false,
  backRef,
  onDentalChanged,
}: ExpandedPatientHeaderProps) {
  const [expandedSection, setExpandedSection] = useState<SectionType>(null);
  const [seenNotesCount, setSeenNotesCount] = useState<number | null>(null);
  const [seenGeneralNotesCount, setSeenGeneralNotesCount] = useState<number | null>(null);
  const [newGeneralNoteText, setNewGeneralNoteText] = useState('');
  // past treatments — folded away like the card's DETAILS, and fetched on first ask
  const [showPrev, setShowPrev] = useState(false);
  const [prev, setPrev] = useState<any[] | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [txRow, setTxRow] = useState<string | null>(null);   // open finding in the treatment console
  const [localGeneralNotes, setLocalGeneralNotes] = useState<any[]>([]);

  // Load general notes internally if not provided via props
  const loadLocalGeneralNotes = useCallback(async () => {
    if (!patient.permanent_patient_id) return;
    const { data } = await getGeneralNotes(patient.permanent_patient_id);
    if (data) setLocalGeneralNotes(data);
  }, [patient.permanent_patient_id]);

  useEffect(() => {
    if (!generalNotes || generalNotes.length === 0) {
      loadLocalGeneralNotes();
    }
  }, [loadLocalGeneralNotes]);

  const effectiveGeneralNotes = (generalNotes && generalNotes.length > 0) ? generalNotes : localGeneralNotes;

  // Load seen notes count from AsyncStorage
  const storageKey = `notes_seen_${patient.permanent_patient_id || patient.id}`;
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((val) => {
      setSeenNotesCount(val ? parseInt(val, 10) : 0);
    });
  }, [storageKey]);

  // Notes badge logic: red if new unread notes, transparent if all read
  const notesCount = toothNotes?.length || 0;
  const hasUnreadNotes = seenNotesCount === null ? false : notesCount > seenNotesCount;

  // General Notes badge logic
  const generalNotesStorageKey = `gnotes_seen_${patient.permanent_patient_id || patient.id}`;
  useEffect(() => {
    AsyncStorage.getItem(generalNotesStorageKey).then((val) => {
      setSeenGeneralNotesCount(val ? parseInt(val, 10) : 0);
    });
  }, [generalNotesStorageKey]);
  const generalNotesCount = effectiveGeneralNotes?.length || 0;
  const hasUnreadGeneralNotes = seenGeneralNotesCount === null ? false : generalNotesCount > seenGeneralNotesCount;

  // Consent state
  const consentSigned = patientConsents?.length > 0 && patientConsents.every(c => c.signed);

  // Local scaling date (updates immediately after saving)
  const [localScalingDate, setLocalScalingDate] = useState<Date | undefined>(undefined);
  const effectiveScalingDate = localScalingDate || lastScalingDate;

  // Total treatment issues count
  const totalTreatmentCount = dentalSummary
    ? dentalSummary.caries_count + dentalSummary.rct_needed_count + dentalSummary.extraction_needed_count + dentalSummary.broken_teeth_count + dentalSummary.filling_done_count
    : 0;

  // Scaling status for icon color
  const monthsSinceScalingForIcon = effectiveScalingDate
    ? Math.floor((new Date().getTime() - effectiveScalingDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;
  const hygieneIconColor = monthsSinceScalingForIcon === null ? '#9CA3AF'
    : monthsSinceScalingForIcon > 6 ? '#DC2626'
    : monthsSinceScalingForIcon >= 4 ? '#D97706'
    : '#059669';

  // Icon configurations - unified white bg with distinct icon colors
  const iconBg = 'rgba(255, 255, 255, 0.6)';
  const icons = [
    { id: 'dental', label: 'Treatment', icon: 'tooth', iconType: 'material', color: '#2563EB', bgColor: iconBg, badge: totalTreatmentCount },
    { id: 'referrals', label: 'Referrals', icon: 'arrow-redo', iconType: 'ionicon', color: '#2563EB', bgColor: iconBg, badge: patientReferrals?.filter(r => r.status !== 'given').length || 0 },
    { id: 'hygiene', label: 'Hygiene', icon: 'sparkles', iconType: 'ionicon', color: hygieneIconColor, bgColor: iconBg, badge: 0 },
    { id: 'notes', label: 'Notes', icon: 'document-text', iconType: 'ionicon', color: '#2563EB', bgColor: iconBg, badge: notesCount, badgeColor: hasUnreadNotes ? '#EF4444' : 'rgba(107, 114, 128, 0.6)' },
    { id: 'consent', label: 'Consent', icon: consentSigned ? 'checkmark-circle' : 'close-circle', iconType: 'ionicon', color: consentSigned ? '#059669' : '#9CA3AF', bgColor: iconBg, badge: 0 },
    { id: 'general_notes', label: 'G. Notes', icon: 'document-text', iconType: 'ionicon', color: '#2563EB', bgColor: iconBg, badge: generalNotesCount, badgeColor: hasUnreadGeneralNotes ? '#EF4444' : 'rgba(107, 114, 128, 0.6)' },
  ];

  const handleIconPress = (iconId: string) => {
    if (iconId === 'general_notes') {
      onLoadGeneralNotes?.();
      setSeenGeneralNotesCount(generalNotesCount);
      AsyncStorage.setItem(generalNotesStorageKey, generalNotesCount.toString());
    }
    if (iconId === 'consent') {
      if (!consentSigned) {
        onConsentPress();
      }
      return;
    }
    if (iconId === 'referrals') {
      onLoadReferrals();
    }
    if (iconId === 'notes') {
      onLoadToothNotes();
      // Mark notes as seen - persist to AsyncStorage
      setSeenNotesCount(notesCount);
      AsyncStorage.setItem(storageKey, notesCount.toString());
    }
    setExpandedSection(iconId as SectionType);
  };

  const renderIcon = (item: typeof icons[0]) => {
    if (item.iconType === 'material') {
      return <MaterialCommunityIcons name={item.icon as any} size={scale(32)} color={item.color} />;
    }
    return <Ionicons name={item.icon as any} size={scale(32)} color={item.color} />;
  };

  // ── embedded: the card's own app-icon tiles ──
  // Same object as the tiles in the card's action row: a rounded gradient face
  // with a diagonal sheen, its own coloured shadow, and the label underneath.
  // One blue for everything the record simply holds. Only the two tiles that
  // report a STATE are allowed their own colour: hygiene, and consent.
  const TILE_BLUE: [string, string] = ['#6D9BFF', '#4360D0'];
  const TILE_G: Record<string, [string, string]> = {
    dental: TILE_BLUE,
    referrals: TILE_BLUE,
    notes: TILE_BLUE,
    general_notes: TILE_BLUE,
    chart: TILE_BLUE,
    // grey none · green fresh · amber past the half-way mark · red past six months
    hygiene:
      hygieneIconColor === '#DC2626' ? ['#FF6E72', '#E23B42']
      : hygieneIconColor === '#D97706' ? ['#FFC64D', '#E9A00C']
      : hygieneIconColor === '#059669' ? ['#4ADE80', '#0E9F6E']
      : ['#B4BECC', '#7C8798'],
    consent: consentSigned ? ['#4ADE80', '#0E9F6E'] : ['#B4BECC', '#7C8798'],
  };
  const SHEEN: [string, string, string] = ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'];

  const loadPrev = async () => {
    if (!patient.permanent_patient_id) return;
    setLoadingPrev(true);
    const { data } = await getPreviousTreatments(patient.permanent_patient_id);
    setPrev(data || []);
    setLoadingPrev(false);
  };

  const togglePrev = async () => {
    const opening = !showPrev;
    setShowPrev(opening);
    if (opening && prev === null) loadPrev();
  };

  // Taking a treatment back. A chart entry also puts its tooth back to what
  // it was — a tooth that was never filled must not keep reading as filled.
  // The statistic follows on its own: the event is bound to the record.
  const undoEntry = (v: PreviousTreatment) => {
    const what =
      v.kind === 'chart' ? `${v.treatment}${v.tooth != null ? ` on tooth ${v.tooth}` : ''} will be removed, and the tooth put back to what it was.`
      : v.kind === 'scaling' ? 'This scaling record will be removed.'
      : 'This referral goes back to pending.';

    Alert.alert('Undo this treatment', what, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          const res =
            v.kind === 'chart' ? await revertEditingRecord(v.raw_id)
            : v.kind === 'scaling' ? await deleteScalingRecord(v.raw_id)
            : await updateReferralStatus(v.raw_id, 'not_given');

          if (res.error) { Alert.alert('Cannot undo', res.error.message); return; }

          loadPrev();
          if (v.kind === 'referral') onLoadReferrals();
          if (v.kind === 'chart') onDentalChanged?.();
        },
      },
    ]);
  };

  const renderEmbeddedGrid = () => {
    // the chart lived in the header bar that the card doesn't need — it becomes a tile
    const tiles = [...icons, { id: 'chart', label: 'Chart', icon: 'open-outline', iconType: 'ionicon', color: '#fff', bgColor: '', badge: 0 }];
    return (
      <View>
        <View style={eg.wrap}>
        {tiles.map((item) => {
          const g = TILE_G[item.id] || TILE_G.dental;
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.75}
              style={eg.cell}
              onPress={(e) => {
                e.stopPropagation();
                if (item.id === 'chart') { onOpenDentalChart(); return; }
                handleIconPress(item.id);
              }}
              onLongPress={(e) => {
                e.stopPropagation();
                if (item.id === 'consent' && consentSigned) onConsentPress();
              }}
              delayLongPress={2000}
            >
              <View style={[eg.shadow, { shadowColor: g[1], backgroundColor: g[1] }]}>
                <LinearGradient colors={g} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={eg.face}>
                  <LinearGradient
                    colors={SHEEN}
                    locations={[0, 0.46, 0.64]}
                    start={{ x: 0.12, y: 0 }}
                    end={{ x: 0.82, y: 1 }}
                    style={eg.sheen}
                  />
                  {item.iconType === 'material'
                    ? <MaterialCommunityIcons name={item.icon as any} size={scale(24)} color="#fff" style={eg.glyph} />
                    : <Ionicons name={item.icon as any} size={scale(23)} color="#fff" style={eg.glyph} />}
                </LinearGradient>
                {item.badge > 0 && (
                  <View style={[eg.badge, { backgroundColor: (item as any).badgeColor || '#EF4444' }]}>
                    <Text style={eg.badgeTxt}>{item.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={eg.label} numberOfLines={1}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
        </View>

        {/* what was done to this patient before today */}
        <View style={eg.prevHr} />
        <TouchableOpacity activeOpacity={0.7} style={eg.prevHead} onPress={togglePrev}>
          <Text style={eg.prevLabel}>PREVIOUS TREATMENTS</Text>
          {prev !== null && prev.length > 0 && <Text style={eg.prevCount}>{prev.length}</Text>}
          <Ionicons name={showPrev ? 'chevron-up' : 'chevron-down'} size={scale(15)} color="#5A7079" />
        </TouchableOpacity>

        {showPrev && (
          <View style={eg.prevBody}>
            {loadingPrev && <ActivityIndicator size="small" color="#4360D0" style={{ paddingVertical: scale(14) }} />}
            {!loadingPrev && prev?.length === 0 && (
              <Text style={eg.prevEmpty}>No treatment recorded before today</Text>
            )}
            {!loadingPrev && !!prev?.length && (
              // five entries tall at most — a long history scrolls inside itself
              // rather than stretching the card down the page
              <ScrollView
                style={prev.length > PREV_VISIBLE ? { maxHeight: PREV_ROW_H * PREV_VISIBLE } : undefined}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {prev.map((v, i) => {
                  const fam = familyOf(v.treatment);
                  const d = new Date(v.timestamp);
                  const thisYear = d.getFullYear() === new Date().getFullYear();
                  const first = i === 0, last = i === prev.length - 1;
                  return (
                    <View key={v.id} style={sp.entry}>
                      {/* the spine, drawn behind the node and stopping at both ends */}
                      <View style={[sp.rail, first && sp.railTop, last && sp.railEnd]} />
                      <View style={[sp.node, { borderColor: fam.tone + '66' }]}>
                        {v.tooth != null
                          ? <Text style={[sp.nodeTxt, { color: fam.tone }]}>{v.tooth}</Text>
                          : <Ionicons name={fam.glyph as any} size={scale(15)} color={fam.tone} />}
                      </View>

                      <View style={sp.body}>
                        <Text style={sp.tx} numberOfLines={1}>{v.treatment}</Text>
                        <View style={sp.metaRow}>
                          {first && <View style={[sp.latest, { backgroundColor: fam.tone }]}><Text style={sp.latestTxt}>LATEST</Text></View>}
                          {!!v.doctor_name && <Text style={sp.by} numberOfLines={1}>Dr. {v.doctor_name}</Text>}
                        </View>
                      </View>

                      <View style={sp.when}>
                        <Text style={sp.day}>{d.getDate()}</Text>
                        <Text style={sp.mon}>{thisYear ? MONTHS[d.getMonth()] : String(d.getFullYear())}</Text>
                      </View>

                      {/* a wrong tooth is taken back from where you see it.
                          Only on your own work — another doctor's record is
                          not yours to remove. */}
                      {!readOnly && v.doctor_name === doctorName && (
                        <TouchableOpacity
                          onPress={() => undoEntry(v)}
                          style={sp.undo}
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Ionicons name="arrow-undo-outline" size={scale(13)} color="#C4565C" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    );
  };

  // Render Icons Grid
  const renderIconsGrid = () => embedded ? renderEmbeddedGrid() : (
    <View style={{ padding: scale(16) }}>
      {/* Header Bar: Close + Name + File Number */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: scale(16),
        padding: scale(12),
        marginBottom: scale(20),
        borderWidth: scale(2),
        borderColor: 'rgba(255, 255, 255, 0.35)',
      }}>
        {/* Close Button */}
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            width: scale(36),
            height: scale(36),
            borderRadius: scale(12),
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={(e) => {
            e.stopPropagation();
            onTogglePermanentExpansion(patient);
          }}
        >
          <Ionicons name="chevron-up" size={scale(22)} color="#1E3A8A" />
        </TouchableOpacity>

        {/* Name + File Number */}
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          onPress={(e) => {
            e.stopPropagation();
            if (patient.permanent_patient_id && patient.file_number && onPatientNamePress) {
              onPatientNamePress(patient.permanent_patient_id, patient.file_number);
            }
          }}
        >
          <Text style={{ fontSize: scale(20), fontWeight: '800', color: '#1E3A8A' }}>{patient.name}</Text>
          {patient.file_number && (
            <Text style={{ fontSize: scale(13), color: '#3B5998', marginTop: scale(2), fontWeight: '600' }}>
              File: {patient.file_number}
            </Text>
          )}
        </TouchableOpacity>

        {/* Open Chart Arrow */}
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            width: scale(36),
            height: scale(36),
            borderRadius: scale(12),
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={(e) => {
            e.stopPropagation();
            onOpenDentalChart();
          }}
        >
          <Ionicons name="open-outline" size={scale(20)} color="#1E3A8A" />
        </TouchableOpacity>
      </View>

      {/* Icons Grid - 3 columns */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: scale(16) }}>
        {icons.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={{
              width: scale(90),
              height: scale(90),
              backgroundColor: item.bgColor,
              borderRadius: scale(20),
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: scale(2),
              borderColor: 'rgba(255, 255, 255, 0.6)',
            }}
            onPress={(e) => {
              e.stopPropagation();
              handleIconPress(item.id);
            }}
            onLongPress={(e) => {
              e.stopPropagation();
              if (item.id === 'consent' && consentSigned) {
                onConsentPress();
              }
            }}
            delayLongPress={2000}
          >
            {/* Badge */}
            {item.badge > 0 && (
              <View style={{
                position: 'absolute',
                top: scale(-10),
                left: scale(-10),
                backgroundColor: (item as any).badgeColor || '#EF4444',
                borderRadius: scale(14),
                minWidth: scale(28),
                height: scale(28),
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: scale(7),
                borderWidth: scale(2.5),
                borderColor: '#FFFFFF',
                zIndex: 10,
              }}>
                <Text style={{ fontSize: scale(14), fontWeight: '800', color: '#FFFFFF' }}>
                  {item.badge}
                </Text>
              </View>
            )}
            {renderIcon(item)}
            <Text style={{ fontSize: scale(12), color: '#1E3A8A', marginTop: scale(8), fontWeight: '700' }}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Render Treatment Content
  const treatmentSections = dentalSummary ? [
    { key: 'caries', name: 'Caries', count: dentalSummary.caries_count, teeth: dentalSummary.caries_teeth },
    { key: 'rct', name: 'RCT Needed', count: dentalSummary.rct_needed_count, teeth: dentalSummary.rct_needed_teeth },
    { key: 'extraction', name: 'Extraction Needed', count: dentalSummary.extraction_needed_count, teeth: dentalSummary.extraction_needed_teeth },
    { key: 'broken', name: 'Broken Tooth', count: dentalSummary.broken_teeth_count, teeth: dentalSummary.broken_teeth },
    { key: 'filling', name: 'Need Permanent Filling', count: dentalSummary.filling_done_count, teeth: dentalSummary.filling_done_teeth },
  ].filter(s => s.count > 0) : [];

  // embedded: the same console the card uses outside — a row per finding, and the
  // teeth appear only when that row is asked for
  const renderTreatmentConsole = () => {
    if (loadingDentalData) return <ActivityIndicator size="small" color="#4360D0" style={{ paddingVertical: scale(20) }} />;
    if (!dentalSummary) return <Text style={eg.prevEmpty}>No dental data available</Text>;
    if (treatmentSections.length === 0) {
      return (
        <View style={eg.clearWrap}>
          <Ionicons name="checkmark-circle" size={scale(30)} color="#0E9F6E" />
          <Text style={eg.clearTxt}>No treatment needed</Text>
        </View>
      );
    }
    const total = treatmentSections.reduce((n, s) => n + s.count, 0);
    const teethTouched = new Set(treatmentSections.flatMap((s) => s.teeth)).size;
    const peak = Math.max(...treatmentSections.map((s) => s.count), 1);

    return (
      <View>
        {/* the whole picture first, the parts after */}
        <View style={tc.summary}>
          <Text style={tc.sumBig}>{total}</Text>
          <View style={{ flex: 1 }}>
            <Text style={tc.sumLead}>FINDINGS</Text>
            <Text style={tc.sumSub}>across {teethTouched} {teethTouched === 1 ? 'tooth' : 'teeth'}</Text>
          </View>
        </View>

        {treatmentSections.map((section) => {
          const openRow = txRow === section.key;
          const tone = FINDING_TONE[section.key] || '#5A7079';
          return (
            <View key={section.key} style={[tc.card, { borderLeftColor: tone }]}>
              <TouchableOpacity activeOpacity={0.75} style={tc.head} onPress={() => setTxRow(openRow ? null : section.key)}>
                <View style={[tc.glyph, { backgroundColor: tone + '1F' }]}>
                  <Ionicons name={(FINDING_GLYPH[section.key] || 'ellipse') as any} size={scale(16)} color={tone} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={tc.name} numberOfLines={1}>{section.name}</Text>
                  <View style={tc.track}>
                    <View style={[tc.fill, { width: `${Math.round((section.count / peak) * 100)}%`, backgroundColor: tone }]} />
                  </View>
                </View>
                <Text style={[tc.count, { color: tone }]}>{section.count}</Text>
                <Ionicons name={openRow ? 'chevron-up' : 'chevron-down'} size={scale(15)} color="#8CA0A8" />
              </TouchableOpacity>

              {openRow && (
                <View style={tc.teeth}>
                  {section.teeth.map((tooth) => (
                    <TouchableOpacity
                      key={tooth}
                      activeOpacity={0.8}
                      style={[tc.tooth, { borderColor: tone + '59' }]}
                      onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                    >
                      <Text style={[tc.toothTxt, { color: tone }]}>{tooth}</Text>
                      <View style={[tc.toothBar, { backgroundColor: tone }]} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderTreatmentContent = () => embedded ? renderTreatmentConsole() : (
    <ScrollView style={{ flex: 1, padding: scale(16) }}>
      {loadingDentalData ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : treatmentSections.length > 0 ? (
        <View style={{ gap: scale(14) }}>
          {treatmentSections.map((section) => (
            <View key={section.key} style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: scale(14),
              padding: scale(13),
              borderWidth: scale(1.5),
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                marginHorizontal: scale(-13), marginTop: scale(-13), marginBottom: scale(10),
                paddingHorizontal: scale(13), paddingVertical: scale(10),
                borderTopLeftRadius: scale(12), borderTopRightRadius: scale(12),
                borderBottomWidth: scale(1), borderBottomColor: 'rgba(37, 99, 235, 0.2)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                  <MaterialCommunityIcons name="tooth" size={scale(18)} color="#2563EB" />
                  <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#2563EB' }}>
                    {section.name}
                  </Text>
                </View>
                <View style={{ backgroundColor: '#2563EB', paddingHorizontal: scale(10), paddingVertical: scale(3), borderRadius: scale(10) }}>
                  <Text style={{ fontSize: scale(13), fontWeight: '800', color: '#FFFFFF' }}>{section.count}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(7) }}>
                {section.teeth.map((tooth) => (
                  <TouchableOpacity
                    key={tooth}
                    style={{
                      backgroundColor: 'rgba(250, 204, 21, 0.15)',
                      paddingHorizontal: scale(12),
                      paddingVertical: scale(6),
                      borderRadius: scale(8),
                      borderWidth: scale(1.5),
                      borderColor: 'rgba(250, 204, 21, 0.4)',
                    }}
                    onPress={() => patient.permanent_patient_id && onToothEditPress(patient.permanent_patient_id, tooth)}
                  >
                    <Text style={{ color: '#1E3A8A', fontWeight: '700', fontSize: scale(13) }}>{tooth}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : dentalSummary ? (
        <View style={{ alignItems: 'center', padding: scale(24) }}>
          <Ionicons name="checkmark-circle" size={scale(48)} color="#10B981" />
          <Text style={{ color: '#FFFFFF', marginTop: scale(12), fontSize: scale(16), fontWeight: '600' }}>No treatment needed</Text>
        </View>
      ) : (
        <Text style={{ color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center' }}>No dental data available</Text>
      )}
    </ScrollView>
  );

  // Render Referrals Content
  // ── embedded: a dispatch board ──
  // A referral is either still owed to another department or already handed over,
  // and that is the only thing anyone scans this list for. So the two states are
  // drawn as different objects: the pending ones stand up in their own colour and
  // carry the action; the delivered ones lie flat, stamped and quiet.
  const toggleReferral = async (id: string, isGiven: boolean) => {
    const { error } = await updateReferralStatus(id, isGiven ? 'not_given' : 'given');
    if (error) { Alert.alert('Error', 'Failed to update status'); return; }
    onLoadReferrals();
    // handing one over adds it to what was done — refresh that list if it was read
    if (prev !== null) loadPrev();
  };

  const renderReferralsEmbedded = () => {
    if (loadingReferrals) return <ActivityIndicator size="small" color="#EA580C" style={{ paddingVertical: scale(20) }} />;
    if (!patientReferrals.length) {
      return (
        <View style={eg.clearWrap}>
          <Ionicons name="checkmark-circle" size={scale(30)} color="#0E9F6E" />
          <Text style={eg.clearTxt}>Nothing referred out</Text>
        </View>
      );
    }

    const pending = patientReferrals.filter((r) => r.status !== 'given');
    const done = patientReferrals.filter((r) => r.status === 'given');
    const stamp = (iso?: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    };

    const card = (referral: PatientReferral, isGiven: boolean) => {
      const tone = isGiven ? '#0E9F6E' : '#EA580C';
      const dept = referral.department || referral.referral_type || 'Unknown';
      const why = referral.notes || referral.reason;
      return (
        <View key={referral.id} style={[rf.card, { borderLeftColor: tone }, isGiven && rf.cardDone]}>
          <View style={rf.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[rf.dept, { color: tone }]} numberOfLines={1}>{dept}</Text>
              <Text style={rf.meta} numberOfLines={1}>
                {referral.doctor_name ? `Dr. ${referral.doctor_name} · ` : ''}{stamp(referral.timestamp || referral.created_at)}
              </Text>
            </View>
            {!!referral.tooth_number && (
              <View style={[rf.tooth, { borderColor: tone + '59' }]}>
                <Text style={[rf.toothTxt, { color: tone }]}>{referral.tooth_number}</Text>
                <View style={[rf.toothBar, { backgroundColor: tone }]} />
              </View>
            )}
          </View>

          {!!why && (
            <View style={rf.why}>
              <View style={[rf.whyRail, { backgroundColor: tone + '4D' }]} />
              <Text style={rf.whyTxt}>{why}</Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => toggleReferral(referral.id, isGiven)}
            style={[rf.act, isGiven ? rf.actDone : { backgroundColor: tone }]}
          >
            <Ionicons
              name={isGiven ? 'checkmark-circle' : 'arrow-redo'}
              size={scale(15)}
              color={isGiven ? '#0E9F6E' : '#fff'}
            />
            <Text style={[rf.actTxt, isGiven && { color: '#0E9F6E' }]}>
              {isGiven ? 'GIVEN' : 'MARK AS GIVEN'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    };

    return (
      <View>
        <View style={tc.summary}>
          <Text style={[tc.sumBig, pending.length > 0 && { color: '#EA580C' }]}>{pending.length}</Text>
          <View style={{ flex: 1 }}>
            <Text style={tc.sumLead}>STILL OWED</Text>
            <Text style={tc.sumSub}>
              {done.length ? `${done.length} already handed over` : 'nothing handed over yet'}
            </Text>
          </View>
        </View>

        {/* three on screen; a long board scrolls inside itself so the card keeps
            the height it had */}
        <ScrollView
          style={patientReferrals.length > REF_VISIBLE ? { maxHeight: REF_BOARD_H } : undefined}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {pending.map((r) => card(r, false))}

          {done.length > 0 && (
            <View style={rf.divider}>
              <View style={rf.dividerLine} />
              <Text style={rf.dividerTxt}>DELIVERED</Text>
              <View style={rf.dividerLine} />
            </View>
          )}
          {done.map((r) => card(r, true))}
        </ScrollView>
      </View>
    );
  };

  const renderReferralsContent = () => embedded ? renderReferralsEmbedded() : (
    <ScrollView style={{ flex: 1, padding: scale(16) }}>
      {loadingReferrals ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : patientReferrals.length > 0 ? (
        <View style={{ gap: scale(12) }}>
          {patientReferrals.map((referral) => {
            const isGiven = referral.status === 'given';
            const department = referral.department || referral.referral_type || 'Unknown';
            return (
              <View key={referral.id} style={{
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                borderRadius: scale(16),
                padding: scale(16),
                borderWidth: scale(2),
                borderColor: 'rgba(255, 255, 255, 0.7)',
              }}>
                {/* Department + Status Toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), flex: 1 }}>
                    <Ionicons name="arrow-redo" size={scale(18)} color="#EA580C" />
                    <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#EA580C' }}>{department}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      const newStatus = isGiven ? 'not_given' : 'given';
                      try {
                        const { error } = await updateReferralStatus(referral.id, newStatus);
                        if (error) {
                          Alert.alert('Error', 'Failed to update status');
                          return;
                        }
                        // Reload referrals to reflect change
                        onLoadReferrals();
                      } catch (err) {
                        Alert.alert('Error', 'Unexpected error');
                      }
                    }}
                    style={{
                      backgroundColor: isGiven ? '#059669' : '#DC2626',
                      paddingHorizontal: scale(14),
                      paddingVertical: scale(6),
                      borderRadius: scale(12),
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: scale(6),
                    }}
                  >
                    <Ionicons name={isGiven ? 'checkmark-circle' : 'close-circle'} size={scale(16)} color="#FFFFFF" />
                    <Text style={{ fontSize: scale(13), fontWeight: '700', color: '#FFFFFF' }}>
                      {isGiven ? 'Given' : 'Not Given'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={{ height: scale(1), backgroundColor: 'rgba(234, 88, 12, 0.2)', marginBottom: scale(10) }} />

                {/* Tooth + Doctor + Notes */}
                <View style={{ gap: scale(6) }}>
                  {referral.tooth_number && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <Ionicons name="medical" size={scale(14)} color="#6B7280" />
                      <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#1E3A8A' }}>Tooth: #{referral.tooth_number}</Text>
                    </View>
                  )}
                  {referral.doctor_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <Ionicons name="person" size={scale(14)} color="#6B7280" />
                      <Text style={{ fontSize: scale(14), fontWeight: '500', color: '#374151' }}>Dr. {referral.doctor_name}</Text>
                    </View>
                  )}
                  {(referral.notes || referral.reason) && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: scale(6) }}>
                      <Ionicons name="document-text" size={scale(14)} color="#6B7280" style={{ marginTop: scale(2) }} />
                      <Text style={{ fontSize: scale(13), color: '#6B7280', flex: 1 }}>{referral.notes || referral.reason}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                    <Ionicons name="time" size={scale(14)} color="#9CA3AF" />
                    <Text style={{ fontSize: scale(12), color: '#9CA3AF' }}>
                      {new Date(referral.timestamp || referral.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ alignItems: 'center', padding: scale(24) }}>
          <Ionicons name="document-outline" size={scale(48)} color="rgba(255, 255, 255, 0.5)" />
          <Text style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: scale(12), fontSize: scale(16) }}>No referrals</Text>
        </View>
      )}
    </ScrollView>
  );

  // Render Hygiene Content
  const [showScalingConfirm, setShowScalingConfirm] = useState(false);
  const [scalingDate, setScalingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const renderHygieneContent = () => {
    // Calculate months since last scaling
    const monthsSinceScaling = effectiveScalingDate
      ? Math.floor((new Date().getTime() - effectiveScalingDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
      : null;

    // Status: green (<4), yellow (4-6), red (>6), gray (never)
    const getStatus = () => {
      if (monthsSinceScaling === null) return { color: '#9CA3AF', label: 'Not recorded', icon: 'help-circle' as const };
      if (monthsSinceScaling < 4) return { color: '#059669', label: 'Good', icon: 'checkmark-circle' as const };
      if (monthsSinceScaling <= 6) return { color: '#D97706', label: 'Due soon', icon: 'warning' as const };
      return { color: '#DC2626', label: 'Overdue', icon: 'alert-circle' as const };
    };
    const status = getStatus();
    const progressPercent = monthsSinceScaling !== null ? Math.min(monthsSinceScaling / 6, 1) : 0;

    return (
      <ScrollView style={{ flex: 1, padding: scale(16) }}>
        {/* Scaling Card */}
        <View style={{
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          borderRadius: scale(16),
          padding: scale(16),
          borderWidth: scale(2),
          borderColor: 'rgba(255, 255, 255, 0.7)',
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
              <MaterialCommunityIcons name="tooth" size={scale(20)} color="#059669" />
              <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#059669' }}>Scaling</Text>
            </View>
            <View style={{ backgroundColor: status.color, paddingHorizontal: scale(10), paddingVertical: scale(4), borderRadius: scale(10), flexDirection: 'row', alignItems: 'center', gap: scale(4) }}>
              <Ionicons name={status.icon} size={scale(14)} color="#FFFFFF" />
              <Text style={{ fontSize: scale(12), fontWeight: '700', color: '#FFFFFF' }}>{status.label}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: scale(1), backgroundColor: 'rgba(5, 150, 105, 0.2)', marginBottom: scale(14) }} />

          {/* Last Scaling Date */}
          <View style={{ alignItems: 'center', marginBottom: scale(14) }}>
            <Text style={{ fontSize: scale(13), color: '#6B7280', fontWeight: '500' }}>Last scaling</Text>
            <Text style={{ fontSize: scale(20), fontWeight: '800', color: '#1E3A8A', marginTop: scale(4) }}>
              {effectiveScalingDate ? effectiveScalingDate.toLocaleDateString() : '—'}
            </Text>
            {monthsSinceScaling !== null && (
              <Text style={{ fontSize: scale(13), color: status.color, fontWeight: '600', marginTop: scale(2) }}>
                {monthsSinceScaling === 0 ? 'This month' : `${monthsSinceScaling} month${monthsSinceScaling !== 1 ? 's' : ''} ago`}
              </Text>
            )}
          </View>

          {/* Progress Bar */}
          <View style={{ marginBottom: scale(16) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: scale(6) }}>
              <Text style={{ fontSize: scale(11), color: '#6B7280', fontWeight: '500' }}>0 months</Text>
              <Text style={{ fontSize: scale(11), color: '#6B7280', fontWeight: '500' }}>6 months</Text>
            </View>
            <View style={{ height: scale(10), backgroundColor: 'rgba(0, 0, 0, 0.08)', borderRadius: scale(5) }}>
              <View style={{
                height: scale(10),
                width: `${progressPercent * 100}%`,
                backgroundColor: status.color,
                borderRadius: scale(5),
              }} />
            </View>
            {monthsSinceScaling !== null && monthsSinceScaling <= 6 && (
              <Text style={{ fontSize: scale(12), color: status.color, fontWeight: '600', textAlign: 'center', marginTop: scale(6) }}>
                {6 - monthsSinceScaling} month{6 - monthsSinceScaling !== 1 ? 's' : ''} remaining
              </Text>
            )}
            {monthsSinceScaling !== null && monthsSinceScaling > 6 && (
              <Text style={{ fontSize: scale(12), color: '#DC2626', fontWeight: '700', textAlign: 'center', marginTop: scale(6) }}>
                Overdue by {monthsSinceScaling - 6} month{monthsSinceScaling - 6 !== 1 ? 's' : ''}!
              </Text>
            )}
          </View>

          {/* Scaling Done Button - hidden in read-only mode */}
          {!readOnly && (
          <TouchableOpacity
            style={{
              backgroundColor: '#059669',
              borderRadius: scale(14),
              paddingVertical: scale(14),
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: scale(8),
            }}
            onPress={() => {
              setScalingDate(new Date());
              setShowScalingConfirm(true);
              setShowDatePicker(false);
            }}
          >
            <Ionicons name="checkmark-circle" size={scale(20)} color="#FFFFFF" />
            <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#FFFFFF' }}>Scaling Done</Text>
          </TouchableOpacity>
          )}
        </View>

        {/* Scaling Confirm Modal */}
        {showScalingConfirm && (
          <View style={{
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            borderRadius: scale(16),
            padding: scale(16),
            marginTop: scale(14),
            borderWidth: scale(2),
            borderColor: 'rgba(255, 255, 255, 0.7)',
          }}>
            <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#1E3A8A', textAlign: 'center', marginBottom: scale(14) }}>
              Confirm Scaling Date
            </Text>

            {/* Date Picker - always visible as spinner */}
            <View style={{
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              borderRadius: scale(12),
              borderWidth: scale(1.5),
              borderColor: 'rgba(5, 150, 105, 0.3)',
              marginBottom: scale(14),
              overflow: 'hidden',
              alignItems: 'center',
            }}>
              <DateTimePicker
                value={scalingDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(event: any, date?: Date) => {
                  if (date) setScalingDate(date);
                }}
              />
            </View>

            {/* Confirm + Cancel */}
            <View style={{ flexDirection: 'row', gap: scale(10) }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0, 0, 0, 0.06)',
                  borderRadius: scale(12),
                  paddingVertical: scale(12),
                  alignItems: 'center',
                }}
                onPress={() => setShowScalingConfirm(false)}
              >
                <Text style={{ fontSize: scale(15), fontWeight: '600', color: '#6B7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#059669',
                  borderRadius: scale(12),
                  paddingVertical: scale(12),
                  alignItems: 'center',
                }}
                onPress={async () => {
                  if (patient.permanent_patient_id) {
                    try {
                      const { error } = await createScalingRecord(patient.permanent_patient_id, doctorName || 'Doctor', scalingDate);
                      if (error) {
                        Alert.alert('Error', 'Failed to save scaling record');
                        return;
                      }
                      // Update local state immediately
                      setLocalScalingDate(scalingDate);
                      Alert.alert('Success', `Scaling recorded for ${scalingDate.toLocaleDateString()}`);
                    } catch (err) {
                      Alert.alert('Error', 'Unexpected error');
                    }
                  }
                  setShowScalingConfirm(false);
                }}
              >
                <Text style={{ fontSize: scale(15), fontWeight: '700', color: '#FFFFFF' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  // Render Notes Content
  // ── embedded: the chart margin ──
  // A tooth note is an annotation pinned to a tooth, and several notes on the
  // same tooth are one running commentary about it — not unrelated rows. So the
  // tooth is the object, drawn once as its enamel chip, with everything ever
  // written about it stacked beside it.
  const renderNotesEmbedded = () => {
    if (loadingToothNotes) {
      return <ActivityIndicator size="small" color={NOTE_TONE} style={{ paddingVertical: scale(20) }} />;
    }
    if (!toothNotes.length) {
      return (
        <View style={eg.clearWrap}>
          <Ionicons name="document-text-outline" size={scale(30)} color="#8CA0A8" />
          <Text style={[eg.clearTxt, { color: '#8CA0A8' }]}>Nothing noted on any tooth</Text>
        </View>
      );
    }

    const when = (n: ToothNote) => new Date(n.timestamp || n.created_at).getTime() || 0;
    const byTooth: Record<string, ToothNote[]> = {};
    for (const n of toothNotes) {
      const k = String(n.tooth_number ?? '—');
      (byTooth[k] = byTooth[k] || []).push(n);
    }
    // newest tooth first, and newest note first inside each tooth
    const groups = Object.keys(byTooth)
      .map((tooth) => ({ tooth, notes: byTooth[tooth].slice().sort((a, b) => when(b) - when(a)) }))
      .sort((a, b) => when(b.notes[0]) - when(a.notes[0]));

    return (
      <View>
        <View style={tc.summary}>
          <Text style={[tc.sumBig, { color: NOTE_TONE }]}>{toothNotes.length}</Text>
          <View style={{ flex: 1 }}>
            <Text style={tc.sumLead}>TOOTH NOTES</Text>
            <Text style={tc.sumSub}>
              {groups.length === 1 ? 'all on one tooth' : `across ${groups.length} teeth`}
            </Text>
          </View>
        </View>

        <ScrollView
          style={groups.length > NOTE_VISIBLE ? { maxHeight: NOTE_BOARD_H } : undefined}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {groups.map((g) => (
            <View key={g.tooth} style={nt.card}>
              <View style={nt.spine}>
                <View style={nt.tooth}>
                  <Text style={nt.toothTxt}>{g.tooth}</Text>
                  <View style={nt.toothBar} />
                </View>
                {g.notes.length > 1 && <Text style={nt.stackTxt}>{g.notes.length} NOTES</Text>}
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                {g.notes.map((n, i) => (
                  <View key={i} style={i > 0 ? nt.entryNext : undefined}>
                    <Text style={nt.txt}>{n.note}</Text>
                    <Text style={nt.meta} numberOfLines={1}>
                      {n.doctor_name ? `DR. ${n.doctor_name}` : 'UNSIGNED'} · {stampOf(n.timestamp || n.created_at)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderNotesContent = () => embedded ? renderNotesEmbedded() : (
    <ScrollView style={{ flex: 1, padding: scale(16) }}>
      {loadingToothNotes ? (
        <ActivityIndicator size="large" color="#FFFFFF" />
      ) : toothNotes.length > 0 ? (
        <View style={{ gap: scale(12) }}>
          {toothNotes.map((note, index) => (
            <View key={index} style={{
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: scale(16),
              padding: scale(16),
              borderWidth: scale(2),
              borderColor: 'rgba(255, 255, 255, 0.7)',
            }}>
              {/* Tooth Number */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                  <Ionicons name="document-text" size={scale(18)} color="#7C3AED" />
                  <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#7C3AED' }}>Tooth #{note.tooth_number}</Text>
                </View>
              </View>

              {/* Divider */}
              <View style={{ height: scale(1), backgroundColor: 'rgba(124, 58, 237, 0.2)', marginBottom: scale(10) }} />

              {/* Note Text */}
              <Text style={{ fontSize: scale(14), fontWeight: '500', color: '#374151', marginBottom: scale(8), lineHeight: scale(20) }}>{note.note}</Text>

              {/* Doctor + Date */}
              <View style={{ gap: scale(4) }}>
                {note.doctor_name && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                    <Ionicons name="person" size={scale(14)} color="#6B7280" />
                    <Text style={{ fontSize: scale(13), fontWeight: '500', color: '#6B7280' }}>Dr. {note.doctor_name}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                  <Ionicons name="time" size={scale(14)} color="#9CA3AF" />
                  <Text style={{ fontSize: scale(12), color: '#9CA3AF' }}>
                    {new Date(note.timestamp || note.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ alignItems: 'center', padding: scale(24) }}>
          <Ionicons name="document-text-outline" size={scale(48)} color="rgba(255, 255, 255, 0.5)" />
          <Text style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: scale(12), fontSize: scale(16) }}>No notes</Text>
        </View>
      )}
    </ScrollView>
  );

  // Render General Notes Content
  // ── embedded: the file's own notes ──
  // These are written here, so writing is the head of the section rather than an
  // afterthought above a list: the composer sits where a summary strip sits
  // elsewhere, and the newest entry is marked because it is the one being answered.
  const renderGeneralNotesEmbedded = () => {
    const notes = effectiveGeneralNotes
      .slice()
      .sort((a: any, b: any) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));
    const ready = !!newGeneralNoteText.trim();

    const submit = async () => {
      const text = newGeneralNoteText.trim();
      if (!text || !patient.permanent_patient_id) return;
      if (onAddGeneralNote) {
        onAddGeneralNote(text);
      } else {
        await createGeneralNote(patient.permanent_patient_id, text, doctorName || 'Doctor');
        loadLocalGeneralNotes();
      }
      setNewGeneralNoteText('');
      setSeenGeneralNotesCount(generalNotesCount + 1);
      AsyncStorage.setItem(generalNotesStorageKey, (generalNotesCount + 1).toString());
    };

    // a note on a file is a clinical record: it does not vanish on one stray tap
    const remove = (note: any) => {
      Alert.alert('Delete note', 'This note will be removed from the file.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (onDeleteGeneralNote) {
              onDeleteGeneralNote(note.id);
            } else {
              await deleteGeneralNote(note.id);
              loadLocalGeneralNotes();
            }
          },
        },
      ]);
    };

    return (
      <View>
        {!readOnly && (
          <View style={[gn.compose, ready && gn.composeOn]}>
            <TextInput
              style={gn.input}
              placeholder="Write a note for the file…"
              placeholderTextColor="#9FB0B8"
              value={newGeneralNoteText}
              onChangeText={setNewGeneralNoteText}
              multiline
            />
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!ready}
              onPress={submit}
              style={[gn.send, ready ? gn.sendOn : gn.sendOff]}
            >
              <Ionicons name="arrow-up" size={scale(19)} color={ready ? '#FFFFFF' : '#A9BAC2'} />
            </TouchableOpacity>
          </View>
        )}

        {notes.length === 0 ? (
          <View style={eg.clearWrap}>
            <Ionicons name="create-outline" size={scale(30)} color="#8CA0A8" />
            <Text style={[eg.clearTxt, { color: '#8CA0A8' }]}>Nothing written on this file</Text>
          </View>
        ) : (
          <ScrollView
            style={notes.length > GN_VISIBLE ? { maxHeight: GN_BOARD_H } : undefined}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {notes.map((note: any, i: number) => (
              <View key={note.id} style={[gn.card, i > 0 && gn.cardOld]}>
                <Text style={gn.txt}>{note.note}</Text>
                <View style={gn.foot}>
                  {i === 0 && <View style={gn.latest}><Text style={gn.latestTxt}>LATEST</Text></View>}
                  <Text style={gn.by} numberOfLines={1}>
                    {note.doctor_name ? `DR. ${note.doctor_name}` : 'UNSIGNED'} · {stampOf(note.created_at)}
                  </Text>
                  {!readOnly && (
                    <TouchableOpacity
                      onPress={() => remove(note)}
                      style={gn.del}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={scale(13)} color="#C4565C" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderGeneralNotesContent = () => embedded ? renderGeneralNotesEmbedded() : (
    <View style={{ flex: 1, padding: scale(16) }}>
      {/* Input */}
      <View style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(14) }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            borderRadius: scale(12),
            padding: scale(12),
            fontSize: scale(14),
            color: '#1E3A8A',
            borderWidth: scale(1.5),
            borderColor: 'rgba(255, 255, 255, 0.7)',
            minHeight: scale(44),
          }}
          placeholder="Write a general note..."
          placeholderTextColor="#9CA3AF"
          value={newGeneralNoteText}
          onChangeText={setNewGeneralNoteText}
          multiline
        />
        <TouchableOpacity
          style={{
            backgroundColor: newGeneralNoteText.trim() ? '#2563EB' : 'rgba(255, 255, 255, 0.3)',
            borderRadius: scale(12),
            width: scale(44),
            height: scale(44),
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={async () => {
            if (newGeneralNoteText.trim() && patient.permanent_patient_id) {
              if (onAddGeneralNote) {
                onAddGeneralNote(newGeneralNoteText.trim());
              } else {
                await createGeneralNote(patient.permanent_patient_id, newGeneralNoteText.trim(), 'Doctor');
                loadLocalGeneralNotes();
              }
              setNewGeneralNoteText('');
              setSeenGeneralNotesCount(generalNotesCount + 1);
              AsyncStorage.setItem(generalNotesStorageKey, (generalNotesCount + 1).toString());
            }
          }}
          disabled={!newGeneralNoteText.trim()}
        >
          <Ionicons name="send" size={scale(20)} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Notes List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {effectiveGeneralNotes.length > 0 ? (
          <View style={{ gap: scale(10) }}>
            {effectiveGeneralNotes.map((note: any) => (
              <View key={note.id} style={{
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                borderRadius: scale(14),
                padding: scale(14),
                borderWidth: scale(2),
                borderColor: 'rgba(255, 255, 255, 0.7)',
              }}>
                <Text style={{ fontSize: scale(14), color: '#1E3A8A', lineHeight: scale(20) }}>{note.note}</Text>
                <View style={{ height: scale(1), backgroundColor: 'rgba(37, 99, 235, 0.15)', marginVertical: scale(10) }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                    <Ionicons name="person" size={scale(13)} color="#6B7280" />
                    <Text style={{ fontSize: scale(12), color: '#6B7280' }}>Dr. {note.doctor_name}</Text>
                    <Text style={{ fontSize: scale(12), color: '#9CA3AF' }}>
                      {new Date(note.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      if (onDeleteGeneralNote) {
                        onDeleteGeneralNote(note.id);
                      } else {
                        await deleteGeneralNote(note.id);
                        loadLocalGeneralNotes();
                      }
                    }}
                    style={{ padding: scale(4) }}
                  >
                    <Ionicons name="trash-outline" size={scale(16)} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ alignItems: 'center', padding: scale(30) }}>
            <Ionicons name="document-text-outline" size={scale(48)} color="rgba(255, 255, 255, 0.5)" />
            <Text style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: scale(10), fontSize: scale(15) }}>No general notes yet</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  // Render Section Content with Back Button
  const renderSectionContent = () => {
    let content = null;
    let sectionTitle = '';

    switch (expandedSection) {
      case 'dental':
        content = renderTreatmentContent();
        sectionTitle = 'Treatment';
        break;
      case 'referrals':
        content = renderReferralsContent();
        sectionTitle = 'Referrals';
        break;
      case 'hygiene':
        content = renderHygieneContent();
        sectionTitle = 'Hygiene';
        break;
      case 'notes':
        content = renderNotesContent();
        sectionTitle = 'Notes';
        break;
      case 'general_notes':
        content = renderGeneralNotesContent();
        sectionTitle = 'General Notes';
        break;
      default:
        return null;
    }

    return (
      <View style={{ flex: 1 }}>
        {/* Header Bar — dropped when embedded: the card's own chevron is the way
            back, and repeating the section's name above its own content is noise */}
        {!embedded && <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: scale(16),
          padding: scale(12),
          marginHorizontal: scale(16),
          marginTop: scale(12),
          marginBottom: scale(4),
          borderWidth: scale(2),
          borderColor: 'rgba(255, 255, 255, 0.35)',
        }}>
          {/* Back Button - Left */}
          <TouchableOpacity
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              width: scale(36),
              height: scale(36),
              borderRadius: scale(12),
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={(e) => {
              e.stopPropagation();
              setExpandedSection(null);
            }}
          >
            <Ionicons name="chevron-back" size={scale(22)} color="#1E3A8A" />
          </TouchableOpacity>

          {/* Title - Center */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: scale(18), fontWeight: '800', color: '#1E3A8A', letterSpacing: scale(0.5) }}>
              {sectionTitle}
            </Text>
          </View>

          {/* Spacer to balance the back button */}
          <View style={{ width: scale(36) }} />
        </View>}

        {/* Content */}
        {content}
      </View>
    );
  };

  // the card asks this before collapsing anything of its own
  if (backRef) {
    backRef.current = () => {
      if (!expandedSection) return false;
      setExpandedSection(null);
      return true;
    };
  }

  return (
    <View style={embedded ? undefined : { marginBottom: scale(16) }}>
      {!expandedSection ? renderIconsGrid() : renderSectionContent()}
    </View>
  );
}

// the embedded grid — the card's app icons, 4 to a row
const eg = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', rowGap: scale(14), paddingVertical: scale(14) },
  cell: { width: '25%', alignItems: 'center', gap: scale(8) },
  shadow: {
    width: scale(52), height: scale(52), borderRadius: scale(15),
    shadowOffset: { width: 0, height: scale(8) },
    shadowOpacity: 0.5, shadowRadius: scale(9), elevation: 7,
  },
  face: { flex: 1, borderRadius: scale(15), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  glyph: { textShadowColor: 'rgba(0,0,0,0.22)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.5 },
  badge: {
    position: 'absolute', top: -scale(6), right: -scale(6),
    minWidth: scale(20), height: scale(20), borderRadius: scale(10),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(5),
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  badgeTxt: { fontSize: scale(11), fontWeight: '800', color: '#FFFFFF' },
  label: { fontSize: scale(11), fontWeight: '600', color: '#5A7079' },

  // past treatments — the same foldaway the card uses for DETAILS
  prevHr: { height: 1, backgroundColor: 'rgba(40,54,82,0.10)', marginTop: scale(6) },
  prevHead: { flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingVertical: scale(11) },
  prevLabel: { flex: 1, fontSize: scale(10.5), fontWeight: '800', letterSpacing: 1, color: '#5A7079' },
  prevCount: {
    fontSize: scale(10.5), fontWeight: '800', color: '#4360D0',
    backgroundColor: 'rgba(109,155,255,0.16)',
    paddingHorizontal: scale(7), paddingVertical: scale(2), borderRadius: scale(8), overflow: 'hidden',
  },
  prevBody: { paddingBottom: scale(4) },
  prevRow: {
    flexDirection: 'row', alignItems: 'center', gap: scale(10),
    paddingVertical: scale(9), borderTopWidth: 1, borderTopColor: 'rgba(40,54,82,0.07)',
  },
  prevEmpty: { paddingVertical: scale(16), textAlign: 'center', fontSize: scale(12), fontWeight: '600', color: '#8CA0A8' },

  clearWrap: { alignItems: 'center', gap: scale(9), paddingVertical: scale(24) },
  clearTxt: { fontSize: scale(13.5), fontWeight: '700', color: '#0E9F6E' },
});

// ── the history spine ──
const NODE = scale(34);
const RAIL_X = scale(4) + NODE / 2;
const sp = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: scale(12), height: PREV_ROW_H, paddingLeft: scale(4) },
  rail: { position: 'absolute', left: RAIL_X - 1, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(40,54,82,0.10)' },
  railTop: { top: '50%' },      // the spine begins at the newest node
  railEnd: { bottom: '50%' },   // and ends at the oldest
  node: {
    width: NODE, height: NODE, borderRadius: NODE / 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FCFDFF', borderWidth: 2,
    shadowColor: '#1E2D4B', shadowOffset: { width: 0, height: scale(3) },
    shadowOpacity: 0.18, shadowRadius: scale(5), elevation: 3,
  },
  nodeTxt: { fontSize: scale(12.5), fontWeight: '800', letterSpacing: -0.4 },
  body: { flex: 1, minWidth: 0 },
  tx: { fontSize: scale(14), fontWeight: '700', color: '#12232A', letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: scale(7), marginTop: scale(3) },
  latest: { paddingHorizontal: scale(6), paddingVertical: scale(1.5), borderRadius: scale(6) },
  latestTxt: { fontSize: scale(8), fontWeight: '800', letterSpacing: 0.8, color: '#fff' },
  by: { flexShrink: 1, fontSize: scale(10.5), fontWeight: '600', color: '#8CA0A8' },
  when: { alignItems: 'flex-end', minWidth: scale(34) },
  // quiet on purpose: correcting a record is rare, and should not compete
  // with reading the history
  undo: {
    marginLeft: scale(8),
    width: scale(26), height: scale(26), borderRadius: scale(9),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(226,59,66,0.09)',
  },
  day: { fontSize: scale(17), fontWeight: '800', color: '#12232A', letterSpacing: -0.6 },
  mon: { marginTop: -scale(1), fontSize: scale(8.5), fontWeight: '800', letterSpacing: 1, color: '#8CA0A8' },
});

// ── the findings chart ──
const tc = StyleSheet.create({
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: scale(12),
    paddingVertical: scale(12), paddingHorizontal: scale(14),
    marginBottom: scale(11), borderRadius: scale(16),
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
  },
  sumBig: { fontSize: scale(30), fontWeight: '800', color: '#12232A', letterSpacing: -1.5 },
  sumLead: { fontSize: scale(9.5), fontWeight: '800', letterSpacing: 1.6, color: '#5A7079' },
  sumSub: { marginTop: scale(2), fontSize: scale(12), fontWeight: '600', color: '#8CA0A8' },

  card: {
    marginBottom: scale(9),
    borderRadius: scale(15),
    borderLeftWidth: scale(4),
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
    borderRightColor: 'rgba(255,255,255,0.9)',
    borderBottomColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: scale(11), paddingHorizontal: scale(12), paddingVertical: scale(11) },
  glyph: { width: scale(30), height: scale(30), borderRadius: scale(10), alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: scale(13.5), fontWeight: '700', color: '#12232A', letterSpacing: -0.2 },
  // the count against the worst count, so the five compare at a glance
  track: { marginTop: scale(6), height: scale(4), borderRadius: scale(2), backgroundColor: 'rgba(40,54,82,0.09)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: scale(2) },
  count: { fontSize: scale(19), fontWeight: '800', letterSpacing: -0.8 },

  teeth: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(7), paddingHorizontal: scale(12), paddingBottom: scale(12) },
  tooth: {
    minWidth: scale(40), height: scale(38), borderRadius: scale(12),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(8), paddingTop: scale(3),
    backgroundColor: '#FCFDFF', borderWidth: 1.5,
    shadowColor: '#1E2D4B', shadowOffset: { width: 0, height: scale(2) },
    shadowOpacity: 0.12, shadowRadius: scale(4), elevation: 2,
  },
  toothTxt: { fontSize: scale(13.5), fontWeight: '800', letterSpacing: -0.4 },
  // the crown line — a tooth chip that reads as a tooth, not a button
  toothBar: { marginTop: scale(3), width: scale(14), height: 2, borderRadius: 1, opacity: 0.55 },
});

// ── the referrals board ──
const rf = StyleSheet.create({
  card: {
    marginBottom: scale(9),
    borderRadius: scale(15),
    borderLeftWidth: scale(4),
    backgroundColor: 'rgba(255,255,255,0.60)',
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
    borderRightColor: 'rgba(255,255,255,0.9)',
    borderBottomColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: scale(12), paddingTop: scale(11), paddingBottom: scale(11),
  },
  // handed over: filed away, not shouting for attention
  cardDone: { backgroundColor: 'rgba(255,255,255,0.34)', opacity: 0.78 },

  head: { flexDirection: 'row', alignItems: 'center', gap: scale(11) },
  dept: { fontSize: scale(13), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  meta: { marginTop: scale(3), fontSize: scale(11), fontWeight: '600', color: '#8CA0A8' },

  tooth: {
    minWidth: scale(40), height: scale(38), borderRadius: scale(12),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(8), paddingTop: scale(3),
    backgroundColor: '#FCFDFF', borderWidth: 1.5,
    shadowColor: '#1E2D4B', shadowOffset: { width: 0, height: scale(2) },
    shadowOpacity: 0.12, shadowRadius: scale(4), elevation: 2,
  },
  toothTxt: { fontSize: scale(13.5), fontWeight: '800', letterSpacing: -0.4 },
  toothBar: { marginTop: scale(3), width: scale(14), height: 2, borderRadius: 1, opacity: 0.55 },

  // the reason, set as what it is — a quotation from the referring doctor
  why: { flexDirection: 'row', gap: scale(9), marginTop: scale(10) },
  whyRail: { width: 2, borderRadius: 1 },
  whyTxt: { flex: 1, fontSize: scale(12.5), lineHeight: scale(18), fontWeight: '500', fontStyle: 'italic', color: '#5A7079' },

  act: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7),
    height: scale(36), borderRadius: scale(11), marginTop: scale(11),
  },
  actDone: { backgroundColor: 'rgba(14,159,110,0.12)', borderWidth: 1, borderColor: 'rgba(14,159,110,0.32)' },
  actTxt: { fontSize: scale(11.5), fontWeight: '800', letterSpacing: 1, color: '#fff' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: scale(10), marginTop: scale(6), marginBottom: scale(11) },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(40,54,82,0.10)' },
  dividerTxt: { fontSize: scale(9), fontWeight: '800', letterSpacing: 1.5, color: '#8CA0A8' },
});

// ── the chart margin: what was written about a tooth ──
const nt = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: scale(12),
    marginBottom: scale(9),
    borderRadius: scale(15),
    borderLeftWidth: scale(4), borderLeftColor: NOTE_TONE,
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
    borderRightColor: 'rgba(255,255,255,0.9)',
    borderBottomColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: scale(12), paddingVertical: scale(11),
  },
  spine: { alignItems: 'center', gap: scale(5) },
  // the same enamel chip the findings and referrals use — one tooth, one shape
  tooth: {
    minWidth: scale(40), height: scale(38), borderRadius: scale(12),
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(8), paddingTop: scale(3),
    backgroundColor: '#FCFDFF', borderWidth: 1.5, borderColor: 'rgba(106,75,196,0.38)',
    shadowColor: '#1E2D4B', shadowOffset: { width: 0, height: scale(2) },
    shadowOpacity: 0.12, shadowRadius: scale(4), elevation: 2,
  },
  toothTxt: { fontSize: scale(13.5), fontWeight: '800', letterSpacing: -0.4, color: NOTE_TONE },
  toothBar: { marginTop: scale(3), width: scale(14), height: 2, borderRadius: 1, opacity: 0.55, backgroundColor: NOTE_TONE },
  // several notes on one tooth: say how many instead of repeating the chip
  stackTxt: { fontSize: scale(8), fontWeight: '800', letterSpacing: 0.6, color: NOTE_TONE, opacity: 0.7 },

  entryNext: { marginTop: scale(9), paddingTop: scale(9), borderTopWidth: 1, borderTopColor: 'rgba(40,54,82,0.08)' },
  txt: { fontSize: scale(13), lineHeight: scale(19), fontWeight: '500', color: '#12232A' },
  meta: { marginTop: scale(5), fontSize: scale(9.5), fontWeight: '800', letterSpacing: 0.6, color: '#8CA0A8' },
});

// ── the file's own notes ──
const gn = StyleSheet.create({
  compose: {
    flexDirection: 'row', alignItems: 'flex-end', gap: scale(9),
    padding: scale(8), paddingLeft: scale(13),
    marginBottom: scale(11), borderRadius: scale(17),
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
  },
  // the field wakes up once there is something worth filing
  composeOn: { backgroundColor: 'rgba(255,255,255,0.74)', borderColor: 'rgba(67,96,208,0.38)' },
  input: {
    flex: 1, minHeight: scale(38), maxHeight: scale(96),
    paddingVertical: scale(9), paddingRight: scale(4),
    fontSize: scale(13.5), lineHeight: scale(19), fontWeight: '500', color: '#12232A',
  },
  send: { width: scale(38), height: scale(38), borderRadius: scale(13), alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: 'rgba(40,54,82,0.07)' },
  sendOn: {
    backgroundColor: GN_TONE,
    shadowColor: GN_TONE, shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: 0.42, shadowRadius: scale(7), elevation: 5,
  },

  card: {
    marginBottom: scale(9), borderRadius: scale(15),
    borderLeftWidth: scale(4), borderLeftColor: GN_TONE,
    backgroundColor: 'rgba(255,255,255,0.60)',
    borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
    borderRightColor: 'rgba(255,255,255,0.9)',
    borderBottomColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: scale(12), paddingVertical: scale(11),
  },
  // older entries recede so the newest is the one that reads first
  cardOld: { backgroundColor: 'rgba(255,255,255,0.42)', borderLeftColor: 'rgba(67,96,208,0.34)' },
  txt: { fontSize: scale(13.5), lineHeight: scale(20), fontWeight: '500', color: '#12232A' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginTop: scale(9) },
  latest: { paddingHorizontal: scale(6), paddingVertical: scale(1.5), borderRadius: scale(6), backgroundColor: GN_TONE },
  latestTxt: { fontSize: scale(8), fontWeight: '800', letterSpacing: 0.8, color: '#FFFFFF' },
  by: { flex: 1, fontSize: scale(9.5), fontWeight: '800', letterSpacing: 0.6, color: '#8CA0A8' },
  del: {
    width: scale(26), height: scale(26), borderRadius: scale(9),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(226,59,66,0.09)',
  },
});
