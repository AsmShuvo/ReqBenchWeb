import { useState, useMemo } from 'react'
import { useRequestStore, type KeyValuePair } from '../store/useRequestStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { resolveString, buildVariableMap } from '../lib/resolveVariables'
import { generators, type CodegenRequest } from '../lib/codegen'
import { useEscape } from '../lib/useEscape'
import { useToast } from '../store/useToastStore'

function buildResolvedRequest(
  tab: {
    method: string
    url: string
    params: KeyValuePair[]
    headers: KeyValuePair[]
    body: string
    authType: string
    authToken: string
  },
  varMap: Map<string, string>,
): CodegenRequest {
  // Resolve all fields
  const resolvedUrl = resolveString(tab.url, varMap).resolved
  const resolvedParams = tab.params
    .filter((p) => p.enabled && p.key)
    .map((p) => ({
      key: resolveString(p.key, varMap).resolved,
      value: resolveString(p.value, varMap).resolved,
    }))
  const resolvedHeaders = tab.headers
    .filter((p) => p.enabled && p.key)
    .map((p) => ({
      key: resolveString(p.key, varMap).resolved,
      value: resolveString(p.value, varMap).resolved,
    }))
  const resolvedBody = resolveString(tab.body, varMap).resolved
  const resolvedAuthToken = resolveString(tab.authToken, varMap).resolved

  // Build full URL with query params
  let fullUrl = resolvedUrl
  if (resolvedParams.length > 0) {
    try {
      const u = new URL(resolvedUrl)
      resolvedParams.forEach((p) => u.searchParams.append(p.key, p.value))
      fullUrl = u.toString()
    } catch {
      // URL may be invalid — use as-is
    }
  }

  // Build headers object
  const headers: Record<string, string> = {}
  resolvedHeaders.forEach((h) => {
    headers[h.key] = h.value
  })
  if (tab.authType === 'bearer' && resolvedAuthToken) {
    headers['Authorization'] = `Bearer ${resolvedAuthToken}`
  } else if (tab.authType === 'basic' && resolvedAuthToken) {
    headers['Authorization'] = `Basic ${btoa(resolvedAuthToken)}`
  }

  return {
    method: tab.method,
    url: fullUrl,
    headers,
    body: resolvedBody,
  }
}

export default function CodeGenModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  const toast = useToast()
  const { tabs, activeTabId } = useRequestStore()
  const { environments, activeEnvironmentId } = useEnvironmentStore()
  const [activeGenId, setActiveGenId] = useState(generators[0].id)
  const [copied, setCopied] = useState(false)

  const tab = tabs.find((t) => t.id === activeTabId)
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const varMap = useMemo(
    () => (activeEnv ? buildVariableMap(activeEnv.variables) : new Map<string, string>()),
    [activeEnv],
  )

  const code = useMemo(() => {
    if (!tab) return ''
    const gen = generators.find((g) => g.id === activeGenId)
    if (!gen) return ''
    const req = buildResolvedRequest(tab, varMap)
    return gen.generate(req)
  }, [tab, activeGenId, varMap])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    toast.success('Code copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!tab) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Generate Code</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer px-1">
            &times;
          </button>
        </div>

        {/* Language tabs */}
        <div className="flex border-b border-gray-800 overflow-x-auto">
          {generators.map((gen) => (
            <button
              key={gen.id}
              onClick={() => {
                setActiveGenId(gen.id)
                setCopied(false)
              }}
              className={`px-4 py-2.5 text-sm whitespace-nowrap cursor-pointer shrink-0 ${
                activeGenId === gen.id
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {gen.label}
            </button>
          ))}
        </div>

        {/* Code output */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {code}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-800">
          <span className="text-xs text-gray-500">
            {activeEnv ? `Resolved with "${activeEnv.name}" environment` : 'No environment active — variables unresolved'}
          </span>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded cursor-pointer ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy to Clipboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
