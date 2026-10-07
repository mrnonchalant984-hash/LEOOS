import Link from "next/link";

export default function WebsitePayment() {
  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-16 text-white">
      <section className="mx-auto max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm font-bold text-yellow-300">LEO OS PROJECT BUILDER</p>
        <h1 className="mt-2 text-3xl font-black">Build with your plan</h1>
        <p className="mt-3 text-zinc-400">
          Websites, web apps, and SaaS projects use your LEO OS plan. Hosting is a separate service after the included 90-day trial.
        </p>
        <Link href="/pricing" className="mt-7 inline-flex rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black">View plans</Link>
      </section>
    </main>
  );
}
