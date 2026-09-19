import type { Metadata } from "next";
import "./globals.css";
import StaffConsole from "./StaffConsole";

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
        <StaffConsole />
      </body>
    </html>
  );
}
