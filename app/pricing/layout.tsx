import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | LeonardX',
  description:
    'Compare LeonardX Free, Standard, Pro, and Business plans for AI-assisted website, web app, and SaaS development. Review prepaid monthly, quarterly, and yearly prices.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'LeonardX Pricing — Plans for Building Software',
    description:
      'Compare LeonardX plans and prepaid billing periods for building websites, web apps, and SaaS products.',
    url: '/pricing',
  },
};

export default function PricingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
