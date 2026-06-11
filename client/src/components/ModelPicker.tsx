import { useCanvasStore } from '../state/canvasStore';
import type { Provider } from '@gloss/shared';

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
};

/** Provider-grouped model selector. Models whose provider has no API key are
 *  shown but disabled, so it's clear what's available vs. what needs a key. */
export function ModelPicker() {
  const models = useCanvasStore((s) => s.models);
  const configured = useCanvasStore((s) => s.configuredProviders);
  const selected = useCanvasStore((s) => s.selectedModel);
  const setModel = useCanvasStore((s) => s.setModel);

  if (models.length === 0) return null;

  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <select
      className="model-picker"
      value={selected}
      onChange={(e) => setModel(e.target.value)}
      title="Model used for new branches and image import"
    >
      {providers.map((provider) => {
        const usable = configured.includes(provider);
        return (
          <optgroup
            key={provider}
            label={`${PROVIDER_LABEL[provider]}${usable ? '' : ' — no API key'}`}
          >
            {models
              .filter((m) => m.provider === provider)
              .map((m) => (
                <option key={m.id} value={m.id} disabled={!usable}>
                  {m.label}
                </option>
              ))}
          </optgroup>
        );
      })}
    </select>
  );
}
