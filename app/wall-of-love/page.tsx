import { Badge } from '@/components/ui/badge';
import { TestimonialForm } from '@/components/TestimonialForm';
import { TestimonialsCarousel } from '@/components/TestimonialsCarousel';
import { createPublicMetadata } from '@/lib/seo';

export const metadata = createPublicMetadata({
  title: 'LeonardX Client Experiences',
  description: 'Read published feedback from LeonardX clients and collaborators, or share your own experience with the platform.',
  path: '/wall-of-love',
});

export default function WallOfLovePage() {
  return <main className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
    <Badge>Wall of Love</Badge>
    <h1 className="mt-4 text-4xl font-black sm:text-5xl">Client experiences</h1>
    <p className="mt-3 max-w-2xl text-zinc-400">Published testimonials from clients and collaborators.</p>
    <TestimonialsCarousel />
    <section className="mt-16 max-w-xl">
      <h2 className="mb-4 text-2xl font-bold">Share your experience</h2>
      <TestimonialForm />
    </section>
  </main>;
}
