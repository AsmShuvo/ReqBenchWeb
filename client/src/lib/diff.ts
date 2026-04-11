// ─── JSON Diff ───────────────────────────────────────────────────────────────

export type DiffType = 'added' | 'removed' | 'changed' | 'unchanged' | 'nested'

export interface DiffEntry {
  key: string
  type: DiffType
  path: string
  leftValue?: unknown
  rightValue?: unknown
  children?: DiffEntry[]
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

export function diffJson(left: unknown, right: unknown, path = ''): DiffEntry[] {
  const entries: DiffEntry[] = []

  if (isPlainObject(left) && isPlainObject(right)) {
    const allKeys = new Set([...Object.keys(left), ...Object.keys(right)])

    for (const key of allKeys) {
      const fullPath = path ? `${path}.${key}` : key
      const inLeft = key in left
      const inRight = key in right

      if (!inLeft) {
        entries.push({ key, type: 'added', path: fullPath, rightValue: right[key] })
      } else if (!inRight) {
        entries.push({ key, type: 'removed', path: fullPath, leftValue: left[key] })
      } else if (isPlainObject(left[key]) && isPlainObject(right[key])) {
        const children = diffJson(left[key], right[key], fullPath)
        const hasChanges = children.some((c) => c.type !== 'unchanged')
        entries.push({
          key,
          type: hasChanges ? 'nested' : 'unchanged',
          path: fullPath,
          children,
        })
      } else if (Array.isArray(left[key]) && Array.isArray(right[key])) {
        const lStr = JSON.stringify(left[key])
        const rStr = JSON.stringify(right[key])
        if (lStr === rStr) {
          entries.push({ key, type: 'unchanged', path: fullPath, leftValue: left[key] })
        } else {
          entries.push({
            key,
            type: 'changed',
            path: fullPath,
            leftValue: left[key],
            rightValue: right[key],
          })
        }
      } else if (left[key] === right[key]) {
        entries.push({ key, type: 'unchanged', path: fullPath, leftValue: left[key] })
      } else {
        entries.push({
          key,
          type: 'changed',
          path: fullPath,
          leftValue: left[key],
          rightValue: right[key],
        })
      }
    }
  } else if (left !== right) {
    entries.push({
      key: path || '(root)',
      type: 'changed',
      path,
      leftValue: left,
      rightValue: right,
    })
  }

  return entries
}

export function hasDifferences(entries: DiffEntry[]): boolean {
  return entries.some(
    (e) => e.type !== 'unchanged' && (e.type !== 'nested' || hasDifferences(e.children ?? [])),
  )
}

export interface DiffStats {
  added: number
  removed: number
  changed: number
  unchanged: number
}

export function countDiffStats(entries: DiffEntry[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, changed: 0, unchanged: 0 }
  for (const e of entries) {
    if (e.type === 'nested') {
      const child = countDiffStats(e.children ?? [])
      stats.added += child.added
      stats.removed += child.removed
      stats.changed += child.changed
      stats.unchanged += child.unchanged
    } else {
      stats[e.type]++
    }
  }
  return stats
}

// ─── Text Diff (LCS-based) ──────────────────────────────────────────────────

export type LineDiffType = 'same' | 'added' | 'removed'

export interface LineDiff {
  type: LineDiffType
  line: string
  leftNum?: number
  rightNum?: number
}

export function diffText(leftText: string, rightText: string): LineDiff[] {
  const leftLines = leftText.split('\n')
  const rightLines = rightText.split('\n')
  const m = leftLines.length
  const n = rightLines.length

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (leftLines[i - 1] === rightLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack
  const result: LineDiff[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      result.push({ type: 'same', line: leftLines[i - 1], leftNum: i, rightNum: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', line: rightLines[j - 1], rightNum: j })
      j--
    } else {
      result.push({ type: 'removed', line: leftLines[i - 1], leftNum: i })
      i--
    }
  }

  return result.reverse()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function tryParseJson(text: string): { valid: true; data: unknown } | { valid: false } {
  try {
    return { valid: true, data: JSON.parse(text) }
  } catch {
    return { valid: false }
  }
}

export function formatValue(val: unknown): string {
  if (typeof val === 'string') return `"${val}"`
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}
