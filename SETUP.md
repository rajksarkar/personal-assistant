# Setup guide: Database, Twilio, Google Auth, Public Base URL

Copy `.env.example` to `.env` at the **repo root** (`personal-assistant/.env`), then fill in the values below.

---

## 1. Database URL

- **What it is:** Path to the SQLite file used by the server.
- **Where:** Repo root `.env`
- **Value:**  
  ```bash
  DATABASE_URL=file:./dev.db
  ```
- **Notes:**
  - `./dev.db` is relative to where the server runs. The app is written so that when the server runs from `apps/server`, it resolves to a `dev.db` file at the repo root.
  - The file is created automatically the first time you run `pnpm db:push`.
- **Apply schema:**  
  ```bash
  npm run db:push
  npm run db:generate
  ```

---

## 2. Twilio

You need a Twilio account and a **voice-capable** phone number.

1. Sign up at [twilio.com](https://www.twilio.com/try-twilio) and open the [Console](https://console.twilio.com).
2. In the Console home you’ll see:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click “Show” to reveal)
3. Get a phone number: [Phone Numbers → Manage → Buy a number](https://console.twilio.com/us1/develop/phone-numbers/manage/search).  
   - Choose one with **Voice** capability.  
   - Note the number in E.164 form (e.g. `+15551234567`).

In `.env`:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+15551234567
```

Replace with your real Account SID, Auth Token, and Voice number.

**Outbound calls:** For trial accounts you can only call numbers you’ve verified (Verified Caller IDs) or your own Twilio numbers (e.g. Dev Phone). Add/verify numbers in the Console as needed.

### How to check if Twilio is working

1. **Config check (no call)**  
   With the server running, open in your browser:
   ```text
   http://localhost:4000/api/twilio/status
   ```
   You’ll see JSON with:
   - `configured: true` when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and `PUBLIC_BASE_URL` are all set.
   - `message` explaining what’s missing if not.

2. **If you click “Start Call” and nothing happens**  
   - The UI now shows a red message when Twilio isn’t configured (e.g. “Twilio not configured; set TWILIO_* and PUBLIC_BASE_URL”).
   - Ensure **PUBLIC_BASE_URL** is set to your tunnel URL (e.g. `https://xxxx.ngrok.io`) and the tunnel is running (`npm run dev:tunnel`), then restart the server.

3. **Verify the Twilio number**  
   - [Console → Phone Numbers → Manage → Active numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming): your number must have **Voice** enabled.
   - Use E.164 format in `.env`: `TWILIO_FROM_NUMBER=+15551234567`.

4. **See if the call was created**  
   - [Twilio Console → Monitor → Logs → Calls](https://console.twilio.com/us1/monitor/logs/calls).  
   - After clicking “Start Call”, a new call should appear. Check its status (queued, ringing, completed, failed, etc.) and error code if it failed.

5. **Trial account: who you can call**  
   - You can only call **Verified Caller IDs** or numbers in your Twilio account (e.g. your other Twilio number or Dev Phone).  
   - [Add a verified number](https://console.twilio.com/us1/develop/voice/settings/verified-caller-ids).  
   - In the app, use that verified number as the “Phone number” when testing.

---

## 3. Google Auth (Calendar)

Used for “Sign in with Google” and creating calendar events.

1. **Google Cloud project**
   - Go to [Google Cloud Console](https://console.cloud.google.com).
   - Create a project or pick an existing one.

2. **OAuth consent screen**
   - APIs & Services → **OAuth consent screen**.
   - Choose **External** (or Internal for Workspace).
   - Fill App name, User support email, Developer contact. Add your email as a test user if in testing.

3. **Credentials**
   - APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - Name: e.g. “Personal Reservation Assistant”.
   - **Authorized redirect URIs:** add:
     ```text
     http://localhost:4000/auth/google/callback
     ```
   - Save. Copy the **Client ID** and **Client Secret**.

4. **Calendar API**
   - APIs & Services → **Library** → search “Google Calendar API” → **Enable**.

In `.env`:

```bash
GOOGLE_CLIENT_ID=xxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxx
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
```

- Keep `GOOGLE_REDIRECT_URI` exactly as above for local dev.
- For a different port or domain, change it and add the same URI in the OAuth client’s “Authorized redirect URIs”.

**Using it:** Open the app and click “Sign in with Google (Calendar)”, or go to `http://localhost:4000/auth/google`. After signing in you can use “Save to Calendar”.

---

## 4. Public Base URL

Twilio must reach your server over the internet for:

- TwiML: `GET /api/twiml/stream?taskId=...`
- Media: WebSocket `wss://.../ws/twilio-media`
- Status: `POST /api/twilio/status?taskId=...`

So your server needs a **public HTTPS URL**. For local dev we use a tunnel (e.g. ngrok).

1. **Start a tunnel to port 4000**
   - From the repo root:
     ```bash
     pnpm dev:tunnel
     ```
   - Or, if you use ngrok directly:
     ```bash
     ngrok http 4000
     ```

2. **Copy the HTTPS URL**  
   Example: `https://a1b2c3d4.ngrok-free.app`  
   Do **not** add a trailing slash.

3. **Put it in `.env`**
   ```bash
   PUBLIC_BASE_URL=https://a1b2c3d4.ngrok-free.app
   ```

4. **Restart the server**  
   So it picks up the new `PUBLIC_BASE_URL`.

**Flow:**

1. Start tunnel: `pnpm dev:tunnel` (or `ngrok http 4000`).
2. Copy the HTTPS URL into `PUBLIC_BASE_URL` in `.env`.
3. Restart server: stop and run `pnpm dev` again.
4. When you click “Start Call”, Twilio will use this URL to fetch TwiML and open the media WebSocket.

If you change the tunnel URL (e.g. new ngrok session), update `PUBLIC_BASE_URL` and restart the server again.

**If Twilio reports "Got HTTP 404" to `/api/twilio/status` or `/api/twiml/stream`**

1. **Tunnel and server** – The tunnel (e.g. `ngrok http 4000`) must be running and forwarding to the **same port** the server uses (default 4000). The server must be running when Twilio calls.
2. **URL matches** – `PUBLIC_BASE_URL` in `.env` must match the tunnel URL **exactly** (e.g. `https://a1b2c3d4.ngrok-free.app`), no trailing slash. If you restarted ngrok and got a new URL, update `.env` and restart the server.
3. **Test from your machine** (replace with your real tunnel URL):
   ```bash
   # TwiML (Twilio GETs this when the call starts)
   curl -s -o /dev/null -w "%{http_code}" "https://YOUR_TUNNEL_URL/api/twiml/stream?taskId=test"
   # Status callback (Twilio POSTs here for call status)
   curl -X POST "https://YOUR_TUNNEL_URL/api/twilio/status?taskId=test" -d "CallStatus=no-answer"
   ```
   Both should return `200` (and the second should show `<Response></Response>`). If you get 404 here, the tunnel URL is wrong or the tunnel is not pointing at port 4000.

---

## Quick reference

| Variable            | Where to get it                          | Example / format                    |
|--------------------|------------------------------------------|-------------------------------------|
| `DATABASE_URL`     | You choose path                          | `file:./dev.db`                     |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account info          | `AC...`                             |
| `TWILIO_AUTH_TOKEN`  | Twilio Console → Account info          | (secret string)                     |
| `TWILIO_FROM_NUMBER` | Twilio Console → Buy a Voice number   | `+15551234567`                      |
| `GOOGLE_CLIENT_ID`   | Google Cloud → Credentials → OAuth client | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Same OAuth client                     | `GOCSPX-...`                        |
| `GOOGLE_REDIRECT_URI` | Fixed for local dev                   | `http://localhost:4000/auth/google/callback` |
| `PUBLIC_BASE_URL`    | Tunnel (ngrok) output                  | `https://xxxx.ngrok-free.app`       |

All of these go in **one `.env` file** at the repo root: `personal-assistant/.env`.
