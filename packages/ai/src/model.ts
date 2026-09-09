import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { gateway } from '@ai-sdk/gateway';
import type { LanguageModel } from 'ai';

export interface UserModelConfig {
  baseUrl?: string | null;
  apiKey?: string | null;
  protocol?: string | null;
}

export function resolveModel(
  userModel?: string | null,
  cfg?: UserModelConfig,
): LanguageModel {
  const modelId =
    userModel ?? process.env.AI_DEFAULT_MODEL ?? 'claude-sonnet-4-20250514';
  const baseURL = (cfg?.baseUrl || process.env.AI_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const apiKey = (cfg?.apiKey || process.env.AI_API_KEY || '').trim();
  const protocol = cfg?.protocol || process.env.AI_PROTOCOL || 'openai';

  if (baseURL && apiKey) {
    if (protocol === 'anthropic')
      return createAnthropic({ baseURL, apiKey })(modelId);
    // 默认 OpenAI 兼容 = 绝大多数中转站
    return createOpenAI({ baseURL, apiKey })(modelId);
  }
  // 兜底 Vercel AI Gateway
  return gateway(modelId);
}
