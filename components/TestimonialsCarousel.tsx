'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Testimonial = {
  id: string;
  name: string;
  company: string;
  comment: string;
  created_at: string;
};

type TestimonialUpdate = { testimonial: Testimonial; count: number | null };

export function TestimonialsCarousel() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active = true;
    fetch('/api/testimonials', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Testimonials could not be loaded.');
        if (active) {
          setItems(data.testimonials || []);
          setCount(data.count || 0);
        }
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Testimonials could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });

    function onPublished(event: Event) {
      const update = (event as CustomEvent<TestimonialUpdate>).detail;
      if (!update?.testimonial) return;
      setItems(current => [update.testimonial, ...current.filter(item => item.id !== update.testimonial.id)]);
      setCount(current => update.count ?? current + 1);
      setIndex(0);
    }
    window.addEventListener('leo:testimonial-published', onPublished);
    return () => {
      active = false;
      window.removeEventListener('leo:testimonial-published', onPublished);
    };
  }, []);

  useEffect(() => {
    if (paused || reducedMotion.current || items.length < 2) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  function goTo(next: number) {
    setIndex((next + items.length) % items.length);
  }

  function onTouchStart(event: React.TouchEvent<HTMLElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
    setPaused(true);
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const endX = event.changedTouches[0]?.clientX;
    if (touchStartX.current !== null && endX !== undefined) {
      const delta = endX - touchStartX.current;
      if (Math.abs(delta) > 45) goTo(index + (delta < 0 ? 1 : -1));
    }
    touchStartX.current = null;
    setPaused(false);
  }

  return (
    <section
      aria-label="Published testimonials"
      className="mt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black">Wall of Love</h2>
          <p className="mt-2 text-sm text-zinc-400">{count} published {count === 1 ? 'testimonial' : 'testimonials'}</p>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-zinc-400">Loading testimonials…</div>
        : error ? <div role="status" className="rounded-2xl border border-red-900/60 bg-zinc-950 p-6 text-sm text-red-300">{error}</div>
        : items.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-zinc-400">No testimonials yet. Be the first to share your experience.</div>
        : <>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950" aria-roledescription="carousel">
            <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
              {items.map(item => (
                <article key={item.id} aria-roledescription="slide" className="min-w-full p-6 sm:p-9">
                  <div className="text-4xl leading-none text-yellow-300" aria-hidden="true">“</div>
                  <blockquote className="mt-4 max-w-4xl text-lg leading-8 text-zinc-200 sm:text-2xl">{item.comment}</blockquote>
                  <div className="mt-7 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-800 pt-4">
                    <div><p className="font-bold">{item.name}</p><p className="text-sm text-zinc-500">{item.company}</p></div>
                    <time className="text-xs text-zinc-500" dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time>
                  </div>
                </article>
              ))}
            </div>
          </div>
          {items.length > 1 && <div className="mt-4 flex items-center justify-center gap-3">
            <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous testimonial" className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 hover:border-yellow-400"><ChevronLeft size={19}/></button>
            <div className="flex items-center gap-2" aria-label={`Testimonial ${index + 1} of ${items.length}`}>
              {items.map((item, dot) => <button key={item.id} type="button" onClick={() => goTo(dot)} aria-label={`Show testimonial ${dot + 1}`} aria-current={dot === index} className={`h-2.5 rounded-full transition-all ${dot === index ? 'w-6 bg-yellow-400' : 'w-2.5 bg-zinc-600 hover:bg-zinc-400'}`} />)}
            </div>
            <button type="button" onClick={() => goTo(index + 1)} aria-label="Next testimonial" className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 hover:border-yellow-400"><ChevronRight size={19}/></button>
          </div>}
        </>}
    </section>
  );
}
