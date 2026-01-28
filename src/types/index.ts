/**
 * Type definitions
 */

export interface ESLintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
  source?: string;
  fix?: {
    range: [number, number];
    text: string;
  };
}

export interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

export interface ParsedLocation {
  file: string;
  fileFull: string;
  line: number;
  column: number;
  hasFix: boolean;
}

export interface ParsedRule {
  ruleId: string | null;
  severity: 'error' | 'warning';
  count: number;
  autoFixable: boolean;
  fixableCount: number;
  locations: ParsedLocation[];
  sampleMessages: string[];
  sampleSource: string[];
}

export interface ParsedSummary {
  totalIssues: number;
  errors: number;
  warnings: number;
  fixable: number;
  uniqueRules: number;
}

export interface ParsedResult {
  summary: ParsedSummary;
  rules: ParsedRule[];
}

export interface AIExplanation {
  problemDescription: string;
  whyProblem: string;
  howToFix: string;
  priority: 'low' | 'medium' | 'high';
}

export interface AIFix {
  startLine: number;
  endLine: number;
  fixedCode: string;
  explanation: string;
}

export interface LocationFix {
  file: string;
  startLine: number;
  endLine: number;
  original: string;
  fixed: string;
  explanation: string;
}

export interface RuleFix {
  ruleId: string;
  count: number;
  severity: 'error' | 'warning';
  explain: AIExplanation;
  disableConfig: {
    modifiedConfig: string;
    diffDescription: string;
  };
  fixes: LocationFix[];
}

export interface AnalyzeOptions {
  provider: 'claude-code' | 'cursor-cli';
  model?: string;
  output?: string;
  raw?: boolean;
  nonInteractive?: boolean;
  autoFix?: boolean;
  debug?: boolean;
  config?: string;
}
