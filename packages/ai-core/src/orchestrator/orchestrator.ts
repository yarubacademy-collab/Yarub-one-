import { AppError, type Capability, type Locale, type Localized } from '@yarub/shared';
import { executionOrder, type Plan, type PlanStep } from '../planner/plan.schema.js';
import { renderPromptTemplate } from '../planner/planner.js';

/**
 * Step 5 of the pipeline.
 *
 * Design constraints this satisfies:
 *  - Every completed step is checkpointed, so a failure at step 6 of 7 does
 *    not re-run steps 1-5 and does not re-spend on their providers.
 *  - Independent steps run in parallel waves.
 *  - Cancellation is honoured at every step boundary.
 *  - A step whose capability has no configured provider is recorded as
 *    NOT_CONFIGURED. It is never replaced by simulated output.
 */

export type StepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'not_configured';

export interface StepRecord {
  stepKey: string;
  status: StepStatus;
  providerId?: string;
  /** Storage key or inline text, depending on output kind. */
  outputRef?: string;
  errorCode?: string;
  attempts: number;
}

/** Persistence boundary. The worker binds this to Postgres; tests bind memory. */
export interface CheckpointStore {
  load(jobId: string): Promise<StepRecord[]>;
  save(jobId: string, record: StepRecord): Promise<void>;
  isCancelled(jobId: string): Promise<boolean>;
  setProgress(jobId: string, percent: number): Promise<void>;
}

export interface StepExecutionContext {
  jobId: string;
  language: Locale;
  prompt: string;
  step: PlanStep;
  signal: AbortSignal;
}

export interface StepExecutionResult {
  outputRef: string;
  providerId: string;
  /** For usage accounting. */
  units: number;
}

/**
 * Executes one capability. Implemented per capability family in the worker
 * (text, image, video, speech, code, document) on top of the provider registry.
 */
export interface StepExecutor {
  supports(capability: Capability): boolean;
  execute(ctx: StepExecutionContext): Promise<StepExecutionResult>;
}

export interface ProgressEvent {
  jobId: string;
  stepKey: string;
  title: Localized;
  status: StepStatus;
  percent: number;
}

export interface OrchestratorOptions {
  store: CheckpointStore;
  executors: StepExecutor[];
  availableCapabilities: readonly Capability[];
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
  maxAttempts?: number;
  stepTimeoutMs?: number;
}

export interface JobOutcome {
  status: 'succeeded' | 'failed' | 'cancelled' | 'partial';
  records: StepRecord[];
  /** stepKey -> output, for the Assembler. */
  outputs: Map<string, string>;
  notConfigured: Capability[];
}

export class Orchestrator {
  private readonly maxAttempts: number;
  private readonly stepTimeoutMs: number;

