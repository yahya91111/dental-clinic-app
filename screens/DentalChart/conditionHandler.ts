import {
  ToothSurfaceConditions,
  getConditionName,
  getAllSurfaces,
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
  selectedTooth: number | string | null;
  selectedSurface: string | null;
  toothConditions: Record<number | string, ToothSurfaceConditions>;
  toothRecords: Record<number | string, ToothRecord[]>;
  allPlanningRecordsGlobal: PlanningRecordGlobal[];
  pendingPlanningRecords: PendingPlanningRecord[];
  userName: string;
  // State setters
  setToothBorderColors: (fn: (prev: Record<number | string, ToothCondition>) => Record<number | string, ToothCondition>) => void;
  setToothConditions: (fn: (prev: Record<number | string, ToothSurfaceConditions>) => Record<number | string, ToothSurfaceConditions>) => void;
  setPendingPlanningRecords: (fn: (prev: PendingPlanningRecord[]) => PendingPlanningRecord[]) => void;
  setToothRecords: (fn: (prev: Record<number | string, ToothRecord[]>) => Record<number | string, ToothRecord[]>) => void;
  setHasModalChanges: (value: boolean) => void;
  setShowConditionMenu: (value: boolean) => void;
  setSelectedTooth: (value: number | string | null) => void;
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

      const toothNum = typeof selectedTooth === 'number' ? selectedTooth : parseInt(String(selectedTooth), 10);
      const surfaceOptions = getAllSurfaces(toothNum);
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
        toothNumber: toothNum,
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

      // تحقق إذا كان أي سطح extraction أو missing - إذا نعم، امسح الكل
      if (currentConditions) {
        const hasExtractionOrMissing =
          currentConditions.top === 'extraction' || currentConditions.top === 'missing' ||
          currentConditions.bottom === 'extraction' || currentConditions.bottom === 'missing' ||
          currentConditions.left === 'extraction' || currentConditions.left === 'missing' ||
          currentConditions.right === 'extraction' || currentConditions.right === 'missing' ||
          currentConditions.center === 'extraction' || currentConditions.center === 'missing';

        if (hasExtractionOrMissing) {
          // إزالة اللون من جميع الأسطح (لأن extraction/missing يؤثر على كل السن)
          console.log('🧹 Clear: Found extraction/missing, clearing ALL surfaces');
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

        const toothNumForSurface = typeof selectedTooth === 'number' ? selectedTooth : parseInt(String(selectedTooth), 10);
        const surfaceOptions = getAllSurfaces(toothNumForSurface);
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
      const toothNumForSurface = typeof selectedTooth === 'number' ? selectedTooth : parseInt(String(selectedTooth), 10);
      const surfaceOptions = getAllSurfaces(toothNumForSurface);
      const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
      const surfaceLabel = surface?.label || selectedSurface;
      const timestampNum = now.getTime() + Math.random() * 0.999;

      // كشف التغيير: البحث عن آخر سجل لنفس السطح بحالة مختلفة
      // أولوية البحث:
      // 0. الحالة المرئية الحالية (toothConditions) - الأهم
      // 1. editing_records (العلاجات المنفذة - الأسطح الخضراء)
      // 2. planning_records (التخطيطات)

      let isChange = false;
      let previousCondition = '';

      // ══════════════════════════════════════════════════════════════
      // STEP 0: فحص مباشر للحالة المرئية - هل السن محدد كـ Extraction؟
      // ══════════════════════════════════════════════════════════════
      const currentToothConditions = toothConditions[selectedTooth];
      if (currentToothConditions) {
        const allExtraction =
          currentToothConditions.top === 'extraction' &&
          currentToothConditions.bottom === 'extraction' &&
          currentToothConditions.left === 'extraction' &&
          currentToothConditions.right === 'extraction' &&
          currentToothConditions.center === 'extraction';

        if (allExtraction) {
          // نحن هنا في else block، أي condition ليس extraction/missing/treated/null
          // لذلك هذا تغيير من Extraction إلى حالة أخرى
          console.log('🔍 DIRECT CHECK: All surfaces are extraction, changing to:', conditionName.english);
          isChange = true;
          previousCondition = 'Extraction';
        }
      }

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
        console.log(`  → selectedSurface="${selectedSurface}", condition="${condition}", conditionName="${conditionName.english}"`);

        // احذف كل الألوان أولاً
        const clearedConditions: ToothSurfaceConditions = {
          top: null,
          bottom: null,
          left: null,
          right: null,
          center: null,
        };

        // استخدم selectedSurface مباشرة (وهو بالفعل key مثل 'top', 'bottom', 'left', 'right', 'center')
        // لا حاجة للتحويل من label إلى key
        if (selectedSurface && (selectedSurface === 'top' || selectedSurface === 'bottom' ||
            selectedSurface === 'left' || selectedSurface === 'right' || selectedSurface === 'center')) {
          clearedConditions[selectedSurface] = condition;
          console.log(`  → Setting ${selectedSurface} to ${condition}`);
          console.log(`  → clearedConditions:`, clearedConditions);
        } else {
          console.log(`  → WARNING: selectedSurface "${selectedSurface}" is not a valid key`);
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
