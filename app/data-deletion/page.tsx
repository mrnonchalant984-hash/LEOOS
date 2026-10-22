import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description: "Learn how to request deletion of your LeonardX account and associated personal data.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/data-deletion" },
};

const supportEmail = "leonardudoh5@gmail.com";

export default function DataDeletionPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 md:py-20">
      <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.04] shadow-2xl shadow-black/20">
        <header className="border-b border-white/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-violet-500/10 p-6 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">LeonardX · Privacy</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Data deletion instructions</h1>
          <p className="mt-4 max-w-2xl leading-7 text-zinc-300">
            You can ask LeonardX to delete your account and personal information. This page explains how to make a request and what to expect.
          </p>
          <p className="mt-3 text-sm text-zinc-500">Last updated: October 22, 2026</p>
        </header>
        <div className="space-y-8 p-6 leading-7 text-zinc-300 sm:p-10">
          <section>
            <h2 className="text-xl font-bold text-white">How to request deletion</h2>
            <ol className="mt-3 list-decimal space-y-3 pl-6">
              <li>
                Email <a className="font-semibold text-cyan-300 underline underline-offset-4" href={`mailto:${supportEmail}?subject=${encodeURIComponent("LeonardX data deletion request")}`}>{supportEmail}</a> with the subject <strong className="text-white">LeonardX data deletion request</strong>.
              </li>
              <li>Identify the email address associated with your LeonardX account and state that you want your account and associated personal data deleted.</li>
              <li>We may contact you to verify account ownership. Do not send your password, access tokens, API keys, or other secrets.</li>
            </ol>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">What may be deleted</h2>
            <p className="mt-3">
              Depending on the account and services you used, a verified request may cover your LeonardX profile, account-associated personal information, saved preferences, and connected-account tokens managed by LeonardX. Associated project data will be reviewed where deletion will not affect another user or violate a legal obligation.
            </p>
            <p className="mt-3">
              Data held directly by third-party providers—including connected GitHub, Google, Meta, payment, hosting, or AI-provider accounts—may require a separate request to that provider. You can also revoke LeonardX access in the provider&apos;s security or connected-app settings.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">Processing and retention</h2>
            <p className="mt-3">
              We will review the request, verify account ownership where necessary, and contact you if more information is needed. We aim to process verified requests within 30 days. Some records may be retained for a limited period where required for legal compliance, security, fraud prevention, dispute resolution, or accounting.
            </p>
            <p className="mt-3">
              This page explains how to submit a request; sending an email does not itself confirm that deletion has completed. We will provide confirmation when the request has been reviewed and processed.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">Need help?</h2>
            <p className="mt-3">Contact <a className="font-semibold text-cyan-300 underline underline-offset-4" href={`mailto:${supportEmail}`}>{supportEmail}</a> for help with a deletion request.</p>
          </section>
          <div className="flex flex-wrap gap-4 border-t border-white/10 pt-6 text-sm">
            <Link className="text-cyan-300 underline underline-offset-4" href="/privacy">Read the privacy policy</Link>
            <Link className="text-cyan-300 underline underline-offset-4" href="/">Return to LeonardX</Link>
          </div>
        </div>
      </article>
    </main>
  );
}
