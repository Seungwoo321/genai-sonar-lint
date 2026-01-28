/**
 * Claude Code Provider
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AIProvider, AIResponse, ProviderOptions, ProviderStatus } from './types.js';

const execAsync = promisify(exec);

// Max buffer size: 50MB
const MAX_BUFFER = 50 * 1024 * 1024;

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

  resetSession(): void {
    this.sessionId = undefined;
    if (this.debug) {
      console.log('[DEBUG] Claude session reset');
    }
  }

  private async callClaude<T>(
    prompt: string,
    schema: object
  ): Promise<AIResponse<T>> {
    // Create temp file for prompt to avoid shell escaping issues
    const timestamp = Date.now();
    const promptFile = join(tmpdir(), `genai-sonar-lint-prompt-${timestamp}.txt`);

    try {
      // Write prompt to temp file
      writeFileSync(promptFile, prompt, 'utf8');

      // Escape schema JSON for shell (single quotes with escaped single quotes inside)
      const schemaJson = JSON.stringify(schema);
      const escapedSchema = schemaJson.replace(/'/g, "'\\''");

      // Note: Do NOT use --resume with --json-schema as it causes schema to be ignored
      // Each call uses a fresh session for reliable structured output
      const cmd = `cat "${promptFile}" | claude -p --model ${this.model} --output-format json --json-schema '${escapedSchema}'`;

      if (this.debug) {
        console.log('[DEBUG] Claude Command:', cmd.substring(0, 200) + '...');
        console.log('[DEBUG] Prompt length:', prompt.length, 'bytes');
      }

      const { stdout } = await execAsync(cmd, {
        timeout: this.timeout,
        maxBuffer: MAX_BUFFER
      });

      if (this.debug) {
        console.log('[DEBUG] Claude Response length:', stdout.length, 'bytes');
        console.log('[DEBUG] Claude Raw response (first 1000 chars):', stdout.substring(0, 1000));
      }

      const response = JSON.parse(stdout);

      if (this.debug) {
        console.log('[DEBUG] Response keys:', Object.keys(response));
      }

      // Save session ID for subsequent calls
      if (response.session_id) {
        this.sessionId = response.session_id;
      }

      // Check for error response
      if (response.is_error || response.error) {
        return {
          success: false,
          error: response.error || response.message || 'Unknown error from Claude',
        };
      }

      // Get expected field names from schema for validation
      const schemaProps = (schema as { properties?: Record<string, unknown> }).properties || {};
      const expectedFields = Object.keys(schemaProps);

      // Helper to check if object has expected schema fields
      const hasSchemaFields = (obj: unknown): boolean => {
        if (!obj || typeof obj !== 'object') return false;
        return expectedFields.some(key => key in (obj as Record<string, unknown>));
      };

      // Primary: Use structured_output (when --json-schema works correctly)
      if (response.structured_output && hasSchemaFields(response.structured_output)) {
        if (this.debug) {
          console.log('[DEBUG] Using structured_output');
        }
        return {
          success: true,
          data: response.structured_output as T,
          sessionId: this.sessionId,
        };
      }

      // Fallback: Parse from result field (if --json-schema didn't work)
      if (response.result !== undefined) {
        let data: T | undefined;

        if (typeof response.result === 'object' && hasSchemaFields(response.result)) {
          data = response.result as T;
        } else if (typeof response.result === 'string' && response.result.trim()) {
          // Try to extract JSON from string (may contain markdown code blocks)
          const parsed = this.extractJsonFromString(response.result);
          if (parsed && hasSchemaFields(parsed)) {
            data = parsed as T;
          }
        }

        if (data) {
          if (this.debug) {
            console.log('[DEBUG] Using result field (fallback)');
          }
          return {
            success: true,
            data,
            sessionId: this.sessionId,
          };
        }
      }

      return {
        success: false,
        error: 'No data found in response',
      };
    } catch (error) {
      if (this.debug) {
        console.log('[DEBUG] Claude Error:', error);
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

  /**
   * Extract JSON object from a string that may contain markdown code blocks
   */
  private extractJsonFromString(str: string): unknown {
    if (!str || typeof str !== 'string') return undefined;

    let cleaned = str.trim();

    // Remove markdown code block markers
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    // Find the first balanced JSON object
    const startIndex = cleaned.indexOf('{');
    if (startIndex === -1) return undefined;

    let depth = 0;
    let inString = false;
    let escape = false;
    let endIndex = -1;

    for (let i = startIndex; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex === -1) return undefined;

    const jsonStr = cleaned.substring(startIndex, endIndex + 1);

    try {
      return JSON.parse(jsonStr);
    } catch {
      return undefined;
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
1. startLine과 endLine: 삭제하고 교체할 원본 코드의 정확한 라인 범위 (1-indexed, 포함)
2. fixedCode: startLine부터 endLine까지의 코드를 완전히 대체할 새 코드
   - 원본 코드를 복사하지 말고, 수정된 코드만 작성
   - 들여쓰기(공백/탭)를 원본과 동일하게 유지
   - 여러 줄인 경우 줄바꿈(\\n) 포함

## 예시
원본 (라인 10-12):
  const x = a ? (b ? 1 : 2) : 3;

올바른 응답:
  startLine: 10
  endLine: 10
  fixedCode: "  let result;\\n  if (a) {\\n    result = b ? 1 : 2;\\n  } else {\\n    result = 3;\\n  }"

잘못된 응답 (원본 포함하면 안됨):
  fixedCode: "const x = a ? (b ? 1 : 2) : 3;\\n  let result;\\n  ..."  // 원본이 중복됨`;

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
