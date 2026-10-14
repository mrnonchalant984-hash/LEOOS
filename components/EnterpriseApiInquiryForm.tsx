'use client';

import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';

export function EnterpriseApiInquiryForm() {
  const [organization, setOrganization] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [usage, setUsage] = useState('unknown');
  const [useCase, setUseCase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setSuccess(false);
    try {
      const response = await fetch('/api/enterprise-api-inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organization, workEmail, expectedMonthlyRequests: usage, useCase }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Inquiry could not be submitted.');
      setSuccess(true); setMessage(data.message || 'Inquiry received.'); setOrganization(''); setWorkEmail(''); setUseCase(''); setUsage('unknown');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Inquiry could not be submitted.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-2">
    <label className="text-sm text-zinc-300">Organization<input required minLength={2} maxLength={120} value={organization} onChange={e => setOrganization(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" /></label>
    <label className="text-sm text-zinc-300">Work email<input required type="email" maxLength={254} value={workEmail} onChange={e => setWorkEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" /></label>
    <label className="text-sm text-zinc-300 md:col-span-2">Expected monthly requests<select value={usage} onChange={e => setUsage(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"><option value="under_100k">Under 100,000</option><option value="100k_1m">100,000–1 million</option><option value="1m_10m">1–10 million</option><option value="over_10m">Over 10 million</option><option value="unknown">Not sure yet</option></select></label>
    <label className="text-sm text-zinc-300 md:col-span-2">Use case and requirements<textarea required minLength={20} maxLength={2000} rows={4} value={useCase} onChange={e => setUseCase(e.target.value)} placeholder="Describe your integration, expected traffic, security requirements, and needed support." className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" /></label>
    <div className="md:col-span-2"><button type="submit" disabled={busy} className="primary-button"><Send size={14}/>{busy ? 'Sending…' : 'Send API access request'}</button>{message && <p role="status" className={`mt-3 text-sm ${success ? 'text-emerald-200' : 'text-zinc-300'}`}>{message}</p>}</div>
  </form>;
}
