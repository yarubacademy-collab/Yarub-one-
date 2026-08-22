#!/usr/bin/env node
/**
 * Architectural guard (Principle P2).
 * The AI Core plans and orchestrates. It must never import a vendor SDK or
 * call an AI endpoint directly — it goes through @yarub/providers contracts.
 * This runs in CI and fails the build on violation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE = 'packages/ai-core/src';
const FORBIDDEN = [
  /from ['"]openai['"]/,
  /from ['"]@anthropic-ai\//,
  /from ['"]@google\/generative-ai['"]/,
  /from ['"]replicate['"]/,
  /api\.openai\.com/,
  /api\.anthropic\.com/,
  /generativelanguage\.googleapis\.com/,
];

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry)) {
      const src = readFileSync(full, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(src)) violations.push(`${full} matches ${pattern}`);
      }
    }
  }
}

try {
  walk(CORE);
} catch {
  console.log('ai-core not present yet, skipping boundary check');
  process.exit(0);
}

if (violations.length) {
  console.error('Architecture boundary violated in ai-core:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('Boundary check passed: ai-core is vendor-free.');
