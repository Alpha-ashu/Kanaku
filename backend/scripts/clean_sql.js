const fs = require('fs');
let sql = fs.readFileSync('schema_clean.sql', 'utf8');
if (sql.charCodeAt(0) === 0xFEFF) sql = sql.slice(1);
// Replace all "auth". with "public". to avoid permission issues in Supabase
sql = sql.replace(/"auth"\./g, '"public".');
// Remove schema creation for auth
sql = sql.replace(/CREATE SCHEMA IF NOT EXISTS "auth";/g, '');
fs.writeFileSync('schema_final.sql', sql, 'utf8');
