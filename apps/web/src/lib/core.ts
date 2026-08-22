import { loadConfig } from '@yarub/config';
import { buildRegistry } from '@yarub/providers';
import { YarubCore } from '@yarub/ai-core';

/**
 * One Core per process. Provider health is cached inside the registry, so
 * this does not re-probe on every request.
 */
let instance: YarubCore | undefined;

export function core(): YarubCore {
  if (!instance) {
    const config = loadConfig();
    instance = new YarubCore({
      registry: buildRegistry(config),
      maxPromptChars: config.MAX_PROMPT_CHARS,
    });
  }
  return instance;
}
