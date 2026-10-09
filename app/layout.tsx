import type {Metadata} from 'next'; import './globals.css'; import './premium-theme.css'; import {Analytics} from '@vercel/analytics/next'; import {Header} from '@/components/Header'; import {Footer} from '@/components/Footer'; import {Providers} from './providers'; import VisualBackground from '@/components/VisualBackground'; import {GlobalLEOWidget} from '@/components/GlobalLEOWidget';

export const metadata: Metadata = {
  metadataBase: new URL('https://leoos-omega.vercel.app'),
  title: 'Leonard X — AI Software Creation Platform',
  description: 'Leonard X is an AI-powered software creation and management platform for building, testing, deploying and improving software.',
  icons: {
    icon: [
      { url: '/favicon.ico', rel: 'icon' },
      { url: '/icon.svg', type: 'image/svg+xml', rel: 'icon' },
      { url: '/icon.png', type: 'image/png', sizes: '256x256' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'Leonard X — AI Software Creation Platform',
    description: 'AI-powered software creation, agent execution, deployment and developer tooling.',
    url: 'https://leoos-omega.vercel.app',
  },
};

export default function Layout({children}:{children:React.ReactNode}){return <html lang='en' data-scroll-behavior='smooth'><body className='min-h-screen bg-black text-white'><VisualBackground/><Providers><Header/>{children}<GlobalLEOWidget/><Footer/></Providers><Analytics/></body></html>}
