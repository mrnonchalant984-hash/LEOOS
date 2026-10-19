'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { CONTACT_SERVICES } from '@/lib/contact-form';
import { siteData } from '@/data/site';

type SubmissionStatus = { type: 'success' | 'error'; message: string };

const fieldClassName = 'min-h-12 w-full rounded-xl border border-white/15 bg-white/[.045] px-4 py-3 text-base text-white outline-none transition-colors placeholder:text-zinc-500 hover:border-white/25 focus-visible:border-white/60 focus-visible:ring-2 focus-visible:ring-white/30';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setStatus(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submission = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      service: String(form.get('service') ?? ''),
      message: String(form.get('message') ?? ''),
    };

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || result.saved !== true) {
        throw new Error(result.error || 'Your message could not be submitted. Please try again.');
      }

      let emailSent = false;
      let notificationError = 'Web3Forms is not configured for this deployment.';
      const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
      if (accessKey) {
        try {
          const emailResponse = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              access_key: accessKey,
              name: submission.name,
              email: submission.email,
              replyto: submission.email,
              subject: `New LeonardX contact: ${submission.service}`,
              from_name: 'LeonardX Contact Form',
              message: `Service requested: ${submission.service}\n\n${submission.message}`,
            }),
            signal: AbortSignal.timeout(8_000),
          });
          const emailResult = await emailResponse.json().catch(() => ({}));
          emailSent = emailResponse.ok && emailResult.success === true;
          if (!emailSent) {
            notificationError = emailResponse.status === 429
              ? 'Web3Forms rate-limited the email. Wait one hour before trying again; your message is already saved.'
              : emailResult.message || `Web3Forms could not send the email (HTTP ${emailResponse.status}).`;
          }
        } catch {
          notificationError = 'Web3Forms could not be reached. Your message is already saved.';
        }
      }

      setStatus({
        type: 'success',
        message: emailSent
          ? 'Your message has been received and LeonardX has been notified by email.'
          : `Your message was saved, but the email was not sent. ${notificationError}`,
      });
      formElement.reset();
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error
          ? error.message
          : 'Your message could not be submitted. Check your connection and try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-14 sm:py-20">
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-400">
          LeonardX services
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
          Contact Us
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
          Tell us what you’re working on. We’ll review your message and follow up about the right next step.
        </p>
      </header>

      <form
        onSubmit={submit}
        className="mx-auto mt-10 max-w-2xl rounded-2xl border border-white/10 bg-white/[.025] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:mt-12 sm:p-8"
      >
        <div className="grid gap-5">
          <div className="grid gap-2">
            <label htmlFor="contact-name" className="text-sm font-semibold text-zinc-100">
              Full name
            </label>
            <input
              id="contact-name"
              name="name"
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={120}
              required
              className={fieldClassName}
              placeholder="Your name"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="contact-email" className="text-sm font-semibold text-zinc-100">
              Email address
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              className={fieldClassName}
              placeholder="you@example.com"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="contact-service" className="text-sm font-semibold text-zinc-100">
              What service do you need?
            </label>
            <select
              id="contact-service"
              name="service"
              required
              defaultValue=""
              className={`${fieldClassName} appearance-none`}
            >
              <option value="" disabled>Select a service</option>
              {CONTACT_SERVICES.map((service) => (
                <option key={service} value={service} className="bg-zinc-950 text-white">
                  {service}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label htmlFor="contact-message" className="text-sm font-semibold text-zinc-100">
              Message
            </label>
            <textarea
              id="contact-message"
              name="message"
              minLength={10}
              maxLength={12000}
              rows={7}
              required
              className={`${fieldClassName} min-h-44 resize-y`}
              placeholder="Share a little about your goal, timeline, or questions…"
            />
            <p className="text-xs text-zinc-500">Please include at least 10 characters.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/services"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black motion-reduce:animate-none" aria-hidden="true" />
                Sending message…
              </>
            ) : (
              <>
                <Send aria-hidden="true" size={16} />
                Send message
                <ArrowRight aria-hidden="true" size={15} />
              </>
            )}
          </button>
        </div>

        {status && (
          <p
            role={status.type === 'success' ? 'status' : 'alert'}
            aria-live={status.type === 'success' ? 'polite' : 'assertive'}
            className={`mt-5 flex items-start gap-2 rounded-xl border p-4 text-sm leading-6 ${
              status.type === 'success'
                ? 'border-white/15 bg-white/[.04] text-zinc-200'
                : 'border-red-400/25 bg-red-400/[.06] text-red-200'
            }`}
          >
            {status.type === 'success' && (
              <CheckCircle2 aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
            )}
            {status.message}
          </p>
        )}
      </form>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-zinc-500">
        Prefer email?{' '}
        <a
          href={`mailto:${siteData.email}`}
          className="font-medium text-zinc-300 underline decoration-white/30 underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Contact LeonardX directly
        </a>
      </p>
    </main>
  );
}
