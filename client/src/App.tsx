import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import TabBar from './components/TabBar'
import RequestBuilder from './components/RequestBuilder'
import ResponseViewer from './components/ResponseViewer'
import CollectionsPanel from './components/CollectionsPanel'
import FlowPage from './components/flow/FlowPage'
import { initSyncAutoPush, pullFromServer } from './lib/syncManager'

type View = 'request' | 'flow'

function App() {
  const [view, setView] = useState<View>('request')
  const [collectionsOpen, setCollectionsOpen] = useState(false)

  useEffect(() => {
    initSyncAutoPush()
    void pullFromServer()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <Navbar
        view={view}
        onSetView={setView}
        onToggleCollections={() => setCollectionsOpen((o) => !o)}
      />
      {view === 'request' ? (
        <>
          <TabBar />
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="md:w-1/2 md:border-r border-b md:border-b-0 border-gray-800 overflow-auto">
              <RequestBuilder />
            </div>
            <div className="md:w-1/2 overflow-auto">
              <ResponseViewer />
            </div>
          </div>
        </>
      ) : (
        <FlowPage />
      )}
      {collectionsOpen && <CollectionsPanel onClose={() => setCollectionsOpen(false)} />}
    </div>
  )
}

export default App
