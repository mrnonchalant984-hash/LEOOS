import { AuthForm } from '@/components/AuthForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in or create an account | LeonardX', description: 'Securely access your LeonardX software workspace.' };

export default function AuthPage() {
  return <main className="auth-page-main"><AuthForm /></main>;
}
