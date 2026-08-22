'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  promoPriceMinor: number | null;
  promoEndsAt: string | null;
  intervalDays: number;
  imageQuota: number;
  videoQuota: number;
  maxVideoSeconds: number;
  websiteQuota: number;
  gameQuota: number;
}

interface SubscriptionResponse {
  plans: PlanRow[];
  subscription: { planCode: string; status: string; expiresAt: string | null } | null;
  paymentStatus: string;
}

/**
 * Pricing.
 *
 * Every number rendered here comes from the Plan table — no price, quota or
 * duration is written into this component. An unpriced plan says so rather
 * than inventing a figure.
 */
export function PricingTable({ locale }: { locale: string }) {
  const t = useTranslations('plan');
  const tMeter = useTranslations('meter');

  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const res = await fetch('/api/subscription');
    if (res.ok) setData((await res.json()) as SubscriptionResponse);
  }

  useEffect(() => {
    void load();
  }, []);

  async function subscribe(code: string) {
    setBusy(code);
    setNotice('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: code, locale }),
      });

      if (res.ok) {
        // A configured provider returns a hosted checkout URL to redirect to.
        const data = (await res.json()) as { redirectUrl?: string };
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        await load();
        return;
      }

      // Without credentials the server says so plainly. Nothing is simulated.
      setNotice(t('paymentNotConfigured'));
    } finally {
      setBusy('');
    }
  }

  async function cancel() {
    setBusy('cancel');
    try {
      await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      await load();
    } finally {
      setBusy('');
    }
  }

  if (!data) return null;

  const price = (plan: PlanRow) => {
    const promoActive =
      plan.promoPriceMinor !== null &&
      (!plan.promoEndsAt || new Date(plan.promoEndsAt) > new Date());
    const minor = promoActive ? plan.promoPriceMinor! : plan.priceMinor;
    if (minor <= 0) return t('priceUnavailable');
    return `${(minor / 100).toFixed(2)} ${plan.currency}`;
  };

  return (
    <div className="space-y-6">
      {notice && <p className="y-card p-4 text-sm">{notice}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((plan) => {
          const current = data.subscription?.planCode === plan.code;
          return (
            <section
              key={plan.id}
              className={`y-card p-6 flex flex-col ${current ? 'border-amber' : ''}`}
            >
              <h2 className="font-bold text-lg">{t(plan.code as 'free')}</h2>

              <p className="numeral text-2xl font-bold my-3">{price(plan)}</p>
              <p className="text-xs text-ink-muted mb-4">
                {plan.intervalDays >= 365 ? t('perYear') : t('perMonth')}
              </p>

              <ul className="text-sm space-y-1 flex-1">
                <li>
                  {tMeter('image')} <span className="numeral">{plan.imageQuota}</span>
                </li>
                <li>
                  {tMeter('video')} <span className="numeral">{plan.videoQuota}</span> ·{' '}
                  <span className="numeral">{plan.maxVideoSeconds}s</span>
                </li>
                <li>
                  {tMeter('website')} <span className="numeral">{plan.websiteQuota}</span>
                </li>
                <li>
                  {tMeter('game')} <span className="numeral">{plan.gameQuota}</span>
                </li>
              </ul>

              <div className="mt-5">
                {current ? (
                  <p className="text-sm text-ink-muted">{t('current')}</p>
                ) : plan.code === 'free' ? null : (
                  <button
                    onClick={() => void subscribe(plan.code)}
                    disabled={busy === plan.code}
                    className="y-primary w-full text-sm"
                  >
                    {t('choose')}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {data.subscription && data.subscription.status === 'active' && data.subscription.planCode !== 'free' && (
        <button onClick={() => void cancel()} disabled={busy === 'cancel'} className="text-sm text-danger hover:underline">
          {t('cancel')}
        </button>
      )}
    </div>
  );
}
