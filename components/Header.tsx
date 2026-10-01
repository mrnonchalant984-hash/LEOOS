'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Menu, MessageCircle, X } from 'lucide-react';
import { siteData } from '@/data/site';

const links = [
  ['Home', '/'],
  ['Portfolio', '/portfolio'],
  ['About', '/about'],
  ['Audit', '/audit'],
  ['Pricing', '/pricing'],
  ['Wall of Love', '/wall-of-love'],
  ['Contact', '/contact'],
  ['Blog', '/blog'],
  ['LEO AI', '/app'],
  ['Account', '/account'],
] as const;

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-900 bg-black/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2">
        <Link href="/" onClick={closeMenu} className="shrink-0 text-xl font-black">
          LEONARD<span className="gold">.</span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-5 text-sm lg:flex">
          {links.map(([label, href]) => <Link key={href} href={href} className="whitespace-nowrap">{label}</Link>)}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link href="/app" aria-label="Open LEO AI" title="Open LEO AI" className="hidden rounded-lg border border-zinc-800 p-2 md:block">
            <Bot size={18} />
          </Link>
          <a href={siteData.whatsapp} aria-label={siteData.whatsappLabel} title={siteData.whatsappLabel} className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--gold)] text-black lg:h-auto lg:w-auto lg:px-3 lg:py-2 lg:text-sm lg:font-bold">
            <MessageCircle size={18} />
            <span className="ml-1 hidden lg:inline">{siteData.whatsappLabel}</span>
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 lg:hidden"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-zinc-800 bg-zinc-950 px-4 py-3 lg:hidden">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-1 sm:grid-cols-3">
            {links.map(([label, href]) => (
              <Link key={href} href={href} onClick={closeMenu} className="rounded-lg px-3 py-3 text-sm hover:bg-white/10">
                {label}
              </Link>
            ))}
          </div>
          <a href={siteData.whatsapp} onClick={closeMenu} className="mx-auto mt-2 flex max-w-7xl items-center gap-2 rounded-lg bg-[var(--gold)] px-3 py-3 text-sm font-bold text-black">
            <MessageCircle size={18} />{siteData.whatsappLabel}
          </a>
        </nav>
      )}
    </header>
  );
}
