import { SellerOrdersClient } from './seller-orders-client';

export const metadata = { title: 'Manage orders | LeoX Store', robots: { index: false, follow: false } };

export default function SellerOrdersPage() {
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-12 text-white sm:px-8"><SellerOrdersClient /></main>;
}
