# Leave Management System – Workspace Setup Guide

## Quick Start

1. **Install Node.js & npm** (if not already installed):
   ```bash
   # Using Homebrew (macOS):
   brew install node
   
   # Or using nvm (recommended for flexibility):
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
   nvm install --lts
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env and set JWT_SECRET to a strong value
   ```

4. **Run tests** (verify everything works):
   ```bash
   npm test
   ```

## VS Code Setup

This workspace includes pre-configured:
- **Launch configurations** in `.vscode/launch.json` for running the backend server and tests
- **Tasks** in `.vscode/tasks.json` for npm commands
- **Settings** in `.vscode/settings.json` for code formatting and exclusions

### Launch & Debug

1. Open the workspace: `LMS_SA.code-workspace`
2. Press **F5** to start the backend server (or use Debug > Start Debugging)
3. Press **Ctrl+Shift+D** then select "Run Tests" to run the test suite
4. View output in the integrated terminal

### Available npm Scripts

```bash
npm start          # Run backend server (production)
npm run dev        # Run backend with auto-reload (development, requires nodemon)
npm test           # Run Jest test suite
npm install        # Install dependencies
```

## Project Structure

```
.
├── index.html           # Static front-end (requirements doc + forms)
├── styles.css           # Front-end styles (responsive)
├── script.js            # Front-end AJAX + demo logic
├── server.js            # Express backend (auth, leave CRUD, exports)
├── package.json         # Node project metadata & dependencies
├── .env.example         # Environment variables template
├── README.md            # Project documentation
├── README_BACKEND.md    # Backend-specific docs
├── .vscode/
│   ├── launch.json      # Debug configurations
│   ├── tasks.json       # npm tasks for VS Code
│   └── settings.json    # Workspace editor settings
├── __tests__/
│   └── api.test.js      # Jest tests for API endpoints
└── .github/
    └── workflows/
        └── ci.yml       # GitHub Actions CI (runs tests on push/PR)
```

## Development Workflow

### Backend Development

1. Copy `.env.example` to `.env` and set `JWT_SECRET`
2. Run in development mode:
   ```bash
   npm run dev
   ```
   The server auto-reloads on file changes (via nodemon)
3. Backend API runs at `http://localhost:4000`

### Front-end Development

1. Open `index.html` in your browser (or serve via static server):
   ```bash
   python3 -m http.server 8000
   # then open http://localhost:8000
   ```
2. Front-end expects backend API at `http://localhost:4000/api`
3. Token is stored in `localStorage['lms_token']`

### Testing

Run tests locally:
```bash
npm test
```

Tests use an in-memory SQLite database and require no external setup. GitHub Actions automatically runs tests on push/PR.

## API Endpoints

### Authentication
- `POST /api/auth/register` — Create a new account
- `POST /api/auth/login` — Log in and get JWT token
- `GET /api/auth/me` — Get current user info (requires token)
- `POST /api/auth/forgot` — Request password reset token
- `POST /api/auth/reset` — Reset password with token

### Leaves
- `GET /api/leaves` — List leaves (own only for employees, all for managers)
- `POST /api/leaves` — Submit a leave request
- `POST /api/leaves/:id/approve` — Approve/reject a leave (manager only)

### Exports
- `GET /api/export/raw?year=YYYY` — Export raw leave data as CSV (manager only)
- `GET /api/export/summary?year=YYYY` — Export summary report as CSV (manager only)

## Troubleshooting

**npm not found**: Install Node.js via Homebrew or nvm (see Quick Start).

**Port 4000 already in use**: Change `PORT` in `.env` or kill the process using port 4000.

**Tests fail with SQLite error**: Ensure `npm install` completed successfully and all dependencies are installed.

**Front-end can't reach backend**: Verify the backend is running on port 4000 and the `API_BASE` in `script.js` is set correctly.

## Production Deployment

For production:
- Use HTTPS and secure environment variable management (e.g., AWS Secrets Manager, GitHub Secrets)
- Set `JWT_SECRET` and `NODE_ENV=production`
- Use a real database (PostgreSQL/MySQL) instead of SQLite
- Configure proper email delivery for password resets
- Add input validation, rate limiting, and CORS configuration
- Use a process manager (PM2) to keep the server running
- Enable comprehensive logging and monitoring

See `README.md` and `README_BACKEND.md` for more details.
