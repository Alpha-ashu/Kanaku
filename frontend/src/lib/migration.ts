/**
 * migration.ts
 *
 * Handles one-time migration of legacy localStorage keys:
 *   v1: KANKU_* (original brand) → KANAKU_* (current brand)
 *   v2: cleanup pass — marks migration complete for new installs
 */

const MIGRATION_V1_KEY = 'KANAKU_global_migration_v1';
const MIGRATION_V2_KEY = 'KANAKU_global_migration_v2';

export function runGlobalMigration() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // v1: KANKU_* → KANAKU_*
  if (!localStorage.getItem(MIGRATION_V1_KEY)) {
    const v1Migrations = [
      // Encryption keys
      { old: 'KANKU_encrypted_key', new: 'KANAKU_encrypted_key' },
      { old: 'KANKU_salt', new: 'KANAKU_salt' },

      // Guest Mode
      { old: 'KANKU_guest_mode', new: 'KANAKU_guest_mode' },
      { old: 'KANKU_guest_created_at', new: 'KANAKU_guest_created_at' },

      // Sync & Engine
      { old: 'KANKU_sync_queue_v3', new: 'KANAKU_sync_queue_v3' },
      { old: 'KANKU_learning_data', new: 'KANAKU_learning_data' },
      { old: 'KANKU_merchant_patterns', new: 'KANAKU_merchant_patterns' },
      { old: 'KANKU_description_repair_v2', new: 'KANAKU_description_repair_v2' },

      // App State
      { old: 'KANKU_onboarding_completed', new: 'onboarding_completed' },
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

  // v2: mark complete (no-op for existing installs that already have KANAKU_* keys)
  if (!localStorage.getItem(MIGRATION_V2_KEY)) {
    localStorage.setItem(MIGRATION_V2_KEY, 'done');
  }
}
