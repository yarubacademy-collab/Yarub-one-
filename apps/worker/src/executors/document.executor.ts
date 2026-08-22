import type { StepExecutionContext, StepExecutionResult, StepExecutor } from '@yarub/ai-core';
import type { Capability } from '@yarub/shared';
import type { ObjectStorage } from '@yarub/storage';
import { renderPdf } from '@yarub/documents';

/**
 * document.render is the one capability with no external provider: rendering
 * happens locally. That is deliberate — Arabic and Urdu shaping is too
 * important to outsource, and it keeps the document path always available.
 */
export class DocumentExecutor implements StepExecutor {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly projectId: string,
  ) {}

  supports(capability: Capability): boolean {
    return capability === 'document.render';
  }

  async execute(ctx: StepExecutionContext): Promise<StepExecutionResult> {
    const pdf = await renderPdf({
      markdown: ctx.prompt,
      language: ctx.language,
      title: ctx.step.title[ctx.language],
    });

    const key = `projects/${this.projectId}/artifacts/${ctx.jobId}-${ctx.step.id}.pdf`;
    await this.storage.put(key, pdf, 'application/pdf');
    return { outputRef: key, providerId: 'local-document-renderer', units: 1 };
  }
}
