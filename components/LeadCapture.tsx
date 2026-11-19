'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type LeadValues = { name: string; service: string; budget: string; phone: string };

export function LeadCapture({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState<LeadValues>({ name: '', service: '', budget: '', phone: '' });
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, website }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.saved !== true) {
        throw new Error(result.error || 'Your project details could not be saved.');
      }

      const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY?.trim();
      if (!accessKey) {
        toast.error('Your details were saved, but owner notification is not configured. Add NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in Vercel.');
        return;
      }

      const message = [
        'New Braverton lead captured by Bram',
        '',
        `Name: ${v.name}`,
        `Service: ${v.service}`,
        `Budget: ${v.budget}`,
        `Phone: ${v.phone}`,
      ].join('\\n');

      let web3Result: { success?: boolean; message?: string } = {};
      let web3Response: Response;
      try {
        web3Response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            access_key: accessKey,
            name: v.name,
            phone: v.phone,
            subject: `New Braverton lead from Bram: ${v.name}`,
            from_name: 'Braverton — Bram Lead Capture',
            message,
            botcheck: website,
          }),
        });
        web3Result = await web3Response.json().catch(() => ({}));
      } catch {
        toast.error('Your lead was saved, but Web3Forms could not be reached. Owner notification is not confirmed.');
        return;
      }

      if (!web3Response.ok || web3Result.success !== true) {
        toast.error(web3Result.message || `Your lead was saved, but Web3Forms rejected the notification (HTTP ${web3Response.status}).`);
        return;
      }

      toast.success('Your details were sent to Braverton. The team has been notified.');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Lead submission failed. Please retry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
      <div className="text-sm font-semibold text-yellow-300">Want Leonard to help with your project?</div>
      <Input placeholder="Name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} required minLength={2} maxLength={120} />
      <Input placeholder="Service" value={v.service} onChange={e => setV({ ...v, service: e.target.value })} required minLength={2} maxLength={500} />
      <Input placeholder="Budget" value={v.budget} onChange={e => setV({ ...v, budget: e.target.value })} required maxLength={160} />
      <Input placeholder="Phone number" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} required minLength={5} maxLength={80} />
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="bram-lead-website">Leave this field empty</label>
        <input id="bram-lead-website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
      </div>
      <Button className="w-full" disabled={loading}>
        {loading ? 'Sending…' : 'Send details'}
      </Button>
    </form>
  );
}
