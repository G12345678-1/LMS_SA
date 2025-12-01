const API_BASE = 'http://localhost:4000/api';
const saveToken = t => localStorage.setItem('lms_token', t);
const getToken = () => localStorage.getItem('lms_token');
const clearToken = () => localStorage.removeItem('lms_token');

document.addEventListener('DOMContentLoaded', () => {
  if(document.getElementById('menuToggle')) {
    document.getElementById('menuToggle').onclick = () => {
      const nav = document.getElementById('mainNav');
      nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
    };
  }
  // default manager view filter
  window.showPendingOnly = false;
  loadCurrentUser();
  loadLeaves();
  // default time-frame behavior
  try {
    const tf = document.getElementById('timeFrame');
    const st = document.getElementById('startTime');
    const et = document.getElementById('endTime');
    const setDefaults = (val) => {
      if(!st || !et) return;
      if(val === 'AM') { st.value = '08:45'; et.value = '13:20'; }
      else if(val === 'PM') { st.value = '13:30'; et.value = '18:00'; }
      else if(val === 'Full Day') { st.value = '08:45'; et.value = '18:00'; }
      // Hourly: don't overwrite
    };
    if(tf) {
      // initial
      setDefaults(tf.value);
      tf.addEventListener('change', e => setDefaults(e.target.value));
    }
  } catch(e) { console.warn('Time defaults not applied', e); }
});

