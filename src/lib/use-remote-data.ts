'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ZodType } from 'zod'

export function useRemoteData<T>(url: string, schema: ZodType<T>) {
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: string }>({ key: url, data: null, loading: true, error: '' })
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    const request = ++generation.current
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const timer = setTimeout(() => abort.abort(), 15000)
    setState({ key: url, data: null, loading: true, error: '' })
    try {
      const response = await fetch(url, { cache: 'no-store', signal: abort.signal })
      if (!response.ok) throw new Error('Request failed')
      const data = schema.parse(await response.json())
      if (generation.current !== request) return false
      setState({ key: url, data, loading: false, error: '' })
      return true
    } catch {
      if (generation.current === request) setState({ key: url, data: null, loading: false, error: 'Unable to load current data. Please retry.' })
      return false
    } finally { clearTimeout(timer) }
  }, [url, schema])
  const latestLoad = useRef(load)
  latestLoad.current = load
  const reload = useCallback(() => latestLoad.current(), [])
  const cancel = useCallback(() => { generation.current++; controller.current?.abort() }, [])
  useEffect(() => { void load(); return cancel }, [load, cancel])
  return { data: state.key === url ? state.data : null, loading: state.key !== url || state.loading, error: state.key === url ? state.error : '', reload }
}
