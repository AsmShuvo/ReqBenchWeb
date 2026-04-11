import { useState, useMemo } from 'react'
import { useRequestStore, type ResponseSnapshot } from '../store/useRequestStore'
import {
  diffJson,
  diffText,
  tryParseJson,
  formatValue,
  countDiffStats,
  type DiffEntry,
  type LineDiff,
} from '../lib/diff'

// ─── Candidate builder ──────────────────────────────────────────────────────

interface Candidate {
  id: string
  label: string
  body: string
  snapshot: ResponseSnapshot
}

function useCandidates(): Candidate[] {
  const { tabs, activeTabId } = useRequestStore()

  return useMemo(() => {
    const candidates: Candidate[] = []
    const activeTab = tabs.find((t) => t.id === activeTabId)

    // Current tab's response history (most recent first)
    if (activeTab) {
      for (const snap of activeTab.responseHistory ?? []) {
        candidates.push({
          id: snap.id,
          label: `This tab: ${snap.label}`,
          body: snap.response.body,
          snapshot: snap,
        })
      }
    }

    // Other tabs' latest responses
    for (const tab of tabs) {
      if (tab.id === activeTabId) continue
      if (!tab.response) continue
      const snap: ResponseSnapshot = {
        id: `tab-${tab.id}`,
        response: tab.response,
        timestamp: Date.now(),
        label: `${tab.method} ${tab.response.status}`,
      }
      candidates.push({
        id: snap.id,
        label: `Tab "${tab.name}": ${tab.method} ${tab.response.status}`,
        body: tab.response.body,
        snapshot: snap,
      })
    }

    return candidates
  }, [tabs, activeTabId])
}

// ─── JSON Diff Tree ─────────────────────────────────────────────────────────

