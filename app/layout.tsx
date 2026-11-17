import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import './premium-theme.css';
import './store/store-theme.css';
import './design-system.css';
import { Providers } from './providers';
import VisualBackground from '@/components/VisualBackground';
import { StoreChrome } from '@/components/StoreChrome';
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
  themeColor: '#080810',
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: '%s | Braverton',
  },
  description: SITE_DESCRIPTION,
  keywords: ['Braverton', 'AI software development', 'build apps with AI', 'Coda AI assistant', 'web development Nigeria', 'AI platform Africa'],
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
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: [{ url: '/braverton-logo.svg', type: 'image/svg+xml' }],
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
    'color-scheme': 'light dark',
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': SITE_ORIGIN + '/#organization',
  name: SITE_NAME,
  description: 'AI-assisted software creation platform for building websites, web apps and software.',
  areaServed: ['NG', 'Africa'],
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: SITE_ORIGIN + '/contact' },
  alternateName: ['Braverton OS'],
  url: SITE_ORIGIN + '/',
  logo: SITE_ORIGIN + '/braverton-logo.svg',
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('leonardx-theme');if(t==='dark'){document.documentElement.dataset.theme='dark';}else{document.documentElement.dataset.theme='light';}}catch(e){document.documentElement.dataset.theme='light';}" }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }} />
      </head>
      <body className="min-h-screen">
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8872751811502892"
          strategy="beforeInteractive"
          crossOrigin="anonymous"
        />
        <VisualBackground />
        <Providers>
          <StoreChrome>{children}</StoreChrome>
        </Providers>
        <ObservabilityScripts />
      </body>
    </html>
  );
}
