import { useState } from 'react'
import SearchBar from './SearchBar.tsx'

const SUGGESTIONS: string[] = [
  'Sudan displacement briefing',
  'SG statement on Gaza ceasefire',
  'GA Resolution 79/1',
  'UNHCR emergency funding update',
]

interface SearchHomeProps {
  onSubmit: (query: string) => void
  isLoading: boolean
}

export default function SearchHome({ onSubmit, isLoading }: SearchHomeProps) {
  const [input, setInput] = useState<string>('')

  return (
    <div className="search-home">
      <div className="portal-label">Journalist Portal</div>
      <h1 className="portal-heading">
        Find <strong>Anything</strong> At the UN
      </h1>

      <div className="search-bar-wrap">
        <SearchBar
          value={input}
          onChange={setInput}
          onSubmit={(q) => { setInput(''); onSubmit(q) }}
          disabled={isLoading}
          placeholder="Ask Anything…"
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '18px', justifyContent: 'center' }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            style={{
              background: 'none',
              border: '1px solid #e0e0e0',
              borderRadius: '50px',
              padding: '5px 12px',
              fontSize: '12px',
              color: '#555',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            onClick={() => { setInput(''); onSubmit(s) }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
