import { useRequestStore } from '../store/useRequestStore'

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, addTab, removeTab } =
    useRequestStore()

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center gap-0 overflow-x-auto shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`h-full px-4 text-sm flex items-center gap-2 border-r border-gray-800 shrink-0 cursor-pointer ${
            activeTabId === tab.id
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <span className="truncate max-w-32">{tab.method} {tab.name}</span>
          {tabs.length > 1 && (
            <span
              onClick={(e) => {
                e.stopPropagation()
                removeTab(tab.id)
              }}
              className="text-gray-500 hover:text-red-400 ml-1"
            >
              &times;
            </span>
          )}
        </button>
      ))}
      <button
        onClick={addTab}
        className="h-full px-3 text-gray-500 hover:text-white hover:bg-gray-800/50 text-lg cursor-pointer"
      >
        +
      </button>
    </div>
  )
}
