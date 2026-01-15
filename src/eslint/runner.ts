/**
 * ESLint Runner
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ESLintResult } from '../types/index.js';

const execAsync = promisify(exec);

/**
 * Run ESLint on a target path and return JSON results
 */
export async function runESLint(
  targetPath: string,
  projectRoot: string
): Promise<ESLintResult[]> {
  try {
    const { stdout } = await execAsync(
      `npx eslint "${targetPath}" --format json`,
      { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 }
    );

    return JSON.parse(stdout);
  } catch (error: unknown) {
    // ESLint exits with code 1 when there are linting errors
    // but still outputs valid JSON
    if (error && typeof error === 'object' && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout;
      if (stdout) {
        try {
          return JSON.parse(stdout);
        } catch {
          // Not valid JSON
        }
      }
    }
    throw error;
  }
}

/**
 * Run ESLint --fix on a target path
 */
export async function runESLintFix(
  targetPath: string,
  projectRoot: string
): Promise<void> {
  await execAsync(`npx eslint "${targetPath}" --fix`, {
    cwd: projectRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
}
