"use client"

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { StarRating } from '@/components/shared/StarRating'
import { CheckCircle2, ChevronLeft, Loader2, MessageSquareQuote, ShieldCheck, Sparkles, Star } from 'lucide-react'

const prompts = [
  'What did the trainer do especially well?',
  'Did your athlete feel more confident after the session?',
  'Anything another parent should know before booking?',
]

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const bookingId = params.bookingId as string
  const [loading, setLoading] = useState(false)
  const [overallRating, setOverallRating] = useState(0)
  const [knowledgeRating, setKnowledgeRating] = useState(0)
  const [communicationRating, setCommunicationRating] = useState(0)
  const [punctualityRating, setPunctualityRating] = useState(0)
  const [comment, setComment] = useState('')

  const ratings = useMemo(
    () => [
      { label: 'Overall experience', value: overallRating, setter: setOverallRating, help: 'How did the full session feel from start to finish?' },
      { label: 'Knowledge & expertise', value: knowledgeRating, setter: setKnowledgeRating, help: 'Rate coaching quality, instruction, and understanding of the sport.' },
      { label: 'Communication', value: communicationRating, setter: setCommunicationRating, help: 'Was the trainer clear, supportive, and parent-friendly?' },
      { label: 'Punctuality', value: punctualityRating, setter: setPunctualityRating, help: 'Did the trainer show up and operate on time?' },
    ],
    [overallRating, knowledgeRating, communicationRating, punctualityRating]
  )

  const completionCount = ratings.filter((item) => item.value > 0).length

  const handleSubmit = async () => {
    if (ratings.some((item) => item.value === 0)) {
      toast({ title: 'Please rate all categories', description: 'Complete every score so families see a balanced review.', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/reviews/${bookingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: overallRating,
          knowledgeRating,
          communicationRating,
          punctualityRating,
          comment: comment || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast({ title: 'Review not submitted', description: data.error || 'Please try again.', variant: 'destructive' })
        return
      }

      toast({ title: 'Review submitted', description: 'Thanks — your feedback helps other families book with more confidence.' })
      router.push('/parent/dashboard')
    } catch {
      toast({ title: 'Review not submitted', description: 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 text-white">
      <div className="container max-w-5xl">
        <button onClick={() => router.back()} className="inline-flex items-center text-sm text-slate-400 hover:text-white">
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </button>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
              <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Parent feedback
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Rate your session with confidence.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                A strong review helps other families understand coaching quality, professionalism, and whether a trainer feels worth booking again.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Scores completed', value: `${completionCount}/4`, note: 'all categories required' },
                  { label: 'Review status', value: completionCount === 4 ? 'Ready' : 'In progress', note: 'submit when all ratings are set' },
                  { label: 'Trust impact', value: 'High', note: 'better parent decision-making' },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <Card className="mt-6 border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><ShieldCheck className="h-4 w-4" /> What makes a helpful review</div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">Be specific about coaching quality, not just whether your child liked the session.</div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">Mention communication, energy, and whether the trainer met your expectations.</div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">Keep it honest, family-safe, and useful for the next parent deciding to book.</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><Star className="h-4 w-4 text-emerald-300" /> Session rating</div>
                <div className="mt-5 space-y-6">
                  {ratings.map((item) => (
                    <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4">
                      <Label className="text-sm font-medium text-white">{item.label}</Label>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{item.help}</p>
                      <div className="mt-3">
                        <StarRating rating={item.value} size={item.label === 'Overall experience' ? 'lg' : 'md'} interactive onRatingChange={item.setter} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><MessageSquareQuote className="h-4 w-4 text-emerald-300" /> Written feedback</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {prompts.map((prompt) => (
                    <span key={prompt} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-300">{prompt}</span>
                  ))}
                </div>
                <div className="mt-4">
                  <Label htmlFor="comment" className="text-sm font-medium text-white">Comments (optional)</Label>
                  <Textarea
                    id="comment"
                    placeholder="Share what stood out about the trainer, session quality, communication, and your athlete's experience."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={500}
                    className="mt-2 border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500"
                    rows={6}
                  />
                  <div className="mt-2 text-right text-xs text-slate-500">{comment.length}/500</div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => router.back()}>
                Skip for now
              </Button>
              <Button className="gradient-primary flex-1 border-0 text-white" onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Submit review</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
