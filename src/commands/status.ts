/**
 * Status Command
 */

import chalk from 'chalk';
import { findESLintConfig } from '../eslint/config.js';
import { createProvider, isValidProviderType } from '../providers/index.js';

interface StatusOptions {
  provider?: string;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const projectRoot = process.cwd();

  console.log(chalk.cyan.bold('\n📋 genai-sonar-lint Status\n'));

  // ESLint config
  const configPath = findESLintConfig(projectRoot);
  if (configPath) {
    console.log(chalk.green('✓'), 'ESLint config:', chalk.dim(configPath));
  } else {
    console.log(chalk.red('✗'), 'ESLint config: not found');
  }

  // Provider status
  if (options.provider) {
    if (!isValidProviderType(options.provider)) {
      console.log(chalk.red('✗'), `Unknown provider: ${options.provider}`);
      return;
    }

    const provider = createProvider(options.provider);
    const status = await provider.status();

    if (status.available) {
      console.log(chalk.green('✓'), `${options.provider}: available`);
      if (status.version) {
        console.log('  ', chalk.dim(`Version: ${status.version}`));
      }
    } else {
      console.log(chalk.red('✗'), `${options.provider}: not available`);
    }
    console.log('  ', chalk.dim(status.details));
  } else {
    // Check both providers
    for (const providerType of ['claude-code', 'cursor-cli'] as const) {
      const provider = createProvider(providerType);
      const status = await provider.status();

      if (status.available) {
        console.log(chalk.green('✓'), `${providerType}: available`);
        if (status.version) {
          console.log('  ', chalk.dim(`Version: ${status.version}`));
        }
      } else {
        console.log(chalk.yellow('○'), `${providerType}: not available`);
      }
      console.log('  ', chalk.dim(status.details));
    }
  }

  console.log('');
}
