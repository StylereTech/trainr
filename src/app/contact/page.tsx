"use client"

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Mail, MapPin, MessageSquare, Send, ShieldCheck } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function ContactPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', subject: '', message: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1000))
    toast({ title: 'Message sent!', description: 'We\'ll get back to you within 24 hours.' })
    setForm({ name: '', email: '', subject: '', message: '' })
    setLoading(false)
  }

  return (
    <div className="bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_42%),linear-gradient(180deg,_#04130b_0%,_#08131f_100%)] py-16 md:py-20">
        <div className="container grid items-center gap-10 lg:grid-cols-[1fr_.9fr]">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">Contact Trainr</div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Get in touch with the team behind the platform.</h1>
            <p className="mt-5 text-lg text-slate-300">Questions about bookings, trainer approvals, safety, payments, or partnerships? Send us the details and we’ll route it cleanly.</p>
          </div>
          <div className="flex items-center justify-center rounded-[2rem] border border-white/10 bg-slate-900/80 p-12 shadow-2xl">
            <Image src="/brand/trainr-shield-logo.jpg" alt="Trainr" width={200} height={200} className="h-32 w-32 rounded-2xl md:h-48 md:w-48" />
          </div>
        </div>
      </section>

      <section className="bg-white py-16 text-slate-950">
        <div className="container grid gap-8 md:grid-cols-[.8fr_1.2fr]">
          <div className="space-y-4">
            {[
              { icon: Mail, title: 'Email', value: 'support@trainr.app' },
              { icon: MessageSquare, title: 'Live Chat', value: 'Mon–Fri, 9am–6pm CT' },
              { icon: MapPin, title: 'Headquarters', value: 'Dallas, TX' },
            ].map((item) => (
              <Card key={item.title} className="border-slate-200 shadow-sm">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary text-white">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.value}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-slate-200 shadow-xl">
            <CardContent className="p-6 md:p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="h-12" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v })}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Select a topic" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Question</SelectItem>
                      <SelectItem value="trainer">Trainer Inquiry</SelectItem>
                      <SelectItem value="billing">Billing & Payments</SelectItem>
                      <SelectItem value="safety">Safety Concern</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required className="min-h-[160px]" />
                </div>
                <Button type="submit" className="gradient-primary border-0 text-white" disabled={loading}>
                  <Send className="mr-2 h-4 w-4" />
                  {loading ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
