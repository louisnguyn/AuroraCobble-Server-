import { useState } from 'react'
import { UsageStats } from './components/UsageStats'
import { Leaderboard } from './components/Leaderboard'
import './App.css'

type Tab = 'usage' | 'leaderboard'

function App() {
  const [tab, setTab] = useState<Tab>('usage')

  return (
    <div className="app">
      <nav className="nav">
        <h1 className="brand">Aurora Ranked</h1>
        <div className="tabs">
          <button
            className={tab === 'usage' ? 'active' : ''}
            onClick={() => setTab('usage')}
          >
            Usage Stats
          </button>
          <button
            className={tab === 'leaderboard' ? 'active' : ''}
            onClick={() => setTab('leaderboard')}
          >
            Leaderboard
          </button>
        </div>
      </nav>
      <main className="main">
        {tab === 'usage' && <UsageStats />}
        {tab === 'leaderboard' && <Leaderboard />}
      </main>
    </div>
  )
}

export default App
