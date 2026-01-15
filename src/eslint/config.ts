/**
 * ESLint Config Finder
 */

import { existsSync } from 'fs';
import { join } from 'path';

const CONFIG_CANDIDATES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'packages/eslint-config/index.js',
];

/**
 * Find ESLint config file in the project
 */
export function findESLintConfig(projectRoot: string): string | null {
  for (const candidate of CONFIG_CANDIDATES) {
    const configPath = join(projectRoot, candidate);
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Validate that ESLint config exists
 */
export function validateESLintConfig(configPath: string): boolean {
  return existsSync(configPath);
}
