/**
 * The "Join via WhatsApp" link shown next to a course — in a reminder email
 * and, where the chat mentions a matching course, in the chat itself.
 *
 * Each course can carry its own WhatsApp number (e.g. one person handles
 * Qur'an courses, another handles AI courses) — pass the course's own
 * `whatsappNumber` as `courseNumber`. When a course has none, this falls back
 * to ACADEMY_WHATSAPP_NUMBER, the academy's general number. Either way, the
 * number must be international format with no "+", no spaces, no leading
 * zero (e.g. "9665XXXXXXXX") — the exact format wa.me links require. Returns
 * null only when neither is set, so a caller can simply skip the button
 * rather than ship a broken link.
 */
export function buildWhatsAppJoinLink(courseName: string, courseNumber?: string | null): string | null {
  const number = courseNumber || process.env.ACADEMY_WHATSAPP_NUMBER;
  if (!number) return null;

  const message =
    `السلام عليكم، أريد الانضمام إلى دورة "${courseName}". ` +
    'يرجى إرسال رقم الحساب لإتمام الدفع.';

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
