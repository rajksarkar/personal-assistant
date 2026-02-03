const EXTRACTION_PROMPT = `You are extracting structured reservation/appointment details from a phone call transcript.
Return a single JSON object with these fields (use null for missing):
- reservation_name: string
- business_or_person: string
- datetime_start: string (ISO 8601 or clear date/time description)
- duration_minutes: number
- party_size: number or null
- confirmation_number: string or null
- address: string or null
- special_notes: string or null
- confidence: number 0-1
- needs_user_action: boolean
- needs_user_action_reason: string or null (why user must confirm, e.g. "datetime ambiguous")
Return only valid JSON, no markdown or explanation.`;

export interface ExtractedFields {
  reservation_name?: string;
  business_or_person?: string;
  datetime_start?: string;
  duration_minutes?: number;
  party_size?: number | null;
  confirmation_number?: string | null;
  address?: string | null;
  special_notes?: string | null;
  confidence?: number;
  needs_user_action?: boolean;
  needs_user_action_reason?: string | null;
}

export async function extractOutcomeFromTranscript(
  transcriptText: string,
  apiKey: string
): Promise<{ summaryText: string; extractedFields: ExtractedFields }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: `Transcript:\n\n${transcriptText}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI extraction failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in OpenAI response");
  let extractedFields: ExtractedFields;
  try {
    extractedFields = JSON.parse(content) as ExtractedFields;
  } catch {
    extractedFields = { confidence: 0, needs_user_action: true, needs_user_action_reason: "Parse failed" };
  }
  const summaryText =
    [extractedFields.reservation_name, extractedFields.datetime_start, extractedFields.confirmation_number]
      .filter(Boolean)
      .join(" · ") || "Call completed; review transcript for details.";
  return { summaryText, extractedFields };
}
