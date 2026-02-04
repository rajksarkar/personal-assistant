import { google } from "googleapis";
import type { ExtractedFields } from "./outcome-extraction";

// MVP: tokens stored in DB; production should use encrypted storage.
export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  contextName: string,
  outcome: { summaryText: string | null; extractedFieldsJson: string | null }
): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, process.env.GOOGLE_REDIRECT_URI);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const fields: ExtractedFields = outcome.extractedFieldsJson
    ? (JSON.parse(outcome.extractedFieldsJson) as ExtractedFields)
    : {};
  const title = `Reservation: ${contextName}`;
  let startDate = new Date();
  let endDate = new Date(startDate.getTime() + 90 * 60 * 1000);
  if (fields.datetime_start) {
    const d = new Date(fields.datetime_start);
    if (!isNaN(d.getTime())) {
      startDate = d;
      const mins = fields.duration_minutes ?? 90;
      endDate = new Date(startDate.getTime() + mins * 60 * 1000);
    }
  }
  const description = [
    outcome.summaryText,
    fields.confirmation_number && `Confirmation: ${fields.confirmation_number}`,
    fields.address && `Address: ${fields.address}`,
    fields.special_notes && `Notes: ${fields.special_notes}`,
  ]
    .filter(Boolean)
    .join("\n");
  const timezone = process.env.TIMEZONE || "America/New_York";
  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      description,
      start: { dateTime: startDate.toISOString(), timeZone: timezone },
      end: { dateTime: endDate.toISOString(), timeZone: timezone },
    },
  });
  return event.data.id ?? "";
}

export function getAuthUrl(clientId: string, redirectUri: string): string {
  const oauth2Client = new google.auth.OAuth2(clientId, "", redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    prompt: "consent",
  });
}

export async function sendEmailSummary(
  accessToken: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  toEmail: string,
  subject: string,
  body: string
): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, process.env.GOOGLE_REDIRECT_URI);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const message = [
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });
}

export async function getTokensFromCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; email: string }> {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const user = await oauth2.userinfo.get();
  const email = user.data.email ?? "";
  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    email,
  };
}
