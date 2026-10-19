import type { Metadata, Viewport } from 'next';
import './globals.css';
import './premium-theme.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Providers } from './providers';
import VisualBackground from '@/components/VisualBackground';
import { GlobalLEOWidget } from '@/components/GlobalLEOWidget';
import { ObservabilityScripts } from './observability-scripts';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_TITLE,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_PATH,
  serializeJsonLd,
} from '@/lib/seo';

export const viewport: Viewport = {
  themeColor: '#08090d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: '%s | LeonardX',
  },
  description: SITE_DESCRIPTION,
  category: 'technology',
  authors: [{ name: SITE_NAME }, { name: 'Leonard Udoh' }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', rel: 'icon' }],
    shortcut: '/favicon.svg',
    apple: [{ url: '/leonardx-logo.svg', type: 'image/svg+xml' }],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_ORIGIN + '/',
    locale: 'en_US',
    images: [{ url: SOCIAL_IMAGE_PATH, width: 1200, height: 630, alt: SOCIAL_IMAGE_ALT }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE_PATH],
  },
  other: {
    'format-detection': 'telephone=no',
    'color-scheme': 'dark',
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': SITE_ORIGIN + '/#organization',
  name: SITE_NAME,
  alternateName: ['LEO OS', 'Leonard X'],
  url: SITE_ORIGIN + '/',
  logo: SITE_ORIGIN + '/leonardx-logo.svg',
  founder: { '@type': 'Person', name: 'Leonard Udoh' },
};

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': SITE_ORIGIN + '/#website',
  name: SITE_NAME,
  url: SITE_ORIGIN + '/',
  description: SITE_DESCRIPTION,
  publisher: { '@id': SITE_ORIGIN + '/#organization' },
  inLanguage: 'en',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }} />
      </head>
      <body className="min-h-screen bg-black text-white">
        <VisualBackground />
        <Providers>
          <Header />
          {children}
          <GlobalLEOWidget />
          <Footer />
        </Providers>
        <ObservabilityScripts />
      </body>
    </html>
  );
}
