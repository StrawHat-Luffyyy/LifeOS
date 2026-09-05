import { config } from '../../../config/index.js';
import { type LLMProvider } from './llm-gateway.interface.js';
import { OllamaProvider } from './ollama.provider.js';
import { MockLLMProvider } from './mock.provider.js';

export * from './llm-gateway.interface.js';
export * from './ollama.provider.js';
export * from './mock.provider.js';

let activeProviderOverride: LLMProvider | null = null;

export function setLLMProviderForTesting(provider: LLMProvider | null): void {
  activeProviderOverride = provider;
}

export function getLLMProvider(): LLMProvider {
  if (activeProviderOverride) {
    return activeProviderOverride;
  }

  if (config.LLM_PROVIDER === 'mock') {
    return new MockLLMProvider();
  }

  return new OllamaProvider();
}
