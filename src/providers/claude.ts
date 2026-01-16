/**
 * Claude Code Provider
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { AIProvider, AIResponse, ProviderOptions, ProviderStatus } from './types.js';

const execAsync = promisify(exec);

export class ClaudeCodeProvider implements AIProvider {
  readonly name = 'claude-code' as const;
  private sessionId?: string;
  private model: string;
  private timeout: number;
  private debug: boolean;

  constructor(options?: ProviderOptions) {
    this.model = options?.model || 'haiku';
    this.timeout = options?.timeout || 60000;
    this.debug = options?.debug || false;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which claude');
      return true;
    } catch {
      return false;
    }
  }

  async login(): Promise<void> {
    console.log('Setting up Claude Code authentication token...');
    console.log('This requires a Claude subscription.');
    console.log('');
    await execAsync('claude setup-token', { timeout: 120000 });
  }

  async status(): Promise<ProviderStatus> {
    try {
      const { stdout } = await execAsync('claude --version', { timeout: 10000 });
      return {
        available: true,
        version: stdout.trim(),
        details: 'Claude Code CLI is available',
      };
    } catch {
      return {
        available: false,
        details: 'Claude Code CLI not found. Install it first.',
      };
    }
  }

  private async callClaude<T>(
    prompt: string,
    schema: object
  ): Promise<AIResponse<T>> {
    try {
      const resumeFlag = this.sessionId ? `--resume ${this.sessionId}` : '';

      const cmd = `echo '${prompt.replace(/'/g, "'\\''")}' | claude -p --model ${this.model} --output-format json --json-schema '${JSON.stringify(schema)}' ${resumeFlag}`;

      if (this.debug) {
        console.log('[DEBUG] Command:', cmd.substring(0, 200) + '...');
      }

      const { stdout } = await execAsync(cmd, { timeout: this.timeout });

      if (this.debug) {
        console.log('[DEBUG] Raw response:', stdout.substring(0, 500));
      }

      const response = JSON.parse(stdout);

      // Save session ID for subsequent calls
      if (response.session_id) {
        this.sessionId = response.session_id;
      }

      // Try multiple possible response structures
      let data: T | undefined;

      if (response.structured_output) {
        data = response.structured_output;
      } else if (response.result) {
        // result might be a JSON string
        if (typeof response.result === 'string') {
          try {
            data = JSON.parse(response.result);
          } catch {
            data = response.result as T;
          }
        } else {
          data = response.result;
        }
      } else if (response.content) {
        // Some versions return content directly
        data = response.content;
      } else if (response.message) {
        // Try parsing message as JSON
        if (typeof response.message === 'string') {
          try {
            data = JSON.parse(response.message);
          } catch {
            data = response.message as T;
          }
        } else {
          data = response.message;
        }
      }

      if (this.debug) {
        console.log('[DEBUG] Parsed data:', JSON.stringify(data, null, 2));
      }

      if (!data) {
        return {
          success: false,
          error: 'No data found in response',
        };
      }

      return {
        success: true,
        data,
        sessionId: this.sessionId,
      };
    } catch (error) {
      if (this.debug) {
        console.log('[DEBUG] Error:', error);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async explainRule(
    ruleId: string,
    sampleSource: string,
    sampleMessages: string
  ): Promise<AIResponse<{
    problemDescription: string;
    whyProblem: string;
    howToFix: string;
    priority: string;
  }>> {
    const prompt = `규칙 ID: ${ruleId}

샘플 코드:
${sampleSource}

ESLint 메시지:
${sampleMessages}

이 규칙에 대해 설명해주세요.`;

    const schema = {
      type: 'object',
      properties: {
        problemDescription: { type: 'string' },
        whyProblem: { type: 'string' },
        howToFix: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['problemDescription', 'whyProblem', 'howToFix', 'priority'],
    };

    return this.callClaude(prompt, schema);
  }

  async generateFix(
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
  }>> {
    const prompt = `ESLint 규칙 위반을 수정해주세요.

규칙: ${ruleId}
메시지: ${message}
문제 발생 라인: ${line}

코드 컨텍스트 (라인 번호 포함):
${codeContext}

## 중요 지침
1. 수정이 필요한 코드 범위를 정확히 파악하세요 (시작 라인 ~ 끝 라인)
2. start_line과 end_line은 교체할 범위 (포함)
3. fixed_code는 그 범위를 대체할 새 코드 (들여쓰기 유지)`;

    const schema = {
      type: 'object',
      properties: {
        startLine: { type: 'integer' },
        endLine: { type: 'integer' },
        fixedCode: { type: 'string' },
        explanation: { type: 'string' },
      },
      required: ['startLine', 'endLine', 'fixedCode', 'explanation'],
    };

    return this.callClaude(prompt, schema);
  }

  async generateDisableConfig(
    ruleId: string,
    configContent: string
  ): Promise<AIResponse<{
    modifiedConfig: string;
    diffDescription: string;
  }>> {
    const prompt = `ESLint flat config 파일에 규칙을 비활성화하는 코드를 추가해주세요.

비활성화할 규칙: ${ruleId}

현재 config 파일 내용:
${configContent}

기존 규칙 구조를 분석하여 적절한 위치에 '${ruleId}': 'off' 를 추가하세요.`;

    const schema = {
      type: 'object',
      properties: {
        modifiedConfig: { type: 'string' },
        diffDescription: { type: 'string' },
      },
      required: ['modifiedConfig', 'diffDescription'],
    };

    return this.callClaude(prompt, schema);
  }

  async askQuestion(
    question: string,
    context: string
  ): Promise<AIResponse<{
    answer: string;
    codeSuggestion?: string;
  }>> {
    const prompt = `${context}

사용자 질문: ${question}

한국어로 답변하세요.`;

    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        codeSuggestion: { type: 'string' },
      },
      required: ['answer'],
    };

    return this.callClaude(prompt, schema);
  }
}
