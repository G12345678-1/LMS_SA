/* Minimal Node/Express + SQLite backend for Leave Management (demo)

Endpoints implemented (demo):
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/forgot  (prints reset token)
- POST /api/auth/reset   (token-based reset)
- GET  /api/leaves       (list, query by ?status= or ?year=) - returns only own leaves for non-managers
- POST /api/leaves      (create leave request)
- POST /api/leaves/:id/approve  (manager approves/rejects)
- GET  /api/export/raw?year=YYYY
- GET  /api/export/summary?year=YYYY
- GET  /api/auth/me     (returns current user info)

This is a minimal, clear scaffold for development — not production ready.
*/

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const DB_FILE = process.env.DB_FILE || './data/leave.db';

// ensure data folder
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new sqlite3.Database(DB_FILE);

// initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    department TEXT,
    role TEXT DEFAULT 'Employee',
    password_hash TEXT,
    allocation INTEGER DEFAULT 20,
    used INTEGER DEFAULT 0,
    reset_token TEXT
  )`);

  // Create leaves table; allow real (fractional) duration_days
  db.run(`CREATE TABLE IF NOT EXISTS leaves (
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
  )`);

  // No automatic runtime migrations here. Use the separate migration script in `scripts/migrate.js` when needed.
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Rate limiter for auth endpoints to reduce brute force risk
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });

// helpers
function signToken(user){
  return jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: process.env.TOKEN_EXPIRY || '7d' });
}

function authMiddleware(req,res,next){
  const h = req.headers.authorization;
  if(!h) return res.status(401).json({error:'Missing auth token'});
  const parts = h.split(' ');
  if(parts.length !== 2) return res.status(401).json({error:'Invalid auth header'});
  const token = parts[1];
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; next();
  }catch(e){
    return res.status(401).json({error:'Invalid token'});
  }
}

function requireManager(req,res,next){
  if(req.user && (req.user.role === 'Manager' || req.user.role === 'Admin')) return next();
  return res.status(403).json({error:'Manager role required'});
}

// Auth routes
app.post('/api/auth/register', authLimiter, async (req,res)=>{
  const {name, username, email, department, role, password} = req.body;
  if(!username || !email || !password) return res.status(400).json({error:'username,email,password required'});
  const hash = await bcrypt.hash(password, 10);
  const stmt = db.prepare(`INSERT INTO users (name,username,email,department,role,password_hash) VALUES (?,?,?,?,?,?)`);
  stmt.run(name||'', username, email, department||'', role||'Employee', hash, function(err){
    if(err) return res.status(400).json({error: err.message});
    const user = { id: this.lastID, username, role: role||'Employee' };
    res.json({ message:'Registered', user, token: signToken(user) });
  });
});

app.post('/api/auth/login', authLimiter, (req,res)=>{
  const {username, password} = req.body;
  if(!username || !password) return res.status(400).json({error:'username and password required'});
  db.get('SELECT id,username,password_hash,role FROM users WHERE username = ?', [username], async (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!row) return res.status(400).json({error:'Invalid credentials'});
    const ok = await bcrypt.compare(password, row.password_hash);
    if(!ok) return res.status(400).json({error:'Invalid credentials'});
    const user = { id: row.id, username: row.username, role: row.role };
    res.json({ message:'Logged in', token: signToken(user) });
  });
});

app.post('/api/auth/forgot', authLimiter, (req,res)=>{
  const { email, username } = req.body;
  if(!email && !username) return res.status(400).json({error:'email or username required'});
  const q = email ? 'email = ?' : 'username = ?';
  const val = email || username;
  const token = Math.random().toString(36).slice(2,12);
  db.run(`UPDATE users SET reset_token = ? WHERE ${q}`, [token, val], function(err){
    if(err) return res.status(500).json({error:err.message});
    if(this.changes === 0) return res.status(404).json({error:'User not found'});
    // In production, send email. Here we return token for demo.
    res.json({message:'Password reset token generated (demo)', resetToken: token});
  });
});

app.post('/api/auth/reset', async (req,res)=>{
  const { username, token, newPassword } = req.body;
  if(!username || !token || !newPassword) return res.status(400).json({error:'username,token,newPassword required'});
  db.get('SELECT id,reset_token FROM users WHERE username = ?', [username], async (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!row || row.reset_token !== token) return res.status(400).json({error:'Invalid token'});
    const hash = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE users SET password_hash = ?, reset_token = NULL WHERE id = ?', [hash, row.id], function(err){
      if(err) return res.status(500).json({error:err.message});
      res.json({message:'Password reset successful'});
    });
  });
});

// Leaves
// Count business days (exclude weekends) between two dates (inclusive)
function daysBetween(startStr,endStr){
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  let count = 0;
  const current = new Date(s);
  while(current <= e){
    const dayOfWeek = current.getDay();
    // exclude Saturday (6) and Sunday (0)
    if(dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

app.post('/api/leaves', authMiddleware, upload.single('attachment'), (req,res)=>{
  const userId = req.user.id;
  let { type, start_date, end_date, start_time, end_time, time_frame, reason } = req.body;
  if(!start_date || !end_date) return res.status(400).json({error:'start_date and end_date required'});
  // default time-frame values (as requested):
  const DEFAULTS = { full: {start: '08:45', end: '18:00'}, am: {start: '08:45', end: '13:20'}, pm: {start: '13:30', end: '18:00'} };
  if(!time_frame) time_frame = 'Full Day';
  // normalize time_frame
  const tf = (time_frame || '').toLowerCase();
  if((!start_time || !end_time) && (tf === 'am' || tf === 'pm' || tf === 'full day' || tf === 'fullday' || tf === 'full')){
    if(tf === 'am') { start_time = DEFAULTS.am.start; end_time = DEFAULTS.am.end; }
    else if(tf === 'pm') { start_time = DEFAULTS.pm.start; end_time = DEFAULTS.pm.end; }
    else { start_time = DEFAULTS.full.start; end_time = DEFAULTS.full.end; }
  }

  // helper to compute minutes from HH:MM
  function minutesOf(hhmm){ const parts = (hhmm||'').split(':'); if(parts.length < 2) return null; return parseInt(parts[0],10)*60 + parseInt(parts[1],10); }
  const fullDayMinutes = minutesOf(DEFAULTS.full.end) - minutesOf(DEFAULTS.full.start);

  // compute duration
  let durationDays = 0;
  let durationHours = 0;
  const sameDay = start_date === end_date;
  if(sameDay){
    const sm = minutesOf(start_time) ?? minutesOf(DEFAULTS.full.start);
    const em = minutesOf(end_time) ?? minutesOf(DEFAULTS.full.end);
    if(sm == null || em == null || em < sm) return res.status(400).json({error:'Invalid start_time or end_time for same-day leave'});
    const mins = em - sm;
    durationHours = +(mins/60).toFixed(3);
    // prefer explicit half/full day when requested
    if(tf === 'am' || tf === 'pm') durationDays = 0.5;
    else if(tf === 'full day' || tf === 'fullday' || tf === 'full') durationDays = 1;
    else durationDays = +(durationHours / (fullDayMinutes/60)).toFixed(3);
  } else {
    // multi-day: count business days (weekdays only) and assume full days for intermediate days
    const days = daysBetween(start_date, end_date);
    durationDays = days;
    durationHours = +(days * (fullDayMinutes/60)).toFixed(3);
  }

  // check balance (use allocation minus used, compare with durationDays)
  db.get('SELECT allocation, used FROM users WHERE id = ?', [userId], (err,u)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!u) return res.status(404).json({error:'User not found'});
    if(durationDays > (u.allocation - u.used)) return res.status(400).json({error:'Insufficient leave balance'});
    const appliedAt = new Date().toISOString();
    const attach = req.file ? req.file.filename : null;
    const stmt = db.prepare(`INSERT INTO leaves (user_id,type,start_date,end_date,start_time,end_time,time_frame,reason,attachment,duration_days,duration_hours,applied_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(userId,type,start_date,end_date,start_time||'',end_time||'',time_frame||'',reason||'',attach,durationDays,durationHours,appliedAt,function(err){
      if(err) return res.status(500).json({error:err.message});
      res.json({message:'Leave requested', leaveId:this.lastID});
    });
  });
});

