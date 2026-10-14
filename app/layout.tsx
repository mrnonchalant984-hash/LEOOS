import type { Metadata, Viewport } from 'next';
import './globals.css';
import './premium-theme.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Providers } from './providers';
import VisualBackground from '@/components/VisualBackground';
import { GlobalLEOWidget } from '@/components/GlobalLEOWidget';
import { ObservabilityScripts } from './observability-scripts';

const siteUrl = 'https://leoos-omega.vercel.app';
const siteName = 'LeonardX';
const siteDescription = 'Build websites, web apps and software with AI-assisted coding, project workspaces, specialized agents, developer APIs and deployment workflows in LeonardX.';

export const viewport: Viewport = {
  themeColor: '#08090d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: 'LeonardX — AI Website Builder, Coding Agents & Software Workspace',
    template: '%s | LeonardX',
  },
  description: siteDescription,
  category: 'technology',
  keywords: [
    'LeonardX', 'LEO OS', 'AI website builder', 'AI app builder', 'AI coding assistant',
    'AI software development', 'AI coding agents', 'build websites with AI',
    'web app development', 'SaaS development', 'developer API', 'AI workflow automation',
    'website builder for businesses', 'AI tools for developers',
  ],
  authors: [{ name: 'LeonardX' }, { name: 'Leonard Udoh' }],
  creator: 'LeonardX',
  publisher: 'LeonardX',
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
    siteName,
    title: 'LeonardX — Build Software with AI',
    description: siteDescription,
    url: siteUrl,
    locale: 'en_US',
    images: [{ url: '/qevli-landing.jpg', width: 960, height: 1346, alt: 'LeonardX AI software creation platform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LeonardX — Build Software with AI',
    description: siteDescription,
    images: ['/qevli-landing.jpg'],
  },
  other: {
    'format-detection': 'telephone=no',
    'color-scheme': 'dark',
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteUrl}/#organization`,
  name: 'LeonardX',
  alternateName: ['LEO OS', 'Leonard X'],
  url: siteUrl,
  logo: `${siteUrl}/leonardx-logo.svg`,
  founder: { '@type': 'Person', name: 'Leonard Udoh' },
  sameAs: [],
};

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  name: 'LeonardX',
  url: siteUrl,
  description: siteDescription,
  publisher: { '@id': `${siteUrl}/#organization` },
  inLanguage: 'en',
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${siteUrl}/#software`,
  name: 'LeonardX',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  url: siteUrl,
  description: siteDescription,
  image: `${siteUrl}/qevli-landing.jpg`,
  publisher: { '@id': `${siteUrl}/#organization` },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth"><head>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, '\\u003c') }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema).replace(/</g, '\\u003c') }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema).replace(/</g, '\\u003c') }} />
  </head><body className="min-h-screen bg-black text-white"><VisualBackground/><Providers><Header/>{children}<GlobalLEOWidget/><Footer/></Providers><ObservabilityScripts/></body></html>;
}
