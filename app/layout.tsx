import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "AI Business Tools",
  description:
    "AI tools that eliminate manual work: invoice/receipt extraction, support inbox triage & a grounded RAG chatbot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/15">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              ⚡ AI Business Tools
            </Link>
            <Link
              href="/"
              className="text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
            >
              All demos
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">{children}</main>
        <footer className="border-t border-black/10 py-6 text-center text-xs text-black/50 dark:border-white/15 dark:text-white/50">
          Built with the Claude API · Demos process data once and store nothing
        </footer>
      </body>
    </html>
  );
}
