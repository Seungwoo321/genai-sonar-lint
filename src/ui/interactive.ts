/**
 * Interactive mode handler - Rule-by-rule processing
 */

import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { displayRule, displayMenu, displayRulesMenu } from './display.js';
import { applyFix, applyIgnoreLine, applyIgnoreFile } from '../eslint/fixer.js';
import type { ParsedResult, ParsedRule, RuleFix, AnalyzeOptions, LocationFix } from '../types/index.js';
import type { AIProvider } from '../providers/types.js';

/**
 * Prompt for user input
 */
export async function prompt(message: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Generate fix for a single rule using AI
 */
export async function generateFixForSingleRule(
  rule: ParsedRule,
  provider: AIProvider,
  configPath: string
): Promise<RuleFix | null> {
  if (rule.ruleId === null) return null;

  const configContent = readFileSync(configPath, 'utf8');
  const spinner = ora(`Generating fix for ${rule.ruleId}...`).start();

  try {
    // Get rule explanation
    const explainResult = await provider.explainRule(
      rule.ruleId,
      rule.sampleSource.join('\n'),
      rule.sampleMessages.join('\n')
    );

    // Get disable config
    const disableResult = await provider.generateDisableConfig(
      rule.ruleId,
      configContent
    );

    // Generate fix for each location
    const fixes: LocationFix[] = [];

    for (const location of rule.locations) {
      // Get code context (±10 lines)
      const fileContent = readFileSync(location.fileFull, 'utf8');
      const lines = fileContent.split('\n');
      const startLine = Math.max(0, location.line - 11);
      const endLine = Math.min(lines.length, location.line + 10);
      const codeContext = lines
        .slice(startLine, endLine)
        .map((line, i) => `${startLine + i + 1}\t${line}`)
        .join('\n');

      const fixResult = await provider.generateFix(
        rule.ruleId,
        location.fileFull,
        location.line,
        rule.sampleMessages[0] || '',
        codeContext
      );

      if (fixResult.success && fixResult.data) {
        const { startLine: fixStart, endLine: fixEnd, fixedCode, explanation } = fixResult.data;

        // Validate fix data
        if (
          typeof fixStart === 'number' &&
          typeof fixEnd === 'number' &&
          fixStart > 0 &&
          fixEnd >= fixStart &&
          fixEnd <= lines.length &&
          typeof fixedCode === 'string' &&
          fixedCode.length > 0
        ) {
          // Get original code
          const originalLines = lines.slice(fixStart - 1, fixEnd);
          const original = originalLines.join('\n');

          fixes.push({
            file: location.fileFull,
            startLine: fixStart,
            endLine: fixEnd,
            original,
            fixed: fixedCode,
            explanation: explanation || 'No explanation provided',
          });
        }
      }
    }

    spinner.succeed(`Generated ${fixes.length} fixes for ${rule.ruleId}`);

    return {
      ruleId: rule.ruleId,
      count: fixes.length,
      severity: rule.severity,
      explain: explainResult.success && explainResult.data
        ? {
            problemDescription: explainResult.data.problemDescription,
            whyProblem: explainResult.data.whyProblem,
            howToFix: explainResult.data.howToFix,
            priority: explainResult.data.priority as 'low' | 'medium' | 'high',
          }
        : {
            problemDescription: 'Failed to generate explanation',
            whyProblem: 'N/A',
            howToFix: 'Check ESLint documentation',
            priority: 'medium',
          },
      disableConfig: disableResult.success && disableResult.data
        ? disableResult.data
        : { modifiedConfig: '', diffDescription: 'Failed to generate' },
      fixes,
    };
  } catch (error) {
    spinner.fail(`Failed to generate fix for ${rule.ruleId}`);
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    return null;
  }
}

/**
 * Process a single rule interactively
 * Returns true if should continue, false if user quit
 */
export async function processRuleInteractive(
  ruleFix: RuleFix,
  provider: AIProvider,
  configPath: string
): Promise<boolean> {
  displayRule(ruleFix, 1, 1);

  while (true) {
    displayMenu();
    const action = await prompt('> ');

    switch (action.toLowerCase()) {
      case 'f': {
        // Apply fixes
        if (ruleFix.fixes.length === 0) {
          console.log(chalk.yellow('\nNo fixes available to apply'));
          continue;
        }

        console.log(chalk.cyan(`\nApply fixes (${ruleFix.fixes.length} available):`));
        for (let j = 0; j < ruleFix.fixes.length; j++) {
          const fix = ruleFix.fixes[j];
          const fileName = fix.file?.split('/').pop() ?? 'unknown';
          console.log(`  ${j + 1}) ${fileName}:${fix.startLine ?? '?'}`);
        }

        const selection = await prompt("Enter numbers (comma-separated), 'a' for all, 'c' to cancel: ");

        if (selection.toLowerCase() === 'c') {
          console.log(chalk.yellow('Cancelled'));
          continue;
        }

        const indices = selection.toLowerCase() === 'a'
          ? ruleFix.fixes.map((_, i) => i)
          : selection.split(',').map((s) => parseInt(s.trim()) - 1);

        for (const idx of indices) {
          if (idx >= 0 && idx < ruleFix.fixes.length) {
            const fix = ruleFix.fixes[idx];
            // Check if fix has required data
            if (!fix.original || !fix.fixed) {
              console.log(chalk.yellow(`⚠️  Fix data incomplete, skipping: ${fix.file?.split('/').pop() ?? 'unknown'}`));
              continue;
            }
            if (applyFix(fix)) {
              console.log(chalk.green(`✅ Applied: ${fix.file.split('/').pop()}`));
            } else {
              console.log(chalk.yellow(`⚠️  Could not find original code: ${fix.file.split('/').pop()}`));
            }
          }
        }
        return true; // Continue to next ESLint run
      }

      case 'd': {
        // Apply disable config
        if (!ruleFix.disableConfig.modifiedConfig) {
          console.log(chalk.red('No config modification available'));
          continue;
        }

        const confirm = await prompt('Modify ESLint config? [y/N] ');
        if (confirm.toLowerCase() === 'y') {
          writeFileSync(configPath, ruleFix.disableConfig.modifiedConfig);
          console.log(chalk.green('✅ Config updated'));
          return true; // Continue to next ESLint run
        }
        continue;
      }

      case 'i': {
        // Ignore options
        console.log(chalk.cyan('\nIgnore options:'));
        console.log('  [1] Line (eslint-disable-next-line)');
        console.log('  [2] File (eslint-disable)');

        const ignoreChoice = await prompt('> ');

        if (ignoreChoice === '1') {
          for (const fix of ruleFix.fixes) {
            if (applyIgnoreLine(fix.file, fix.startLine, ruleFix.ruleId)) {
              console.log(chalk.green(`✅ Added ignore comment: ${fix.file.split('/').pop()}:${fix.startLine}`));
            }
          }
          return true; // Continue to next ESLint run
        } else if (ignoreChoice === '2') {
          const files = [...new Set(ruleFix.fixes.map((f) => f.file))];
          for (const file of files) {
            if (applyIgnoreFile(file, ruleFix.ruleId)) {
              console.log(chalk.green(`✅ Added file-level ignore: ${file.split('/').pop()}`));
            }
          }
          return true; // Continue to next ESLint run
        }
        continue;
      }

      case 'a': {
        // Ask AI
        const question = await prompt('Ask AI: ');
        if (!question) continue;

        const context = `Rule: ${ruleFix.ruleId}\nProblem: ${ruleFix.explain.problemDescription}\nFix: ${ruleFix.explain.howToFix}`;
        const response = await provider.askQuestion(question, context);

        if (response.success && response.data) {
          console.log(chalk.green('\n📝 AI Response:'));
          console.log(response.data.answer);
          if (response.data.codeSuggestion) {
            console.log(chalk.green('\n💻 Code suggestion:'));
            console.log(response.data.codeSuggestion);
          }
        }
        continue;
      }

      case 's':
        console.log(chalk.yellow('Skipped'));
        return true; // Continue to next iteration

      case 'q':
        console.log(chalk.yellow('Exiting...'));
        return false; // User quit

      default:
        console.log(chalk.red('Invalid option. Choose f, d, i, a, s, or q'));
        continue;
    }
  }
}

/**
 * Select a rule from the list
 * Returns selected rule index, or -1 if cancelled, or -2 if quit
 */
export async function selectRule(rules: ParsedRule[]): Promise<number> {
  displayRulesMenu(rules);

  console.log(chalk.dim('\nEnter rule number to process, or [q] to quit:'));
  const input = await prompt('> ');

  if (input.toLowerCase() === 'q') {
    return -2; // Quit
  }

  const num = parseInt(input);
  if (isNaN(num) || num < 1 || num > rules.length) {
    console.log(chalk.red(`Invalid selection. Enter 1-${rules.length}`));
    return -1; // Invalid, retry
  }

  return num - 1; // 0-indexed
}
