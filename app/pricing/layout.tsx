import { createPublicMetadata } from '@/lib/seo';
export const metadata = createPublicMetadata({
  title: 'Pricing',
  description: "Compare LeonardX software workspace plans, prepaid billing periods and the project tools included in each plan.",
  path: "/pricing",
  type: "website",
});

export default function PricingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
