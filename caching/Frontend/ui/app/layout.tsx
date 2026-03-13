import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cache Strategies — Chakri Keerthi",
  description: "In-Memory, Redis, and LRU caching strategies — live demo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body>{children}</body>
    </html>
  );
}