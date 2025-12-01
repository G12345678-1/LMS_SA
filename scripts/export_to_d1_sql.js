const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'leave.db');
const outPath = path.join(__dirname, 'd1_seed.sql');
function esc(v){ if(v===null||v===undefined) return 'NULL'; const s=String(v).replace(/'/g,"''"); return `'${s}'`; }
const db = new sqlite3.Database(dbPath);
function run(){
  db.serialize(()=>{
    db.all('SELECT id,name,username,email,department,role,password_hash,allocation,used,reset_token FROM users ORDER BY id', (e, users)=>{
      if(e) throw e;
      db.all('SELECT id,user_id,type,start_date,end_date,start_time,end_time,time_frame,reason,attachment,duration_days,duration_hours,status,applied_at,actioned_at,action_by FROM leaves ORDER BY id', (e2, leaves)=>{
        if(e2) throw e2;
        let sql = '';
        users.forEach(u=>{
          sql += `INSERT INTO users (id,name,username,email,department,role,password_hash,allocation,used,reset_token) VALUES (${u.id},${esc(u.name)},${esc(u.username)},${esc(u.email)},${esc(u.department)},${esc(u.role)},${esc(u.password_hash)},${u.allocation??'NULL'},${u.used??'NULL'},${esc(u.reset_token)});\n`;
        });
        leaves.forEach(l=>{
          sql += `INSERT INTO leaves (id,user_id,type,start_date,end_date,start_time,end_time,time_frame,reason,attachment,duration_days,duration_hours,status,applied_at,actioned_at,action_by) VALUES (${l.id},${l.user_id},${esc(l.type)},${esc(l.start_date)},${esc(l.end_date)},${esc(l.start_time)},${esc(l.end_time)},${esc(l.time_frame)},${esc(l.reason)},${esc(l.attachment)},${l.duration_days??'NULL'},${l.duration_hours??'NULL'},${esc(l.status)},${esc(l.applied_at)},${esc(l.actioned_at)},${l.action_by??'NULL'});\n`;
        });
        fs.writeFileSync(outPath, sql);
        db.close();
        console.log('Wrote', outPath);
      });
    });
  });
}
run();
