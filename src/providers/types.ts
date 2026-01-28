/**
 * Provider type definitions
 */

export type ProviderType = 'claude-code' | 'cursor-cli';

export interface ProviderOptions {
  model?: string;
  timeout?: number;
  debug?: boolean;
}

export interface AIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  sessionId?: string;
}

export interface ProviderStatus {
  available: boolean;
  version?: string;
  details: string;
}

export interface AIProvider {
  readonly name: ProviderType;

  /**
   * Check if the provider CLI is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Login to the provider
   */
  login(): Promise<void>;

  /**
   * Get provider status
   */
  status(): Promise<ProviderStatus>;

  /**
   * Reset session (for per-file context management)
   */
  resetSession(): void;

  /**
   * Generate rule explanation
   */
  explainRule(
    ruleId: string,
    sampleSource: string,
    sampleMessages: string
  ): Promise<AIResponse<{
    problemDescription: string;
    whyProblem: string;
    howToFix: string;
    priority: string;
  }>>;

  /**
   * Generate fix for a specific location
   */
  generateFix(
    ruleId: string,
    filePath: string,
    line: number,
    message: string,
    codeContext: string
  ): Promise<AIResponse<{
    startLine: number;
    endLine: number;
    fixedCode: string;
    explanation: string;
  }>>;

  /**
   * Generate config modification to disable a rule
   */
  generateDisableConfig(
    ruleId: string,
    configContent: string
  ): Promise<AIResponse<{
    modifiedConfig: string;
    diffDescription: string;
  }>>;

  /**
   * Ask a follow-up question
   */
  askQuestion(
    question: string,
    context: string
  ): Promise<AIResponse<{
    answer: string;
    codeSuggestion?: string;
  }>>;
}
