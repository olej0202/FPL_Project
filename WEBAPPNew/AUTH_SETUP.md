# Auth + Recent Team IDs Setup

This project now supports:
- Google login
- Guest mode login (no account required)
- Per-user recent Team ID history (stored in Postgres for Google users)

## 1) Security First

Do not hardcode credentials in code.
Use environment variables in local `.env` files and in Render environment settings.

If credentials were shared in chat/logs, rotate them in Render before production use.

## 2) Backend Environment (API service)

Use `API/.env.example` as template.

Required variables:
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `AUTH_JWT_SECRET`

Recommended:
- `CORS_ORIGINS` (comma-separated frontend origins)
- `RECENT_TEAM_IDS_LIMIT` (default `30`)

Notes:
- For Render Postgres, include `sslmode=require` in `DATABASE_URL` if not already present.
- Auth tables are auto-created on API startup.

## 3) Frontend Environment (`WEBAPPNew/football-frontend`)

Use `WEBAPPNew/football-frontend/.env.example` as template.

Required variables:
- `VITE_API_BASE_URL`
- `VITE_GOOGLE_CLIENT_ID`

## 4) Google OAuth Setup

In Google Cloud Console:
1. Create an OAuth 2.0 Client ID (Web application).
2. Add Authorized JavaScript origins:
   - local frontend origin (for local dev)
   - deployed frontend origin (Render URL/custom domain)
3. Use that client ID value in both:
   - backend: `GOOGLE_CLIENT_ID`
   - frontend: `VITE_GOOGLE_CLIENT_ID`

## 5) Render Deployment Mapping

API service env:
- `DATABASE_URL` = Render Postgres connection string
- `GOOGLE_CLIENT_ID` = Google OAuth client id
- `AUTH_JWT_SECRET` = long random secret
- `CORS_ORIGINS` = frontend origin(s)

Frontend service env:
- `VITE_API_BASE_URL` = API public URL
- `VITE_GOOGLE_CLIENT_ID` = same Google OAuth client id

## 6) Local Test Flow

1. Start backend with local env set.
2. Start frontend with local env set.
3. Open app:
   - login via Google OR choose guest mode.
4. Open Settings:
   - verify recent Team IDs appear after using a Team ID.
5. Logout:
   - verify app returns to login screen.

## 7) Test vs Production Credential Handling

- Local test: `.env` files (ignored by git).
- Production: Render environment variables only.
- Never commit secrets to repository.
- Rotate secrets if exposed.
