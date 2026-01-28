/**
 * Cursor CLI Provider
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AIProvider, AIResponse, ProviderOptions, ProviderStatus } from './types.js';

const execAsync = promisify(exec);

// Max buffer size: 50MB
const MAX_BUFFER = 50 * 1024 * 1024;

export class CursorCLIProvider implements AIProvider {
  readonly name = 'cursor-cli' as const;
  private sessionId?: string;
  private model: string;
  private timeout: number;
  private debug: boolean;

  constructor(options?: ProviderOptions) {
    this.model = options?.model || 'claude-4.5-sonnet';
    this.timeout = options?.timeout || 120000;
    this.debug = options?.debug || false;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which agent');
      return true;
    } catch {
      return false;
    }
  }

  async login(): Promise<void> {
    console.log('Logging in to Cursor Agent...');
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const proc = spawn('agent', ['login'], { stdio: 'inherit' });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Login failed with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  async status(): Promise<ProviderStatus> {
    try {
      const { stdout } = await execAsync('agent --version', { timeout: 10000 });
      return {
        available: true,
        details: stdout.trim() || 'Cursor Agent is available',
      };
    } catch {
      return {
        available: false,
        details: 'Cursor Agent not available. Install it first.',
      };
    }
  }

  resetSession(): void {
    this.sessionId = undefined;
    if (this.debug) {
      console.log('[DEBUG] Cursor session reset');
    }
  }

  private async callCursor<T>(prompt: string): Promise<AIResponse<T>> {
    // Create temp file for prompt to avoid shell escaping issues and buffer limits
    const timestamp = Date.now();
    const promptFile = join(tmpdir(), `genai-sonar-lint-prompt-${timestamp}.txt`);

    try {
      // Write prompt to temp file
      writeFileSync(promptFile, prompt, 'utf8');

      const resumeFlag = this.sessionId ? `--resume ${this.sessionId}` : '';

      // Use cat to pipe file content instead of echo (more reliable for large content)
      const cmd = `cat "${promptFile}" | agent -p --model ${this.model} --output-format json ${resumeFlag}`;

      if (this.debug) {
        console.log('[DEBUG] Cursor Command:', cmd.substring(0, 200) + '...');
        console.log('[DEBUG] Prompt length:', prompt.length, 'bytes');
      }

      const { stdout } = await execAsync(cmd, {
        timeout: this.timeout,
        maxBuffer: MAX_BUFFER
      });

      if (this.debug) {
        console.log('[DEBUG] Cursor Response length:', stdout.length, 'bytes');
        console.log('[DEBUG] Cursor Raw response (first 1000 chars):', stdout.substring(0, 1000));
        if (stdout.length > 1000) {
          console.log('[DEBUG] Cursor Raw response (last 500 chars):', stdout.substring(stdout.length - 500));
        }
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
    } finally {
      // Clean up temp file
      try {
        if (existsSync(promptFile)) {
          unlinkSync(promptFile);
        }
      } catch {
        // Ignore cleanup errors
      }
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
