import type { NodeOutput } from './flowTypes'

// Template references: {{nodeLabel.path.to.value}}
// - nodeLabel: the label assigned to a previous node (case-sensitive)
// - path: dot-notated object path into that node's NodeOutput
//   e.g. "body.token" -> output.body.token
//        "status"     -> output.status
//        "headers.content-type" -> output.headers["content-type"]
// Missing references are left as-is so the user can see what didn't resolve.

const TEMPLATE_RE = /\{\{([^{}]+?)\}\}/g

export interface ResolveResult {
  resolved: string
  unresolved: string[]
}

function walkPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root
  for (const segment of path) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[segment]
  }
  return cur
}

function formatValue(val: unknown): string {
  if (val === null) return 'null'
  if (val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return JSON.stringify(val)
}

export function resolveTemplate(
  input: string,
  outputs: Map<string, NodeOutput>,
): ResolveResult {
  const unresolved: string[] = []
  const resolved = input.replace(TEMPLATE_RE, (match, rawExpr: string) => {
    const expr = rawExpr.trim()
    const [label, ...pathParts] = expr.split('.')
    if (!label) {
      unresolved.push(expr)
      return match
    }
    const output = outputs.get(label)
    if (!output) {
      unresolved.push(expr)
      return match
    }
    const value = walkPath(output, pathParts)
    if (value === undefined) {
      unresolved.push(expr)
      return match
    }
    return formatValue(value)
  })
  return { resolved, unresolved }
}
