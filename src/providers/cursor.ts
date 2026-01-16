/**
 * Cursor CLI Provider
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { AIProvider, AIResponse, ProviderOptions, ProviderStatus } from './types.js';

const execAsync = promisify(exec);

export class CursorCLIProvider implements AIProvider {
  readonly name = 'cursor-cli' as const;
  private sessionId?: string;
  private model: string;
  private timeout: number;
  private debug: boolean;

  constructor(options?: ProviderOptions) {
    this.model = options?.model || 'gemini-3-flash';
    this.timeout = options?.timeout || 60000;
    this.debug = options?.debug || false;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which cursor');
      return true;
    } catch {
      return false;
    }
  }

  async login(): Promise<void> {
    console.log('Logging in to Cursor...');
    await execAsync('cursor agent login', { timeout: 60000 });
  }

  async status(): Promise<ProviderStatus> {
    try {
      const { stdout } = await execAsync('cursor agent status', { timeout: 10000 });
      return {
        available: true,
        details: stdout.trim() || 'Cursor CLI is available',
      };
    } catch {
      return {
        available: false,
        details: 'Cursor CLI not available. Install it first.',
      };
    }
  }

  private async callCursor<T>(prompt: string): Promise<AIResponse<T>> {
    try {
      const resumeFlag = this.sessionId ? `--resume ${this.sessionId}` : '';

      const cmd = `echo '${prompt.replace(/'/g, "'\\''")}' | cursor agent -p --model ${this.model} --output-format json ${resumeFlag}`;

      if (this.debug) {
        console.log('[DEBUG] Cursor Command:', cmd.substring(0, 200) + '...');
      }

      const { stdout } = await execAsync(cmd, { timeout: this.timeout });

      if (this.debug) {
        console.log('[DEBUG] Cursor Raw response:', stdout.substring(0, 500));
      }

      const response = JSON.parse(stdout);

      // Save session ID for subsequent calls
      if (response.session_id) {
        this.sessionId = response.session_id;
      }

      // Helper to strip markdown code blocks and parse JSON
      const parseJsonString = (str: string): T | undefined => {
        // Strip markdown code blocks (```json ... ``` or ``` ... ```)
        let cleaned = str.trim();
        const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
        if (codeBlockMatch) {
          cleaned = codeBlockMatch[1].trim();
        }
        try {
          return JSON.parse(cleaned);
        } catch {
          return undefined;
        }
      };

      // Try multiple possible response structures
      let data: T | undefined;

      if (response.structured_output) {
        data = response.structured_output;
      } else if (response.result) {
        // result might be a JSON string (possibly with markdown)
        if (typeof response.result === 'string') {
          data = parseJsonString(response.result);
        } else {
          data = response.result;
        }
      } else if (response.content) {
        // Some versions return content directly
        if (typeof response.content === 'string') {
          data = parseJsonString(response.content);
        } else {
          data = response.content;
        }
      } else if (response.message) {
        // Try parsing message as JSON
        if (typeof response.message === 'string') {
          data = parseJsonString(response.message);
        } else {
          data = response.message;
        }
      }

      if (this.debug) {
        console.log('[DEBUG] Cursor Parsed data:', JSON.stringify(data, null, 2));
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
        console.log('[DEBUG] Cursor Error:', error);
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

이 규칙에 대해 설명해주세요.

JSON 형식으로 응답:
{
  "problemDescription": "문제 설명",
  "whyProblem": "왜 문제인지",
  "howToFix": "수정 방법",
  "priority": "low|medium|high"
}`;

    return this.callCursor(prompt);
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

JSON 형식으로 응답:
{
  "startLine": 123,
  "endLine": 125,
  "fixedCode": "수정된 코드",
  "explanation": "수정 이유"
}`;

    return this.callCursor(prompt);
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

JSON 형식으로 응답:
{
  "modifiedConfig": "수정된 전체 config",
  "diffDescription": "변경 내용 요약"
}`;

    return this.callCursor(prompt);
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

한국어로 답변하세요.

JSON 형식으로 응답:
{
  "answer": "답변",
  "codeSuggestion": "코드 제안 (선택)"
}`;

    return this.callCursor(prompt);
  }
}
