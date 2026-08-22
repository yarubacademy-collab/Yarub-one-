import type { StepExecutionContext, StepExecutionResult, StepExecutor } from '@yarub/ai-core';
import { asUntrustedData } from '@yarub/ai-core';
import type { CapabilityRouter } from '@yarub/ai-core';
import type { TextProvider } from '@yarub/providers';
import type { Capability, Locale } from '@yarub/shared';
import { recordUsage } from '../services/usage.js';

/**
 * Code steps for the Website and Game builders.
 *
 * Output is plain files. It is never executed here and never served from the
 * application origin — the sandbox package packages it for a separate origin.
 */
const CODE_SYSTEM: Record<Locale, string> = {
  ar: `أنتج كودًا كاملًا وقابلًا للتشغيل في المتصفح مباشرة.
اكتب كل ملف داخل كتلة مسوّرة مع اسم الملف: \`\`\`html index.html
استخدم dir="rtl" وخطوطًا مناسبة للعربية، وتصميمًا متجاوبًا.
لا تستخدم أي مكتبة خارجية أو طلب شبكة. لا تشرح، أعطِ الكود فقط.`,
  ur: `مکمل، براہِ راست براؤزر میں چلنے والا کوڈ دیں۔
ہر فائل کو fenced block میں فائل نام کے ساتھ لکھیں: \`\`\`html index.html
dir="rtl"، اردو کے لیے مناسب فونٹ، اور responsive ڈیزائن استعمال کریں۔
کوئی external library یا network request نہیں۔ صرف کوڈ دیں، وضاحت نہیں۔`,
  en: `Produce complete code that runs directly in a browser.
Put every file in a fenced block labelled with its filename: \`\`\`html index.html
Use responsive layout and semantic HTML.
No external libraries and no network requests. Return code only, no explanation.`,
};

export class CodeExecutor implements StepExecutor {
  constructor(
    private readonly router: CapabilityRouter,
    private readonly userId: string,
  ) {}

  supports(capability: Capability): boolean {
    return capability === 'code.generate';
  }

  async execute(ctx: StepExecutionContext): Promise<StepExecutionResult> {
    const resolved = await this.router.route<TextProvider>('code.generate', ctx.language);
    if (!resolved.ok) throw resolved.error;
    const provider = resolved.value;

    const res = await provider.generate({
      messages: [
        { role: 'system', content: CODE_SYSTEM[ctx.language] },
        { role: 'user', content: asUntrustedData('spec', ctx.prompt) },
      ],
      language: ctx.language,
      temperature: 0.3,
      maxOutputTokens: 12_000,
      signal: ctx.signal,
    });

    await recordUsage({
      userId: this.userId,
      jobId: ctx.jobId,
      capability: 'code.generate',
      providerId: res.providerId,
      units: res.usage.outputTokens,
    });

    return { outputRef: res.text, providerId: res.providerId, units: res.usage.outputTokens };
  }
}
