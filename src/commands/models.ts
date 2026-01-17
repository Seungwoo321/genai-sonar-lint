/**
 * Models command - list supported models per provider
 */

import type { ProviderType } from '../providers/types.js';

const CURSOR_MODELS = [
  { name: 'claude-4.5-sonnet', description: 'Claude 4.5 Sonnet (default)' },
  { name: 'claude-4-opus', description: 'Claude 4 Opus' },
  { name: 'gpt-4.1', description: 'GPT-4.1' },
  { name: 'gpt-4o', description: 'GPT-4o' },
  { name: 'o3', description: 'OpenAI o3' },
  { name: 'o4-mini', description: 'OpenAI o4-mini' },
  { name: 'gemini-2.5-pro', description: 'Gemini 2.5 Pro' },
  { name: 'gemini-2.5-flash', description: 'Gemini 2.5 Flash' },
];

const CLAUDE_MODELS = [
  { name: 'haiku', description: 'Claude Haiku (default, fast)' },
  { name: 'sonnet', description: 'Claude Sonnet (balanced)' },
  { name: 'opus', description: 'Claude Opus (powerful)' },
];

/**
 * Models command handler
 */
export function modelsCommand(provider: string): void {
  const validProviders = ['claude-code', 'cursor-cli'];

  if (!validProviders.includes(provider)) {
    console.error(`Unknown provider: ${provider}`);
    console.log('Available providers: claude-code, cursor-cli');
    process.exit(1);
  }

  const providerType = provider as ProviderType;
  const models = providerType === 'cursor-cli' ? CURSOR_MODELS : CLAUDE_MODELS;
  const defaultModel = providerType === 'cursor-cli' ? 'claude-4.5-sonnet' : 'haiku';

  console.log(`\nSupported models for ${provider}:\n`);

  for (const model of models) {
    const isDefault = model.name === defaultModel;
    const marker = isDefault ? ' *' : '  ';
    console.log(`${marker} ${model.name.padEnd(20)} ${model.description}`);
  }

  console.log('\n* = default model');
  console.log(`\nUsage: genai-sonar-lint analyze <path> -p ${provider} -m <model-name>`);

  if (providerType === 'cursor-cli') {
    console.log('\nFor the latest supported models, run: agent --help');
  } else {
    console.log('\nFor the latest supported models, run: claude --help');
  }
  console.log('');
}
