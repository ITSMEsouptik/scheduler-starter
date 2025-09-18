import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean> {
  const res = await redis.set(key, owner, 'PX', ttlMs, 'NX');
  return res === 'OK';
}

export async function releaseLock(key: string, owner: string): Promise<void> {
  const script = `if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1]) else return 0 end`;
  await redis.eval(script, 1, key, owner);
}
