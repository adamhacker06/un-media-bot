import { useState, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar.tsx'
import ChatView from './components/ChatView.tsx'
import type { Article, Asset, ChatHistoryItem, HistoryMessage, Message, SseEvent } from './types.ts'

const API_BASE = '/api'
let msgId = 0

export default function App() {
  const [messages, setMessages]       = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([])
  const [activeChat, setActiveChat]   = useState<number | null>(null)
  const chatIdRef = useRef(0)

  // Build the history array the backend expects (all completed turns so far)
  function buildHistory(msgs: Message[]): HistoryMessage[] {
    const history: HistoryMessage[] = []
    for (const m of msgs) {
      if (m.isStreaming) continue
      history.push({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content,
      })
    }
    return history
  }

  const sendMessage = useCallback(async (query: string) => {
    // Add user message immediately
    const userMsg: Message = {
      id: ++msgId,
      role: 'user',
      content: query,
      articles: [],
      assets: [],
      isStreaming: false,
    }
    const assistantMsg: Message = {
      id: ++msgId,
      role: 'assistant',
      content: '',
      articles: [],
      assets: [],
      isStreaming: true,
    }

    setMessages((prev) => {
      const next = [...prev, userMsg, assistantMsg]
      // Kick off the fetch using the snapshot
      void fetchResponse(query, buildHistory(prev), assistantMsg.id)
      return next
    })

    // Track in sidebar history
    const chatId = ++chatIdRef.current
    setActiveChat(chatId)
    setChatHistory((prev) => [{ id: chatId, query }, ...prev.slice(0, 19)])
  }, [])

  async function fetchResponse(query: string, history: HistoryMessage[], assistantId: number) {
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, history }),
      })

      if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') {
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, isStreaming: false } : m)
            )
            continue
          }

          let event: SseEvent
          try { event = JSON.parse(raw) as SseEvent } catch { continue }

          if (event.type === 'token') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.content } : m
              )
            )
          } else if (event.type === 'sources') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, articles: event.articles as Article[], assets: event.assets as Asset[] }
                  : m
              )
            )
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Error: ${event.message}`, isStreaming: false }
                  : m
              )
            )
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${msg}`, isStreaming: false } : m
        )
      )
    }
  }

  function handleNewChat() {
    setMessages([])
    setActiveChat(null)
  }

  return (
    <div className="layout">
      <Sidebar
        chatHistory={chatHistory}
        activeChat={activeChat}
        onNewChat={handleNewChat}
        onSelectChat={setActiveChat}
      />
      <ChatView messages={messages} onSend={sendMessage} />
    </div>
  )
}
