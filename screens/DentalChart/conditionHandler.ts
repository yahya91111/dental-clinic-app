import { CONDITION_NAME_TO_KEY } from './constants';
import {
  ToothSurfaceConditions,
  getConditionName,
  getAllSurfaces,
  getSurfaceNameMap,
  formatTimestamp,
} from './dentalHelpers';
import type { ToothCondition } from '../../types';
import type { PendingPlanningRecord, ToothRecord } from './planningHandlers';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PlanningRecordGlobal {
  toothNumber: number;
  action: 'diagnosed' | 'canceled';
  condition: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  isChange?: boolean;
  previousCondition?: string;
}

export interface ConditionSelectParams {
  condition: ToothCondition;
  selectedTooth: number | null;
  selectedSurface: string | null;
  toothConditions: Record<number, ToothSurfaceConditions>;
  toothRecords: Record<number, ToothRecord[]>;
  allPlanningRecordsGlobal: PlanningRecordGlobal[];
  pendingPlanningRecords: PendingPlanningRecord[];
  userName: string;
  // State setters
  setToothBorderColors: (fn: (prev: Record<number, ToothCondition>) => Record<number, ToothCondition>) => void;
  setToothConditions: (fn: (prev: Record<number, ToothSurfaceConditions>) => Record<number, ToothSurfaceConditions>) => void;
  setPendingPlanningRecords: (fn: (prev: PendingPlanningRecord[]) => PendingPlanningRecord[]) => void;
  setToothRecords: (fn: (prev: Record<number, ToothRecord[]>) => Record<number, ToothRecord[]>) => void;
  setHasModalChanges: (value: boolean) => void;
  setShowConditionMenu: (value: boolean) => void;
  setSelectedTooth: (value: number | null) => void;
  setSelectedSurface: (value: string | null) => void;
}

// ═══════════════════════════════════════════════════════════════
// Condition Select Handler
// ═══════════════════════════════════════════════════════════════

