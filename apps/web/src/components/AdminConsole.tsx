'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface CourseRow {
  id: string;
  name: string;
  description: string;
  price: string;
  schedule: string | null;
  imageUrl: string | null;
  active: boolean;
}

const EMPTY_COURSE: Omit<CourseRow, 'id'> = {
  name: '',
  description: '',
  price: '',
  schedule: '',
  imageUrl: '',
  active: true,
};

interface PlanRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  priceMinor: number;
  currency: string;
  introPriceMinor: number | null;
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
  'introPriceMinor',
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
  initialCourses,
  initialAcademyInfo,
  stats,
}: {
  initialPlans: PlanRow[];
  initialCourses: CourseRow[];
  initialAcademyInfo: string;
  stats: { users: number; activeSubscriptions: number };
}) {
  const t = useTranslations('admin');
  const tPlan = useTranslations('plan');

  const [plans, setPlans] = useState(initialPlans);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const [academyInfo, setAcademyInfo] = useState(initialAcademyInfo);
  const [academySaving, setAcademySaving] = useState(false);

  const [courses, setCourses] = useState(initialCourses);
  const [newCourse, setNewCourse] = useState(EMPTY_COURSE);
  const [courseSaving, setCourseSaving] = useState('');

  function update(code: string, field: string, value: string) {
    setPlans((prev) =>
      prev.map((p) =>
        p.code === code
          ? { ...p, [field]: field === 'currency' ? value.toUpperCase().slice(0, 3) : Number(value) || 0 }
          : p,
      ),
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
          introPriceMinor: plan.introPriceMinor ?? 0,
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

  async function saveAcademyInfo() {
    setAcademySaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/academy-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: academyInfo }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).message ?? 'Error');
    } finally {
      setAcademySaving(false);
    }
  }

  function updateCourse(id: string, field: keyof CourseRow, value: string | boolean) {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  async function saveCourse(course: CourseRow) {
    setCourseSaving(course.id);
    setError('');
    try {
      const res = await fetch('/api/admin/courses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(course),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).message ?? 'Error');
    } finally {
      setCourseSaving('');
    }
  }

  async function deleteCourse(id: string) {
    setCourseSaving(id);
    setError('');
    try {
      const res = await fetch(`/api/admin/courses?id=${id}`, { method: 'DELETE' });
      if (res.ok) setCourses((prev) => prev.filter((c) => c.id !== id));
      else setError((await res.json().catch(() => ({}))).message ?? 'Error');
    } finally {
      setCourseSaving('');
    }
  }

  async function addCourse() {
    setCourseSaving('new');
    setError('');
    try {
      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCourse),
      });
      if (res.ok) {
        const { course } = (await res.json()) as { course: CourseRow };
        setCourses((prev) => [course, ...prev]);
        setNewCourse(EMPTY_COURSE);
      } else {
        setError((await res.json().catch(() => ({}))).message ?? 'Error');
      }
    } finally {
      setCourseSaving('');
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
              <label className="text-xs">
                <span className="text-ink-muted">currency (3 letters)</span>
                <input
                  dir="ltr"
                  type="text"
                  maxLength={3}
                  value={plan.currency}
                  onChange={(e) => update(plan.code, 'currency', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 uppercase outline-none focus:border-amber"
                />
              </label>

              {NUMERIC_FIELDS.map((field) => (
                <label key={field} className="text-xs">
                  <span className="text-ink-muted">
                    {field === 'introPriceMinor' ? 'introPriceMinor (first purchase only, 0 = none)' : field}
                  </span>
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    value={plan[field] ?? 0}
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

      <section className="space-y-4">
        <h2 className="font-semibold">Academy info</h2>
        <p className="text-xs text-ink-muted">
          General facts the chat always has: intro, departments, the yarub-library reference
          collection, policies. Sent in full with every chat message.
        </p>
        <div className="y-card p-5">
          <textarea
            dir="auto"
            rows={10}
            value={academyInfo}
            onChange={(e) => setAcademyInfo(e.target.value)}
            placeholder="Write everything about YARUB Academy here: what it is, its departments, current courses, policies, the yarub-library collection..."
            className="w-full rounded-lg border border-edge bg-parchment p-3 text-sm outline-none focus:border-amber"
          />
          <button onClick={() => void saveAcademyInfo()} disabled={academySaving} className="y-primary text-sm mt-3">
            {t('save')}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Courses</h2>
        <p className="text-xs text-ink-muted">
          Sent to the chat only when a message names one of these. imageUrl is any public link — a
          GitHub-hosted image works well, the same way the app icon is hosted today.
        </p>

        <div className="y-card p-5 space-y-3">
          <p className="text-xs text-ink-muted font-semibold">Add a course</p>
          <input
            dir="auto"
            placeholder="Name"
            value={newCourse.name}
            onChange={(e) => setNewCourse((c) => ({ ...c, name: e.target.value }))}
            className="w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
          />
          <textarea
            dir="auto"
            rows={3}
            placeholder="Description"
            value={newCourse.description}
            onChange={(e) => setNewCourse((c) => ({ ...c, description: e.target.value }))}
            className="w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              dir="ltr"
              placeholder="Price, e.g. 750 SAR"
              value={newCourse.price}
              onChange={(e) => setNewCourse((c) => ({ ...c, price: e.target.value }))}
              className="rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
            />
            <input
              dir="auto"
              placeholder="Schedule (optional)"
              value={newCourse.schedule ?? ''}
              onChange={(e) => setNewCourse((c) => ({ ...c, schedule: e.target.value }))}
              className="rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
            />
          </div>
          <input
            dir="ltr"
            placeholder="Image URL (optional)"
            value={newCourse.imageUrl ?? ''}
            onChange={(e) => setNewCourse((c) => ({ ...c, imageUrl: e.target.value }))}
            className="w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
          />
          <button
            onClick={() => void addCourse()}
            disabled={courseSaving === 'new' || !newCourse.name || !newCourse.description || !newCourse.price}
            className="y-primary text-sm"
          >
            Add course
          </button>
        </div>

        {courses.map((course) => (
          <div key={course.id} className="y-card p-5 space-y-3">
            <input
              dir="auto"
              value={course.name}
              onChange={(e) => updateCourse(course.id, 'name', e.target.value)}
              className="w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm font-semibold outline-none focus:border-amber"
            />
            <textarea
              dir="auto"
              rows={3}
              value={course.description}
              onChange={(e) => updateCourse(course.id, 'description', e.target.value)}
              className="w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                dir="ltr"
                value={course.price}
                onChange={(e) => updateCourse(course.id, 'price', e.target.value)}
                className="rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
              />
              <input
                dir="auto"
                value={course.schedule ?? ''}
                onChange={(e) => updateCourse(course.id, 'schedule', e.target.value)}
                className="rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
              />
            </div>
            <input
              dir="ltr"
              value={course.imageUrl ?? ''}
              onChange={(e) => updateCourse(course.id, 'imageUrl', e.target.value)}
              className="w-full rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={course.active}
                onChange={(e) => updateCourse(course.id, 'active', e.target.checked)}
              />
              Active (shown to the chat)
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => void saveCourse(course)}
                disabled={courseSaving === course.id}
                className="y-primary text-sm"
              >
                {t('save')}
              </button>
              <button
                onClick={() => void deleteCourse(course.id)}
                disabled={courseSaving === course.id}
                className="text-sm text-danger"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
