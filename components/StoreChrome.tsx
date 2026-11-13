'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { GlobalLEOWidget } from '@/components/GlobalLEOWidget';

function StoreHeader() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      setAuthenticated(Boolean(result.authenticated));
    }).catch(() => setAuthenticated(false));
    return () => controller.abort();
  }, [pathname]);
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthenticated(false);
    window.location.assign('/store');
  }

  return <>
    <div className="bg-[#201a14] px-4 py-2 text-center text-xs font-medium tracking-wide text-amber-100">Shop from independent African sellers · Discover something good today</div>
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#fffdf8]/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-7">
        <Link href="/store" className="flex shrink-0 items-center gap-2.5" aria-label="LeoX Market home">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#eb6a2e] text-lg font-black text-white shadow-sm">LX</span>
          <span className="leading-tight"><span className="block text-lg font-black tracking-tight text-stone-900">LeoX Market</span><span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-stone-500">by LeonardX</span></span>
        </Link>
        <form action="/store" method="get" className="hidden min-w-0 flex-1 md:flex">
          <label htmlFor="market-search" className="sr-only">Search products</label>
          <input id="market-search" name="q" placeholder="Search products, brands and more" className="min-w-0 flex-1 rounded-l-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-[#eb6a2e] focus:ring-2 focus:ring-[#eb6a2e]/20" />
          <button className="rounded-r-xl bg-[#eb6a2e] px-5 text-sm font-bold text-white hover:bg-[#d95b21]">Search</button>
        </form>
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Store navigation">
          <Link href="/store/account" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">Buyer account</Link>
          <Link href="/store/orders" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">Orders</Link>
          <Link href="/store/messages" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">Messages</Link>
          <Link href="/store/seller" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#d95b21] hover:bg-stone-100">Seller dashboard</Link>
          <Link href="/store/affiliates" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">Affiliates</Link>
          <Link href="/store/suppliers" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">Suppliers</Link>
          {authenticated === true ? null : authenticated === false ? <><Link href={`/auth?mode=login&next=${encodeURIComponent(pathname || '/store')}`} className="rounded-lg px-3 py-2 text-sm font-bold text-stone-800 hover:bg-stone-100">Sign in</Link><Link href="/store/join" className="rounded-lg px-3 py-2 text-sm font-bold text-[#d95b21] hover:bg-stone-100">Create account</Link></> : null}
        </nav>
        {authenticated === true && <button type="button" onClick={() => void signOut()} className="hidden rounded-lg px-2 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 xl:block">Sign out</button>}
        <Link href="/store/cart" className="relative flex shrink-0 items-center gap-2 rounded-xl bg-[#201a14] px-3 py-3 text-sm font-bold text-white hover:bg-stone-700" aria-label="Shopping cart">🛒<span className="hidden sm:inline">Cart</span></Link>
        <button type="button" onClick={() => setMenuOpen(open => !open)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-stone-300 text-xl text-stone-800 md:hidden" aria-label={menuOpen ? 'Close store menu' : 'Open store menu'} aria-expanded={menuOpen}>{menuOpen ? '×' : '☰'}</button>
      </div>
      <form action="/store" method="get" className="flex px-4 pb-3 md:hidden"><label htmlFor="market-search-mobile" className="sr-only">Search products</label><input id="market-search-mobile" name="q" placeholder="Search products" className="min-w-0 flex-1 rounded-l-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"/><button className="rounded-r-xl bg-[#eb6a2e] px-4 text-sm font-bold text-white">Search</button></form>
      {menuOpen && <nav className="grid gap-1 border-t border-stone-200 bg-white px-4 py-3 md:hidden" aria-label="Mobile store navigation"><Link onClick={() => setMenuOpen(false)} href="/store/account" className="rounded-lg p-3 text-sm font-semibold text-stone-800">Buyer account</Link><Link onClick={() => setMenuOpen(false)} href="/store/orders" className="rounded-lg p-3 text-sm font-semibold text-stone-800">Orders and receipts</Link><Link onClick={() => setMenuOpen(false)} href="/store/messages" className="rounded-lg p-3 text-sm font-semibold text-stone-800">Messages</Link><Link onClick={() => setMenuOpen(false)} href="/store/seller" className="rounded-lg p-3 text-sm font-semibold text-[#d95b21]">Seller dashboard</Link><Link onClick={() => setMenuOpen(false)} href="/store/affiliates" className="rounded-lg p-3 text-sm font-semibold text-stone-800">Affiliate dashboard</Link><Link onClick={() => setMenuOpen(false)} href="/store/suppliers" className="rounded-lg p-3 text-sm font-semibold text-stone-800">Supplier centre</Link><Link onClick={() => setMenuOpen(false)} href="/store/privacy" className="rounded-lg p-3 text-sm font-semibold text-stone-800">Privacy and data</Link>{authenticated === true ? <button onClick={() => void signOut()} className="rounded-lg p-3 text-left text-sm font-semibold text-stone-800">Sign out</button> : authenticated === false ? <><Link onClick={() => setMenuOpen(false)} href={`/auth?mode=login&next=${encodeURIComponent(pathname || '/store')}`} className="rounded-lg p-3 text-sm font-bold text-stone-800">Sign in</Link><Link onClick={() => setMenuOpen(false)} href="/store/join" className="rounded-lg p-3 text-sm font-bold text-[#d95b21]">Create account</Link></> : null}</nav>}
    </header>
    <div className="hidden border-b border-stone-200 bg-[#f7f1e7] sm:block"><nav className="mx-auto flex max-w-[1500px] gap-2 overflow-x-auto px-4 py-2.5 text-xs font-semibold text-stone-600 sm:px-7" aria-label="Store departments"><Link href="/store" className="whitespace-nowrap rounded-full bg-white px-4 py-2 text-stone-900 shadow-sm">All departments</Link>{['Phones & tablets','Home & living','Fashion','Computers','Beauty & care','Sports & outdoors'].map(name => <Link key={name} href={`/store?q=${encodeURIComponent(name)}`} className="whitespace-nowrap rounded-full px-4 py-2 hover:bg-white">{name}</Link>)}<Link href="/store/seller" className="ml-auto whitespace-nowrap rounded-full px-4 py-2 font-bold text-[#d95b21]">Seller dashboard</Link><Link href="/store/affiliates" className="whitespace-nowrap rounded-full px-4 py-2 hover:bg-white">Affiliates</Link><Link href="/store/suppliers" className="whitespace-nowrap rounded-full px-4 py-2 hover:bg-white">Suppliers</Link></nav></div>
  </>;
}

export function StoreChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/store' || pathname?.startsWith('/store/')) return <div className="store-shell min-h-screen bg-[#f5f2ea] text-stone-900"><StoreHeader />{children}<footer className="mt-16 border-t border-stone-200 bg-[#201a14] px-5 py-9 text-sm text-amber-50"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5"><div><strong className="text-lg">LeoX Market</strong><p className="mt-1 text-xs text-amber-100/65">A marketplace from LeonardX · Made for discovery across Africa</p></div><nav className="flex flex-wrap gap-4 text-xs text-amber-100/75"><Link href="/store/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Help</Link><Link href="/">LeonardX</Link></nav></div></footer></div>;
  return <><Header />{children}<GlobalLEOWidget /><Footer /></>;
}
