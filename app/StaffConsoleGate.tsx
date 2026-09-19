"use client";

import { usePathname } from "next/navigation";
import StaffConsole from "./StaffConsole";

export default function StaffConsoleGate() {
  const pathname = usePathname();
  const isStaffRoute = pathname === "/staff";

  return (
    <>
      {!isStaffRoute && (
        <style>{`
          button[title="Kwentayo staff controls"]:not([class*="staffLauncherActive"]) {
            display: none !important;
          }
        `}</style>
      )}
      <StaffConsole key={pathname} />
    </>
  );
}
