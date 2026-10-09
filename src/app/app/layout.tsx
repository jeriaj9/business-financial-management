import type { Metadata } from "next";
import { BusinessShell } from "@/components/app/BusinessShell";

export const metadata: Metadata = {
  title: "Portal de negocio",
};

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <BusinessShell>{children}</BusinessShell>;
}
