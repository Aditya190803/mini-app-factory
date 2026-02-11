import { z } from 'zod';
import { stripCodeFence } from '@/lib/utils';

const toolCallSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.unknown()).default({}),
});

const toolCallsSchema = z.array(toolCallSchema).min(1).max(100);

export type ParsedToolCall = z.infer<typeof toolCallSchema>;

function extractBalancedJsonArray(input: string): string | null {
  const start = input.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1');
}

function tryParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parseArgsLike(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const parsed = tryParseJson(removeTrailingCommas(value));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return null;
}

function normalizeToolCall(raw: unknown): ParsedToolCall | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  let toolName: unknown = obj.tool ?? obj.name;
  if (!toolName && obj.function && typeof obj.function === 'object' && !Array.isArray(obj.function)) {
    const fn = obj.function as Record<string, unknown>;
    toolName = fn.name;
  }
  if (typeof toolName !== 'string' || !toolName.trim()) return null;

  const fnArgs =
    obj.function && typeof obj.function === 'object' && !Array.isArray(obj.function)
      ? (obj.function as Record<string, unknown>).arguments
      : undefined;
  const rawArgs = obj.args ?? obj.arguments ?? obj.input ?? fnArgs;
  const parsedArgs = parseArgsLike(rawArgs);
  if (!parsedArgs) return null;

  return { tool: toolName.trim(), args: parsedArgs };
}

function normalizeToolCallsPayload(decoded: unknown): ParsedToolCall[] | null {
  const fromArray = (items: unknown[]): ParsedToolCall[] | null => {
    const normalized = items.map(normalizeToolCall);
    if (normalized.some((item) => item === null)) return null;
    return normalized as ParsedToolCall[];
  };

  if (Array.isArray(decoded)) {
    return fromArray(decoded);
  }

  if (decoded && typeof decoded === 'object') {
    const obj = decoded as Record<string, unknown>;
    if (Array.isArray(obj.toolCalls)) {
      return fromArray(obj.toolCalls);
    }
    const single = normalizeToolCall(decoded);
    if (single) return [single];
  }

  return null;
}

export function extractToolCalls(content: string): ParsedToolCall[] {
  let jsonContent = content;
  const jsonMatch = content.match(/\[\s*\{\s*"tool":[\s\S]*\}\s*\]/);
  if (jsonMatch) {
    jsonContent = jsonMatch[0];
  } else {
    jsonContent = stripCodeFence(content);
  }

  const parseCandidates: string[] = [];
  const trimmed = jsonContent.trim();
  parseCandidates.push(trimmed);

  const balanced = extractBalancedJsonArray(trimmed);
  if (balanced && balanced !== trimmed) {
    parseCandidates.push(balanced);
  }

  parseCandidates.push(removeTrailingCommas(trimmed));
  if (balanced) {
    parseCandidates.push(removeTrailingCommas(balanced));
  }

  let decoded: unknown = null;
  for (const candidate of parseCandidates) {
    decoded = tryParseJson(candidate);
    if (decoded !== null) break;
  }

  if (decoded === null) {
    throw new Error('Invalid JSON in tool calls');
  }

  const normalized = normalizeToolCallsPayload(decoded);
  if (!normalized) {
    throw new Error('Invalid tool calls payload');
  }

  const parsed = toolCallsSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error('Invalid tool calls payload');
  }

  return parsed.data;
}
