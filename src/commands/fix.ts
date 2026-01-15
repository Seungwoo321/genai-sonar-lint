/**
 * Fix Command - Run ESLint --fix
 */

import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { runESLintFix } from '../eslint/runner.js';

export async function fixCommand(path: string): Promise<void> {
  const projectRoot = process.cwd();
  const targetPath = resolve(projectRoot, path);

  const spinner = ora('Running ESLint --fix...').start();

  try {
    await runESLintFix(targetPath, projectRoot);
    spinner.succeed('ESLint --fix completed');
  } catch (error) {
    spinner.fail('ESLint --fix failed');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}
