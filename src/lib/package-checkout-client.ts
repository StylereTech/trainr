import { z } from 'zod'
import { packageCheckoutRequest, packageCheckoutResponse, savedPackageCheckout } from '@/lib/package-sales-schema'

export const PACKAGE_STORAGE_UNAVAILABLE = '!unavailable'
export const packageStorageKey = (buyerId: string, packageId: string) => `trainr:package-checkout:v1:${encodeURIComponent(buyerId)}:${encodeURIComponent(packageId)}`
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function readPackageRequest(store: Store, key: string) {
  try { const value = store.getItem(key); return value && value.length > 4096 ? PACKAGE_STORAGE_UNAVAILABLE : value }
  catch { return PACKAGE_STORAGE_UNAVAILABLE }
}
export function savePackageRequest(store: Store, key: string, value: z.infer<typeof savedPackageCheckout>) {
  const raw = JSON.stringify(savedPackageCheckout.parse(value))
  store.setItem(key, raw)
  if (store.getItem(key) !== raw) throw new Error('Checkout recovery could not be saved. No payment request was sent.')
}
export function clearPackageRequest(store: Store, key: string) {
  store.removeItem(key)
  if (store.getItem(key) !== null) throw new Error('Saved checkout could not be cleared. Review your purchases.')
}
export function parsePackageRequest(raw: string | null, packageId?: string) {
  if (raw === null) return null
  try {
    const value = savedPackageCheckout.parse(JSON.parse(raw))
    return value.request.packageId === packageId ? value : undefined
  } catch { return undefined }
}
export class PackageCheckoutClientError extends Error {
  constructor(message: string, public readonly offerChanged = false) { super(message) }
}
export async function requestPackageCheckout(input: z.infer<typeof packageCheckoutRequest>) {
  try {
    const response = await fetch('/api/package-purchases/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packageCheckoutRequest.parse(input)), signal: AbortSignal.timeout(15000), redirect: 'error' })
    const data: unknown = await response.json()
    if (!response.ok) {
      const error = z.object({ error: z.string().min(1).max(500), code: z.literal('OFFER_CHANGED').optional() }).strict().safeParse(data)
      throw new PackageCheckoutClientError(error.success ? error.data.error : 'Checkout could not be verified. Retry the saved request or review your purchases.',
        response.status === 409 && error.success && error.data.code === 'OFFER_CHANGED' && !('purchaseId' in input))
    }
    const result = packageCheckoutResponse.parse(data)
    if ('purchaseId' in input && result.purchaseId !== input.purchaseId) throw new Error('Checkout identity mismatch')
    return result
  } catch (error) {
    if (error instanceof PackageCheckoutClientError) throw error
    throw new PackageCheckoutClientError('Checkout could not be verified. Retry the saved request or review your purchases.')
  }
}
