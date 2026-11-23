import Link from 'next/link';
import { CartClient } from './cart-client';

export const metadata = { title: 'Shopping cart | Braverton Market' };

export default function CartPage() {
  return <main className="mx-auto min-h-[70vh] max-w-5xl px-5 py-12 sm:px-8"><Link href="/store" className="text-sm text-white/55">← Continue shopping</Link><h1 className="mt-5 text-4xl font-semibold text-white">Your cart</h1><CartClient /></main>;
}
