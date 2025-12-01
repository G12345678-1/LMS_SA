export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === 'OPTIONS') return cors();
    const route = (m, p) => method === m && path === p;

    try {
      
      if (route('POST', '/api/auth/register')) {
        const body = await req.json();
        const { name = '', username, email, department = '', role = 'Employee', password } = body || {};
        if (!username || !email || !password) return json({ error: 'username,email,password required' }, 400);
        const hash = await sha256(password);
        const applied = await env.DB.prepare(
          'INSERT INTO users (name,username,email,department,role,password_hash) VALUES (?,?,?,?,?,?)'
        ).bind(name, username, email, department, role, hash).run();
        const userId = applied.success ? applied.meta.last_row_id : null;
        const token = randomToken();
        const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        await env.DB.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind(token, userId, expires).run();
        return json({ message: 'Registered', user: { id: userId, username, role }, token });
      }

      if (route('POST', '/api/auth/login')) {
        const body = await req.json();
        const { username, password } = body || {};
        if (!username || !password) return json({ error: 'username and password required' }, 400);
        const row = await env.DB.prepare('SELECT id,username,password_hash,role FROM users WHERE username = ?').bind(username).first();
        if (!row) return json({ error: 'Invalid credentials' }, 400);
        const ok = (await sha256(password)) === row.password_hash;
        if (!ok) return json({ error: 'Invalid credentials' }, 400);
        const token = randomToken();
        const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        await env.DB.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').bind(token, row.id, expires).run();
        return json({ message: 'Logged in', token });
      }

      if (route('POST', '/api/auth/forgot')) {
        const body = await req.json();
        const { email, username } = body || {};
        if (!email && !username) return json({ error: 'email or username required' }, 400);
        const q = email ? 'email = ?' : 'username = ?';
        const val = email || username;
        const token = randomToken().slice(0, 10);
        const res = await env.DB.prepare(`UPDATE users SET reset_token = ? WHERE ${q}`).bind(token, val).run();
        if (!res.success || res.meta.changes === 0) return json({ error: 'User not found' }, 404);
        return json({ message: 'Password reset token generated (demo)', resetToken: token });
      }

      if (route('POST', '/api/auth/reset')) {
        const body = await req.json();
        const { username, token, newPassword } = body || {};
        if (!username || !token || !newPassword) return json({ error: 'username,token,newPassword required' }, 400);
        const row = await env.DB.prepare('SELECT id,reset_token FROM users WHERE username = ?').bind(username).first();
        if (!row || row.reset_token !== token) return json({ error: 'Invalid token' }, 400);
        const hash = await sha256(newPassword);
        await env.DB.prepare('UPDATE users SET password_hash = ?, reset_token = NULL WHERE id = ?').bind(hash, row.id).run();
        return json({ message: 'Password reset successful' });
      }

      if (route('GET', '/api/auth/me')) {
        const auth = await requireAuth(req, env);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const user = auth.user;
        const row = await env.DB.prepare('SELECT id,name,username,email,department,role,allocation,used FROM users WHERE id = ?').bind(user.id).first();
        if (!row) return json({ error: 'User not found' }, 404);
        return json(row);
      }

      if (route('POST', '/api/leaves')) {
        const auth = await requireAuth(req, env);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const user = auth.user;
        const contentType = req.headers.get('content-type') || '';
        let payload = {};
        let attachmentName = null;
        if (contentType.includes('multipart/form-data')) {
          const fd = await req.formData();
          payload = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]));
          const file = fd.get('attachment');
          attachmentName = typeof file === 'object' && file ? file.name : null;
        } else {
          payload = await req.json();
        }
        let { type, start_date, end_date, start_time, end_time, time_frame, reason } = payload;
        if (!start_date || !end_date) return json({ error: 'start_date and end_date required' }, 400);
        const DEFAULTS = { full: { start: '08:45', end: '18:00' }, am: { start: '08:45', end: '13:20' }, pm: { start: '13:30', end: '18:00' } };
        if (!time_frame) time_frame = 'Full Day';
        const tf = (time_frame || '').toLowerCase();
        if ((!start_time || !end_time) && (tf === 'am' || tf === 'pm' || tf === 'full day' || tf === 'fullday' || tf === 'full')) {
          if (tf === 'am') { start_time = DEFAULTS.am.start; end_time = DEFAULTS.am.end; }
          else if (tf === 'pm') { start_time = DEFAULTS.pm.start; end_time = DEFAULTS.pm.end; }
          else { start_time = DEFAULTS.full.start; end_time = DEFAULTS.full.end; }
        }
        const minutesOf = (hhmm) => { const parts = (hhmm || '').split(':'); if (parts.length < 2) return null; return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10); };
        const fullDayMinutes = minutesOf(DEFAULTS.full.end) - minutesOf(DEFAULTS.full.start);
        let durationDays = 0, durationHours = 0;
        const sameDay = start_date === end_date;
        if (sameDay) {
          const sm = minutesOf(start_time) ?? minutesOf(DEFAULTS.full.start);
          const em = minutesOf(end_time) ?? minutesOf(DEFAULTS.full.end);
          if (sm == null || em == null || em < sm) return json({ error: 'Invalid start_time or end_time for same-day leave' }, 400);
          const mins = em - sm;
          durationHours = +(mins / 60).toFixed(3);
          if (tf === 'am' || tf === 'pm') durationDays = 0.5;
          else if (tf === 'full day' || tf === 'fullday' || tf === 'full') durationDays = 1;
          else durationDays = +(durationHours / (fullDayMinutes / 60)).toFixed(3);
        } else {
          const days = daysBetween(start_date, end_date);
          durationDays = days;
          durationHours = +(days * (fullDayMinutes / 60)).toFixed(3);
        }
        const u = await env.DB.prepare('SELECT allocation, used FROM users WHERE id = ?').bind(user.id).first();
        if (!u) return json({ error: 'User not found' }, 404);
        if (durationDays > (u.allocation - (u.used || 0))) return json({ error: 'Insufficient leave balance' }, 400);
        const appliedAt = new Date().toISOString();
        const res = await env.DB.prepare(
          'INSERT INTO leaves (user_id,type,start_date,end_date,start_time,end_time,time_frame,reason,attachment,duration_days,duration_hours,applied_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
        ).bind(user.id, type, start_date, end_date, start_time || '', end_time || '', time_frame || '', reason || '', attachmentName, durationDays, durationHours, appliedAt).run();
        return json({ message: 'Leave requested', leaveId: res.meta.last_row_id });
      }

      if (route('GET', '/api/leaves')) {
        const auth = await requireAuth(req, env);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const user = auth.user;
        const status = url.searchParams.get('status');
        const year = url.searchParams.get('year');
        let q = 'SELECT l.*, u.name, u.role FROM leaves l JOIN users u ON l.user_id = u.id';
        const clauses = [];
        const params = [];
        if (status) { clauses.push('l.status = ?'); params.push(status); }
        if (year) { clauses.push('(substr(l.start_date,1,4) = ? OR substr(l.end_date,1,4) = ?)'); params.push(year, year); }
        if (!(user.role === 'Manager' || user.role === 'Admin')) { clauses.push('l.user_id = ?'); params.push(user.id); }
        if (clauses.length) q += ' WHERE ' + clauses.join(' AND ');
        q += ' ORDER BY l.applied_at DESC';
        const r = await env.DB.prepare(q).bind(...params).all();
        return json(r.results || []);
      }

      if (path.startsWith('/api/leaves/') && method === 'POST' && path.endsWith('/approve')) {
        const auth = await requireAuth(req, env);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const user = auth.user;
        if (!(user.role === 'Manager' || user.role === 'Admin')) return json({ error: 'Manager role required' }, 403);
        const id = path.split('/')[3];
        const body = await req.json();
        const { action } = body || {};
        if (!['Approved', 'Rejected'].includes(action)) return json({ error: 'action must be Approved or Rejected' }, 400);
        const actionedAt = new Date().toISOString();
        const leaf = await env.DB.prepare('SELECT * FROM leaves WHERE id = ?').bind(Number(id)).first();
        if (!leaf) return json({ error: 'Leave not found' }, 404);
        await env.DB.prepare('UPDATE leaves SET status = ?, actioned_at = ?, action_by = ? WHERE id = ?').bind(action, actionedAt, user.id, Number(id)).run();
        if (action === 'Approved') {
          await env.DB.prepare('UPDATE users SET used = COALESCE(used,0) + ? WHERE id = ?').bind(leaf.duration_days || 0, leaf.user_id).run();
        }
        return json({ message: 'Action recorded' });
      }

      if (route('GET', '/api/export/raw')) {
        const auth = await requireAuth(req, env);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const user = auth.user;
        if (!(user.role === 'Manager' || user.role === 'Admin')) return json({ error: 'Manager role required' }, 403);
        const year = url.searchParams.get('year') || new Date().getFullYear().toString();
        const q = 'SELECT u.name as employee, u.role, l.type, l.start_date, l.end_date, l.start_time, l.end_time, l.duration_days, l.duration_hours, l.status, l.applied_at, l.actioned_at FROM leaves l JOIN users u ON l.user_id = u.id WHERE substr(l.start_date,1,4) = ? OR substr(l.end_date,1,4) = ? ORDER BY l.start_date';
        const r = await env.DB.prepare(q).bind(year, year).all();
        const rows = r.results || [];
        const header = ['Employee Name','Role','Leave Type','Start Date','End Date','Start Time','End Time','Duration Day','Duration Time','Status','Applied At','Approved At'];
        const minutesOf = (hhmm) => { if(!hhmm) return null; const p = hhmm.split(':'); if(p.length<2) return null; return parseInt(p[0],10)*60 + parseInt(p[1],10); };
        const fullDayMinutes = (minutesOf('18:00') - minutesOf('08:45')) || (9.25*60);
        const data = [header];
        for (const r of rows) {
          let durDays = r.duration_days;
          if ((durDays === null || durDays === undefined || Number(durDays) === 0) && r.duration_hours) {
            durDays = +(Number(r.duration_hours) / (fullDayMinutes/60)).toFixed(3);
          }
          data.push([r.employee, r.role, r.type, r.start_date, r.end_date, r.start_time || '', r.end_time || '', durDays, r.duration_hours || 0, r.status, formatTimestamp(r.applied_at), formatTimestamp(r.actioned_at)]);
        }
        const csv = rowsToCSV(data);
        return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="leaves_raw_${year}.csv"` } });
      }

      if (route('GET', '/api/export/summary')) {
        const auth = await requireAuth(req, env);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const user = auth.user;
        if (!(user.role === 'Manager' || user.role === 'Admin')) return json({ error: 'Manager role required' }, 403);
        const year = url.searchParams.get('year') || new Date().getFullYear().toString();
        const r = await env.DB.prepare('SELECT id, name, role, allocation, used FROM users ORDER BY name').all();
        const rows = r.results || [];
        const header = ['Employee Name','Role','Total Annual Leave Allocation','Leave Taken','Remaining Balance'];
        const data = [header];
        for (const u of rows) data.push([u.name, u.role, u.allocation, u.used || 0, (u.allocation || 0) - (u.used || 0)]);
        const csv = rowsToCSV(data);
        return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="leaves_summary_${year}.csv"` } });
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: 'Internal error', message: e.message }, 500);
    }
  }
};

function cors() {
  return new Response('', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
function randomToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function requireAuth(req, env){
  const h = req.headers.get('authorization');
  if(!h) return { ok: false, status: 401, error: 'Missing auth token' };
  const parts = h.split(' ');
  if(parts.length !== 2) return { ok: false, status: 401, error: 'Invalid auth header' };
  const token = parts[1];
  const sess = await env.DB.prepare('SELECT token,user_id,expires_at FROM sessions WHERE token = ?').bind(token).first();
  if(!sess) return { ok: false, status: 401, error: 'Invalid token' };
  if(sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) return { ok: false, status: 401, error: 'Token expired' };
  const user = await env.DB.prepare('SELECT id,username,role FROM users WHERE id = ?').bind(sess.user_id).first();
  if(!user) return { ok: false, status: 404, error: 'User not found' };
  return { ok: true, user };
}
async function sha256(s) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function daysBetween(startStr, endStr) {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  let count = 0;
  const current = new Date(s);
  while (current <= e) {
    const dayOfWeek = current.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}
function formatTimestamp(isoString){
  if(!isoString) return '';
  try { const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
  } catch(e) { return isoString; }
}
function rowsToCSV(rows){
  return rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
}
