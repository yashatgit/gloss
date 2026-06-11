import type { Provider } from '@gloss/shared';
import { anthropicProvider, isConfigured as anthropicConfigured } from './providers/anthropic';
import { openaiProvider, isConfigured as openaiConfigured } from './providers/openai';
import type { ChatProvider } from './providers/types';

const PROVIDERS: Record<Provider, { client: ChatProvider; configured: () => boolean }> = {
  anthropic: { client: anthropicProvider, configured: anthropicConfigured },
  openai: { client: openaiProvider, configured: openaiConfigured },
};

export function providerClient(provider: Provider): ChatProvider {
  return PROVIDERS[provider].client;
}

/** Providers whose API key is present in the environment. */
export function configuredProviders(): Provider[] {
  return (Object.keys(PROVIDERS) as Provider[]).filter((p) => PROVIDERS[p].configured());
}

export function isProviderConfigured(provider: Provider): boolean {
  return PROVIDERS[provider].configured();
}
