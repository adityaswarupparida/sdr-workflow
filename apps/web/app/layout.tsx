import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "SDR Agent Dashboard",
  description: "Monitor and manage AI-powered SDR conversations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <nav className="nav">
          <span className="nav-logo">SDR Agent</span>
          <div style={{ display: "flex", gap: 20, marginLeft: 32 }}>
            <a href="/" style={{ fontSize: 14, color: "var(--text-muted)" }}>Conversations</a>
            <a href="/reps" style={{ fontSize: 14, color: "var(--text-muted)" }}>Sales Reps</a>
          </div>
        </nav>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
