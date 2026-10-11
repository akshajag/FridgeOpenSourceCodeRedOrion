import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export function LandingNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 md:px-8">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-6 text-[13.5px] text-ink-muted md:flex">
          <a href="#network" className="hover:text-foreground">Network</a>
          <a href="#hardware" className="hover:text-foreground">Hardware</a>
          <a href="#data" className="hover:text-foreground">Data</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/demo">Open demo</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
