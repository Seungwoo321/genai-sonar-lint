/**
 * Analyze Command - Rule-by-rule processing
 */

import { resolve } from 'path';
import { writeFileSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { runESLint, runESLintFix } from '../eslint/runner.js';
import { parseESLintResult, hasParsingErrors, getParsingErrors } from '../eslint/parser.js';
import { findESLintConfig } from '../eslint/config.js';
import { createProvider, isValidProviderType } from '../providers/index.js';
import { displaySummary } from '../ui/display.js';
import {
  prompt,
  selectRule,
  generateFixForSingleRule,
  processRuleInteractive,
} from '../ui/interactive.js';
import type { AnalyzeOptions, ParsedResult } from '../types/index.js';

/**
 * Run ESLint and parse results
 */
async function runAndParseESLint(
  targetPath: string,
  projectRoot: string
): Promise<ParsedResult | null> {
  const spinner = ora('Running ESLint...').start();

  try {
    const eslintResults = await runESLint(targetPath, projectRoot);
    spinner.succeed('ESLint completed');

    spinner.start('Parsing results...');
    const parsed = parseESLintResult(eslintResults);
    spinner.succeed('Results parsed');

    return parsed;
  } catch (error) {
    spinner.fail('ESLint error');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    return null;
  }
}

export async function analyzeCommand(
  path: string,
  options: AnalyzeOptions
): Promise<void> {
  const projectRoot = process.cwd();
  const targetPath = resolve(projectRoot, path);

  // Validate provider
  if (!isValidProviderType(options.provider)) {
    console.error(chalk.red(`Unknown provider: ${options.provider}`));
    console.error('Available providers: claude-code, cursor-cli');
    process.exit(1);
  }

  // Check ESLint config
  const configPath = findESLintConfig(projectRoot);
  if (!configPath) {
    console.error(chalk.red('ESLint config not found'));
    process.exit(1);
  }

  // Raw mode - just output JSON and exit
  if (options.raw) {
    const eslintResults = await runESLint(targetPath, projectRoot);
    console.log(JSON.stringify(eslintResults, null, 2));
    return;
  }

  // Non-interactive mode - run once and exit
  if (options.nonInteractive) {
    const parsed = await runAndParseESLint(targetPath, projectRoot);
    if (!parsed) process.exit(1);

    if (hasParsingErrors(parsed)) {
      console.error(chalk.red.bold('\n⚠️  Parsing errors found!'));
      for (const error of getParsingErrors(parsed)) {
        console.error(chalk.dim(`  ${error.file}:${error.line} - ${error.message}`));
      }
      process.exit(1);
    }

    displaySummary(parsed);

    if (options.output) {
      writeFileSync(options.output, JSON.stringify(parsed, null, 2));
      console.log(chalk.green(`Results saved to: ${options.output}`));
    }
    return;
  }

  // Check provider availability
  const provider = createProvider(options.provider, {
    model: options.model,
    debug: options.debug,
  });

  const isAvailable = await provider.isAvailable();
  if (!isAvailable) {
    console.error(chalk.red(`\nProvider not available: ${options.provider}`));
    console.error('Make sure the CLI is installed and in your PATH.');
    console.error('');
    console.error('If this issue persists, please report it at:');
    console.error('  https://github.com/Seungwoo321/genai-sonar-lint/issues');
    console.error('');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Main Loop: ESLint → Select Rule → AI Fix → Apply → Repeat
  // ═══════════════════════════════════════════════════════════════════
  let iteration = 1;

  while (true) {
    console.log(chalk.cyan.bold(`\n[Iteration ${iteration}] Running ESLint...\n`));

    // Step 1: Run ESLint
    const parsed = await runAndParseESLint(targetPath, projectRoot);
    if (!parsed) {
      console.error(chalk.red('Failed to run ESLint'));
      process.exit(1);
    }

    // Step 2: Check for parsing errors
    if (hasParsingErrors(parsed)) {
      console.error(chalk.red.bold('\n⚠️  Parsing errors found!'));
      console.error(chalk.red('Fix syntax errors before continuing.\n'));

      for (const error of getParsingErrors(parsed)) {
        console.error(chalk.dim(`  ${error.file}:${error.line} - ${error.message}`));
      }

      const answer = await prompt('\nContinue anyway? [y/N] ');
      if (answer.toLowerCase() !== 'y') {
        process.exit(1);
      }
    }

    // Step 3: No issues - done!
    if (parsed.summary.totalIssues === 0) {
      console.log(chalk.green.bold('\n✅ No issues found! All clean.\n'));
      return;
    }

    // Step 4: Display summary
    displaySummary(parsed);

    // Step 5: Check for auto-fixable issues and offer to fix
    if (parsed.summary.fixable > 0) {
      console.log(chalk.yellow(`\n📦 ${parsed.summary.fixable} auto-fixable issues found.`));
      const answer = await prompt('Run eslint --fix first? [Y/n] ');

      if (answer.toLowerCase() !== 'n') {
        const spinner = ora('Running eslint --fix...').start();
        try {
          await runESLintFix(targetPath, projectRoot);
          spinner.succeed('Auto-fix completed');
          iteration++;
          continue; // Loop back to re-run ESLint
        } catch (error) {
          spinner.fail('Auto-fix failed');
          console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        }
      }
    }

    // Step 6: Filter out auto-fixable rules (only show manual-fix rules)
    const manualRules = parsed.rules.filter((r) => !r.autoFixable && r.ruleId !== null);

    if (manualRules.length === 0) {
      console.log(chalk.yellow('\nNo manual-fix rules remaining. Re-running ESLint...\n'));
      iteration++;
      continue;
    }

    // Step 7: Select a rule to process
    let selectedIndex: number;
    while (true) {
      selectedIndex = await selectRule(manualRules);

      if (selectedIndex === -2) {
        // User quit
        console.log(chalk.yellow('Exiting...'));
        return;
      }

      if (selectedIndex === -1) {
        // Invalid input, retry
        continue;
      }

      break;
    }

    // Step 8: Generate AI fix for selected rule
    const selectedRule = manualRules[selectedIndex];
    console.log(chalk.cyan(`\n[AI] Generating fix for ${selectedRule.ruleId}...\n`));

    const ruleFix = await generateFixForSingleRule(selectedRule, provider, configPath);

    if (!ruleFix) {
      console.log(chalk.yellow('Failed to generate fix. Skipping rule.\n'));
      iteration++;
      continue;
    }

    // Step 9: Process the rule interactively
    const shouldContinue = await processRuleInteractive(ruleFix, provider, configPath);

    if (!shouldContinue) {
      // User quit
      return;
    }

    // Step 10: Loop back to re-run ESLint
    iteration++;
  }
}
