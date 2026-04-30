import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  collection, doc, addDoc, updateDoc, getDoc, onSnapshot,
  orderBy, query as fsQuery, limit, serverTimestamp,
} from 'firebase/firestore'
import { db, firebaseEnabled } from './firebase.ts'
import Sidebar from './components/Sidebar.tsx'
import ChatView from './components/ChatView.tsx'
import SourcesPanel from './components/SourcesPanel.tsx'
import type {
  Article, Asset, ChatHistoryItem, HistoryMessage, Message, SseEvent, StoredMessage,
} from './types.ts'

const API_BASE = '/api'
let msgId = 0
let localChatId = 0

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('un_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('un_device_id', id)
  }
  return id
}

function buildHistory(msgs: Message[]): HistoryMessage[] {
  return msgs
    .filter((m) => !m.isStreaming)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', content: m.content }))
}

export default function App() {
  // Per-chat message state: chatId → Message[]
  // Switching chats never clears this map, so streaming continues in background
  // and previously loaded chats are instantly available without re-fetching.
  const [chatMessages, setChatMessages] = useState<Map<string, Message[]>>(new Map())
  const [chatHistory, setChatHistory]   = useState<ChatHistoryItem[]>([])
  const [activeChat, setActiveChat]     = useState<string | null>(null)
  const [sourcesPanelOpen, setSourcesPanelOpen] = useState(false)

  // Stable ref so async callbacks see current map without stale closures
  const chatMessagesRef = useRef<Map<string, Message[]>>(new Map())
  useEffect(() => { chatMessagesRef.current = chatMessages }, [chatMessages])

  const currentChatIdRef = useRef<string | null>(null)
  const deviceId         = useMemo(getOrCreateDeviceId, [])

  // Messages for the currently viewed chat (empty array = show EmptyState)
  const messages = activeChat ? (chatMessages.get(activeChat) ?? []) : []

  function updateChatMessages(chatId: string, updater: (prev: Message[]) => Message[]) {
    setChatMessages((prev) => {
      const next = new Map(prev)
      next.set(chatId, updater(next.get(chatId) ?? []))
      return next
    })
  }

  // Real-time sidebar from Firestore
  useEffect(() => {
    if (!firebaseEnabled || !db) return
    const q = fsQuery(collection(db, 'chats'), orderBy('updatedAt', 'desc'), limit(30))
    return onSnapshot(q, (snap) => {
      const items: ChatHistoryItem[] = snap.docs
        .filter((d) => d.data().deviceId === deviceId)
        .map((d) => ({ id: d.id, query: d.data().title as string }))
      setChatHistory(items)
    })
  }, [deviceId])

  // Close sources panel when the active chat starts streaming
  useEffect(() => {
    if (messages.some((m) => m.isStreaming)) setSourcesPanelOpen(false)
  }, [messages])

  const sendMessage = useCallback(async (query: string) => {
    const userMsg: Message = {
      id: ++msgId, role: 'user', content: query,
      articles: [], assets: [], isStreaming: false,
    }
    const assistantId = ++msgId

    // Capture history BEFORE adding new messages to this chat
    let chatId = currentChatIdRef.current
    const history = buildHistory(chatMessagesRef.current.get(chatId ?? '') ?? [])

    // Create Firestore doc for new chat (or fall back to local ID)
    if (!chatId) {
      if (firebaseEnabled && db) {
        const ref = await addDoc(collection(db, 'chats'), {
          deviceId,
          title: query,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          messages: [],
        })
        chatId = ref.id
      } else {
        chatId = `local-${++localChatId}`
        setChatHistory((prev) => [{ id: chatId!, query }, ...prev.slice(0, 19)])
      }
      currentChatIdRef.current = chatId
      setActiveChat(chatId)
    }

    updateChatMessages(chatId, (prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', articles: [], assets: [], isStreaming: true },
    ])

    void fetchResponse(query, history, assistantId, chatId, userMsg)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  async function fetchResponse(
    _query: string,
    history: HistoryMessage[],
    assistantId: number,
    chatId: string,
    userMsg: Message,
  ) {
    let assistantContent = ''
    let finalArticles: Article[] = []
    let finalAssets: Asset[]    = []

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: _query, history }),
      })

      if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`)
      if (!res.body) throw new Error('No response body')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

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
            updateChatMessages(chatId, (prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                const cleaned = m.content
                  .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
                  .trimStart()
                return { ...m, content: cleaned, isStreaming: false }
              })
            )
            assistantContent = assistantContent
              .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
              .trimStart()
            continue
          }

          let event: SseEvent
          try { event = JSON.parse(raw) as SseEvent } catch { continue }

          if (event.type === 'token') {
            assistantContent += event.content
            updateChatMessages(chatId, (prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.content } : m
              )
            )
          } else if (event.type === 'sources') {
            finalArticles = event.articles as Article[]
            finalAssets   = event.assets   as Asset[]
            updateChatMessages(chatId, (prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, articles: finalArticles, assets: finalAssets }
                  : m
              )
            )
          } else if (event.type === 'error') {
            updateChatMessages(chatId, (prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Error: ${event.message}`, isStreaming: false }
                  : m
              )
            )
          }
        }
      }

      // Persist full conversation to Firestore
      if (firebaseEnabled && db) {
        const allChatMsgs = chatMessagesRef.current.get(chatId) ?? []
        const historicMsgs: StoredMessage[] = allChatMsgs
          .filter((m) => m.id !== userMsg.id && m.id !== assistantId)
          .map(({ isStreaming: _, ...rest }) => rest)

        const allMessages: StoredMessage[] = [
          ...historicMsgs,
          { id: userMsg.id, role: 'user',      content: _query,           articles: [], assets: [] },
          { id: assistantId, role: 'assistant', content: assistantContent, articles: finalArticles, assets: finalAssets },
        ]

        await updateDoc(doc(db, 'chats', chatId), {
          updatedAt: serverTimestamp(),
          messages: allMessages,
        })
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      updateChatMessages(chatId, (prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${msg}`, isStreaming: false } : m
        )
      )
    }
  }

  function handleNewChat() {
    currentChatIdRef.current = null
    // Don't wipe chatMessages — switching back to a previous chat stays instant
    setActiveChat(null)
    setSourcesPanelOpen(false)
  }

  async function handleSelectChat(id: string) {
    // Only fetch from Firestore if we haven't loaded this chat yet
    if (!chatMessagesRef.current.has(id)) {
      if (firebaseEnabled && db) {
        const snap = await getDoc(doc(db, 'chats', id))
        if (!snap.exists()) return
        const stored = (snap.data().messages ?? []) as StoredMessage[]
        setChatMessages((prev) => {
          if (prev.has(id)) return prev  // loaded by another call while awaiting
          const next = new Map(prev)
          next.set(id, stored.map((m) => ({ ...m, isStreaming: false })))
          return next
        })
      }
    }
    currentChatIdRef.current = id
    setActiveChat(id)
    setSourcesPanelOpen(false)
  }

  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const panelArticles   = latestAssistant?.articles ?? []
  const latestQuery     = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  // Which chats are currently streaming (so the sidebar can show a pulse indicator)
  const streamingChatIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [chatId, msgs] of chatMessages) {
      if (msgs.some((m) => m.isStreaming)) ids.add(chatId)
    }
    return ids
  }, [chatMessages])

  return (
    <div className="layout">
      <Sidebar
        chatHistory={chatHistory}
        activeChat={activeChat}
        streamingChatIds={streamingChatIds}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
      />
      <ChatView
        messages={messages}
        onSend={sendMessage}
        sourcesPanelOpen={sourcesPanelOpen}
        onToggleSources={() => setSourcesPanelOpen((v) => !v)}
      />
      {sourcesPanelOpen && (
        <SourcesPanel
          articles={panelArticles}
          query={latestQuery}
          onClose={() => setSourcesPanelOpen(false)}
        />
      )}
    </div>
  )
}
