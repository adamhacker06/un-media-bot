import { useRef, type KeyboardEvent } from 'react'

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

interface SearchBarProps {
  value: string
  onChange: (val: string) => void
  onSubmit: (val: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function SearchBar({ value, onChange, onSubmit, disabled, placeholder }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
      e.preventDefault()
      onSubmit(value.trim())
    }
  }

  return (
    <div className="search-bar">
      <button className="search-add-btn" tabIndex={-1} aria-label="Attach">+</button>
      <input
        ref={inputRef}
        className="search-input"
        placeholder={placeholder ?? 'Ask Anything…'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        autoFocus
      />
      <div className="search-actions">
        <button className="icon-btn" tabIndex={-1} aria-label="Voice input">
          <MicIcon />
        </button>
        <button
          className="send-btn"
          onClick={() => value.trim() && onSubmit(value.trim())}
          disabled={!value.trim() || disabled}
          aria-label="Send"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
