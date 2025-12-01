PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  department TEXT,
  role TEXT DEFAULT 'Employee',
  password_hash TEXT,
  allocation INTEGER DEFAULT 20,
  used REAL DEFAULT 0,
  reset_token TEXT
);

CREATE TABLE IF NOT EXISTS leaves (
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
  action_by INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
