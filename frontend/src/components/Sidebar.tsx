import type { ChatHistoryItem } from '../types.ts'

interface SidebarProps {
  chatHistory: ChatHistoryItem[]
  activeChat: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
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

      {chatHistory.length > 0 ? (
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
      ) : (
        <div className="sidebar-empty-history">No recent chats</div>
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
