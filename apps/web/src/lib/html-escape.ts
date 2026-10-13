/**
 * For text going into an HTML email or page where it must stay as the
 * literal characters typed, not be read as markup — e.g. a course name
 * that happens to contain "&" or "<". A route.ts file under Next's App
 * Router may only export its HTTP handlers and a short list of special
 * config names, so this ordinary helper lives here instead of inline in
 * the route that uses it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
