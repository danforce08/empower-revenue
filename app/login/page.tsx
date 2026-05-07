'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Wrong password');
      setPending(false);
      return;
    }
    const next = params.get('next') ?? '/';
    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-[var(--background)] px-4">
      <div
        aria-hidden
        className="absolute -right-32 -top-32 w-[520px] h-[520px] rounded-full opacity-[0.06] blur-3xl bg-gradient-to-br from-[var(--brand-cyan)] to-[var(--brand-navy)] anim-fade-in"
      />
      <div
        aria-hidden
        className="absolute -left-40 -bottom-40 w-[420px] h-[420px] rounded-full opacity-[0.05] blur-3xl bg-[var(--brand-cyan)] anim-fade-in"
      />

      <div className="relative w-full max-w-md anim-fade-rise">
        <div className="flex justify-center mb-8">
          <Image
            src="/empower-logo.svg"
            alt="Empower Home Services"
            width={220}
            height={44}
            priority
            className="logo-img h-10 w-auto"
          />
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 shadow-[0_2px_4px_rgba(10,24,40,0.04),0_24px_60px_-20px_rgba(10,24,40,0.18)]">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
            Revenue Dashboard
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1.5">
            Enter the team password to continue.
          </p>

          {error && (
            <div className="mt-5 text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 anim-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--border-strong)] rounded-lg text-sm focus:border-[var(--brand-cyan)] focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50"
            >
              {pending ? 'Signing in…' : 'Continue'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--muted)] mt-6">
          The Empower Revenue Dashboard
        </p>
      </div>
    </div>
  );
}
