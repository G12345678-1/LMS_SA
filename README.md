# Leave Management System – Requirements & Implementation

## Project Overview

**Leave Management System** is a web-based application that allows employees to apply for leave, view leave schedules, and track yearly leave balances. Managers can approve/reject requests and export leave data and summary reports. Secure authentication (account creation, login, password recovery) is included.

### What's Included

This repository provides:
- **Static front-end** (HTML/CSS/JS) with documentation, forms, and demo UI
- **Node/Express backend** (SQLite) with JWT authentication, leave CRUD, and CSV export endpoints
- **Tests & CI** (Jest + Supertest, GitHub Actions)
- **VS Code workspace setup** with launch configs and tasks

### Key Features

✓ User authentication (register, login, password reset)
✓ Role-based access (Employee, Manager, Admin)
✓ Leave application with types, dates, times, and attachments
✓ Time-frame support (AM half: 08:45–13:20, PM half: 13:30–18:00, Full day: 08:45–18:00)
✓ Business days calculation (weekends excluded from duration)
✓ Fractional leave days (0.5 for half-days, 1.0 for full days)
✓ Leave approval workflow for managers with optional remarks
✓ CSV export of raw leave data (with date/time and duration) and summary reports
✓ Rate-limited auth endpoints (prevent brute-force)
✓ Responsive, mobile-friendly UI
✓ Automated tests and GitHub Actions CI

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET to a strong, random value
```

### 3. Run Tests (Verify Setup)

```bash
npm test
```

### 4. Start Backend Server

```bash
npm start                # Production mode
npm run dev              # Development mode with auto-reload
```

Backend API runs at `http://localhost:4000`

### 5. View Front-end

```bash
# Option A: Open index.html directly in browser
open index.html

# Option B: Serve statically (for CORS compatibility)
python3 -m http.server 8000
# then open http://localhost:8000
```

## User Flows

### Employee Workflow
1. Register or log in
2. Submit a leave request (type, dates, optional attachment)
3. View personal leave history and balance
4. Receive notifications on approval/rejection

### Manager Workflow
1. Log in (must have Manager role)
2. View all employees' leave requests and approve/reject them
3. Export raw leave data (CSV) for a selected year
4. Export summary report (CSV) showing all employees' leave balances

### Admin Workflow (Optional)
- Manage user roles and accounts
- Configure leave policies and annual allocations

## API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user (returns JWT) |
| POST | `/api/auth/login` | Log in (returns JWT) |
| GET | `/api/auth/me` | Get current user info (requires token) |
| POST | `/api/auth/forgot` | Request password reset token |
| POST | `/api/auth/reset` | Reset password with token |

### Leave Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leaves` | Submit a leave request (requires token) |
| GET | `/api/leaves` | List leaves (own only for employees, all for managers) |
| POST | `/api/leaves/:id/approve` | Approve/reject leave (manager only) |

### Export Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/export/raw?year=YYYY` | Export raw leave data as CSV (manager only) |
| GET | `/api/export/summary?year=YYYY` | Export summary report as CSV (manager only) |

## Project Structure

```
.
├── index.html                 # Front-end (HTML + forms)
├── styles.css                 # Front-end styles
├── script.js                  # Front-end AJAX logic
├── server.js                  # Express backend
├── package.json               # Dependencies
├── .env.example               # Environment variables template
├── README.md                  # This file
├── README_BACKEND.md          # Backend documentation
├── WORKSPACE_SETUP.md         # VS Code setup guide
├── .vscode/
│   ├── launch.json            # Debug configurations
│   ├── tasks.json             # npm tasks
│   └── settings.json          # Editor settings
├── __tests__/
│   ├── api.test.js            # Basic auth and leave tests
│   ├── export.test.js         # CSV export with time/duration tests
│   ├── approval.test.js       # Manager approval and fractional balance tests
│   └── multiday.test.js       # Multi-day leave with weekend exclusion tests
├── scripts/
│   └── migrate.js             # DB migration script (duration_days to REAL)
├── data/
│   └── leave.db               # SQLite database
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI
└── .gitignore                 # Git exclusions
```

## Development

### Running Locally

**Terminal 1** — Backend server:
```bash
npm run dev
# Server runs at http://localhost:4000
```

**Terminal 2** — Static server (optional):
```bash
python3 -m http.server 8000
# Front-end at http://localhost:8000
```

### Running Tests

```bash
npm test
# Runs Jest with Supertest against in-memory SQLite
```

### Database Migration

If you have an older DB with `duration_days` stored as INTEGER, run the migration script to convert it to REAL (fractional days):

```bash
npm run migrate
# Creates a timestamped backup before running the migration
```

### Leave Duration & Time Frames

**Single-Day Leaves:**
- **AM Half**: 08:45 – 13:20 (0.5 days)
- **PM Half**: 13:30 – 18:00 (0.5 days)
- **Full Day**: 08:45 – 18:00 (1.0 day)

**Multi-Day Leaves:**
- Duration counts **business days only** (Monday–Friday; weekends excluded).
- Example: Friday to Monday = 2 business days (not 4 calendar days).

**Duration Storage:**
- `duration_days`: Fractional number (REAL) representing business days (e.g., 0.5, 1.0, 2.5).
- `duration_hours`: Decimal hours (e.g., 4.583 for AM half).

**CSV Export:**
- Raw export includes columns: Start Date, End Date, Start Time, End Time, Duration Day, Duration Time.
- Summary export shows employee leave allocation, taken, and remaining balance.

### Using VS Code

1. Open workspace: `LMS_SA.code-workspace`
2. Press **F5** to debug backend or select "Run Tests"
3. Use integrated terminal for npm commands

## Security & Production Notes

⚠️ **This is a demo implementation. For production:**
- Add HTTPS and secure secret management (AWS Secrets, GitHub Secrets, etc.)
- Integrate real email delivery (SendGrid, AWS SES, Nodemailer) for password resets
- Use a persistent database (PostgreSQL, MySQL) instead of SQLite
- Add comprehensive input validation and sanitization
- Enable CORS properly and add more robust rate-limiting
- Implement refresh tokens for longer sessions
- Add audit logging for approvals and changes
- Use a process manager (PM2) to keep server running
- Add monitoring and error tracking (Sentry, Datadog, etc.)

## Optional Enhancements

- Calendar view of team members' leave
- Multi-level approval workflow
- Integration with HR payroll system
- Email notifications for leave events
- Role-based admin UI for user/policy management
- Mobile app (React Native, Flutter)

## Testing & CI

Tests run locally and via GitHub Actions on push/PR:
```bash
npm test
```

Tests use an in-memory SQLite database and cover:
- User registration and login
- Leave creation and retrieval
- Role-based access control

## Support & Troubleshooting

**npm not found**: Install Node.js via Homebrew (`brew install node`) or nvm.

**Port 4000 in use**: Change `PORT` in `.env` or kill the process: `lsof -i :4000 | grep LISTEN | awk '{print $2}' | xargs kill -9`

**Tests fail**: Ensure `npm install` completed and all dependencies are installed.

**Front-end can't reach backend**: Verify backend is running on port 4000 and `API_BASE` in `script.js` matches.

## License

MIT
