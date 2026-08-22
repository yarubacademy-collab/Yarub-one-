'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  priceMinor: number;
  currency: string;
  intervalDays: number;
  imageQuota: number;
  videoQuota: number;
  maxVideoSeconds: number;
  websiteQuota: number;
  gameQuota: number;
  documentQuota: number;
}

const NUMERIC_FIELDS = [
  'priceMinor',
  'imageQuota',
  'videoQuota',
  'maxVideoSeconds',
  'websiteQuota',
  'gameQuota',
  'documentQuota',
] as const;

/**
 * Plan and quota administration.
 *
 * Every limit in the product is editable here, which is what keeps the numbers
 * out of the code. Saving writes to the Plan table; enforcement reads from it
 * on the next request.
 */
export function AdminConsole({
  initialPlans,
  stats,
}: {
  initialPlans: PlanRow[];
  stats: { users: number; activeSubscriptions: number };
}) {
  const t = useTranslations('admin');
  const tPlan = useTranslations('plan');

  const [plans, setPlans] = useState(initialPlans);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  function update(code: string, field: string, value: string) {
    setPlans((prev) =>
      prev.map((p) => (p.code === code ? { ...p, [field]: Number(value) || 0 } : p)),
    );
  }

  async function save(plan: PlanRow) {
    setSaving(plan.code);
    setError('');
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: plan.code,
          name: plan.name,
          active: plan.active,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          intervalDays: plan.intervalDays,
          imageQuota: plan.imageQuota,
          videoQuota: plan.videoQuota,
          maxVideoSeconds: plan.maxVideoSeconds,
          websiteQuota: plan.websiteQuota,
          gameQuota: plan.gameQuota,
          documentQuota: plan.documentQuota,
        }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).message ?? 'Error');
    } finally {
      setSaving('');
    }
  }

  return (
    <div className="space-y-8">
      <div className="y-card p-5 flex gap-8">
        <span className="text-sm">
          {t('users')} <span className="numeral font-bold">{stats.users}</span>
        </span>
        <span className="text-sm">
          {tPlan('current')} <span className="numeral font-bold">{stats.activeSubscriptions}</span>
        </span>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      <section className="space-y-4">
        <h2 className="font-semibold">{t('plans')}</h2>

        {plans.map((plan) => (
          <div key={plan.id} className="y-card p-5">
            <h3 className="font-semibold mb-4">{tPlan(plan.code as 'free')}</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {NUMERIC_FIELDS.map((field) => (
                <label key={field} className="text-xs">
                  <span className="text-ink-muted">{field}</span>
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    value={plan[field]}
                    onChange={(e) => update(plan.code, field, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 numeral outline-none focus:border-amber"
                  />
                </label>
              ))}
            </div>

            <button
              onClick={() => void save(plan)}
              disabled={saving === plan.code}
              className="y-primary text-sm mt-4"
            >
              {t('save')}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
