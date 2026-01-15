/**
 * ESLint Result Parser
 */

import type { ESLintResult, ParsedResult, ParsedRule } from '../types/index.js';

/**
 * Parse ESLint JSON results into a structured format grouped by rule
 */
export function parseESLintResult(results: ESLintResult[]): ParsedResult {
  // Flatten all messages with file paths
  const allMessages = results.flatMap((result) =>
    result.messages.map((msg) => ({
      ruleId: msg.ruleId,
      severity: msg.severity === 2 ? 'error' : 'warning',
      message: msg.message,
      file: result.filePath.split('/').pop() || result.filePath,
      fileFull: result.filePath,
      line: msg.line,
      column: msg.column,
      source: msg.source,
      hasFix: !!msg.fix,
    }))
  );

  // Group by rule
  const ruleGroups = new Map<string | null, typeof allMessages>();
  for (const msg of allMessages) {
    const key = msg.ruleId;
    if (!ruleGroups.has(key)) {
      ruleGroups.set(key, []);
    }
    ruleGroups.get(key)!.push(msg);
  }

  // Convert to ParsedRule array
  const rules: ParsedRule[] = Array.from(ruleGroups.entries()).map(
    ([ruleId, messages]) => ({
      ruleId,
      severity: messages[0].severity as 'error' | 'warning',
      count: messages.length,
      autoFixable: messages.some((m) => m.hasFix),
      fixableCount: messages.filter((m) => m.hasFix).length,
      locations: messages.map((m) => ({
        file: m.file,
        fileFull: m.fileFull,
        line: m.line,
        column: m.column,
        hasFix: m.hasFix,
      })),
      sampleMessages: [...new Set(messages.slice(0, 3).map((m) => m.message))],
      sampleSource: [
        ...new Set(
          messages
            .slice(0, 3)
            .map((m) => m.source)
            .filter((s): s is string => !!s)
        ),
      ],
    })
  );

  // Calculate summary
  const summary = {
    totalIssues: allMessages.length,
    errors: allMessages.filter((m) => m.severity === 'error').length,
    warnings: allMessages.filter((m) => m.severity === 'warning').length,
    fixable: allMessages.filter((m) => m.hasFix).length,
    uniqueRules: rules.length,
  };

  return { summary, rules };
}

/**
 * Check if there are parsing errors (syntax errors)
 */
export function hasParsingErrors(result: ParsedResult): boolean {
  return result.rules.some((rule) => rule.ruleId === null);
}

/**
 * Get parsing error locations
 */
export function getParsingErrors(
  result: ParsedResult
): Array<{ file: string; line: number; message: string }> {
  const parsingRule = result.rules.find((rule) => rule.ruleId === null);
  if (!parsingRule) return [];

  return parsingRule.locations.map((loc, i) => ({
    file: loc.fileFull,
    line: loc.line,
    message: parsingRule.sampleMessages[i] || 'Parsing error',
  }));
}
