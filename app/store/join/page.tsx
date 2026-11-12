import Link from 'next/link';

export const metadata = { title: 'Join LeoX Store' };

const signupHref = (accountType: 'buyer' | 'seller') =>
  `/auth?mode=signup&store=1&account_type=${accountType}&next=${encodeURIComponent(accountType === 'seller' ? '/store/seller' : '/store/account')}`;

export default function StoreJoinPage() {
  return <main className="mx-auto min-h-[70vh] max-w-5xl px-5 py-14 sm:px-8">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-[#c8501c]">LeoX Store accounts</p>
    <h1 className="mt-3 text-4xl font-black tracking-tight text-stone-900 sm:text-5xl">Choose your Store experience</h1>
    <p className="mt-4 max-w-2xl leading-7 text-stone-600">Start with the workspace that fits you. You can shop as a buyer and apply to sell later from the seller dashboard.</p>
    <div className="mt-9 grid gap-5 md:grid-cols-2">
      <article className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-stone-500">For shoppers</p>
        <h2 className="mt-3 text-2xl font-bold text-stone-900">Buyer account</h2>
        <p className="mt-3 min-h-14 leading-6 text-stone-600">Discover products, contact sellers, and keep orders and receipts in one place.</p>
        <Link href={signupHref('buyer')} className="mt-6 inline-flex rounded-xl bg-[#201a14] px-5 py-3 font-semibold text-white hover:bg-stone-700">Continue as a buyer</Link>
      </article>
      <article className="rounded-3xl border border-amber-200 bg-amber-50 p-7 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-[#c8501c]">For businesses</p>
        <h2 className="mt-3 text-2xl font-bold text-stone-900">Seller account</h2>
        <p className="mt-3 min-h-14 leading-6 text-stone-600">Set up a storefront and submit business details for staff verification before listing products.</p>
        <Link href={signupHref('seller')} className="mt-6 inline-flex rounded-xl bg-[#eb6a2e] px-5 py-3 font-semibold text-white hover:bg-[#d95b21]">Continue as a seller</Link>
      </article>
    </div>
    <p className="mt-7 text-sm text-stone-500">Already have an account? <Link href="/auth?mode=login&next=%2Fstore%2Faccount" className="font-semibold text-[#c8501c] underline">Sign in</Link></p>
  </main>;
}
