"use client"

import { useEffect, useId, useState } from 'react'
import { Label } from '@/components/ui/label'

const fallbackZones = ['UTC', 'America/Anchorage', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/New_York', 'America/Phoenix', 'Pacific/Honolulu']

export function ScheduleTimeZoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  const [zones, setZones] = useState(fallbackZones)
  useEffect(() => {
    if (typeof Intl.supportedValuesOf === 'function') setZones(['UTC', ...Intl.supportedValuesOf('timeZone')])
  }, [])
  const options = Array.from(new Set([...zones, ...(value ? [value] : [])])).sort()
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>Schedule time zone *</Label>
      <select id={id} required value={value} onChange={event => onChange(event.target.value)}
        className="h-10 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="" disabled>Choose time zone</option>
        {options.map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
      </select>
    </div>
  )
}
