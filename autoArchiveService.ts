/**
 * Auto Archive Service
 * Automatically archives patients at midnight (12:00 AM) every day
 * Silent mode - no notifications
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabaseClient';

// ✅ نظام بسيط لإبلاغ Timeline بالأرشفة
type ArchiveListener = (date: string) => void;
let archiveListeners: ArchiveListener[] = [];

export const archiveEventEmitter = {
  on: (event: string, listener: ArchiveListener) => {
    if (event === 'archive-completed') {
      archiveListeners.push(listener);
    }
  },
  off: (event: string, listener: ArchiveListener) => {
    if (event === 'archive-completed') {
      archiveListeners = archiveListeners.filter(l => l !== listener);
    }
  },
  emit: (event: string, date: string) => {
    if (event === 'archive-completed') {
      archiveListeners.forEach(listener => listener(date));
    }
  }
};

const LAST_ARCHIVE_DATE_KEY = '@last_archive_date';
const CHECK_INTERVAL = 60000; // Check every 1 minute

let archiveInterval: NodeJS.Timeout | null = null;

/**
 * Archive all patients for all clinics
 */
async function archiveAllPatients(): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Step 1: Update archive_date for all patients that are not yet archived
    const { data: archivedPatients, error: archiveError } = await supabase
      .from('patients')
      .update({
        archive_date: today
        // ✅ لا نغير status - نحافظ على الحالة الأصلية
      })
      .is('archive_date', null) // Only unarchived patients
      .select('id'); // Get IDs of archived patients

    if (archiveError) throw archiveError;
    
    // Step 2: Clean up timeline events for archived patients
    if (archivedPatients && archivedPatients.length > 0) {
      const patientIds = archivedPatients.map(p => p.id);
      
      const { error: timelineError } = await supabase
        .from('timeline_events')
        .delete()
        .in('patient_id', patientIds);
      
      if (timelineError) {
        // Don't fail the whole operation if timeline cleanup fails
      }
    }

    // Step 3: Save last archive date
    await AsyncStorage.setItem(LAST_ARCHIVE_DATE_KEY, today);

    // ✅ إبلاغ Timeline بالأرشفة
    archiveEventEmitter.emit('archive-completed', today);

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if we need to archive today
 */
async function shouldArchiveToday(): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const lastArchiveDate = await AsyncStorage.getItem(LAST_ARCHIVE_DATE_KEY);

    // Archive if we haven't archived today yet
    return lastArchiveDate !== today;
  } catch (error) {
    return true; // Archive if we can't check
  }
}

/**
 * Check if it's 23:59 (11:59 PM)
 */
function isEndOfDay(): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Check if it's 23:59 (1 minute window)
  return hours === 23 && minutes === 59;
}

/**
 * Check and archive if needed
 */
async function checkAndArchive() {
  try {
    // Check if it's 23:59
    if (!isEndOfDay()) {
      return;
    }

    // Check if we should archive today
    const shouldArchive = await shouldArchiveToday();

    if (shouldArchive) {
      await archiveAllPatients();
    }
  } catch (error) {
    // Error handling
  }
}

/**
 * Start automatic archive service
 */
export function startAutoArchive() {
  // Clear existing interval if any
  if (archiveInterval) {
    clearInterval(archiveInterval);
  }

  // Check every minute
  archiveInterval = setInterval(checkAndArchive, CHECK_INTERVAL);

  // Also check immediately on start (in case app starts at midnight)
  checkAndArchive();
}

/**
 * Stop automatic archive service
 */
export function stopAutoArchive() {
  if (archiveInterval) {
    clearInterval(archiveInterval);
    archiveInterval = null;
  }
}

/**
 * Get last archive date
 */
export async function getLastArchiveDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ARCHIVE_DATE_KEY);
  } catch (error) {
    return null;
  }
}

/**
 * Manual archive trigger (for testing or manual use)
 */
export async function manualArchive(): Promise<boolean> {
  return await archiveAllPatients();
}

/**
 * Test function - Force archive immediately (ignores time and date checks)
 */
export async function testArchiveNow(): Promise<boolean> {
  try {
    const result = await archiveAllPatients();
    return result;
  } catch (error) {
    return false;
  }
}
