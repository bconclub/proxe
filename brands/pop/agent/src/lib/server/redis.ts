import { createClient } from 'redis';

type AppRedisClient = ReturnType<typeof createClient>;

let redisClient: AppRedisClient | null = null;
let redisConnectPromise: Promise<AppRedisClient> | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedisClient(): Promise<AppRedisClient | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (redisClient?.isOpen) return redisClient;
  if (redisConnectPromise) return redisConnectPromise;

  const client = createClient({ url });
  client.on('error', (error) => {
    console.error('[redis] client error:', error);
  });

  redisConnectPromise = client.connect()
    .then(() => {
      redisClient = client;
      return client;
    })
    .finally(() => {
      redisConnectPromise = null;
    });

  return redisConnectPromise;
}

export async function setJsonWithTtl(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
}

export async function getJson<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error('[redis] failed to parse JSON for key:', key, error);
    return null;
  }
}
