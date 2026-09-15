import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Newsreader } from "next/font/google";
import "./globals.css";

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" });
const displayFont = Newsreader({ subsets: ["latin"], variable: "--font-display" });
const monoFont = IBM_Plex_Mono({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-mono-stack" });

export const metadata: Metadata = {
  title: "London Drift — Take the long way",
  description: "Exploratory walking routes through London, tuned for curiosity rather than efficiency.",
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
      <body className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}>{children}</body>
    </html>
  );
}
