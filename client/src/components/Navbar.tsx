import { useHistoryStore } from '../store/useHistoryStore'
import { useCollectionStore } from '../store/useCollectionStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'

interface NavbarProps {
  onToggleHistory: () => void
  onToggleCollections: () => void
  onToggleEnvironments: () => void
}

export default function Navbar({
  onToggleHistory,
  onToggleCollections,
  onToggleEnvironments,
}: NavbarProps) {
  const historyCount = useHistoryStore((s) => s.entries.length)
  const collectionCount = useCollectionStore((s) => s.collections.length)
  const { environments, activeEnvironmentId, setActiveEnvironment } =
    useEnvironmentStore()

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)

  return (
    <nav className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-white tracking-tight">
          ReqBench
        </span>
        <button
          onClick={onToggleCollections}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white cursor-pointer px-3 py-1.5 rounded hover:bg-gray-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Collections
          {collectionCount > 0 && (
            <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">
              {collectionCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Environment selector */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${activeEnv ? 'bg-green-400' : 'bg-gray-600'}`}
          />
          <select
            value={activeEnvironmentId ?? ''}
            onChange={(e) => setActiveEnvironment(e.target.value || null)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 outline-none cursor-pointer"
          >
            <option value="">No Environment</option>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
          <button
            onClick={onToggleEnvironments}
            className="text-gray-500 hover:text-white text-sm cursor-pointer px-1.5 py-1 rounded hover:bg-gray-800"
            title="Manage environments"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <div className="w-px h-5 bg-gray-700" />

        <button
          onClick={onToggleHistory}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white cursor-pointer px-3 py-1.5 rounded hover:bg-gray-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-3.22-6.88" />
          </svg>
          History
          {historyCount > 0 && (
            <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  )
}
