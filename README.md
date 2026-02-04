# Personal AI Voice Assistant

A localhost web app that makes automated voice calls on your behalf using AI. Give it a phone number, context, and instructions - it will call, have a conversation using OpenAI's Realtime voice API, and handle the follow-up automatically.

## What it does

1. **Makes AI-powered phone calls** - Uses Twilio for calling and OpenAI Realtime API for natural voice conversations
2. **Live transcript streaming** - Watch the conversation happen in real-time via WebSocket
3. **Smart outcome extraction** - GPT-4o-mini analyzes the call and extracts structured data (reservations, appointments, confirmations)
4. **Email summaries** - Automatically sends you an email summary of every call via Gmail
5. **Calendar integration** - Automatically creates Google Calendar events for reservations/appointments with date/time

## Example use cases

- "Call Olive Garden and make a reservation for 2 at 7pm tomorrow under the name Raj"
- "Call Mom and remind her about dinner on Sunday"
- "Call the doctor's office and reschedule my appointment to next week"

## Tech stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Backend**: Express + WebSocket
- **Voice**: Twilio (calls) + OpenAI Realtime API (conversation)
- **AI**: GPT-4o-mini (outcome extraction)
- **Database**: SQLite via Prisma
- **Integrations**: Google Calendar API, Gmail API

## Repository structure

```
apps/web/          # Next.js frontend
apps/server/       # Express API + WebSocket backend
packages/shared/   # Shared TypeScript types
prisma/            # SQLite database schema
```

## Quick start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```env
# Required
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890        # Your Twilio voice number
OPENAI_API_KEY=sk-...
PUBLIC_BASE_URL=https://xxx.trycloudflare.com  # Set after starting tunnel

# Google (for Calendar & Email)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback

# Optional
TIMEZONE=America/New_York             # For date parsing
```

Create `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

### 3. Setup database
```bash
npm run db:push
```

### 4. Start tunnel for Twilio webhooks

Twilio needs to reach your local server. Use Cloudflare Tunnel:
```bash
cloudflared tunnel --url http://localhost:4000
```

Copy the generated URL (e.g., `https://xxx.trycloudflare.com`) to `PUBLIC_BASE_URL` in `.env`.

### 5. Run the app
```bash
npm run dev
```

- **Web UI**: http://localhost:3000
- **API**: http://localhost:4000

### 6. Connect Google (optional but recommended)

Visit http://localhost:4000/auth/google to authorize Calendar and Gmail access.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run web + server together |
| `npm run dev:server` | Server only (port 4000) |
| `npm run dev:web` | Next.js only (port 3000) |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:studio` | Open Prisma Studio GUI |

## How it works

1. **You enter**: Contact name, phone number, and instruction text
2. **Twilio calls** the number and connects to a WebSocket stream
3. **OpenAI Realtime API** handles the voice conversation based on your instructions
4. **Live transcript** streams to your browser via WebSocket
5. **When call ends**: GPT-4o-mini extracts structured data (dates, confirmations, etc.)
6. **Automatically**: Sends email summary and creates calendar event (if applicable)

## Call failure handling

The app shows helpful messages when calls don't connect:
- "Line busy - the recipient is on another call"
- "No answer - the recipient didn't pick up"
- "Call was canceled"

## Google Cloud setup

To enable Calendar and Email features:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project
3. Enable **Gmail API** and **Google Calendar API**
4. Create OAuth 2.0 credentials (Web application)
5. Add redirect URI: `http://localhost:4000/auth/google/callback`
6. Copy Client ID and Secret to `.env`
7. Configure OAuth consent screen (add your email as test user)

## License

MIT
