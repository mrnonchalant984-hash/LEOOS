import type { Metadata } from 'next';
import { NewProductForm } from './product-form';

export const metadata: Metadata = {
  title: 'Advertise a product | LeoX Store',
  description: 'Submit a product listing for review on LeoX Store.',
  robots: { index: false, follow: false, noarchive: true },
};

export default function NewProductPage() {
  return (
    <main className="min-h-[75vh] px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-200">LeoX Store · Seller</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Advertise a product</h1>
        <p className="mt-3 max-w-2xl leading-7 text-white/60">Share accurate product details and location. New listings stay private until they pass moderation. Payment and delivery are arranged between you and the buyer.</p>
        <NewProductForm />
      </div>
    </main>
  );
}