app.get('/api/leaves', authMiddleware, (req,res)=>{
  const status = req.query.status;
  const year = req.query.year;
  // Only managers or admins can see all users' leaves. Regular employees see only their own.
  let q = 'SELECT l.*, u.name, u.role FROM leaves l JOIN users u ON l.user_id = u.id';
  const params = [];
  const clauses = [];
  if(status) { clauses.push('l.status = ?'); params.push(status); }
  if(year) { clauses.push("(substr(l.start_date,1,4) = ? OR substr(l.end_date,1,4) = ?)"); params.push(year,year); }
  if(!(req.user && (req.user.role === 'Manager' || req.user.role === 'Admin'))){
    clauses.push('l.user_id = ?'); params.push(req.user.id);
  }
  if(clauses.length) q += ' WHERE ' + clauses.join(' AND ');
  q += ' ORDER BY l.applied_at DESC';
  db.all(q, params, (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// Return current authenticated user info (safe fields only)
app.get('/api/auth/me', authMiddleware, (req,res)=>{
  db.get('SELECT id,name,username,email,department,role,allocation,used FROM users WHERE id = ?', [req.user.id], (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!row) return res.status(404).json({error:'User not found'});
    res.json(row);
  });
});

app.post('/api/leaves/:id/approve', authMiddleware, requireManager, (req,res)=>{
  const id = req.params.id;
  const { action, remarks } = req.body; // action = 'Approved'|'Rejected'
  if(!['Approved','Rejected'].includes(action)) return res.status(400).json({error:'action must be Approved or Rejected'});
  const actionedAt = new Date().toISOString();
  db.get('SELECT * FROM leaves WHERE id = ?', [id], (err,leaf)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!leaf) return res.status(404).json({error:'Leave not found'});
    db.run('UPDATE leaves SET status = ?, actioned_at = ?, action_by = ? WHERE id = ?', [action, actionedAt, req.user.id, id], function(err){
      if(err) return res.status(500).json({error:err.message});
      if(action === 'Approved'){
        // increment user's used leave
        db.run('UPDATE users SET used = used + ? WHERE id = ?', [leaf.duration_days, leaf.user_id]);
      }
      res.json({message:'Action recorded'});
    });
  });
});

// Helper to format ISO timestamp to readable format (YYYY-MM-DD HH:MM)
function formatTimestamp(isoString){
  if(!isoString) return '';
  try {
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
  } catch(e) { return isoString; }
}

// Export raw CSV
function rowsToCSV(rows){
  return rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
}

app.get('/api/export/raw', authMiddleware, requireManager, (req,res)=>{
  const year = req.query.year || new Date().getFullYear().toString();
  const q = `SELECT u.name as employee, u.role, l.type, l.start_date, l.end_date, l.start_time, l.end_time, l.duration_days, l.duration_hours, l.status, l.applied_at, l.actioned_at FROM leaves l JOIN users u ON l.user_id = u.id WHERE substr(l.start_date,1,4) = ? OR substr(l.end_date,1,4) = ? ORDER BY l.start_date`;
  db.all(q, [year,year], (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    const header = ['Employee Name','Role','Leave Type','Start Date','End Date','Start Time','End Time','Duration Day','Duration Time','Status','Applied At','Approved At'];
    const data = [header];
    // helper to compute fallback duration in days from hours
    const minutesOf = (hhmm) => { if(!hhmm) return null; const p = hhmm.split(':'); if(p.length<2) return null; return parseInt(p[0],10)*60 + parseInt(p[1],10); };
    const fullDayMinutes = (minutesOf('18:00') - minutesOf('08:45')) || (9.25*60);
    rows.forEach(r => {
      let durDays = r.duration_days;
      if((durDays === null || durDays === undefined || Number(durDays) === 0) && r.duration_hours){
        durDays = +(Number(r.duration_hours) / (fullDayMinutes/60)).toFixed(3);
      }
      data.push([r.employee, r.role, r.type, r.start_date, r.end_date, r.start_time || '', r.end_time || '', durDays, r.duration_hours || 0, r.status, formatTimestamp(r.applied_at), formatTimestamp(r.actioned_at)]);
    });
    const csv = rowsToCSV(data);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leaves_raw_${year}.csv"`);
    res.send(csv);
  });
});

// Export summary CSV
app.get('/api/export/summary', authMiddleware, requireManager, (req,res)=>{
  const year = req.query.year || new Date().getFullYear().toString();
  db.all('SELECT id, name, role, allocation, used FROM users ORDER BY name', [], (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    const header = ['Employee Name','Role','Total Annual Leave Allocation','Leave Taken','Remaining Balance'];
    const data = [header];
    rows.forEach(r => data.push([r.name, r.role, r.allocation, r.used, r.allocation - r.used]));
    const csv = rowsToCSV(data);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leaves_summary_${year}.csv"`);
    res.send(csv);
  });
});

// Export the app for testing or further composition
module.exports = app;

if(require.main === module){
  app.listen(PORT, ()=>{
    console.log(`Server started on http://localhost:${PORT}`);
  });
}
