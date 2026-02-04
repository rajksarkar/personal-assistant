import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { getAuthUrl, getTokensFromCode } from "../services/google-calendar";

export const authRoutes = Router();

authRoutes.get("/auth/google", (_req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/auth/google/callback";
  if (!clientId) {
    res.status(500).send("GOOGLE_CLIENT_ID not configured in .env");
    return;
  }
  const url = getAuthUrl(clientId, redirectUri);
  res.redirect(url);
});

authRoutes.get("/auth/google/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/auth/google/callback";
  try {
    const { accessToken, refreshToken, email } = await getTokensFromCode(
      code,
      clientId,
      clientSecret,
      redirectUri
    );
    // MVP: store in DB; production should encrypt tokens.
    await prisma.user.upsert({
      where: { googleEmail: email },
      create: {
        googleEmail: email,
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken,
        tokenExpiry: new Date(Date.now() + 3600 * 1000),
      },
      update: {
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken,
        tokenExpiry: new Date(Date.now() + 3600 * 1000),
      },
    });
    res.redirect(process.env.WEB_ORIGIN || "http://localhost:3000");
  } catch (e) {
    console.error("Google OAuth callback:", e);
    res.status(500).send("Auth failed");
  }
});
