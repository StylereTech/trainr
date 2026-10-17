"use client"

import { useEffect, useState } from 'react'
import { CheckCircle2, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bookingOutcomeTimeError, type BookingOutcomeTiming } from '@/lib/booking-outcome-time'

export function BookingOutcomeActions({ booking, disabled, allowNoShow = false, onAction }: {
  booking: BookingOutcomeTiming
  disabled: boolean
  allowNoShow?: boolean
  onAction: (action: 'complete' | 'no_show') => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  const completionError = bookingOutcomeTimeError(booking, 'complete', now)
  const noShowError = bookingOutcomeTimeError(booking, 'no_show', now)
  return <div className="flex max-w-full flex-col gap-2">
    <div className="flex flex-wrap gap-2">
      <span title={completionError || undefined}>
        <Button size="sm" className="gradient-primary border-0 text-white" disabled={disabled || !!completionError} onClick={() => onAction('complete')}><CheckCircle2 className="mr-1 h-3 w-3" />Complete</Button>
      </span>
      {allowNoShow && <span title={noShowError || undefined}>
        <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" disabled={disabled || !!noShowError} onClick={() => onAction('no_show')}><UserX className="mr-1 h-3 w-3" />No-show</Button>
      </span>}
    </div>
    {completionError && <p className="max-w-xs text-xs text-slate-400">{completionError}</p>}
  </div>
}
