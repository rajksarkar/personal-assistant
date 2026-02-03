# Personal Reservation Assistant

A localhost web app that lets you type an instruction and context (business/person name, phone), initiate an outbound call via Twilio, run a live voice agent with OpenAI Realtime, stream the transcript to the UI, and save outcomes to Google Calendar. All secrets stay on the backend; tasks and transcripts are stored in a local SQLite DB.

## Repository layout

- `apps/web` — Next.js (App Router) + TypeScript UI
- `apps/server` — Express API + WebSockets + Twilio + OpenAI + Google
- `packages/shared` — Shared types (Task, TranscriptEvent, Outcome)
- `prisma/schema.prisma` — SQLite schema (User, Task, TranscriptEvent, Outcome)

## Setup checklist

1. **Clone and install**
   ```bash
   cd personal-assistant
   npm install
   ```
   (Or install pnpm: `npm install -g pnpm`, then use `pnpm install` and `pnpm dev` etc.)

2. **Environment**
   - Copy `.env.example` to `.env` at the repo root.
   - Fill in:
     - `DATABASE_URL=file:./dev.db` (DB created at repo root)
     - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (voice-capable number)
     - `PUBLIC_BASE_URL` — set after starting a tunnel (see step 6), e.g. `https://xxxx.ngrok.io`
     - `OPENAI_API_KEY` (Realtime + Chat for extraction)
     - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback`
   - Web: create `apps/web/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`

3. **Database**
   ```bash
   npm run db:push
   npm run db:generate
   ```

4. **Google OAuth**
   - In Google Cloud Console create OAuth 2.0 credentials (Web application).
   - Add redirect URI: `http://localhost:4000/auth/google/callback`.
   - Put Client ID and Client Secret in `.env`.

5. **Run locally**
   ```bash
   npm run dev
   ```
   - Web UI: http://localhost:3000  
   - API: http://localhost:4000  
   - Sign in with Google (Calendar): open "Sign in with Google (Calendar)" in the app, or visit `http://localhost:4000/auth/google`.

6. **Tunnel for Twilio webhooks (dev)**
   ```bash
   npm run dev:tunnel
   ```
   - Use the printed HTTPS URL as `PUBLIC_BASE_URL` in `.env` so Twilio can reach `/api/twiml/stream` and `/ws/twilio-media`.
   - Restart the server after updating `PUBLIC_BASE_URL`.

## Scripts

- `npm run dev` — run web + server in parallel
- `npm run dev:server` — server only
- `npm run dev:web` — Next.js only
- `npm run dev:tunnel` — ngrok on port 4000 (remind to set `PUBLIC_BASE_URL`)
- `npm run db:generate` — generate Prisma client (from root)
- `npm run db:push` — push schema to SQLite
- `npm run db:studio` — open Prisma Studio

## Definition of done

On localhost you can: 1) Enter context and instruction, 2) click Start Call, 3) watch the live transcript, 4) see a structured outcome after the call, and 5) confirm an event is created in Google Calendar with those details.
