import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { getAuthUrl, getTokensFromCode } from "../services/google-calendar";

export const authRoutes = Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/auth/google/callback";

authRoutes.get("/auth/google", (_req: Request, res: Response) => {
  const url = getAuthUrl(GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI);
  res.redirect(url);
});

authRoutes.get("/auth/google/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }
  try {
    const { accessToken, refreshToken, email } = await getTokensFromCode(
      code,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
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
