"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, UserCog, UserX } from 'lucide-react'

interface User {
  id: string
  email: string
  role: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  parentProfile: { id: string; _count: { athletes: number; bookings: number } } | null
  trainerProfile: { id: string; firstName: string; lastName: string; approvalStatus: string;
    sports: { sport: { name: string } }[]; _count: { bookings: number; reviews: number } } | null
}

export default function AdminUsers() {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [dialog, setDialog] = useState<{ user: User; action: 'change_role' | 'delete' } | null>(null)
  const [newRole, setNewRole] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [reason, setReason] = useState('')
  const requestId = useRef(0)
  const limit = 20

  const fetchUsers = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (roleFilter !== 'all') params.set('role', roleFilter)
      if (query) params.set('search', query)
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) throw new Error('Unable to load users.')
      const data = await res.json()
      if (!Array.isArray(data.users) || !Number.isInteger(data.pagination?.total) ||
          data.users.some((user: User) => typeof user.updatedAt !== 'string' || !Number.isFinite(Date.parse(user.updatedAt)))) throw new Error('Invalid user-list response.')
      if (id !== requestId.current) return
      setUsers(data.users)
      setTotal(data.pagination.total)
      setNeedsReload(false)
    } catch {
      if (id === requestId.current) { setError('Unable to load users. Retry to continue.'); setNeedsReload(true) }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [page, roleFilter, query])

  useEffect(() => { void fetchUsers(); return () => { requestId.current++ } }, [fetchUsers])
  const locked = loading || saving || needsReload
  const newTrainer = dialog?.action === 'change_role' && newRole === 'TRAINER' && !dialog.user.trainerProfile

  const submit = async () => {
    if (!dialog || locked) return
    setSaving(true)
    const data = { userId: dialog.user.id, revision: dialog.user.updatedAt, action: dialog.action,
      ...(dialog.action === 'delete' ? { reason: reason.trim() } : { role: newRole,
        ...(newTrainer ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}) }) }
    try {
      const response = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : 'Unable to confirm this change.'
        if ([401, 403, 404, 409].includes(response.status) || response.status >= 500) {
          setNeedsReload(true); setError(message); setDialog(null)
        } else toast({ title: 'Change not saved', description: message, variant: 'destructive' })
        return
      }
      setDialog(null)
      toast({ title: dialog.action === 'delete' ? 'Account deactivated' : 'Role updated' })
      await fetchUsers()
    } catch {
      setNeedsReload(true)
      setError('Unable to confirm this change. Reload the user list before trying again.')
      setDialog(null)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Button variant="outline" size="sm" onClick={() => void fetchUsers()} disabled={loading || saving}><RefreshCw className="mr-2 h-4 w-4" />Reload</Button>
      </header>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={event => {
        event.preventDefault()
        if (loading || saving) return
        setPage(1)
        if (query === search.trim() && page === 1) void fetchUsers()
        else setQuery(search.trim())
      }}>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input aria-label="Search users" placeholder="Email or trainer name" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={value => { setRoleFilter(value); setPage(1) }} disabled={saving}>
          <SelectTrigger aria-label="Filter by role" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="PARENT">Parents</SelectItem><SelectItem value="TRAINER">Trainers</SelectItem><SelectItem value="ADMIN">Admins</SelectItem></SelectContent>
        </Select>
        <Button type="submit" disabled={loading || saving}><Search className="mr-2 h-4 w-4" />Search</Button>
      </form>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 border-l-2 border-rose-400 bg-rose-500/10 p-3 text-sm text-rose-100">
        <span className="min-w-0 flex-1 break-words">{error}</span><Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void fetchUsers()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
      </div>}
      {loading ? <div role="status" className="flex justify-center py-10"><Loader2 aria-label="Loading users" className="h-6 w-6 animate-spin" /></div> :
        !error && users.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No users found</p> :
        <div className="divide-y divide-white/10 border-y border-white/10">
          {users.map(user => <div key={user.id} data-testid="user-row" className="flex min-w-0 flex-col gap-3 py-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-all text-sm font-medium">{user.email}</span><Badge variant="secondary">{user.role}</Badge>{user.deletedAt && <Badge variant="outline">Deactivated</Badge>}</div>
              <div className="mt-2 text-xs text-slate-400">
                Joined {new Date(user.createdAt).toLocaleDateString()}
                {user.parentProfile && ` | ${user.parentProfile._count.athletes} athletes | ${user.parentProfile._count.bookings} bookings`}
                {user.trainerProfile && ` | ${user.trainerProfile._count.bookings} trainer bookings`}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" disabled={locked || !!user.deletedAt} onClick={() => {
                setDialog({ user, action: 'change_role' }); setNewRole(user.role); setFirstName(''); setLastName('')
              }}><UserCog className="mr-2 h-4 w-4" />Change role</Button>
              <Button variant="outline" size="icon" className="h-9 w-9 text-rose-300" aria-label={`Deactivate ${user.email}`} title="Deactivate account" disabled={locked || !!user.deletedAt} onClick={() => {
                setDialog({ user, action: 'delete' }); setReason('')
              }}><UserX className="h-4 w-4" /></Button>
            </div>
          </div>)}
        </div>}
      <div className="flex items-center justify-between gap-2 text-sm text-slate-400">
        <span>{total} users</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" title="Previous page" aria-label="Previous page" disabled={loading || saving || page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {page} of {Math.max(1, Math.ceil(total / limit))}</span>
          <Button variant="outline" size="icon" title="Next page" aria-label="Next page" disabled={loading || saving || page >= Math.ceil(total / limit)} onClick={() => setPage(value => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <Dialog open={!!dialog} onOpenChange={open => { if (!open && !saving) setDialog(null) }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] border-white/10 bg-slate-950 text-white sm:max-w-md">
          <DialogHeader><DialogTitle>{dialog?.action === 'delete' ? 'Deactivate account' : 'Change role'}</DialogTitle></DialogHeader>
          <p className="break-all text-sm text-slate-300">{dialog?.user.email}</p>
          {dialog?.action === 'delete' ? <div className="space-y-3">
            <p className="text-sm text-slate-300">Account access will end and profile contact details will be anonymized. Booking, payment and audit records will be retained. Existing bookings and payments are not cancelled or refunded.</p>
            <Label htmlFor="deactivation-reason">Reason</Label>
            <Input id="deactivation-reason" value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} disabled={saving} />
          </div> : <div className="space-y-3">
            <Select value={newRole} onValueChange={setNewRole} disabled={saving}>
              <SelectTrigger aria-label="New role"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="PARENT">Parent</SelectItem><SelectItem value="TRAINER">Trainer</SelectItem><SelectItem value="ADMIN">Admin</SelectItem></SelectContent>
            </Select>
            {newTrainer && <div className="grid gap-3">
              <div><Label htmlFor="trainer-first">Trainer first name</Label><Input id="trainer-first" value={firstName} maxLength={50} disabled={saving} onChange={event => setFirstName(event.target.value)} /></div>
              <div><Label htmlFor="trainer-last">Trainer last name</Label><Input id="trainer-last" value={lastName} maxLength={50} disabled={saving} onChange={event => setLastName(event.target.value)} /></div>
            </div>}
          </div>}
          <Button onClick={() => void submit()} disabled={locked || (dialog?.action === 'delete' ? !reason.trim() : !newRole || newRole === dialog?.user.role || (!!newTrainer && (!firstName.trim() || !lastName.trim())))}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : dialog?.action === 'delete' ? <UserX className="mr-2 h-4 w-4" /> : <UserCog className="mr-2 h-4 w-4" />}
            {dialog?.action === 'delete' ? 'Deactivate account' : 'Update role'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
