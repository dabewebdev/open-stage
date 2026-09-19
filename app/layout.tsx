import type { Metadata } from "next";
import "./globals.css";
import StaffConsoleGate from "./StaffConsoleGate";

export const metadata: Metadata = {
  title: "Kwentayo",
  description: "Talk. Listen. Hang out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <StaffConsoleGate />
      </body>
    </html>
  );
}
