# DATABASE INTEGRITY REPORT
**Generated:** 2026-07-15T04:56:37.788Z

## 1. Schema Validation

| Tables | 53 | PASS ✅ |

### Applied Migrations (last 5)
- `20260715000000_todo_indexes`
- `20260708000000_drop_user_pii`
- `20260707000000_sync_schema_drift`
- `20260627000000_registration_integrity`
- `20260624000000_remove_tax_calculations`

## 2. Financial Table Row Counts
| Table | Row Count | Notes |
|---|---|---|
| Users | 165 | — |
| Accounts | 83 | — |
| Transactions | 357 | — |
| Loans | 30 | — |
| Loan Payments | 37 | — |
| Goals | 48 | — |
| Goal Contributions | 105 | — |
| Budgets | 64 | — |
| Group Expenses | 7 | — |
| Audit Logs | 1182 | — |
| Notifications | 108 | — |

## 3. Backup Tool & Policy
- **pg_dump:** Not in PATH ⚠️ (Supabase automatic backups are still active)
- **Supabase automatic backups:** Enabled (Supabase platform manages daily snapshots)
- **Retention:** 7-day rolling backups on Supabase Pro / 30-day on Team plan
- **PITR:** Available on Supabase Pro+ (confirm in Supabase Dashboard → Database → Backups)
- **Manual backup command:**
  ```bash
  pg_dump "$DATABASE_URL" -Fc -f kanakku_backup_$(date +%Y%m%d).dump
  ```
- **Restore command:**
  ```bash
  pg_restore -d "$DATABASE_URL" kanakku_backup_<date>.dump
  ```

> [!NOTE]
> Set `SUPABASE_MANAGEMENT_TOKEN` in `.env` to enable automated backup verification via Supabase Management API.

## 4. Backup Policy Summary

| Item | Status |
|---|---|
| Database connection | ✅ Connected |
| Schema tables (53) | ✅ ≥40 tables present |
| Latest migration | ✅ `20260715000000_todo_indexes` applied |
| Supabase automatic backups | ✅ Platform-managed (verify in Dashboard) |
| pg_dump available | ⚠️ Not in PATH |
| PITR configured | ⚠️ Verify in Supabase Dashboard → Database → Backups |
| Disaster recovery documented | ✅ Commands in this report |

> [!IMPORTANT]
> **Action required:** Verify PITR is enabled in Supabase Dashboard before production launch.
> Navigate to: Project → Database → Backups → Point in Time Recovery.