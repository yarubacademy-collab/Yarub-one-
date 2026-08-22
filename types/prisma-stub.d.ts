/**
 * Typecheck stub for the generated Prisma client.
 *
 * `prisma generate` writes real types into node_modules at build time, but the
 * source typecheck must not depend on a build artifact — otherwise CI cannot
 * check types on a clean checkout. This declares only the surface the
 * repository actually uses; the generated client supersedes it at runtime.
 */
declare module '@prisma/client' {
  export class PrismaClient {
    [model: string]: any;
    $transaction(operations: unknown[]): Promise<unknown[]>;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
  }
}
