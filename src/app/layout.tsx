import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flow - Anti-Procrastination App",
  description: "Eliminate procrastination with neuroscience-backed flow protocols",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-neutral-950 text-neutral-50 min-h-screen`}
      >
        <nav className="border-b border-neutral-800 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <a href="/" className="text-xl font-bold tracking-tight">
              <span className="text-orange-500">Flow</span>{" "}
              <span className="text-neutral-400 text-sm font-normal">
                Anti-Procrastination
              </span>
            </a>
            <div className="flex gap-6 text-sm">
              <a
                href="/"
                className="text-neutral-400 hover:text-neutral-50 transition-colors"
              >
                Dashboard
              </a>
              <a
                href="/projects"
                className="text-neutral-400 hover:text-neutral-50 transition-colors"
              >
                Projects
              </a>
              <a
                href="/today"
                className="text-neutral-400 hover:text-neutral-50 transition-colors"
              >
                Today
              </a>
              <a
                href="/settings"
                className="text-neutral-400 hover:text-neutral-50 transition-colors"
              >
                Settings
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
