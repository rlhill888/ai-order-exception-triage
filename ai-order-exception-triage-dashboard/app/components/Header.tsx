import Link from "next/link";
import LambdaMenu from "@/app/components/LambdaMenu";

export default function Header() {
  return (
    <header className="flex w-full items-center justify-between border-b border-black/[.08] px-8 py-4 dark:border-white/[.145]">
      <Link href="/" className="text-lg font-semibold text-black dark:text-zinc-50">
        Order Exception Triage
      </Link>
      <LambdaMenu />
    </header>
  );
}
