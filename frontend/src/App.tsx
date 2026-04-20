import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar.tsx'
import ChatView from './components/ChatView.tsx'
import type { Article, Asset, ChatHistoryItem, HistoryMessage, Message, SseEvent } from './types.ts'

const API_BASE = '/api'
let msgId = 0

export default function App() {
  const [messages, setMessages]       = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([])
  const [activeChat, setActiveChat]   = useState<number | null>(null)
  const chatIdRef   = useRef(0)
  const messagesRef = useRef<Message[]>([])   // mirror of messages for reading in callbacks

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  function buildHistory(msgs: Message[]): HistoryMessage[] {
    return msgs
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', content: m.content }))
  }

  const sendMessage = useCallback(async (query: string) => {
    const userMsg: Message = {
      id: ++msgId, role: 'user', content: query,
      articles: [], assets: [], isStreaming: false,
    }
    const assistantId = ++msgId
    const assistantMsg: Message = {
      id: assistantId, role: 'assistant', content: '',
      articles: [], assets: [], isStreaming: true,
    }

    // Read history from ref — safe to do outside setState
    const history = buildHistory(messagesRef.current)

    // Add both messages to state — no side effects inside the updater
    setMessages((prev) => [...prev, userMsg, assistantMsg])

    // Fire fetch outside setState to avoid StrictMode double-call
    void fetchResponse(query, history, assistantId)

    const chatId = ++chatIdRef.current
    setActiveChat(chatId)
    setChatHistory((prev) => [{ id: chatId, query }, ...prev.slice(0, 19)])
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
