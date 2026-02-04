# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A localhost web app for making automated voice calls via Twilio to schedule reservations/appointments. Uses OpenAI Realtime API for live voice conversation, streams transcripts to the UI via WebSocket, extracts structured outcomes with GPT-4o-mini, and saves confirmed reservations to Google Calendar.

## Commands

```bash
npm install              # Install all dependencies (monorepo)
npm run dev              # Run web + server concurrently
npm run dev:server       # Server only (Express on :4000)
npm run dev:web          # Next.js only (:3000)
npm run dev:tunnel       # Cloudflare tunnel for Twilio webhooks (update PUBLIC_BASE_URL with new URL)

npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to SQLite
npm run db:studio        # Open Prisma Studio
```

## Architecture

### Monorepo Structure
- `apps/web` — Next.js 14 (App Router) frontend
- `apps/server` — Express + WebSocket backend
- `packages/shared` — TypeScript types shared between apps (Task, TranscriptEvent, Outcome)
- `prisma/schema.prisma` — SQLite database schema

### Key Data Flow

1. **Task Creation**: UI POSTs to `/api/tasks` with context (name, phone, notes) and instruction text
2. **Call Initiation**: POST to `/api/tasks/:id/start-call` triggers Twilio outbound call
3. **Voice Stream**: Twilio connects to `/ws/twilio-media` WebSocket, which bridges audio to OpenAI Realtime API
4. **Transcript Streaming**: `twilio-media.ts` persists transcript events to DB and broadcasts to UI via `/ws/ui` WebSocket
5. **Outcome Extraction**: On call end, `outcome-runner.ts` calls `outcome-extraction.ts` to extract structured fields (reservation details) using GPT-4o-mini
6. **Calendar**: POST to `/api/tasks/:id/save-calendar` creates Google Calendar event from extracted outcome

### Server Key Files
- `src/index.ts` — Express setup, route mounting, WebSocket upgrade handling
- `src/ws/twilio-media.ts` — Core call handling: bridges Twilio media stream to OpenAI Realtime, handles transcript persistence
- `src/ws/ui.ts` — WebSocket for pushing live transcript/status/outcome to frontend
- `src/services/outcome-extraction.ts` — GPT-4o-mini prompt for extracting reservation fields from transcript
- `src/routes/tasks.ts` — Task CRUD and call control endpoints
- `src/routes/auth.ts` — Google OAuth for Calendar access

### Web Key Files
- `app/page.tsx` — Main UI: context form, call controls, live transcript panel, outcome display
- `app/task/[id]/page.tsx` — Individual task detail view
- `app/history/page.tsx` — Task history list

### Database Models
- **User**: Google OAuth tokens for Calendar
- **Task**: Context, instruction, status (DRAFT→CALLING→IN_PROGRESS→COMPLETED/FAILED), call SID
- **TranscriptEvent**: Speaker (ASSISTANT/OTHER_PARTY/SYSTEM) + text, linked to task
- **Outcome**: Summary text, extracted fields JSON, calendar event ID

### Environment Variables
Root `.env` requires: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `PUBLIC_BASE_URL`, `OPENAI_API_KEY`, Google OAuth credentials. Web requires `apps/web/.env.local` with `NEXT_PUBLIC_API_BASE_URL`.