function DiffTree({ entries, depth = 0 }: { entries: DiffEntry[]; depth?: number }) {
  const indent = depth * 16

  return (
    <div>
      {entries.map((entry) => {
        const bg =
          entry.type === 'added'
            ? 'bg-green-500/10'
            : entry.type === 'removed'
              ? 'bg-red-500/10'
              : entry.type === 'changed'
                ? 'bg-yellow-500/10'
                : ''
        const color =
          entry.type === 'added'
            ? 'text-green-400'
            : entry.type === 'removed'
              ? 'text-red-400'
              : entry.type === 'changed'
                ? 'text-yellow-400'
                : 'text-gray-500'

        if (entry.type === 'nested' || entry.type === 'unchanged') {
          if (entry.type === 'unchanged') {
            return (
              <div key={entry.path} className="flex text-xs font-mono py-0.5" style={{ paddingLeft: indent }}>
                <span className="text-gray-600 w-4 shrink-0">&nbsp;</span>
                <span className="text-gray-500">{entry.key}: </span>
                <span className="text-gray-600 ml-1 truncate">{formatValue(entry.leftValue)}</span>
              </div>
            )
          }
          return (
            <div key={entry.path}>
              <div className="flex text-xs font-mono py-0.5" style={{ paddingLeft: indent }}>
                <span className="text-yellow-400 w-4 shrink-0">~</span>
                <span className="text-gray-300">{entry.key}: {'{'}</span>
              </div>
              <DiffTree entries={entry.children ?? []} depth={depth + 1} />
              <div className="text-xs font-mono text-gray-300 py-0.5" style={{ paddingLeft: indent }}>
                {'}'}
              </div>
            </div>
          )
        }

        return (
          <div key={entry.path} className={`flex text-xs font-mono py-0.5 ${bg}`} style={{ paddingLeft: indent }}>
            <span className={`w-4 shrink-0 ${color}`}>
              {entry.type === 'added' ? '+' : entry.type === 'removed' ? '-' : '~'}
            </span>
            <span className={color}>{entry.key}: </span>
            {entry.type === 'changed' ? (
              <span className="ml-1">
                <span className="text-red-400 line-through">{formatValue(entry.leftValue)}</span>
                <span className="text-gray-500 mx-1">&rarr;</span>
                <span className="text-green-400">{formatValue(entry.rightValue)}</span>
              </span>
            ) : (
              <span className={`ml-1 ${color}`}>
                {formatValue(entry.type === 'added' ? entry.rightValue : entry.leftValue)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Text Diff View ─────────────────────────────────────────────────────────

function TextDiffView({ diffs }: { diffs: LineDiff[] }) {
  return (
    <div className="font-mono text-xs">
      {diffs.map((d, i) => {
        const bg =
          d.type === 'added'
            ? 'bg-green-500/10'
            : d.type === 'removed'
              ? 'bg-red-500/10'
              : ''
        const color =
          d.type === 'added'
            ? 'text-green-400'
            : d.type === 'removed'
              ? 'text-red-400'
              : 'text-gray-400'
        const prefix = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '
        const numL = d.leftNum != null ? String(d.leftNum).padStart(4) : '    '
        const numR = d.rightNum != null ? String(d.rightNum).padStart(4) : '    '

        return (
          <div key={i} className={`flex py-0 ${bg}`}>
            <span className="text-gray-600 select-none w-10 shrink-0 text-right pr-1">{numL}</span>
            <span className="text-gray-600 select-none w-10 shrink-0 text-right pr-2">{numR}</span>
            <span className={`${color} w-4 shrink-0`}>{prefix}</span>
            <span className={color}>{d.line || ' '}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Compare Modal ──────────────────────────────────────────────────────────

export default function CompareModal({ onClose }: { onClose: () => void }) {
  const candidates = useCandidates()
  const [leftId, setLeftId] = useState(candidates[0]?.id ?? '')
  const [rightId, setRightId] = useState(candidates[1]?.id ?? '')

  const left = candidates.find((c) => c.id === leftId)
  const right = candidates.find((c) => c.id === rightId)

  const comparison = useMemo(() => {
    if (!left || !right) return null

    const leftJson = tryParseJson(left.body)
    const rightJson = tryParseJson(right.body)

    if (leftJson.valid && rightJson.valid) {
      const entries = diffJson(leftJson.data, rightJson.data)
      const stats = countDiffStats(entries)
      return { mode: 'json' as const, entries, stats }
    }

    // Fallback to pretty-printed JSON text if possible, otherwise raw
    const leftText = leftJson.valid
      ? JSON.stringify(leftJson.data, null, 2)
      : left.body
    const rightText = rightJson.valid
      ? JSON.stringify(rightJson.data, null, 2)
      : right.body

    const diffs = diffText(leftText, rightText)
    const added = diffs.filter((d) => d.type === 'added').length
    const removed = diffs.filter((d) => d.type === 'removed').length
    return { mode: 'text' as const, diffs, stats: { added, removed, changed: 0, unchanged: diffs.filter((d) => d.type === 'same').length } }
  }, [left, right])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Compare Responses</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer px-1">
            &times;
          </button>
        </div>

        {/* Selectors */}
        <div className="flex gap-4 p-4 border-b border-gray-800">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Left (base)</label>
            <select
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none cursor-pointer"
            >
              <option value="" disabled>Select response...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Right (compare)</label>
            <select
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none cursor-pointer"
            >
              <option value="" disabled>Select response...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats bar */}
        {comparison && (
          <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800 text-xs">
            <span className="text-gray-400">
              {comparison.mode === 'json' ? 'JSON diff' : 'Text diff'}
            </span>
            {comparison.stats.added > 0 && (
              <span className="text-green-400">+{comparison.stats.added} added</span>
            )}
            {comparison.stats.removed > 0 && (
              <span className="text-red-400">-{comparison.stats.removed} removed</span>
            )}
            {comparison.stats.changed > 0 && (
              <span className="text-yellow-400">~{comparison.stats.changed} changed</span>
            )}
            {comparison.stats.added === 0 && comparison.stats.removed === 0 && comparison.stats.changed === 0 && (
              <span className="text-gray-500">No differences</span>
            )}
          </div>
        )}

        {/* Diff content */}
        <div className="flex-1 overflow-auto p-4">
          {(!left || !right) && (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-500 text-sm">Select two responses to compare</p>
            </div>
          )}

          {left && right && leftId === rightId && (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-500 text-sm">Select two different responses to compare</p>
            </div>
          )}

          {comparison && leftId !== rightId && (
            <>
              {comparison.mode === 'json' && (
                <DiffTree entries={comparison.entries} />
              )}
              {comparison.mode === 'text' && (
                <TextDiffView diffs={comparison.diffs} />
              )}
            </>
          )}
        </div>

        {/* Metadata footer */}
        {left && right && leftId !== rightId && (
          <div className="flex gap-4 px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
            <div className="flex-1">
              Left: {left.snapshot.response.status} {left.snapshot.response.statusText} &middot; {left.snapshot.response.responseTime}ms
            </div>
            <div className="flex-1 text-right">
              Right: {right.snapshot.response.status} {right.snapshot.response.statusText} &middot; {right.snapshot.response.responseTime}ms
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
