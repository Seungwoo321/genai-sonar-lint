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
    // Create temp files for prompt and schema to avoid shell escaping issues
    const timestamp = Date.now();
    const promptFile = join(tmpdir(), `genai-sonar-lint-prompt-${timestamp}.txt`);
    const schemaFile = join(tmpdir(), `genai-sonar-lint-schema-${timestamp}.json`);

    try {
      // Write prompt and schema to temp files
      writeFileSync(promptFile, prompt, 'utf8');
      writeFileSync(schemaFile, JSON.stringify(schema), 'utf8');

      const resumeFlag = this.sessionId ? `--resume ${this.sessionId}` : '';

      // Use cat to pipe file content instead of echo (more reliable for large content)
      const cmd = `cat "${promptFile}" | claude -p --model ${this.model} --output-format json --json-schema "$(cat "${schemaFile}")" ${resumeFlag}`;

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
        console.log('[DEBUG] Claude Error:', error);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      // Clean up temp files
      try {
        if (existsSync(promptFile)) {
          unlinkSync(promptFile);
        }
        if (existsSync(schemaFile)) {
          unlinkSync(schemaFile);
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
