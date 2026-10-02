/**
 * A line diff for the version history view. Myers-style LCS on lines, bounded so a huge file
 * cannot lock the tab: past the limit it reports the file as changed without line detail.
 */

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length * b.length > MAX_CELLS) return null;

  // lcs[i][j] = length of the LCS of a[i..] and b[j..], stored in one flat array.
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1]! + 1 : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) {
      out.push({ kind: 'removed', text: a[i++]! });
    } else {
      out.push({ kind: 'added', text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++]! });
  while (j < b.length) out.push({ kind: 'added', text: b[j++]! });
  return out;
}

export type FileChange = { path: string; status: 'added' | 'removed' | 'changed' };

/** Which files differ between two snapshots, from the point of view of `from` → `to`. */
export function changedFiles(from: Array<{ path: string; content: string }>, to: Array<{ path: string; content: string }>): FileChange[] {
  const before = new Map(from.map((file) => [file.path, file.content]));
  const after = new Map(to.map((file) => [file.path, file.content]));
  const changes: FileChange[] = [];
  for (const [path, content] of after) {
    if (!before.has(path)) changes.push({ path, status: 'added' });
    else if (before.get(path) !== content) changes.push({ path, status: 'changed' });
  }
  for (const path of before.keys()) if (!after.has(path)) changes.push({ path, status: 'removed' });
  return changes.sort((x, y) => x.path.localeCompare(y.path));
}
