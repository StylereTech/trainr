"use client"

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Send, MessageSquare, Loader2, ArrowLeft, Sparkles, ShieldCheck, Clock3, CheckCheck } from 'lucide-react'

interface Message {
  id: string
  content: string
  createdAt: string
  senderId: string
  sender: { id: string; email: string }
  readAt: string | null
}

interface Thread {
  id: string
  participantA: { id: string; email: string }
  participantB: { id: string; email: string }
  lastMessageAt: string
  messages?: Message[]
  _count?: { messages: number }
}

function MessagesContent() {
  const searchParams = useSearchParams()
  const toParam = searchParams.get('to')

  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThread, setActiveThread] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/messages')
      .then((r) => r.json())
      .then((data) => {
        setThreads(data.threads || [])
        if (data.currentUserId) setCurrentUserId(data.currentUserId)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (activeThread) {
      fetch(`/api/messages?threadId=${activeThread}`)
        .then((r) => r.json())
        .then((data) => {
          setMessages(data.messages || [])
          if (data.currentUserId) setCurrentUserId(data.currentUserId)
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        })
        .catch(console.error)
    }
  }, [activeThread])

  const activeThreadData = threads.find((thread) => thread.id === activeThread)
  const otherParticipant = activeThreadData && currentUserId
    ? (activeThreadData.participantA.id === currentUserId ? activeThreadData.participantB : activeThreadData.participantA)
    : null

  const handleSend = async () => {
    if (!newMessage.trim()) return
    setSending(true)
    try {
      const body: { content: string; threadId?: string; recipientId?: string } = { content: newMessage.trim() }
      if (activeThread) body.threadId = activeThread
      else if (toParam) body.recipientId = toParam

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const msg = await res.json()

      if (!res.ok) {
        console.error(msg)
        return
      }

      if (!activeThread && msg.threadId) {
        setActiveThread(msg.threadId)
      }

      setMessages((prev) => [...prev, msg])
      setNewMessage('')
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="container max-w-6xl py-8">
        <div className="mb-6 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_36%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 md:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs uppercase tracking-[0.22em] text-slate-200"><Sparkles className="h-4 w-4 text-emerald-300" /> Messaging hub</div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Keep trainer and parent communication inside one calmer thread.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">This surface now behaves more like a finished premium inbox, with better thread context, clearer unread cues, and message bubbles that correctly distinguish both sides of the conversation.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Open threads', value: threads.length.toString(), note: 'active conversations' },
              { label: 'Unread now', value: threads.reduce((sum, thread) => sum + (thread._count?.messages || 0), 0).toString(), note: 'messages from the other side' },
              { label: 'Start point', value: toParam ? 'Direct' : 'Inbox', note: toParam ? 'opened from a trainer profile or booking flow' : 'browse all existing threads' },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
                <div className="mt-1 text-xs text-slate-400">{item.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid h-[calc(100vh-18rem)] gap-4 md:grid-cols-[340px_1fr]">
          <Card className={`border-white/10 bg-white/[0.04] text-white ${activeThread ? 'hidden md:block' : ''}`}>
            <CardContent className="flex h-full flex-col p-0">
              <div className="border-b border-white/10 p-4">
                <div className="text-sm font-semibold text-white">Conversations</div>
                <p className="mt-1 text-xs text-slate-400">Switch between parent and trainer threads without leaving the premium shell.</p>
              </div>

              <div className="flex-1 divide-y divide-white/10 overflow-y-auto">
                {threads.length === 0 && !toParam ? (
                  <div className="p-8 text-center text-slate-400">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm">No conversations yet.</p>
                  </div>
                ) : (
                  threads.map((thread) => {
                    const other = currentUserId && thread.participantA.id === currentUserId ? thread.participantB : thread.participantA
                    const lastMsg = thread.messages?.[0]
                    const unreadCount = thread._count?.messages || 0
                    return (
                      <button key={thread.id} onClick={() => setActiveThread(thread.id)} className={`w-full p-4 text-left transition-colors hover:bg-white/[0.04] ${activeThread === thread.id ? 'bg-emerald-400/10' : ''}`}>
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-white/10 text-white">{(other?.email || 'U')[0].toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate text-sm font-medium text-white">{other?.email?.split('@')[0] || 'Conversation'}</div>
                              {unreadCount > 0 && <Badge className="border-0 bg-emerald-500 text-white hover:bg-emerald-500">{unreadCount}</Badge>}
                            </div>
                            {lastMsg && <div className="mt-1 truncate text-xs text-slate-400">{lastMsg.content}</div>}
                            <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500"><Clock3 className="h-3 w-3" /> {new Date(thread.lastMessageAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}

                {toParam && threads.length === 0 && (
                  <div className="p-4 text-sm text-slate-400">New conversation ready to start.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={`border-white/10 bg-white/[0.04] text-white ${!activeThread && !toParam ? 'hidden md:flex' : 'flex'} flex-col`}>
            {activeThread || toParam ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white md:hidden" onClick={() => setActiveThread(null)}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-white/10 text-white">{(otherParticipant?.email || 'N')[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-white">{otherParticipant?.email?.split('@')[0] || 'New conversation'}</div>
                      <div className="text-xs text-slate-400">Secure in-app messaging for scheduling, prep notes, and follow-up.</div>
                    </div>
                  </div>
                  <div className="hidden rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-300 sm:inline-flex sm:items-center sm:gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> In-app thread
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4 md:p-5">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/45 p-8 text-center text-sm text-slate-400">
                      Send the first message to kick off scheduling, questions, or session prep.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = currentUserId ? msg.senderId === currentUserId : false
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[86%] rounded-2xl p-3 text-sm md:max-w-[72%] ${isMe ? 'gradient-primary rounded-br-sm text-white' : 'rounded-bl-sm bg-slate-900 text-slate-100'}`}>
                            <div className="leading-6">{msg.content}</div>
                            <div className={`mt-2 flex items-center gap-1 text-[11px] ${isMe ? 'justify-end text-emerald-100' : 'text-slate-400'}`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {isMe && <CheckCheck className="h-3.5 w-3.5" />}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-white/10 p-4">
                  <form onSubmit={(e) => { e.preventDefault(); handleSend() }} className="space-y-3">
                    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-3 text-xs text-slate-400">
                      Keep it useful: confirm timing, athlete goals, field/court details, or anything the other side should know before session day.
                    </div>
                    <div className="flex gap-2">
                      <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." className="flex-1 border-white/10 bg-slate-900 text-white placeholder:text-slate-500" />
                      <Button type="submit" className="gradient-primary border-0 text-white" disabled={sending || !newMessage.trim()}>
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-slate-400">
                <div className="text-center">
                  <MessageSquare className="mx-auto mb-3 h-12 w-12" />
                  <p>Select a conversation to start messaging.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <MessagesContent />
    </Suspense>
  )
}
