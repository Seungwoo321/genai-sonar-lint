#!/usr/bin/env node
/**
 * genai-sonar-lint CLI - AI-powered ESLint/SonarJS analyzer and fixer
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeCommand } from './commands/analyze.js';
import { fixCommand } from './commands/fix.js';
import { loginCommand } from './commands/login.js';
import { statusCommand } from './commands/status.js';
import { modelsCommand } from './commands/models.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('genai-sonar-lint')
  .description('AI-powered ESLint/SonarJS analyzer and fixer using Claude Code or Cursor CLI')
  .version(packageJson.version);

// Analyze command: genai-sonar-lint analyze <path>
program
  .command('analyze <path>')
  .description('Analyze ESLint/SonarJS issues in the specified path')
  .option('-p, --provider <provider>', 'AI provider (claude-code or cursor-cli)', 'claude-code')
  .option('-m, --model <model>', 'Model to use')
  .option('-o, --output <file>', 'Save results to JSON file')
  .option('-r, --raw', 'Output raw ESLint results without AI analysis')
  .option('-n, --non-interactive', 'Run without interactive mode')
  .option('-d, --debug', 'Enable debug mode')
  .option('-c, --config <path>', 'ESLint config file path (for monorepo)')
  .action(analyzeCommand);

// Fix command: genai-sonar-lint fix <path>
program
  .command('fix <path>')
  .description('Auto-fix ESLint issues using eslint --fix')
  .action(fixCommand);

// Login command: genai-sonar-lint login <provider>
program
  .command('login <provider>')
  .description('Login to AI provider (claude-code or cursor-cli)')
  .action(loginCommand);

// Status command: genai-sonar-lint status
program
  .command('status')
  .description('Check ESLint configuration and provider status')
  .option('-p, --provider <provider>', 'AI provider to check')
  .action(statusCommand);

// Models command: genai-sonar-lint models <provider>
program
  .command('models <provider>')
  .description('List supported models for a provider')
  .action(modelsCommand);

// Help examples
program.addHelpText(
  'after',
  `
Examples:
  $ genai-sonar-lint analyze src/            # Analyze with Claude Code (default)
  $ genai-sonar-lint analyze src/ -p cursor-cli
  $ genai-sonar-lint analyze src/ --raw      # Raw ESLint output only
  $ genai-sonar-lint analyze src/ -o report.json
  $ genai-sonar-lint analyze src/ -c packages/eslint-config/index.js  # Monorepo config

  $ genai-sonar-lint fix src/                # Auto-fix with eslint --fix
  $ genai-sonar-lint login claude-code       # Login to Claude Code
  $ genai-sonar-lint login cursor-cli        # Login to Cursor Agent
  $ genai-sonar-lint status                  # Check configuration
  $ genai-sonar-lint models cursor-cli       # List supported models

Interactive actions:
  [f] Fix      - Apply AI-generated fix
  [d] Disable  - Disable rule in eslint config
  [i] Ignore   - Add eslint-disable comment
  [a] Ask AI   - Ask additional questions
  [s] Skip     - Skip this rule
  [q] Quit     - Exit
`
);

program.parse();
