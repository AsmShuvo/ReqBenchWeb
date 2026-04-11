import { useHistoryStore } from '../store/useHistoryStore'

export default function Navbar({ onToggleHistory }: { onToggleHistory: () => void }) {
  const entryCount = useHistoryStore((s) => s.entries.length)

  return (
    <nav className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      <span className="text-lg font-bold text-white tracking-tight">
        ReqBench
      </span>
      <button
        onClick={onToggleHistory}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white cursor-pointer px-3 py-1.5 rounded hover:bg-gray-800"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6l4 2m6-2a9 9 0 11-3.22-6.88"
          />
        </svg>
        History
        {entryCount > 0 && (
          <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">
            {entryCount}
          </span>
        )}
      </button>
    </nav>
  )
}
