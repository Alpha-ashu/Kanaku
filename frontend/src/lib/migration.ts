/**
 * migration.ts
 *
 * Handles one-time migration of legacy localStorage keys:
 *   v1: KANAKU (original)  KANAKU(intermediate brand)
 *   v2: KANAKU KANAKU  (current brand, migrating back)
 */

const MIGRATION_V1_KEY = 'KANAKU_global_migration_v1';
const MIGRATION_V2_KEY = 'KANAKU_global_migration_v2';

export function runGlobalMigration() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // v1: KANAKU (original)  KANAKU
  if (!localStorage.getItem(MIGRATION_V1_KEY)) {
    const v1Migrations = [
      // Encryption keys
      { old: 'KANAKU_encrypted_key', new: 'KANAKU_encrypted_key' },
      { old: 'KANAKU_salt', new: 'KANAKU_salt' },
      { old: 'KANAKU_encrypted_key', new: 'KANAKU_encrypted_key' },
      { old: 'KANAKU_salt', new: 'KANAKU_salt' },

      // Guest Mode
      { old: 'KANAKU_guest_mode', new: 'KANAKU_guest_mode' },
      { old: 'KANAKU_guest_created_at', new: 'KANAKU_guest_created_at' },

      // Sync & Engine
      { old: 'KANAKU_sync_queue_v3', new: 'KANAKU_sync_queue_v3' },
      { old: 'KANAKU_learning_data', new: 'KANAKU_learning_data' },
      { old: 'KANAKU_merchant_patterns', new: 'KANAKU_merchant_patterns' },
      { old: 'KANAKU_description_repair_v2', new: 'KANAKU_description_repair_v2' },

      // App State
      { old: 'KANAKU_onboarding_completed', new: 'onboarding_completed' },
    ];

    let v1Count = 0;
    v1Migrations.forEach(({ old, new: newKey }) => {
      const val = localStorage.getItem(old);
      if (val !== null) {
        if (!localStorage.getItem(newKey)) {
          localStorage.setItem(newKey, val);
          v1Count++;
        }
      }
    });

    localStorage.setItem(MIGRATION_V1_KEY, 'done');
    if (v1Count > 0) {
      console.info(`[KANAKU/Migration] v1 complete. ${v1Count} keys migrated.`);
    }
  }

  // v2: KANAKU KANAKU 
  if (!localStorage.getItem(MIGRATION_V2_KEY)) {
    console.info('[KANAKU/Migration] Starting v2 brand migration (KANAKU  KANAKU)...');

    const v2Migrations = [
      // Encryption keys (critical  must migrate before app reads them)
      { old: 'KANAKU_encrypted_key', new: 'KANAKU_encrypted_key' },
      { old: 'KANAKU_salt', new: 'KANAKU_salt' },

      // Guest Mode
      { old: 'KANAKU_guest_mode', new: 'KANAKU_guest_mode' },
      { old: 'KANAKU_guest_created_at', new: 'KANAKU_guest_created_at' },

      // Sync & Engine
      { old: 'KANAKU_sync_queue_v3', new: 'KANAKU_sync_queue_v3' },
      { old: 'KANAKU_learning_data', new: 'KANAKU_learning_data' },
      { old: 'KANAKU_merchant_patterns', new: 'KANAKU_merchant_patterns' },
      { old: 'KANAKU_description_repair_v2', new: 'KANAKU_description_repair_v2' },

      // Internal repair flags
      { old: 'KANAKU_global_migration_v1', new: MIGRATION_V1_KEY },
    ];

    let v2Count = 0;
    v2Migrations.forEach(({ old, new: newKey }) => {
      const val = localStorage.getItem(old);
      if (val !== null) {
        if (!localStorage.getItem(newKey)) {
          localStorage.setItem(newKey, val);
          v2Count++;
        }
        // Keep old key for one cycle to prevent data loss during the transition
      }
    });

    localStorage.setItem(MIGRATION_V2_KEY, 'done');
    console.info(`[KANAKU/Migration] v2 complete. ${v2Count} keys migrated.`);
  }
}

