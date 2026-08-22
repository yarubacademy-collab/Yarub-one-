import IORedis from 'ioredis';
import { AppError } from '@yarub/shared';
import { loadConfig } from '@yarub/config';

const redis = new IORedis(loadConfig().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

/**
 * Sliding-window limiter.
 *
 * Keyed per user and per capability class, because one cheap chat message and
 * one video render should not draw from the same allowance.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<void> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, windowSeconds * 2);
  if (count > limit) {
    throw new AppError('RATE_LIMITED', `Rate limit hit for ${key}`, 'آپ نے حد سے زیادہ درخواستیں بھیجی ہیں۔ تھوڑی دیر بعد کوشش کریں۔');
  }
}
