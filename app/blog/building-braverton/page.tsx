import Link from 'next/link';

export default function BuildingBravertonPost() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <article className="rounded-3xl border border-white/10 bg-white/[.04] p-8 md:p-12">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Building Braverton · Founder build log</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Building Braverton in public</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-300">
          This is the running record of Braverton’s development: product decisions, engineering changes,
          verification results, lessons learned and the work that remains.
        </p>
        <h2 className="mt-10 text-2xl font-bold">What this log will cover</h2>
        <ul className="mt-4 list-disc space-y-3 pl-6 leading-8 text-zinc-300">
          <li>How the platform evolves from idea and planning into working software</li>
          <li>Changes to Bram, project workspaces, developer tools and integrations</li>
          <li>What has been implemented, what has been tested and what is still in progress</li>
          <li>Build decisions, trade-offs and lessons from developing in Nigeria</li>
        </ul>
        <p className="mt-8 leading-8 text-zinc-300">
          Updates will distinguish shipped functionality from prototypes and planned work. No invented
          customer numbers, testimonials or deployment claims.
        </p>
        <Link href="/blog" className="mt-8 inline-flex rounded-xl border border-white/15 px-5 py-3 font-semibold">Back to Braverton Journal</Link>
      </article>
    </main>
  );
}
