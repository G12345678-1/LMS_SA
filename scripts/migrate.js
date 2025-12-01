#!/usr/bin/env node
// Safe migration script: convert leaves.duration_days to REAL by recreating table and copying data.
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'leave.db');

if(!fs.existsSync(DB_FILE)){
  console.error('DB file not found:', DB_FILE);
  process.exit(1);
}

const db = new sqlite3.Database(DB_FILE);

function runMigration(){
  db.all("PRAGMA table_info('leaves')", (err, cols) => {
    if(err) { console.error('Error reading table info:', err); process.exit(1); }
    const dd = cols && cols.find(c => c.name === 'duration_days');
    if(!dd){ console.log('No duration_days column found; nothing to do'); process.exit(0); }
    const type = (dd.type||'').toLowerCase();
    if(type === 'real') { console.log('duration_days already REAL; nothing to do'); process.exit(0); }

    console.log('Migrating leaves.duration_days column to REAL...');
    // create a timestamped backup before running migration (skip for in-memory DB)
    try{
      if(DB_FILE !== ':memory:'){
        const bak = DB_FILE + '.backup.' + Date.now();
        fs.copyFileSync(DB_FILE, bak);
        console.log('Backup created at', bak);
      } else {
        console.log('Skipping backup for in-memory DB');
      }
    }catch(e){ console.error('Failed to create backup:', e); process.exit(1); }

    const sql = `BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS leaves_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        start_date TEXT,
        end_date TEXT,
        start_time TEXT,
        end_time TEXT,
        time_frame TEXT,
        reason TEXT,
        attachment TEXT,
        duration_days REAL,
        duration_hours REAL,
        status TEXT DEFAULT 'Pending',
        applied_at TEXT,
        actioned_at TEXT,
        action_by INTEGER
      );
      INSERT INTO leaves_new (id,user_id,type,start_date,end_date,start_time,end_time,time_frame,reason,attachment,duration_days,duration_hours,status,applied_at,actioned_at,action_by)
        SELECT id,user_id,type,start_date,end_date,start_time,end_time,time_frame,reason,attachment,duration_days,duration_hours,status,applied_at,actioned_at,action_by FROM leaves;
      DROP TABLE leaves;
      ALTER TABLE leaves_new RENAME TO leaves;
    COMMIT;`;

    db.exec(sql, (e) => {
      if(e){ console.error('Migration failed:', e); process.exit(1); }
      console.log('Migration completed successfully.');
      process.exit(0);
    });
  });
}

runMigration();
