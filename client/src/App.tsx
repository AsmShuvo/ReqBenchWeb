import { useState } from 'react'
import Navbar from './components/Navbar'
import TabBar from './components/TabBar'
import RequestBuilder from './components/RequestBuilder'
import ResponseViewer from './components/ResponseViewer'
import HistoryPanel from './components/HistoryPanel'
import CollectionsPanel from './components/CollectionsPanel'
import EnvironmentManager from './components/EnvironmentManager'

function App() {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [collectionsOpen, setCollectionsOpen] = useState(false)
  const [environmentsOpen, setEnvironmentsOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <Navbar
        onToggleHistory={() => setHistoryOpen((o) => !o)}
        onToggleCollections={() => setCollectionsOpen((o) => !o)}
        onToggleEnvironments={() => setEnvironmentsOpen((o) => !o)}
      />
      <TabBar />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r border-gray-800 overflow-auto">
          <RequestBuilder />
        </div>
        <div className="w-1/2 overflow-auto">
          <ResponseViewer />
        </div>
      </div>
      {historyOpen && <HistoryPanel onClose={() => setHistoryOpen(false)} />}
      {collectionsOpen && <CollectionsPanel onClose={() => setCollectionsOpen(false)} />}
      {environmentsOpen && <EnvironmentManager onClose={() => setEnvironmentsOpen(false)} />}
    </div>
  )
}

export default App
