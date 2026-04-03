"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Search, UserCog, Trash2, Sparkles, ShieldCheck } from 'lucide-react'

interface User {
  id: string
  email: string
  role: string
  image: string | null
  createdAt: string
  parentProfile: { id: string; _count: { athletes: number; bookings: number } } | null
  trainerProfile: {
    id: string
    firstName: string
    lastName: string
    approvalStatus: string
    sports: { sport: { name: string } }[]
    _count: { bookings: number; reviews: number }
  } | null
}

export default function AdminUsers() {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [roleDialogUser, setRoleDialogUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState('')
  const limit = 20

  const fetchUsers = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (roleFilter !== 'all') params.set('role', roleFilter)
    if (search) params.set('search', search)

    const res = await fetch(`/api/admin/users?${params}`)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
      setTotal(data.pagination.total)
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [page, roleFilter])

  const handleSearch = () => { setPage(1); fetchUsers() }

  const handleRoleChange = async () => {
    if (!roleDialogUser || !newRole) return
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: roleDialogUser.id, action: 'change_role', role: newRole }),
    })
    if (res.ok) {
      toast({ title: 'Role updated successfully' })
      setRoleDialogUser(null)
      fetchUsers()
    } else {
      const data = await res.json()
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete ${email}? This cannot be undone.`)) return
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'delete' }),
    })
    if (res.ok) {
      toast({ title: 'User deleted' })
      fetchUsers()
    } else {
      const data = await res.json()
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 md:p-7">
        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> User management</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Search, re-role, and audit users without dropping back to the old admin-lite UI.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">Filters, row density, and action controls were reworked for cleaner mobile stacking and stronger premium consistency.</p>
      </div>

      <Card className="border-white/10 bg-white/[0.04] text-white">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search by email or name..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="h-12 border-white/10 bg-slate-950/60 pl-10 text-white placeholder:text-slate-500" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-12 w-full border-white/10 bg-slate-950/60 text-white lg:w-44"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="PARENT">Parents</SelectItem>
                <SelectItem value="TRAINER">Trainers</SelectItem>
                <SelectItem value="ADMIN">Admins</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} className="gradient-primary h-12 border-0 text-white">Search</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></div>
      ) : users.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="py-10 text-center text-slate-400">No users found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id} className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/60 text-sm font-semibold text-white">
                  {user.trainerProfile ? `${user.trainerProfile.firstName[0]}${user.trainerProfile.lastName[0]}` : user.email[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-sm text-white">{user.email}</span>
                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>{user.role}</Badge>
                    {user.trainerProfile && <Badge className={user.trainerProfile.approvalStatus === 'APPROVED' ? 'bg-emerald-500/15 text-emerald-200' : user.trainerProfile.approvalStatus === 'PENDING' ? 'bg-amber-500/15 text-amber-200' : 'bg-rose-500/15 text-rose-200'}>{user.trainerProfile.approvalStatus}</Badge>}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-slate-400">
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                    {user.trainerProfile && <> • {user.trainerProfile.sports.map(s => s.sport.name).join(', ')} • {user.trainerProfile._count.bookings} bookings</>}
                    {user.parentProfile && <> • {user.parentProfile._count.athletes} athletes • {user.parentProfile._count.bookings} bookings</>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Dialog open={roleDialogUser?.id === user.id} onOpenChange={(open) => !open && setRoleDialogUser(null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => { setRoleDialogUser(user); setNewRole(user.role) }}>
                        <UserCog className="mr-1 h-3 w-3" /> Change role
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="border-white/10 bg-slate-950 text-white">
                      <DialogHeader><DialogTitle>Change Role for {user.email}</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-2">
                        <Select value={newRole} onValueChange={setNewRole}>
                          <SelectTrigger className="border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PARENT">Parent</SelectItem>
                            <SelectItem value="TRAINER">Trainer</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button onClick={handleRoleChange} className="gradient-primary w-full border-0 text-white">Update role</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => handleDelete(user.id, user.email)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      <Card className="border-white/10 bg-white/[0.04] text-white">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-emerald-300" /> User admin polish</CardTitle></CardHeader>
        <CardContent className="text-sm text-slate-300">Dense user rows now wrap better on mobile, preserve action clarity, and visually match the refreshed private Trainr shell.</CardContent>
      </Card>
    </div>
  )
}
