'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Testimonial = { id: string; name: string; company: string; comment: string; created_at: string };

export function TestimonialForm() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company, comment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your testimonial could not be published.');

      const detail: { testimonial: Testimonial; count: number | null } = { testimonial: result.testimonial, count: result.count ?? null };
      window.dispatchEvent(new CustomEvent('leo:testimonial-published', { detail }));
      toast.success('Testimonial published successfully! Thank you for sharing your experience.');
      setName('');
      setCompany('');
      setComment('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your testimonial could not be published.');
    } finally {
      setLoading(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-3">
    <Input placeholder="Your name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={80} required autoComplete="name" />
    <Input placeholder="Company / role" value={company} onChange={event => setCompany(event.target.value)} maxLength={100} required />
    <Textarea placeholder="Your experience" value={comment} onChange={event => setComment(event.target.value)} minLength={10} maxLength={1200} required />
    <Button disabled={loading}>{loading ? 'Publishing…' : 'Publish testimonial'}</Button>
  </form>;
}
