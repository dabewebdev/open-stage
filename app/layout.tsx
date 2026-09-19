import type { Metadata } from "next";
import "./globals.css";
import StaffConsoleGate from "./StaffConsoleGate";
import StageVideoLayer from "./StageVideoLayer";

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
        <StageVideoLayer />
      </body>
    </html>
  );
}
