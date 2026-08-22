/** The eight things a user can ask YARUB ONE to do. Maps 1:1 to UI sections. */
export const DOMAINS = [
  'chat',
  'image',
  'video',
  'education',
  'website',
  'game',
  'visual',
  'document',
] as const;

export type Domain = (typeof DOMAINS)[number];

export type Complexity = 'simple' | 'project';

export type ArtifactType =
  | 'message'
  | 'document'
  | 'website'
  | 'game'
  | 'image-set'
  | 'video';