export function handleConditionSelect({
  condition,
  selectedTooth,
  selectedSurface,
  toothConditions,
  toothRecords,
  allPlanningRecordsGlobal,
  pendingPlanningRecords,
  userName,
  setToothBorderColors,
  setToothConditions,
  setPendingPlanningRecords,
  setToothRecords,
  setHasModalChanges,
  setShowConditionMenu,
  setSelectedTooth,
  setSelectedSurface,
}: ConditionSelectParams): void {
  if (selectedTooth && selectedSurface) {
    // إذا كانت الحالة treated، قم بتلوين الحدود فقط
    if (condition === 'treated') {
      console.log(`🦷 Setting border color for tooth ${selectedTooth} to 'treated' (Root Canal Treated)`);
      setToothBorderColors(prev => ({
        ...prev,
        [selectedTooth]: 'treated',
      }));

      // إضافة سجل للقائمة المعلقة (Pending) و toothRecords
      const now = new Date();
      const timestamp = formatTimestamp(now);
      const timestampNum = now.getTime() + Math.random() * 0.999;

      const newRecord = {
        type: 'planning' as const,
        action: 'diagnosed' as const,
        condition: 'Tooth Status',
        surfaces: ['Root Canal Treated'],
        timestamp,
        timestampNum,
        doctorName: userName,
        isChange: undefined,
        previousCondition: undefined
      };

      // استبدال السجل السابق (Whole tooth status)
      setPendingPlanningRecords(prev => {
        // Remove any existing Tooth Status record for this tooth
        const filtered = prev.filter(record =>
          record.toothNumber !== selectedTooth ||
          record.condition !== 'Tooth Status'
        );

        return [
          ...filtered,
          {
            toothNumber: selectedTooth,
            ...newRecord
          }
        ];
      });

      // استبدال في toothRecords أيضاً
      setToothRecords(prev => {
        const existingRecords = prev[selectedTooth] || [];
        const filtered = existingRecords.filter(record =>
          record.type !== 'planning' ||
          record.condition !== 'Tooth Status'
        );

        return {
          ...prev,
          [selectedTooth]: [
            ...filtered,
            newRecord
          ]
        };
      });

      setHasModalChanges(true);
      setShowConditionMenu(false);
      return;
    }

    // إذا كانت الحالة missing، قم بتلوين جميع الأسطح
    if (condition === 'missing') {
      setToothConditions(prev => ({
        ...prev,
        [selectedTooth]: {
          top: condition,
          bottom: condition,
          left: condition,
          right: condition,
          center: condition,
        },
      }));

      // إضافة سجل للقائمة المعلقة (Pending) و toothRecords
      const now = new Date();
      const timestamp = formatTimestamp(now);
      const timestampNum = now.getTime() + Math.random() * 0.999;

      const newRecord = {
        type: 'planning' as const,
        action: 'diagnosed' as const,
        condition: 'Tooth Status',
        surfaces: ['Missing Tooth'],
        timestamp,
        timestampNum,
        doctorName: userName,
        isChange: undefined,
        previousCondition: undefined
      };

      // استبدال السجل السابق (Whole tooth status)
      setPendingPlanningRecords(prev => {
        const filtered = prev.filter(record =>
          record.toothNumber !== selectedTooth ||
          record.condition !== 'Tooth Status'
        );

        return [
          ...filtered,
          {
            toothNumber: selectedTooth,
            ...newRecord
          }
        ];
      });

      // استبدال في toothRecords أيضاً
      setToothRecords(prev => {
        const existingRecords = prev[selectedTooth] || [];
        const filtered = existingRecords.filter(record =>
          record.type !== 'planning' ||
          record.condition !== 'Tooth Status'
        );

        return {
          ...prev,
          [selectedTooth]: [
            ...filtered,
            newRecord
          ]
        };
      });

      setHasModalChanges(true);
    }
    // إذا كانت الحالة extraction (Condition - يحفظ Record فوراً)
    else if (condition === 'extraction') {
      setToothConditions(prev => ({
        ...prev,
        [selectedTooth]: {
          top: condition,
          bottom: condition,
          left: condition,
          right: condition,
          center: condition,
        },
      }));

      // حفظ planning record لـ Extraction
      const now = new Date();
      const timestamp = formatTimestamp(now);

      const conditionName = getConditionName(condition);
      const timestampNum = now.getTime() + Math.random() * 0.999;

      const newRecord = {
        type: 'planning' as const,
        action: 'diagnosed' as const,
        condition: conditionName.english,
        surfaces: ['All surfaces'],
        timestamp,
        timestampNum,
        doctorName: userName,
        isChange: undefined,
        previousCondition: undefined
      };

      // استبدال السجل السابق (Whole tooth - Extraction)
      setToothRecords(prev => {
        const existingRecords = prev[selectedTooth] || [];
        const filtered = existingRecords.filter(record =>
          record.type !== 'planning' ||
          record.condition !== conditionName.english
        );

        return {
          ...prev,
          [selectedTooth]: [
            ...filtered,
            newRecord
          ]
        };
      });

      // استبدال في pendingPlanningRecords أيضاً
      setPendingPlanningRecords(prev => {
        const filtered = prev.filter(record =>
          record.toothNumber !== selectedTooth ||
          record.condition !== conditionName.english
        );

        return [
          ...filtered,
          {
            toothNumber: selectedTooth,
            ...newRecord
          }
        ];
      });

    } else if (condition === 'CLEAR_TOOTH_STATUS' as any) {
      // إذا كان Clear Condition من قائمة Tooth Status - احذف border + كل الأسطح
      if (!selectedTooth) {
        console.error(' Invalid tooth number:', selectedTooth);
        return;
      }

      console.log('🧹 Clear Tooth Status: Clearing border + all surfaces for tooth', selectedTooth);

      // إزالة لون الحدود
      setToothBorderColors(prev => {
        const newBorderColors = { ...prev };
        delete newBorderColors[selectedTooth];
        return newBorderColors;
      });

      // إزالة اللون من جميع الأسطح
      setToothConditions(prev => ({
        ...prev,
        [selectedTooth]: {
          top: null,
          bottom: null,
          left: null,
          right: null,
          center: null,
        },
      }));

      // حفظ planning record عند إلغاء الحالة
      const now = new Date();
      const timestamp = formatTimestamp(now);

      const surfaceOptions = getAllSurfaces(selectedTooth);
      const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
      const surfaceLabel = surface?.label || selectedSurface;
      const timestampNum = now.getTime() + Math.random() * 0.999;

      const newRecord = {
        type: 'planning' as const,
        action: 'canceled' as const,
        condition: '',
        surfaces: [surfaceLabel],
        timestamp,
        timestampNum,
        toothNumber: selectedTooth,
        doctorName: userName,
        isChange: undefined,
        previousCondition: undefined
      };

      setToothRecords(prev => {
        const existingRecords = prev[selectedTooth] || [];
        const filtered = existingRecords.filter(record => {
          if (record.type !== 'planning') return true;
          const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
          return !recordSurface;
        });

        return {
          ...prev,
          [selectedTooth]: [
            ...filtered,
            newRecord
          ]
        };
      });

      setPendingPlanningRecords(prev => [...prev, newRecord]);

      setShowConditionMenu(false);
      setSelectedTooth(null);
      setSelectedSurface('center');

    } else if (condition === null) {
      // إذا كان Clear Condition من قائمة Condition العادية
      const currentConditions = toothConditions[selectedTooth];

      // إزالة لون الحدود
      setToothBorderColors(prev => {
        const newBorderColors = { ...prev };
        delete newBorderColors[selectedTooth];
        return newBorderColors;
      });

      // تحقق إذا كانت جميع الأسطح extraction أو missing
      if (currentConditions) {
        const allSame =
          currentConditions.top === currentConditions.bottom &&
          currentConditions.bottom === currentConditions.left &&
          currentConditions.left === currentConditions.right &&
          currentConditions.right === currentConditions.center &&
          (currentConditions.top === 'extraction' || currentConditions.top === 'missing');

        if (allSame) {
          // إزالة اللون من جميع الأسطح
          setToothConditions(prev => ({
            ...prev,
            [selectedTooth]: {
              top: null,
              bottom: null,
              left: null,
              right: null,
              center: null,
            },
          }));
        } else {
          // إزالة اللون من السطح المحدد فقط
          setToothConditions(prev => ({
            ...prev,
            [selectedTooth]: {
              ...(prev[selectedTooth] || {
                top: null,
                bottom: null,
                left: null,
                right: null,
                center: null,
              }),
              [selectedSurface]: null,
            },
          }));
        }

        // حفظ planning record عند إلغاء الحالة
        const now = new Date();
        const timestamp = formatTimestamp(now);

        const surfaceOptions = getAllSurfaces(selectedTooth);
        const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
        const surfaceLabel = surface?.label || selectedSurface;
        const timestampNum = now.getTime() + Math.random() * 0.999;

        // Clear Condition: إضافة سجل canceled (استبدال السجل السابق)
        const newRecord = {
          type: 'planning' as const,
          action: 'canceled' as const,
          condition: '',
          surfaces: [surfaceLabel],
          timestamp,
          timestampNum,
          doctorName: userName,
          isChange: undefined,
          previousCondition: undefined
        };

        // استبدال السجل السابق في toothRecords
        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record => {
            if (record.type !== 'planning') return true;

            // Remove old record for this surface
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface;
          });

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        // استبدال السجل السابق في pendingPlanningRecords
        setPendingPlanningRecords(prev => {
          const filtered = prev.filter(record => {
            if (record.toothNumber !== selectedTooth) return true;

            // Remove old record for this surface
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface;
          });

          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });
      }
    } else {
      // تلوين السطح المحدد فقط
      setToothConditions(prev => ({
        ...prev,
        [selectedTooth]: {
          ...(prev[selectedTooth] || {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null,
          }),
          [selectedSurface]: condition,
        },
      }));

      // إضافة سجل للقائمة العامة و toothRecords مباشرةً
      const now = new Date();
      const timestamp = formatTimestamp(now);

      const conditionName = getConditionName(condition);
      const surfaceOptions = getAllSurfaces(selectedTooth);
      const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
      const surfaceLabel = surface?.label || selectedSurface;
      const timestampNum = now.getTime() + Math.random() * 0.999;

      // كشف التغيير: البحث عن آخر سجل لنفس السطح بحالة مختلفة
      // أولوية البحث:
      // 1. editing_records (العلاجات المنفذة - الأسطح الخضراء)
      // 2. planning_records (التخطيطات)

      let isChange = false;
      let previousCondition = '';

      // ══════════════════════════════════════════════════════════════
      // STEP 1: البحث في editing_records أولاً (العلاجات المنفذة)
      // ══════════════════════════════════════════════════════════════
      const editingRecordsForTooth = toothRecords[selectedTooth] || [];
      const sortedEditingRecords = [...editingRecordsForTooth].sort((a, b) => b.timestampNum - a.timestampNum);

      console.log(`🔍 Searching in editing_records for tooth ${selectedTooth}, surface ${surfaceLabel}:`, {
        editingRecordsCount: editingRecordsForTooth.length,
        records: editingRecordsForTooth.map(r => ({ details: r.details, surfaces: r.surfaces }))
      });

      // البحث عن آخر علاج لنفس السطح
      // في editing_records: surfaces = ['mesial', 'distal'], details = 'Permanent Filling'
      const lastTreatmentForSurface = sortedEditingRecords.find(r =>
        r.surfaces && Array.isArray(r.surfaces) && r.surfaces.some(s => s.toLowerCase() === surfaceLabel.toLowerCase())
      );

      if (lastTreatmentForSurface && lastTreatmentForSurface.details) {
        // وجدنا علاج سابق (السطح أخضر) - استخدم details من editing_records
        const previousConditionName = lastTreatmentForSurface.details;

        console.log(` Found treatment record: ${previousConditionName} on ${surfaceLabel}`);

        // التحقق إذا كانت الحالة مختلفة
        if (previousConditionName.toLowerCase() !== conditionName.english.toLowerCase()) {
          isChange = true;
          previousCondition = previousConditionName;
          console.log(`🔄 CHANGE DETECTED (from Treatment): ${previousConditionName} → ${conditionName.english} on ${surfaceLabel}`);
        } else {
          console.log(` Same condition (Treatment): ${conditionName.english} on ${surfaceLabel}`);
        }
      } else {
        console.log(` No treatment found in editing_records, searching in planning_records...`);
        // ══════════════════════════════════════════════════════════════
        // STEP 2: لم نجد علاج - ابحث في planning_records (التخطيطات)
        // ══════════════════════════════════════════════════════════════
        const globalRecordsForTooth = allPlanningRecordsGlobal.filter(r => r.toothNumber === selectedTooth);
        const pendingRecordsForTooth = pendingPlanningRecords.filter(r => r.toothNumber === selectedTooth);
        const allRecordsForTooth = [...globalRecordsForTooth, ...pendingRecordsForTooth];

        const sortedRecordsForTooth = allRecordsForTooth.sort((a, b) => b.timestampNum - a.timestampNum);

        // أولاً: ابحث عن Extraction
        let lastDiagnosedForSurface = sortedRecordsForTooth.find(
          r => r.action === 'diagnosed' && r.condition === 'Extraction'
        );

        // إذا لم نجد Extraction، ابحث عن سجل لنفس السطح
        if (!lastDiagnosedForSurface) {
          lastDiagnosedForSurface = sortedRecordsForTooth.find(r =>
            r.action === 'diagnosed' &&
            r.surfaces.some(s => s.toLowerCase().includes(`(${surfaceLabel.toLowerCase()})`))
          );
        }

        if (lastDiagnosedForSurface) {
          // حالة خاصة: التغيير من Extraction
          if (lastDiagnosedForSurface.condition === 'Extraction') {
            if (conditionName.english !== 'Extraction') {
              isChange = true;
              previousCondition = 'Extraction';
              console.log(`🔄 CHANGE DETECTED (from Planning): Extraction → ${conditionName.english} on ${surfaceLabel}`);
            } else {
              console.log(` Same condition (Planning): Extraction`);
            }
          } else {
            // استخراج اسم الحالة من السجل السابق
            const previousSurfaceText = lastDiagnosedForSurface.surfaces.find(s => s.toLowerCase().includes(`(${surfaceLabel.toLowerCase()})`));
            if (previousSurfaceText) {
              const previousConditionMatch = previousSurfaceText.match(/^(.+?)\s*\(/);
              const previousConditionName = previousConditionMatch ? previousConditionMatch[1].trim() : previousSurfaceText;

              // التحقق إذا كانت الحالة مختلفة
              if (previousConditionName.toLowerCase() !== conditionName.english.toLowerCase()) {
                isChange = true;
                previousCondition = previousConditionName;
                console.log(`🔄 CHANGE DETECTED (from Planning): ${previousConditionName} → ${conditionName.english} on ${surfaceLabel}`);
              } else {
                console.log(` Same condition (Planning): ${conditionName.english} on ${surfaceLabel}`);
              }
            }
          }
        } else {
          console.log(`➕ NEW diagnosis: ${conditionName.english} on ${surfaceLabel}`);
        }
      }

      const newRecord = {
        type: 'planning' as const,
        action: 'diagnosed' as const,
        condition: conditionName.english, // Use actual condition name (Caries, Follow-up, etc.)
        surfaces: [`${conditionName.english} (${surfaceLabel})`],
        timestamp,
        timestampNum,
        doctorName: userName,
        isChange: isChange, // Track if this is a change from previous condition
        previousCondition: isChange ? previousCondition : undefined
      };

      // استبدال السجل السابق بدلاً من الإضافة (لنفس السن ونفس السطح)
      setPendingPlanningRecords(prev => {
        // Remove any existing record for this tooth + surface
        const filtered = prev.filter(record => {
          if (record.toothNumber !== selectedTooth) return true;

          // Check if this record is for the same surface
          const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
          return !recordSurface; // Keep only if different surface
        });

        // Add the new record
        return [
          ...filtered,
          {
            toothNumber: selectedTooth,
            ...newRecord
          }
        ];
      });

      // استبدال السجل في toothRecords أيضاً
      setToothRecords(prev => {
        const existingRecordsForTooth = prev[selectedTooth] || [];

        // Remove any existing planning record for this surface
        const filtered = existingRecordsForTooth.filter(record => {
          if (record.type !== 'planning') return true; // Keep non-planning records

          // Check if this record is for the same surface
          const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
          return !recordSurface; // Keep only if different surface
        });

        return {
          ...prev,
          [selectedTooth]: [
            ...filtered,
            newRecord
          ]
        };
      });

      // إذا كان تغيير من Extraction، احذف اللون الأسود من كل الأسطح فوراً
      if (isChange && previousCondition === 'Extraction') {
        console.log('🔄 Clearing extraction color from all surfaces immediately');

        // احذف كل الألوان أولاً
        const clearedConditions: ToothSurfaceConditions = {
          top: null,
          bottom: null,
          left: null,
          right: null,
          center: null,
        };

        // Mapping للأسطح (use helper to get correct mapping for lower teeth)
        const surfaceNameToKey = getSurfaceNameMap(selectedTooth);

        // أضف اللون الجديد للسطح المحدد فقط (إذا كان له لون)
        if (CONDITION_NAME_TO_KEY[conditionName.english]) {
          const surfaceKey = surfaceNameToKey[surfaceLabel.toLowerCase()];
          console.log(`  → Adding new color: condition="${conditionName.english}", surface="${surfaceLabel}", surfaceKey="${surfaceKey}", color="${CONDITION_NAME_TO_KEY[conditionName.english]}"`);
          if (surfaceKey) {
            clearedConditions[surfaceKey as keyof ToothSurfaceConditions] = CONDITION_NAME_TO_KEY[conditionName.english] as ToothCondition;
            console.log(`   clearedConditions after adding:`, clearedConditions);
          } else {
            console.log(`   surfaceKey is null for "${surfaceLabel}"`);
          }
        } else {
          console.log(`   No color mapping for condition "${conditionName.english}"`);
        }

        console.log(`  🎨 Final clearedConditions:`, clearedConditions);
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: clearedConditions
        }));
      }

    }
    setShowConditionMenu(false);
    setSelectedSurface(null);
  }
}
