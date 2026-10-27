import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Add, EmojiHappy, SearchNormal1, Send2 } from 'iconsax-react'
import { useLookups, useStore } from '../store/Store'
import { Avatar, Card, Field, Modal, SearchInput } from '../components/ui'
import { cx, timeAgo } from '../lib/format'
import { ApiError } from '../lib/api'
import { C } from '../lib/theme'

/** Internal team messaging (persisted). Client communication is logged on leads/opportunities instead. */
export default function Messages() {
  const { db, me, sendMessage, create, attempt, toast } = useStore()
  const { userById } = useLookups()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [find, setFind] = useState('')
  const [showFind, setShowFind] = useState(false)
  const [newChat, setNewChat] = useState(false)
  const [draft, setDraft] = useState<{ name: string; memberIds: string[]; description: string }>({ name: '', memberIds: [], description: '' })
  const endRef = useRef<HTMLDivElement>(null)

  const convs = useMemo(() => db.conversations
    .filter((c) => c.memberIds.includes(me.id) || me.role === 'admin')
    .map((c) => ({ c, msgs: db.messages.filter((m) => m.conversationId === c.id) }))
    .filter(({ c }) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.msgs.at(-1)?.createdAt ?? b.c.createdAt).localeCompare(a.msgs.at(-1)?.createdAt ?? a.c.createdAt)), [db.conversations, db.messages, q, me])
  const activeId = params.get('c') ?? convs[0]?.c.id
  const active = convs.find((x) => x.c.id === activeId)
  const shown = active?.msgs.filter((m) => !find || m.body.toLowerCase().includes(find.toLowerCase())) ?? []
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [active?.msgs.length, activeId])

  const send = async () => {
    if (!text.trim() || !active) return
    setSending(true)
    try { await sendMessage(active.c.id, text.trim()); setText('') } catch (e) { toast(e instanceof ApiError ? e.message : 'Message not sent', 'danger') } finally { setSending(false) }
  }

  return (
    <Card className="grid min-h-[680px] grid-cols-1 overflow-hidden p-0 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_280px]">
      <div className="border-r border-line p-4">
        <div className="mb-4 flex items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search conversations" className="h-9 flex-1" />
          <button aria-label="New conversation" onClick={() => { setDraft({ name: '', memberIds: [me.id], description: '' }); setNewChat(true) }} className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-accent"><Add size={16} color={C.white} /></button>
        </div>
        <div className="scroll-thin -mx-2 flex max-h-[600px] flex-col overflow-y-auto">
          {convs.map(({ c, msgs }) => {
            const last = msgs.at(-1)
            return (
              <button key={c.id} onClick={() => setParams({ c: c.id })} className={cx('flex gap-3 border-b border-line px-3 py-3 text-left transition-colors', c.id === activeId ? 'bg-lavender-light' : 'hover:bg-canvas')}>
                <Avatar src={last?.userId ? userById.get(last.userId)?.avatar : null} name={c.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><span className="truncate text-[13px] font-medium">{c.name}</span><span className="whitespace-nowrap text-[11px] text-muted">{last ? timeAgo(last.createdAt) : ''}</span></div>
                  <p className="line-clamp-2 text-[11px] text-muted">{last ? `${last.userId === me.id ? 'You' : last.author.split(' ')[0]}: ${last.body}` : 'No messages yet'}</p>
                </div>
              </button>
            )
          })}
          {convs.length === 0 && <p className="p-4 text-[12px] text-muted">No conversations. Start one with the + button.</p>}
        </div>
      </div>

      {active ? (
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-3 border-b border-line px-5 py-3">
            <Avatar name={active.c.name} size={36} />
            <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{active.c.name}</p><p className="truncate text-[11px] text-muted">{active.c.memberIds.length} members</p></div>
            <button aria-label="Search in conversation" onClick={() => setShowFind((s) => !s)}><SearchNormal1 size={18} color={C.muted} /></button>
          </div>
          {showFind && <div className="border-b border-line px-5 py-2"><SearchInput value={find} onChange={setFind} placeholder="Find in conversation" /></div>}
          <div className="scroll-thin flex-1 space-y-4 overflow-y-auto bg-lavender-light/50 px-5 py-5" style={{ maxHeight: 540 }}>
            {shown.length === 0 && <p className="text-center text-[12px] text-muted">{find ? 'No messages match.' : 'No messages yet. Say hello.'}</p>}
            {shown.map((m) => {
              const mine = m.userId === me.id
              const u = m.userId ? userById.get(m.userId) : undefined
              return (
                <div key={m.id} className={cx('flex items-end gap-2', mine && 'flex-row-reverse')}>
                  <Avatar src={u?.avatar} name={m.author} size={26} />
                  <div className="max-w-[78%] rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
                    <div className="mb-1 flex justify-between gap-6 text-[11px]"><span className={mine ? 'text-lavender-ink' : 'text-sky-accent'}>{m.author}</span><span className="text-[11px] text-faint">{u?.title ?? ''}</span></div>
                    <p className="whitespace-pre-line text-[12px] leading-relaxed">{m.body}</p>
                    <p className="mt-1 text-right text-[11px] text-faint">{new Date(m.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
          <form className="flex items-center gap-3 border-t border-line px-5 py-3" onSubmit={(e) => { e.preventDefault(); void send() }}>
            <EmojiHappy size={20} color={C.faint} aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Message" maxLength={4000} className="h-10 flex-1 rounded-full bg-canvas px-4 text-[13px] outline-none" />
            <button type="submit" aria-label="Send" disabled={!text.trim() || sending} className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-accent disabled:opacity-40"><Send2 size={18} color={C.white} variant="Bold" /></button>
          </form>
        </div>
      ) : <div className="flex items-center justify-center p-10 text-[13px] text-muted">Select or start a conversation</div>}

      {active && (
        <aside className="hidden border-l border-line p-5 2xl:block">
          <h2 className="text-[13px] font-medium">Group info</h2>
          <p className="mt-4 text-[11px] text-muted">Description</p>
          <p className="mt-1 text-[12px] leading-relaxed">{active.c.description ?? 'No description.'}</p>
          <p className="mb-3 mt-5 text-[11px] text-muted">Members</p>
          <div className="flex flex-col gap-3">
            {active.c.memberIds.map((id) => userById.get(id)).filter(Boolean).map((u) => (
              <div key={u!.id} className="flex items-center gap-2"><Avatar src={u!.avatar} name={u!.name} size={26} /><span><span className="block text-[11px]">{u!.name}</span><span className="block text-[11px] text-muted">{u!.title}</span></span></div>
            ))}
          </div>
          <p className="mt-6 text-[11px] text-faint">Team chat is internal. Log client emails and calls on the lead or opportunity timeline.</p>
        </aside>
      )}

      <Modal open={newChat} onClose={() => setNewChat(false)} title="New conversation" width={460}
        footer={<><button className="btn-ghost" onClick={() => setNewChat(false)}>Cancel</button><button className="btn-primary" disabled={!draft.name.trim()} onClick={async () => {
          const c = await attempt(() => create('conversations', { ...draft, isGroup: true }, 'Conversation'))
          if (c) { setParams({ c: c.id }); setNewChat(false) }
        }}>Create</button></>}>
        <div className="space-y-4">
          <Field label="Name"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Northwind deal room" /></Field>
          <Field label="Description"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field label="Members">
            <div className="flex flex-wrap gap-2">
              {db.users.map((u) => {
                const on = draft.memberIds.includes(u.id)
                return <button type="button" key={u.id} onClick={() => setDraft({ ...draft, memberIds: on ? draft.memberIds.filter((x) => x !== u.id) : [...draft.memberIds, u.id] })} className={cx('rounded-full border px-3 py-1 text-[12px]', on ? 'border-sky-accent bg-sky-light' : 'border-line text-muted')}>{u.name}</button>
              })}
            </div>
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
