import 'server-only';

export function normalizePath(input: string) {
  return input.replace(/^\/+/, "");
}
