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

      const resumeFlag = this.sessionId ? `--resume ${this.sessionId}` : '';

      // Use cat to pipe file content and properly escaped schema
      const cmd = `cat "${promptFile}" | claude -p --model ${this.model} --output-format json --json-schema '${escapedSchema}' ${resumeFlag}`;

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
        if (stdout.length > 1000) {
          console.log('[DEBUG] Claude Raw response (last 500 chars):', stdout.substring(stdout.length - 500));
        }
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

      // Helper to check if object has expected schema fields
      const hasSchemaFields = (obj: unknown): obj is T => {
        if (!obj || typeof obj !== 'object') return false;
        const schemaProps = (schema as { properties?: Record<string, unknown> }).properties;
        if (!schemaProps) return false;
        // Check if at least one expected field exists
        return Object.keys(schemaProps).some(key => key in (obj as Record<string, unknown>));
      };

      // Try multiple possible response structures
      let data: T | undefined;

      // 1. Check structured_output first (Claude Code with --json-schema)
      if (response.structured_output) {
        data = response.structured_output;
      }
      // 2. Check if response itself contains schema fields (direct output)
      else if (hasSchemaFields(response)) {
        // Filter out metadata fields and use the response directly
        const responseObj = response as Record<string, unknown>;
        const { session_id, cost, duration_ms, num_turns, ...rest } = responseObj;
        if (hasSchemaFields(rest)) {
          data = rest as T;
        }
      }
      // 3. Check result field
      else if (response.result) {
        if (typeof response.result === 'string') {
          data = parseJsonString(response.result);
        } else if (hasSchemaFields(response.result)) {
          data = response.result;
        }
      }
      // 4. Check content field
      else if (response.content) {
        if (typeof response.content === 'string') {
          data = parseJsonString(response.content);
        } else if (hasSchemaFields(response.content)) {
          data = response.content;
        }
      }
      // 5. Check message field
      else if (response.message) {
        if (typeof response.message === 'string') {
          data = parseJsonString(response.message);
        } else if (hasSchemaFields(response.message)) {
          data = response.message;
        }
      }

      if (this.debug) {
        console.log('[DEBUG] Parsed data:', data ? JSON.stringify(data, null, 2).substring(0, 500) : 'undefined');
      }

      if (!data) {
        if (this.debug) {
          console.log('[DEBUG] Full response for debugging:', JSON.stringify(response, null, 2).substring(0, 2000));
        }
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
