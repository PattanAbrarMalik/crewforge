import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrewForge — Find your people",
  description:
    "Build your next with a crew that complements you. Race-proof team formation for Hack4Hack 2026.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
