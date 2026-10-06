'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react';
import { siteData } from '@/data/site';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
      if (!accessKey) throw new Error('Contact delivery is not configured. Add NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY to Vercel and redeploy.');

      const saveResponse = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const saveResult = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveResult.error || 'Message could not be saved.');

      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...payload,
          access_key: accessKey,
          subject: `New portfolio contact from ${payload.name}`,
          from_name: 'LEO OS Contact Form',
          replyto: payload.email,
          botcheck: '',
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        const detail = result?.body?.message || result?.message || result?.error || 'Web3Forms did not accept the submission.';
        throw new Error(`Message saved, but Web3Forms could not deliver it: ${detail}`);
      }
      setStatus({ type: 'success', text: 'Message sent. Leonard has been notified by email.' });
      event.currentTarget.reset();
    } catch (error) {
      setStatus({ type: 'error', text: error instanceof Error ? error.message : 'Message could not be sent.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <div className="max-w-2xl">
        <p className="mb-3 font-semibold text-[var(--gold)]">CONTACT LEONARD</p>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Let&apos;s build something that brings customers.</h1>
        <p className="mt-5 text-zinc-400">Send your details below. Your message is delivered to Leonard by email.</p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.3fr_.7fr]">
        <form onSubmit={submit} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Name<input name="name" required minLength={2} className="rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="Your full name" /></label>
            <label className="grid gap-2 text-sm font-medium">Email<input name="email" type="email" required className="rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="you@example.com" /></label>
            <label className="grid gap-2 text-sm font-medium sm:col-span-2">Phone<input name="phone" required className="rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="+234..." /></label>
            <label className="grid gap-2 text-sm font-medium sm:col-span-2">Message<textarea name="message" required minLength={10} rows={7} className="resize-y rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="Tell Leonard what you want to build..." /></label>
          </div>
          <button disabled={loading} className="mt-6 inline-flex items-center rounded-xl bg-[var(--gold)] px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"><Send size={17} className="mr-2" />{loading ? 'Sending...' : 'Send Message'}</button>
          {status && <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${status.type === 'success' ? 'border-emerald-800 text-emerald-300' : 'border-red-800 text-red-300'}`}>{status.text}</p>}
        </form>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
          <h2 className="text-2xl font-bold">Contact information</h2>
          <div className="mt-6 grid gap-4">
            <a href={`mailto:${siteData.email}`} className="flex gap-3 rounded-xl border border-zinc-800 p-4 hover:border-[var(--gold)]"><Mail className="text-[var(--gold)]" /> <span>{siteData.email}</span></a>
            <a href={`tel:${siteData.phone}`} className="flex gap-3 rounded-xl border border-zinc-800 p-4 hover:border-[var(--gold)]"><Phone className="text-[var(--gold)]" /> <span>{siteData.phoneDisplay}</span></a>
            <div className="flex gap-3 rounded-xl border border-zinc-800 p-4"><MapPin className="text-[var(--gold)]" /> <span>{siteData.location}</span></div>
          </div>
          <Link href={siteData.whatsapp} target="_blank" className="mt-6 block rounded-xl bg-[var(--gold)] px-5 py-4 text-center font-black text-black"><MessageCircle className="mr-2 inline" size={18} />Message LeonardX on WhatsApp</Link>
          <p className="mt-4 text-sm text-zinc-500">WhatsApp: {siteData.phoneDisplay}</p>
        </aside>
      </div>
    </main>
  );
}
