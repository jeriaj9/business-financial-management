import Link from "next/link";
import { BrandMark } from "@/components/app/BrandMark";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,var(--brand)_0%,transparent_65%)] opacity-15" />
      <header className="relative px-4 py-5 sm:px-8">
        <Link href="/" aria-label={`${brand.name}, inicio`}>
          <BrandMark />
        </Link>
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
