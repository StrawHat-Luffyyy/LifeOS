import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env from the repo root (two levels up from packages/backend)
dotenv.config({ path: '../../.env' });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().default(30),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OLLAMA_BASE_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen3:8b'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
  LLM_TEMPERATURE: z.coerce.number().default(0.15),
  LLM_PROVIDER: z.enum(['ollama', 'mock']).default('ollama'),
  EMBEDDING_PROVIDER: z.enum(['ollama', 'mock']).default('ollama'),
  UPLOAD_DIR: z.string().default('data/uploads'),
  INTEGRATION_ENCRYPTION_KEY: z.string().length(64).optional(),
  GITHUB_SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/api/integrations/google/callback'),
  CALENDAR_SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = Object.freeze(parsed.data);

export type Config = typeof config;
