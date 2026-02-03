import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Reservation Assistant",
  description: "AI-powered reservation and appointment calls",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
