/**
 * Login command for provider authentication
 */

import chalk from 'chalk';
import { createProvider, isValidProviderType } from '../providers/index.js';

/**
 * Login command handler
 */
export async function loginCommand(provider: string): Promise<void> {
  // Validate provider
  if (!isValidProviderType(provider)) {
    console.error(chalk.red(`Unknown provider: ${provider}`));
    console.log('Available providers: claude-code, cursor-cli');
    process.exit(1);
  }

  const aiProvider = createProvider(provider);

  try {
    await aiProvider.login();
    console.log(chalk.green('Login completed successfully'));
  } catch (error) {
    console.error(chalk.red(`Login failed: ${error}`));
    process.exit(1);
  }
}