  constructor(private readonly opts: OrchestratorOptions) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.stepTimeoutMs = opts.stepTimeoutMs ?? 180_000;
  }

  async run(jobId: string, plan: Plan): Promise<JobOutcome> {
    const waves = executionOrder(plan);
    const total = plan.steps.length;

    // Resume: anything already succeeded is reloaded, not recomputed.
    const prior = await this.opts.store.load(jobId);
    const records = new Map<string, StepRecord>(prior.map((r) => [r.stepKey, r]));
    const outputs = new Map<string, string>();
    for (const record of prior) {
      if (record.status === 'succeeded' && record.outputRef) {
        outputs.set(record.stepKey, record.outputRef);
      }
    }

    const notConfigured = new Set<Capability>();
    let completed = [...records.values()].filter((r) => r.status !== 'pending').length;
    let hardFailure = false;

    for (const wave of waves) {
      if (await this.opts.store.isCancelled(jobId)) {
        return { status: 'cancelled', records: [...records.values()], outputs, notConfigured: [...notConfigured] };
      }

      const runnable = wave.filter((step) => records.get(step.id)?.status !== 'succeeded');

      const settled = await Promise.all(
        runnable.map((step) => this.runStep(jobId, plan, step, outputs, total, () => ++completed)),
      );

      for (const record of settled) {
        records.set(record.stepKey, record);
        if (record.status === 'succeeded' && record.outputRef) {
          outputs.set(record.stepKey, record.outputRef);
        }
        if (record.status === 'not_configured') {
          const step = plan.steps.find((s) => s.id === record.stepKey);
          if (step) notConfigured.add(step.capability);
        }
        if (record.status === 'failed') {
          const step = plan.steps.find((s) => s.id === record.stepKey);
          if (step && !step.optional) hardFailure = true;
        }
      }

      if (hardFailure) break;
    }

    const status: JobOutcome['status'] = hardFailure
      ? 'failed'
      : notConfigured.size > 0
        ? 'partial'
        : 'succeeded';

    return { status, records: [...records.values()], outputs, notConfigured: [...notConfigured] };
  }

  private async runStep(
    jobId: string,
    plan: Plan,
    step: PlanStep,
    outputs: ReadonlyMap<string, string>,
    total: number,
    tick: () => number,
  ): Promise<StepRecord> {
    const emit = async (record: StepRecord) => {
      await this.opts.store.save(jobId, record);
      const percent = Math.round((tick() / total) * 100);
      await this.opts.store.setProgress(jobId, percent);
      await this.opts.onProgress?.({
        jobId,
        stepKey: step.id,
        title: step.title,
        status: record.status,
        percent,
      });
    };

    if (!this.opts.availableCapabilities.includes(step.capability)) {
      const record: StepRecord = {
        stepKey: step.id,
        status: 'not_configured',
        errorCode: 'NOT_CONFIGURED',
        attempts: 0,
      };
      await emit(record);
      return record;
    }

    const executor = this.opts.executors.find((e) => e.supports(step.capability));
    if (!executor) {
      const record: StepRecord = {
        stepKey: step.id,
        status: 'not_configured',
        errorCode: 'NO_EXECUTOR',
        attempts: 0,
      };
      await emit(record);
      return record;
    }

    const prompt = renderPromptTemplate(step.input.promptTemplate, outputs);
    let attempts = 0;
    let lastError: unknown;

    while (attempts < this.maxAttempts) {
      attempts += 1;
      if (await this.opts.store.isCancelled(jobId)) {
        return { stepKey: step.id, status: 'skipped', errorCode: 'JOB_CANCELLED', attempts };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.stepTimeoutMs);
      try {
        const result = await executor.execute({
          jobId,
          language: plan.language,
          prompt,
          step,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const record: StepRecord = {
          stepKey: step.id,
          status: 'succeeded',
          providerId: result.providerId,
          outputRef: result.outputRef,
          attempts,
        };
        await emit(record);
        return record;
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (!isRetryable(error) || attempts >= this.maxAttempts) break;
        await sleep(exponentialBackoff(attempts));
      }
    }

    const record: StepRecord = {
      stepKey: step.id,
      status: 'failed',
      errorCode: error_code(lastError),
      attempts,
    };
    await emit(record);
    return record;
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.code === 'PROVIDER_FAILED' || error.code === 'INTERNAL';
  }
  // Network-level failures and timeouts are worth another attempt.
  return true;
}

function error_code(error: unknown): string {
  return error instanceof AppError ? error.code : 'INTERNAL';
}

function exponentialBackoff(attempt: number): number {
  const base = 500 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reference implementation used by tests and by dry runs. */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly records = new Map<string, Map<string, StepRecord>>();
  private readonly cancelled = new Set<string>();
  readonly progress = new Map<string, number>();

  async load(jobId: string): Promise<StepRecord[]> {
    return [...(this.records.get(jobId)?.values() ?? [])];
  }

  async save(jobId: string, record: StepRecord): Promise<void> {
    const bucket = this.records.get(jobId) ?? new Map<string, StepRecord>();
    bucket.set(record.stepKey, record);
    this.records.set(jobId, bucket);
  }

  async isCancelled(jobId: string): Promise<boolean> {
    return this.cancelled.has(jobId);
  }

  async setProgress(jobId: string, percent: number): Promise<void> {
    this.progress.set(jobId, percent);
  }

  cancel(jobId: string): void {
    this.cancelled.add(jobId);
  }
}
