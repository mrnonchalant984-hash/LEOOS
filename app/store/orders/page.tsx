import Link from 'next/link';
import { OrdersClient } from './orders-client';

export const metadata = { title: 'Your orders | LeoX Store' };

export default function OrdersPage() {
  return <main className="mx-auto min-h-[70vh] max-w-5xl px-5 py-12 sm:px-8"><Link href="/store" className="text-sm text-white/55">← Store</Link><h1 className="mt-5 text-4xl font-semibold text-white">Your orders and receipts</h1><OrdersClient /></main>;
}
