/**
 * ESLint Fixer - Apply fixes to files
 */

import { readFileSync, writeFileSync } from 'fs';
import type { LocationFix } from '../types/index.js';

/**
 * Apply a fix to a file using content-based matching
 */
export function applyFix(fix: LocationFix): boolean {
  try {
    const content = readFileSync(fix.file, 'utf8');

    if (!content.includes(fix.original)) {
      return false; // Original code not found (already modified?)
    }

    const newContent = content.replace(fix.original, fix.fixed);
    writeFileSync(fix.file, newContent);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply multiple fixes to files
 */
export function applyFixes(fixes: LocationFix[]): {
  success: number;
  failed: number;
  skipped: number;
} {
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const fix of fixes) {
    if (!fix.original || !fix.fixed) {
      skipped++;
      continue;
    }

    if (applyFix(fix)) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed, skipped };
}

/**
 * Add eslint-disable-next-line comment
 */
export function applyIgnoreLine(
  filePath: string,
  line: number,
  ruleId: string
): boolean {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    if (line < 1 || line > lines.length) {
      return false;
    }

    // Get indentation from target line
    const targetLine = lines[line - 1];
    const indentMatch = targetLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    // Insert comment before target line
    lines.splice(line - 1, 0, `${indent}// eslint-disable-next-line ${ruleId}`);

    writeFileSync(filePath, lines.join('\n'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Add eslint-disable comment at file top
 */
export function applyIgnoreFile(filePath: string, ruleId: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf8');

    // Check if already has eslint-disable
    if (content.startsWith('/* eslint-disable')) {
      // Add to existing disable
      const newContent = content.replace(
        /\/\* eslint-disable/,
        `/* eslint-disable ${ruleId},`
      );
      writeFileSync(filePath, newContent);
    } else {
      // Add new disable comment
      writeFileSync(filePath, `/* eslint-disable ${ruleId} */\n${content}`);
    }
    return true;
  } catch {
    return false;
  }
}

export { applyIgnoreLine as applyIgnore };
