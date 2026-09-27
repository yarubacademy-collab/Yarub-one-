'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';

/**
 * One form for both entry points.
 *
 * Server responses are deliberately uninformative about whether an account
 * exists, so this component must not try to be more specific than the API is.
 */
export function AuthForm({ mode, locale }: { mode: 'login' | 'register'; locale: Locale }) {
  const t = useTranslations('auth');
  const tError = useTranslations('error');
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isRegister ? { email, password, locale } : { email, password },
        ),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
        setError(
          body.code === 'RATE_LIMITED' ? tError('rateLimited') : body.message ?? tError('generic'),
        );
        return;
      }

      router.push(`/${locale}`);
      router.refresh();
    } catch {
      setError(tError('generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold mb-6">{isRegister ? t('signUp') : t('signIn')}</h1>

      <div className="y-card p-5 space-y-4">
        <label className="block">
          <span className="text-sm text-ink-muted">{t('email')}</span>
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-edge bg-parchment px-3 py-2 outline-none focus:border-amber"
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-muted">{t('password')}</span>
          <input
            type="password"
            dir="ltr"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            className="mt-1 w-full rounded-lg border border-edge bg-parchment px-3 py-2 outline-none focus:border-amber"
          />
        </label>

        {error && <p className="text-danger text-sm">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={busy || !email || password.length < (isRegister ? 10 : 1)}
          className="y-primary w-full"
        >
          {isRegister ? t('signUp') : t('signIn')}
        </button>
      </div>

      <p className="text-sm text-ink-muted mt-4 text-center">
        <Link
          href={`/${locale}/${isRegister ? 'login' : 'register'}`}
          className="hover:text-ink underline"
        >
          {isRegister ? t('signIn') : t('signUp')}
        </Link>
      </p>
    </div>
  );
}
