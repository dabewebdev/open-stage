import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Stage",
  description: "One room. One stage. Everyone gets a turn.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
