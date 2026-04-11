import { useState } from 'react'

type ResponseTab = 'Body' | 'Headers'

export default function ResponseViewer() {
  const [activeTab, setActiveTab] = useState<ResponseTab>('Body')

  const responseTabs: ResponseTab[] = ['Body', 'Headers']

  return (
    <div className="flex flex-col h-full">
      {/* Response Summary */}
      <div className="flex items-center gap-4 p-3 border-b border-gray-800">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Status:</span>
          <span className="text-sm text-gray-400">---</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Time:</span>
          <span className="text-sm text-gray-400">---</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Size:</span>
          <span className="text-sm text-gray-400">---</span>
        </div>
      </div>

      {/* Response Tabs */}
      <div className="flex border-b border-gray-800">
        {responseTabs.map((rt) => (
          <button
            key={rt}
            onClick={() => setActiveTab(rt)}
            className={`px-4 py-2 text-sm cursor-pointer ${
              activeTab === rt
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {rt}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'Body' && (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500 text-sm">Send a request to see the response</p>
          </div>
        )}
        {activeTab === 'Headers' && (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500 text-sm">No response headers yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
