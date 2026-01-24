import { Alert } from 'react-native';
import { createScalingRecord, deleteScalingRecord } from '../../lib/database';
import { formatTimestamp } from './dentalHelpers';

// ═══════════════════════════════════════════════════════════════
// Oral Hygiene (Scaling) Handlers
// Functions for adding and deleting scaling records
// ═══════════════════════════════════════════════════════════════

export interface ScalingRecord {
  id: string;
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

export interface OralHygieneHandlersParams {
  permanentPatientId: string | undefined;
  userName: string | undefined;
  setScalingRecords: React.Dispatch<React.SetStateAction<ScalingRecord[]>>;
  setIsOralHygieneExpanded: (expanded: boolean) => void;
}

/**
 * Add a new Scaling record
 */
export async function handleAddScaling({
  permanentPatientId,
  userName,
  setScalingRecords,
  setIsOralHygieneExpanded,
}: OralHygieneHandlersParams): Promise<void> {
  if (!permanentPatientId) {
    Alert.alert('Error', 'No patient selected');
    return;
  }

  const now = new Date();
  const timestamp = formatTimestamp(now);

  // حفظ في قاعدة البيانات
  const { data, error } = await createScalingRecord(
    permanentPatientId,
    userName || 'Dr. Unknown'
  );

  if (error) {
    Alert.alert('Error', 'Failed to save scaling record');
    console.error('Error saving scaling record:', error);
    return;
  }

  // إضافة للـ state
  if (data) {
    setScalingRecords(prev => [
      {
        id: data.id,
        timestamp,
        doctorName: userName || 'Dr. Unknown',
        timestampNum: now.getTime()
      },
      ...prev
    ]);
  }

  // إغلاق الحاوية بعد الإضافة
  setIsOralHygieneExpanded(false);
}

/**
 * Delete a Scaling record
 */
export async function handleDeleteScalingRecord(
  recordId: string,
  index: number,
  setScalingRecords: React.Dispatch<React.SetStateAction<ScalingRecord[]>>
): Promise<void> {
  const { error } = await deleteScalingRecord(recordId);
  if (error) {
    Alert.alert('Error', 'Failed to delete scaling record');
    console.error('Error deleting scaling record:', error);
    return;
  }
  setScalingRecords(prev => prev.filter((_, i) => i !== index));
}
