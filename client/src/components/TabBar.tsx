import { useRequestStore } from '../store/useRequestStore'

const methodColors: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
}

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, addTab, removeTab, duplicateTab } =
    useRequestStore()

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center gap-0 overflow-x-auto shrink-0">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`group h-full px-3 text-sm flex items-center gap-1.5 border-r border-gray-800 shrink-0 cursor-pointer select-none ${
            activeTabId === tab.id
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <span className={`text-xs font-semibold ${methodColors[tab.method] ?? 'text-gray-400'}`}>
            {tab.method}
          </span>
          <span className="truncate max-w-36">{tab.name}</span>
          <div className="flex items-center gap-0.5 ml-1">
            <span
              onClick={(e) => {
                e.stopPropagation()
                duplicateTab(tab.id)
              }}
              className="text-gray-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 text-xs px-0.5"
              title="Duplicate tab"
            >
              ⧉
            </span>
            {tabs.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  removeTab(tab.id)
                }}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm px-0.5"
                title="Close tab"
              >
                &times;
              </span>
            )}
          </div>
        </div>
      ))}
      <button
        onClick={addTab}
        className="h-full px-3 text-gray-500 hover:text-white hover:bg-gray-800/50 text-lg cursor-pointer"
        title="New tab"
      >
        +
      </button>
    </div>
  )
}