async function apiLogin(e) {
  e.preventDefault();
  const {username, password} = e.target;
  try {
    const r = await fetch(`${API_BASE}/auth/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: username.value, password: password.value})});
    const j = await r.json();
    if(!r.ok) {
      alert('Login failed: ' + (j.error || j.message || 'Unknown error'));
      return;
    }
    saveToken(j.token);
    alert('Login successful');
    loadCurrentUser();
    loadLeaves();
  } catch(e) { 
    alert('Error: ' + (e.name === 'AbortError' ? 'Request timeout' : e.message)); 
    console.error('Login error:', e);
  }
}

async function apiRegister(e) {
  e.preventDefault();
  const f = e.target;
  try {
    console.log('Registering user...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const r = await fetch(`${API_BASE}/auth/register`, {
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({name: f.name.value, username: f.username.value, email: f.email.value, department: f.department.value, role: f.role.value, password: f.password.value}),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const j = await r.json();
    console.log('Response:', j);
    if(!r.ok) {
      alert('Register failed: ' + (j.error || j.message || 'Unknown error'));
      return;
    }
    saveToken(j.token);
    alert('Registered successfully');
    f.reset();
    loadCurrentUser();
    loadLeaves();
  } catch(e) { 
    alert('Error: ' + (e.name === 'AbortError' ? 'Request timeout' : e.message)); 
    console.error(e);
  }
}

async function apiSubmitLeave(e) {
  e.preventDefault();
  const t = getToken();
  if(!t) return alert('Please login first');
  try {
    const r = await fetch(`${API_BASE}/leaves`, {method:'POST', headers:{'Authorization':'Bearer '+t}, body: new FormData(e.target)});
    const j = await r.json();
    if(!r.ok) {
      alert('Failed: ' + (j.error || j.message || 'Unknown error'));
      return;
    }
    alert('Leave submitted');
    loadLeaves();
  } catch(e) { 
    alert('Error: ' + (e.name === 'AbortError' ? 'Request timeout' : e.message));
    console.error('Leave submission error:', e);
  }
}

const sampleLeaves = [{name:'Alice', type:'Annual', start_date:'2025-12-02', end_date:'2025-12-04', status:'Approved'}, {name:'Bob', type:'Medical', start_date:'2025-11-30', end_date:'2025-11-30', status:'Pending'}];
const sampleSummary = [{name:'Alice', allocation:20, taken:5, remaining:15}, {name:'Bob', allocation:20, taken:2, remaining:18}];

const downloadCSV = (fn, rows) => {
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  a.download = fn;
  a.click();
};

async function apiExportRaw() {
  const y = document.getElementById('exportYear').value, t = getToken();
  if(!t) {
    alert('Please login to export data');
    return downloadCSV(`raw_${y}.csv`, [['Name','Type','Dates','Status'], ...sampleLeaves.map(l => [l.name,l.type,`${l.start_date}-${l.end_date}`,l.status])]);
  }
  try {
    const r = await fetch(`${API_BASE}/export/raw?year=${y}`, {headers:{'Authorization':'Bearer '+t}});
    if(!r.ok) {
      const j = await r.json();
      alert('Export failed: ' + (j.error || 'Unknown error'));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = `raw_${y}.csv`;
    a.click();
    alert('CSV downloaded');
  } catch(e) { alert('Error: ' + e.message); }
}

async function apiExportSummary() {
  const y = document.getElementById('exportYear').value, t = getToken();
  if(!t) {
    alert('Please login to export data');
    return downloadCSV(`summary_${y}.csv`, [['Name','Allocation','Used','Remaining'], ...sampleSummary.map(s => [s.name,s.allocation,s.taken,s.remaining])]);
  }
  try {
    const r = await fetch(`${API_BASE}/export/summary?year=${y}`, {headers:{'Authorization':'Bearer '+t}});
    if(!r.ok) {
      const j = await r.json();
      alert('Export failed: ' + (j.error || 'Unknown error'));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = `summary_${y}.csv`;
    a.click();
    alert('CSV downloaded');
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadCurrentUser() {
  const t = getToken(), u = document.getElementById('userArea');
  if(!u) return;
  if(!t) { u.innerHTML = '<div class="card">Not signed in</div>'; return; }
  try {
    const r = await fetch(`${API_BASE}/auth/me`, {headers:{'Authorization':'Bearer '+t}});
    if(!r.ok) { clearToken(); u.innerHTML = '<div class="card">Session expired</div>'; return; }
    const j = await r.json();
    // store current user for UI logic
    window.currentUser = j;
    u.innerHTML = `<div class="card">${j.name} (${j.role}) <button id="logoutBtn">Logout</button></div>`;
    document.getElementById('logoutBtn').onclick = () => { clearToken(); window.currentUser = null; loadCurrentUser(); loadLeaves(); };
    // show pending controls for managers
    const pc = document.getElementById('pendingControls');
    if(pc) pc.style.display = (j.role === 'Manager' || j.role === 'Admin') ? 'block' : 'none';
    updatePendingButton();
  } catch(e) {}
}

async function loadLeaves() {
  const t = getToken(), b = document.getElementById('onLeaveRows');
  if(!b) return;
  b.innerHTML = '';
  if(!t) {
    sampleLeaves.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${l.name}</td><td>${l.type}</td><td>${l.start_date}-${l.end_date}</td><td>${l.status}</td>`;
      b.appendChild(tr);
    });
    return;
  }
  try {
    // if manager requested pending-only view, pass status filter
    let url = `${API_BASE}/leaves`;
    if(window.showPendingOnly && window.currentUser && (window.currentUser.role === 'Manager' || window.currentUser.role === 'Admin')){
      url += '?status=Pending';
    }
    const r = await fetch(url, {headers:{'Authorization':'Bearer '+t}});
    if(!r.ok) return;
    const d = await r.json();
    d.forEach(x => {
      const tr = document.createElement('tr');
      // actions column for managers on pending requests
      let actions = '';
      if(window.currentUser && (window.currentUser.role === 'Manager' || window.currentUser.role === 'Admin') && x.status === 'Pending'){
        actions = `<td><button class="approve-btn" onclick="approveLeave(${x.id}, 'Approved')">Approve</button> <button class="reject-btn" onclick="approveLeave(${x.id}, 'Rejected')">Reject</button></td>`;
      } else {
        actions = '<td></td>';
      }
      const timeRange = `${x.start_date}${x.start_time ? ' ' + x.start_time : ''} - ${x.end_date}${x.end_time ? ' ' + x.end_time : ''}`;
      const dur = (x.duration_days !== null && x.duration_days !== undefined) ? `${x.duration_days} d / ${x.duration_hours || 0} h` : '';
      tr.innerHTML = `<td>${x.name}</td><td>${x.type}</td><td>${timeRange}${dur ? ' ('+dur+')' : ''}</td><td>${x.status}</td>${actions}`;
      b.appendChild(tr);
    });
  } catch(e) {}
}

// Manager approve/reject action
async function approveLeave(id, action){
  if(!confirm(`${action} leave id ${id}?`)) return;
  // optional remarks
  const remarks = prompt('Optional remarks (leave blank if none)');
  const t = getToken();
  if(!t) return alert('Please login as manager');
  try{
    const r = await fetch(`${API_BASE}/leaves/${id}/approve`, {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+t}, body: JSON.stringify({action, remarks})});
    const j = await r.json();
    if(!r.ok) return alert('Action failed: ' + (j.error || j.message || 'Unknown error'));
    alert('Action recorded');
    loadLeaves();
  }catch(e){ alert('Error: '+ e.message); }
}

function togglePendingView(){
  window.showPendingOnly = !window.showPendingOnly;
  updatePendingButton();
  loadLeaves();
}

function updatePendingButton(){
  const btn = document.getElementById('togglePending');
  if(!btn) return;
  btn.textContent = window.showPendingOnly ? 'Show All' : 'Show Pending Only';
}
