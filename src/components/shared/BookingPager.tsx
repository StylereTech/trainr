import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
export function BookingPager({ pagination, onPage }: { pagination: { page: number; totalPages: number; total: number }; onPage: (page: number) => void }) {
  return <nav aria-label="Booking pages" className="mt-4 flex items-center justify-center gap-3 text-sm">
    <Button variant="outline" size="icon" aria-label="Previous booking page" title="Previous booking page" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
    <span>Page {pagination.page} of {Math.max(1, pagination.totalPages)} ({pagination.total} bookings)</span>
    <Button variant="outline" size="icon" aria-label="Next booking page" title="Next booking page" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}><ChevronRight className="h-4 w-4" /></Button>
  </nav>
}
