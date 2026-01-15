/**
 * Display utilities
 */

import chalk from 'chalk';
import type { ParsedResult, ParsedRule, RuleFix } from '../types/index.js';

/**
 * Display analysis summary
 */
export function displaySummary(result: ParsedResult): void {
  const { summary, rules } = result;

  console.log('');
  console.log(chalk.cyan.bold('═'.repeat(64)));
  console.log(chalk.cyan.bold('                    SonarLint Analysis Summary'));
  console.log(chalk.cyan.bold('═'.repeat(64)));
  console.log('');

  const manual = summary.totalIssues - summary.fixable;

  console.log(chalk.yellow('📊 Summary (ESLint results)'));
  console.log(`   Total issues: ${chalk.bold(summary.totalIssues)} (errors: ${chalk.red(summary.errors)}, warnings: ${chalk.yellow(summary.warnings)})`);
  console.log(`   ├─ Auto-fixable: ${chalk.green(summary.fixable)} (eslint --fix)`);
  console.log(`   └─ Manual fix: ${chalk.yellow(manual)} (AI assisted)`);
  console.log(`   Unique rules: ${chalk.bold(summary.uniqueRules)}`);
  console.log('');

  console.log(chalk.yellow('📋 Rules'));
  for (const rule of rules) {
    const fixLabel = rule.autoFixable ? chalk.green('[auto-fix]') : chalk.yellow('[manual]');
    console.log(`   • ${rule.ruleId} (${rule.count}) - ${rule.severity} ${fixLabel}`);
  }
  console.log('');
}

/**
 * Display a single rule with AI explanation
 */
export function displayRule(
  ruleFix: RuleFix,
  index: number,
  total: number
): void {
  console.log('');
  console.log(chalk.cyan('═'.repeat(64)));
  console.log(chalk.cyan(`  Rule ${index}/${total}`));
  console.log(chalk.cyan('═'.repeat(64)));
  console.log('');

  console.log(`${chalk.bold('📋 Rule:')} ${chalk.yellow(ruleFix.ruleId)} (${ruleFix.count} issues)`);
  console.log(`${chalk.bold('⚠️  Severity:')} ${ruleFix.severity} | ${chalk.bold('Priority:')} ${ruleFix.explain.priority}`);
  console.log('');

  console.log(chalk.dim('── AI Analysis ──────────────────────────────────────────────'));
  console.log(`${chalk.bold('🔴 Problem:')} ${ruleFix.explain.problemDescription}`);
  console.log(`${chalk.bold('❓ Why:')} ${ruleFix.explain.whyProblem}`);
  console.log(`${chalk.bold('✅ How to fix:')} ${ruleFix.explain.howToFix}`);
  console.log('');

  // Display fixes preview
  console.log(chalk.dim('── [f] Fix Preview (AI generated) ───────────────────────────'));
  for (const fix of ruleFix.fixes) {
    const fileShort = fix.file.split('/').pop();
    const lineRange = fix.startLine === fix.endLine
      ? `${fix.startLine}`
      : `${fix.startLine}-${fix.endLine}`;

    console.log(`${chalk.bold(`📍 ${fileShort}:${lineRange}`)}`);
    console.log(chalk.red('   Original:'));
    for (const line of fix.original.split('\n')) {
      console.log(chalk.red(`   - ${line}`));
    }
    console.log(chalk.green('   Fixed:'));
    for (const line of fix.fixed.split('\n')) {
      console.log(chalk.green(`   + ${line}`));
    }
    console.log(chalk.dim(`   └ ${fix.explanation}`));
    console.log('');
  }

  // Display disable preview
  console.log(chalk.dim('── [d] Disable Preview (AI generated) ────────────────────────'));
  console.log(`   ${ruleFix.disableConfig.diffDescription}`);
  console.log('');

  // Display ignore options
  console.log(chalk.dim('── [i] Ignore Options ─────────────────────────────────────────'));
  console.log(`   [1] Line: // eslint-disable-next-line ${ruleFix.ruleId}`);
  console.log(`   [2] File: /* eslint-disable ${ruleFix.ruleId} */`);
  console.log('');
}

/**
 * Display action menu
 */
export function displayMenu(): void {
  console.log(chalk.cyan('─'.repeat(64)));
  console.log(`  ${chalk.yellow('[f]')} Fix      - Apply AI-generated fix          ${chalk.green('[deterministic]')}`);
  console.log(`  ${chalk.yellow('[d]')} Disable  - Apply config change             ${chalk.green('[deterministic]')}`);
  console.log(`  ${chalk.yellow('[i]')} Ignore   - Add eslint-disable comment      ${chalk.green('[deterministic]')}`);
  console.log(`  ${chalk.yellow('[a]')} Ask AI   - Ask additional questions        ${chalk.magenta('[non-deterministic]')}`);
  console.log(`  ${chalk.yellow('[s]')} Skip     - Skip this rule                  ${chalk.green('[deterministic]')}`);
  console.log(`  ${chalk.yellow('[q]')} Quit     - Exit                            ${chalk.green('[deterministic]')}`);
  console.log(chalk.cyan('─'.repeat(64)));
}

/**
 * Display rules menu for selection
 */
export function displayRulesMenu(rules: ParsedRule[]): void {
  console.log('');
  console.log(chalk.cyan.bold('═'.repeat(64)));
  console.log(chalk.cyan.bold('              Select a Rule to Process'));
  console.log(chalk.cyan.bold('═'.repeat(64)));
  console.log('');

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const severityColor = rule.severity === 'error' ? chalk.red : chalk.yellow;
    const fixLabel = rule.autoFixable ? chalk.green('[auto-fix]') : chalk.yellow('[manual]');

    console.log(`  ${chalk.cyan(`[${i + 1}]`)} ${rule.ruleId} ${severityColor(`(${rule.severity})`)} - ${rule.count} issues ${fixLabel}`);
  }
  console.log('');
}
