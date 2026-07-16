# WorkHunter

Platsbanken job application assistant — search jobs, tailor resumes with Gemini, create Gmail drafts, and archive sent applications.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/)
- Google Cloud OAuth credentials (Desktop app)

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console

2. **Google Cloud setup:**
   - Create a project and enable **Gmail API**
   - Configure OAuth consent screen (Testing mode is fine for personal use)
   - Create **Desktop** OAuth client ID
   - Add redirect URI: `http://127.0.0.1:1422/oauth/callback`

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run in development:
   ```bash
   npm run tauri dev
   ```

## Features

- **Google sign-in** — each account is an isolated local profile
- **Setup wizard** — first role + base resume/letter on first launch
- **Platsbanken search** — full JobSearch API filters
- **Proceed / Reject** — processed ads stay hidden
- **Gemini tailoring** — editable prompts in Settings
- **Gmail drafts** — PDF attachments, manual send only
- **Test mode** — all drafts go to your test email
- **Archive** — searchable sent applications, 6-month retention
- **Clear test data** — reset workflow without losing base documents

## Data location

SQLite database: `%APPDATA%\WorkHunter\workhunter.db` (Windows)

## Troubleshooting

**Port already in use** — A previous dev session may still be running. In PowerShell:

```powershell
netstat -ano | findstr :1430
taskkill /PID <pid> /F
```

Or close any leftover `node.exe` / WorkHunter windows from Task Manager, then run `npm run tauri dev` again.

Ports used in dev: **1430** (Vite UI), **1422** (Google OAuth callback).
