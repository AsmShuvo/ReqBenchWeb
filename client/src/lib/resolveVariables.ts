import type { EnvVariable } from '../store/useEnvironmentStore'

const VAR_PATTERN = /\{\{(\w+)\}\}/g

export interface ResolveResult {
  resolved: string
  unresolved: string[]
}

export function resolveString(
  input: string,
  variables: Map<string, string>,
): ResolveResult {
  const unresolved: string[] = []

  const resolved = input.replace(VAR_PATTERN, (match, name: string) => {
    const value = variables.get(name)
    if (value === undefined) {
      unresolved.push(name)
      return match
    }
    return value
  })

  return { resolved, unresolved }
}

export function buildVariableMap(variables: EnvVariable[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const v of variables) {
    if (v.enabled && v.key.trim()) {
      map.set(v.key.trim(), v.value)
    }
  }
  return map
}

export function findAllVariables(input: string): string[] {
  const matches: string[] = []
  let m: RegExpExecArray | null
  const pattern = new RegExp(VAR_PATTERN.source, 'g')
  while ((m = pattern.exec(input)) !== null) {
    if (!matches.includes(m[1])) {
      matches.push(m[1])
    }
  }
  return matches
}

export function collectUnresolved(
  texts: string[],
  variables: Map<string, string>,
): string[] {
  const all = new Set<string>()
  for (const text of texts) {
    const { unresolved } = resolveString(text, variables)
    for (const u of unresolved) all.add(u)
  }
  return [...all]
}
