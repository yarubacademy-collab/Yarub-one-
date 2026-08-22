/**
 * The full capability vocabulary of YARUB ONE.
 * The AI Core plans in terms of these. It never names a vendor or a model.
 */
export const CAPABILITIES = [
  'text.generate',
  'text.reason',
  'text.translate',
  'image.generate',
  'image.edit',
  'video.textToVideo',
  'video.imageToVideo',
  'speech.tts',
  'speech.stt',
  'code.generate',
  'document.render',
  'embedding.create',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityStatus = 'available' | 'degraded' | 'not_configured';

/** Which phase of the roadmap turns each capability on. */
export const CAPABILITY_PHASE: Record<Capability, 1 | 2 | 3 | 4> = {
  'text.generate': 1,
  'text.reason': 1,
  'text.translate': 1,
  'image.generate': 2,
  'image.edit': 2,
  'document.render': 2,
  'code.generate': 3,
  'video.textToVideo': 4,
  'video.imageToVideo': 4,
  'speech.tts': 4,
  'speech.stt': 4,
  'embedding.create': 2,
};
