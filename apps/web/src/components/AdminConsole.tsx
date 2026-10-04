
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface CourseRow {
  id: string;
  name: string;
  description: string;
  price: string;
  schedule: string | null;
  startsAt: string | null;
  imageUrl: string | null;
  whatsappNumber: string | null;
  active: boolean;
}

interface CourseDraft {
  name: string;
  description: string;
  price: string;
  schedule: string;
  startsAt: string;
  imageUrl: string;
  whatsappNumber: string;
  active: boolean;
}

/**
 * Shows a stored startsAt (UTC, e.g. "2026-10-04T13:00:00.000Z") back in Oman
 * local time, matching what the admin actually typed for it. Oman is UTC+4
 * all year, so this is just "add 4 hours and drop the Z" — the server-side
 * counterpart of the same fixed offset applied when the course was saved.
 */
function toOmanLocalInputValue(utcIso: string): string {
  const omanTime = new Date(new Date(utcIso).getTime() + 4 * 60 * 60 * 1000);
  return omanTime.toISOString().slice(0, 16);
}

const EMPTY_DRAFT: CourseDraft = {
  name: '',
  description: '',
  price: '',
  schedule: '',
  startsAt: '',
  imageUrl: '',
  whatsappNumber: '',
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

/** A chosen file, as a data: URL the upload endpoint accepts directly. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Plan, academy-info and course administration.
 *
 * Every limit and every course in the product is editable here, which is what
 * keeps them out of the code: saving writes to the database; the chat and the
 * pricing page read from it on the very next request, no deploy involved.
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
  const [drafts, setDrafts] = useState<CourseDraft[]>([EMPTY_DRAFT]);
  const [uploading, setUploading] = useState<string>(''); // 'new-<index>' or an existing course id
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

  /** Uploads straight to this GitHub repo's own public/ folder; no S3 account needed. */
  async function uploadImage(
    key: string,
    file: File,
    onDone: (url: string) => void,
  ) {
    setUploading(key);
    setError('');
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body.code === 'NOT_CONFIGURED'
            ? 'Image upload is not set up yet (GITHUB_TOKEN / GITHUB_REPO) — paste an image URL instead for now.'
            : (body.message ?? 'Upload failed'),
        );
        return;
      }
      const { url } = (await res.json()) as { url: string };
      onDone(url);
    } finally {
      setUploading('');
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

  function updateDraft(index: number, field: keyof CourseDraft, value: string | boolean) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  function addDraftRow() {
    setDrafts((prev) => [...prev, EMPTY_DRAFT]);
  }

  function removeDraftRow(index: number) {
    setDrafts((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  /** Saves every filled-in draft row in one request — one course or several at once. */
  async function saveDrafts() {
    const ready = drafts.filter((d) => d.name && d.description && d.price);
    if (!ready.length) return;

    setCourseSaving('new');
    setError('');
    try {
      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses: ready }),
      });
      if (res.ok) {
        const { courses: added } = (await res.json()) as { courses: CourseRow[] };
        setCourses((prev) => [...added, ...prev]);
        setDrafts([EMPTY_DRAFT]);
      } else {
        setError((await res.json().catch(() => ({}))).message ?? 'Error');
      }
    } finally {
      setCourseSaving('');
    }
  }

  const fieldClass =
    'rounded-lg border border-edge bg-parchment px-2 py-1.5 text-sm outline-none focus:border-amber';

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
          Sent to the chat only when a message names one of these. "Starts at" is what a future
          reminder step would schedule against — leave it blank for a course with no fixed start.
        </p>

        <div className="y-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-muted font-semibold">
              Add course{drafts.length > 1 ? 's' : ''} ({drafts.length} this time)
            </p>
            <button type="button" onClick={addDraftRow} className="text-xs underline text-amber">
              + Add another course
            </button>
          </div>

          {drafts.map((draft, index) => (
            <div key={index} className="space-y-3 pt-4 first:pt-0 border-t border-edge first:border-0">
              {drafts.length > 1 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-ink-muted">Course {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeDraftRow(index)}
                    className="text-xs text-danger"
                  >
                    Remove
                  </button>
                </div>
              )}

              <input
                dir="auto"
                placeholder="Name, e.g. Qur'an Tajweed"
                value={draft.name}
                onChange={(e) => updateDraft(index, 'name', e.target.value)}
                className={`w-full ${fieldClass}`}
              />
              <textarea
                dir="auto"
                rows={3}
                placeholder="Description"
                value={draft.description}
                onChange={(e) => updateDraft(index, 'description', e.target.value)}
                className={`w-full ${fieldClass}`}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  dir="ltr"
                  placeholder="Price, e.g. 750 SAR"
                  value={draft.price}
                  onChange={(e) => updateDraft(index, 'price', e.target.value)}
                  className={fieldClass}
                />
                <input
                  dir="auto"
                  placeholder="Schedule (optional), e.g. Mon & Wed, 7pm"
                  value={draft.schedule}
                  onChange={(e) => updateDraft(index, 'schedule', e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs">
                  <span className="text-ink-muted">Starts at (optional)</span>
                  <input
                    dir="ltr"
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(e) => updateDraft(index, 'startsAt', e.target.value)}
                    className={`mt-1 w-full ${fieldClass}`}
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-ink-muted">WhatsApp number (optional)</span>
                  <input
                    dir="ltr"
                    placeholder="e.g. 96876007156"
                    value={draft.whatsappNumber}
                    onChange={(e) => updateDraft(index, 'whatsappNumber', e.target.value)}
                    className={`mt-1 w-full ${fieldClass}`}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <span className="block text-xs text-ink-muted">Image (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadImage(`new-${index}`, file, (url) => updateDraft(index, 'imageUrl', url));
                  }}
                  disabled={uploading === `new-${index}`}
                  className="text-xs"
                />
                {uploading === `new-${index}` && <p className="text-xs text-ink-muted">Uploading…</p>}
                {draft.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- a remote, admin-chosen image
                  <img src={draft.imageUrl} alt="" className="h-20 rounded-lg border border-edge" />
                )}
              </div>
            </div>
          ))}

          <button
            onClick={() => void saveDrafts()}
            disabled={courseSaving === 'new' || !drafts.some((d) => d.name && d.description && d.price)}
            className="y-primary text-sm"
          >
            {drafts.length > 1 ? `Add ${drafts.filter((d) => d.name).length} courses` : 'Add course'}
          </button>
        </div>

        {courses.map((course) => (
          <div key={course.id} className="y-card p-5 space-y-3">
            <input
              dir="auto"
              value={course.name}
              onChange={(e) => updateCourse(course.id, 'name', e.target.value)}
              className={`w-full font-semibold ${fieldClass}`}
            />
            <textarea
              dir="auto"
              rows={3}
              value={course.description}
              onChange={(e) => updateCourse(course.id, 'description', e.target.value)}
              className={`w-full ${fieldClass}`}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                dir="ltr"
                value={course.price}
                onChange={(e) => updateCourse(course.id, 'price', e.target.value)}
                className={fieldClass}
              />
              <input
                dir="auto"
                value={course.schedule ?? ''}
                onChange={(e) => updateCourse(course.id, 'schedule', e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="text-ink-muted">WhatsApp number (optional)</span>
              <input
                dir="ltr"
                placeholder="e.g. 96876007156"
                value={course.whatsappNumber ?? ''}
                onChange={(e) => updateCourse(course.id, 'whatsappNumber', e.target.value)}
                className={`mt-1 w-full ${fieldClass}`}
              />
            </label>
            <label className="block text-xs">
              <span className="text-ink-muted">Starts at</span>
              <input
                dir="ltr"
                type="datetime-local"
                value={course.startsAt ? toOmanLocalInputValue(course.startsAt) : ''}
                onChange={(e) => updateCourse(course.id, 'startsAt', e.target.value)}
                className={`mt-1 w-full ${fieldClass}`}
              />
            </label>
            </div>

            <div className="space-y-2">
              <input
                dir="ltr"
                placeholder="Image URL"
                value={course.imageUrl ?? ''}
                onChange={(e) => updateCourse(course.id, 'imageUrl', e.target.value)}
                className={`w-full ${fieldClass}`}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadImage(course.id, file, (url) => updateCourse(course.id, 'imageUrl', url));
                }}
                disabled={uploading === course.id}
                className="text-xs"
              />
              {uploading === course.id && <p className="text-xs text-ink-muted">Uploading…</p>}
              {course.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a remote, admin-chosen image
                <img src={course.imageUrl} alt="" className="h-20 rounded-lg border border-edge" />
              )}
            </div>

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
