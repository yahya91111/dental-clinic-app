import { Alert } from 'react-native';
import {
  createPlanningBatch,
  createPlanningRecord,
  saveToothSurfaceCondition,
  deleteToothSurfaceCondition,
} from '../../lib/database';
import {
  ToothSurfaceConditions,
  convertNumberToPalmer,
  getSurfaceMap,
} from './dentalHelpers';
import { CONDITION_NAME_TO_KEY } from './constants';
import type { ToothSurface, ToothCondition } from '../../types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PendingPlanningRecord {
  toothNumber: number | string;
  type: 'planning';
  action: 'diagnosed' | 'canceled';
  condition: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  isChange?: boolean;
  previousCondition?: string;
}

export interface ToothRecord {
  type: 'editing' | 'planning';
  treatment?: string;
  details?: string;
  action?: 'diagnosed' | 'canceled';
  condition?: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  isChange?: boolean;
  previousCondition?: string;
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Extract surface name from strings like "Caries (Mesial)" or "Mesial"
 */
function extractSurfaceName(surfaceLabel: string): string {
  if (surfaceLabel.includes('(')) {
    const match = surfaceLabel.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : surfaceLabel;
  }
  return surfaceLabel;
}

/**
 * Map surface names to database surface names
 */
const SURFACE_NAME_TO_DB: Record<string, ToothSurface> = {
  'mesial': 'mesial',
  'distal': 'distal',
  'buccal': 'buccal',
  'lingual': 'lingual',
  'palatal': 'lingual',
  'occlusal': 'occlusal',
};

// ═══════════════════════════════════════════════════════════════
// Planning Submit Handler
// ═══════════════════════════════════════════════════════════════

interface PlanningSubmitParams {
  permanentPatientId: string;
  userName: string;
  pendingPlanningRecords: PendingPlanningRecord[];
  setAllPlanningRecordsGlobal: (fn: (prev: any[]) => any[]) => void;
  setPendingPlanningRecords: (records: PendingPlanningRecord[]) => void;
  loadPatientDentalData: () => Promise<void>;
}

export async function handlePlanningSubmit({
  permanentPatientId,
  userName,
  pendingPlanningRecords,
  setAllPlanningRecordsGlobal,
  setPendingPlanningRecords,
  loadPatientDentalData,
}: PlanningSubmitParams): Promise<boolean> {
  if (!permanentPatientId || !userName || pendingPlanningRecords.length === 0) {
    console.log('Cannot submit planning: missing data or no pending records');
    return false;
  }

  try {
    console.log('🔵 Submitting planning batch with', pendingPlanningRecords.length, 'records');

    // Step 1: Create a new planning batch
    const { data: batchData, error: batchError } = await createPlanningBatch(
      permanentPatientId,
      userName
    );

    if (batchError || !batchData) {
      console.error('❌ Error creating planning batch:', batchError);
      Alert.alert('خطأ', 'فشل حفظ التخطيط. حاول مرة أخرى.');
      return false;
    }

    const batchId = batchData.id;
    console.log('✅ Created planning batch:', batchId);

    // Step 2: Save all pending planning records with batch_id
    const savePromises = pendingPlanningRecords.map(async (record) => {
      const palmerNotation = convertNumberToPalmer(record.toothNumber);
      if (!palmerNotation) {
        console.error('Invalid tooth number:', record.toothNumber);
        return null;
      }

      // Don't lowercase special tooth status values
      const surfaceArray = record.surfaces.map(s => {
        if (s === 'Root Canal Treated' || s === 'Missing Tooth') {
          return s;
        }
        return s.toLowerCase();
      }) as ToothSurface[];

      console.log(`💾 Saving planning record - Tooth ${record.toothNumber}: condition="${record.condition}", surfaces=`, surfaceArray);

      return createPlanningRecord(
        permanentPatientId,
        palmerNotation,
        record.action,
        record.condition,
        surfaceArray,
        userName,
        record.isChange,
        record.previousCondition,
        batchId
      );
    });

    const results = await Promise.all(savePromises);
    const errors = results.filter(r => r?.error);

    if (errors.length > 0) {
      console.error('❌ Some planning records failed to save:', errors);
      Alert.alert('تحذير', 'تم حفظ بعض السجلات فقط. تحقق من البيانات.');
    } else {
      console.log('✅ All planning records saved successfully with batch_id:', batchId);
    }

    // Step 2.5: Save/Delete tooth surface conditions
    console.log('🔵 Saving tooth surface conditions from pending records...');

    const deleteOperationPromises: Promise<any>[] = [];
    const saveOperationPromises: Promise<any>[] = [];

    // Process each pending planning record
    for (const record of pendingPlanningRecords) {
      const palmerNotation = convertNumberToPalmer(record.toothNumber);
      if (!palmerNotation) continue;

      console.log(`🔍 Processing record: ${record.condition}, surfaces:`, record.surfaces);

      const surfaceMap = getSurfaceMap(record.toothNumber);

      // Handle change from Extraction
      if (record.isChange && record.previousCondition === 'Extraction') {
        console.log(`   → Changing from Extraction → clearing all surfaces first`);
        for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
          const dbSurface = surfaceMap[surfaceKey];
          deleteOperationPromises.push(
            deleteToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface)
          );
        }
      }

      // Handle Clear Condition (canceled)
      if (record.action === 'canceled') {
        record.surfaces.forEach(surfaceLabel => {
          const surfaceName = extractSurfaceName(surfaceLabel);
          const dbSurface = SURFACE_NAME_TO_DB[surfaceName.toLowerCase()];
          console.log(`  → Clear: "${surfaceLabel}" → surface:"${surfaceName}" → dbSurface:"${dbSurface}"`);
          if (dbSurface) {
            deleteOperationPromises.push(
              deleteToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface)
            );
          }
        });
      }
      // Handle surface-specific diagnoses (Caries, Fracture, etc.)
      else if (record.condition && CONDITION_NAME_TO_KEY[record.condition]) {
        const color = CONDITION_NAME_TO_KEY[record.condition];
        record.surfaces.forEach(surfaceLabel => {
          const surfaceName = extractSurfaceName(surfaceLabel);
          const dbSurface = SURFACE_NAME_TO_DB[surfaceName.toLowerCase()];
          console.log(`  → ${record.condition}: "${surfaceLabel}" → surface:"${surfaceName}" → dbSurface:"${dbSurface}" → color:"${color}"`);
          if (dbSurface) {
            saveOperationPromises.push(
              saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, color)
            );
          }
        });
      }
      // Handle Extraction
      else if (record.condition === 'Extraction') {
        console.log('  → Extraction: saving "extraction" to all surfaces');
        for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
          const dbSurface = surfaceMap[surfaceKey];
          saveOperationPromises.push(
            saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, 'extraction')
          );
        }
      }
      // Handle Missing Tooth
      else if (record.surfaces.includes('Missing Tooth')) {
        console.log('  → Missing Tooth: saving "missing" to all surfaces');
        for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
          const dbSurface = surfaceMap[surfaceKey];
          saveOperationPromises.push(
            saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, 'missing')
          );
        }
      }
      // Root Canal Treated: border color only
      else if (record.surfaces.includes('Root Canal Treated')) {
        console.log('  → Root Canal Treated: border color only (no surface colors saved)');
      }
    }

    // Execute DELETE operations first
    if (deleteOperationPromises.length > 0) {
      console.log(`🗑️ Executing ${deleteOperationPromises.length} delete operations...`);
      const deleteResults = await Promise.all(deleteOperationPromises);
      const deleteErrors = deleteResults.filter(r => r?.error);
      if (deleteErrors.length > 0) {
        console.error('❌ Some delete operations failed:', deleteErrors);
      } else {
        console.log(`✅ All ${deleteOperationPromises.length} delete operations completed`);
      }
    }

    // Execute SAVE operations after deletes
    if (saveOperationPromises.length > 0) {
      console.log(`💾 Executing ${saveOperationPromises.length} save operations...`);
      const saveResults = await Promise.all(saveOperationPromises);
      const saveErrors = saveResults.filter(r => r?.error);
      if (saveErrors.length > 0) {
        console.error('❌ Some save operations failed:', saveErrors);
      } else {
        console.log(`✅ All ${saveOperationPromises.length} save operations completed`);
      }
    }

    if (deleteOperationPromises.length === 0 && saveOperationPromises.length === 0) {
      console.log('ℹ️ No surface conditions to save/delete');
    }

    // Step 3: Move pending records to global
    setAllPlanningRecordsGlobal(prev => [...prev, ...pendingPlanningRecords]);

    // Step 4: Clear pending records
    setPendingPlanningRecords([]);

    // Step 5: Show success
    Alert.alert('✅ نجح', 'تم حفظ التخطيط بنجاح!');

    // Step 6: Reload data
    await loadPatientDentalData();

    return true;

  } catch (error) {
    console.error('❌ Exception in handlePlanningSubmit:', error);
    Alert.alert('خطأ', 'حدث خطأ أثناء حفظ التخطيط.');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Planning Cancel Handler
// ═══════════════════════════════════════════════════════════════

interface PlanningCancelParams {
  pendingPlanningRecords: PendingPlanningRecord[];
  setToothRecords: (fn: (prev: Record<number, ToothRecord[]>) => Record<number, ToothRecord[]>) => void;
  setPendingPlanningRecords: (records: PendingPlanningRecord[]) => void;
  setSelectedSurfaces: (surfaces: Record<number | string, string[]>) => void;
  loadPatientDentalData: () => Promise<void>;
}

export function handlePlanningCancel({
  pendingPlanningRecords,
  setToothRecords,
  setPendingPlanningRecords,
  setSelectedSurfaces,
  loadPatientDentalData,
}: PlanningCancelParams): void {
  if (pendingPlanningRecords.length === 0) {
    return;
  }

  Alert.alert(
    'إلغاء التخطيط',
    'هل تريد إلغاء كل التخطيطات المعلقة؟',
    [
      { text: 'لا', style: 'cancel' },
      {
        text: 'نعم',
        style: 'destructive',
        onPress: async () => {
          console.log('🔴 Canceling planning session - clearing', pendingPlanningRecords.length, 'pending records');

          // Step 1: Remove pending planning records from toothRecords
          setToothRecords(prev => {
            const updated = { ...prev };

            pendingPlanningRecords.forEach(pendingRecord => {
              const toothNum = pendingRecord.toothNumber;
              if (updated[toothNum]) {
                updated[toothNum] = updated[toothNum].filter(record => {
                  if (record.type !== 'planning') return true;
                  return !(
                    record.condition === pendingRecord.condition &&
                    record.timestampNum === pendingRecord.timestampNum
                  );
                });

                if (updated[toothNum].length === 0) {
                  delete updated[toothNum];
                }
              }
            });

            return updated;
          });

          // Step 2: Clear pending records
          setPendingPlanningRecords([]);

          // Step 3: Clear selected surfaces
          setSelectedSurfaces({});

          // Step 4: Reload from database
          await loadPatientDentalData();

          console.log('✅ Planning canceled - restored to saved state');
        }
      }
    ]
  );
}
