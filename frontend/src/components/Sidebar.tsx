import type { ChatHistoryItem } from '../types.ts'

function UNGlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

interface SidebarProps {
  chatHistory: ChatHistoryItem[]
  activeChat: number | null
  onNewChat: () => void
  onSelectChat: (id: number) => void
}

export default function Sidebar({ chatHistory, activeChat, onNewChat, onSelectChat }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">UN</div>
        <span>UN Press Portal</span>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <span className="new-chat-icon">+</span>
        New Chat
      </button>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        <div className="sidebar-nav-item">
          <span className="sidebar-nav-icon">
            <CalendarIcon />
          </span>
          Today's Schedule
          <span className="live-dot" style={{ marginLeft: 'auto' }} />
        </div>
        <div className="sidebar-nav-item">
          <span className="sidebar-nav-icon">
            <UNGlobeIcon />
          </span>
          Latest News
        </div>
      </nav>

      <div className="sidebar-divider" />

      {chatHistory.length > 0 && (
        <>
          <div className="sidebar-section-label">Recent</div>
          {chatHistory.map((item) => (
            <div
              key={item.id}
              className={`sidebar-recent-item ${activeChat === item.id ? 'active-chat' : ''}`}
              onClick={() => onSelectChat(item.id)}
              title={item.query}
            >
              {item.query}
            </div>
          ))}
        </>
      )}

      <div className="sidebar-spacer" />

      <div className="sidebar-user">
        <div className="user-avatar">JG</div>
        <div className="user-info">
          <div className="user-name">Jacob Gallager</div>
          <div className="user-role">Journalist</div>
        </div>
      </div>
    </aside>
  )
}
