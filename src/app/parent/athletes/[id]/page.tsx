import Link from 'next/link'
import { AthleteEditor } from '@/components/shared/AthleteEditor'

export default async function EditAthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <div className="mx-auto w-full max-w-3xl px-4 py-8 text-white"><Link href="/parent/dashboard" className="text-sm text-sky-300 underline">Back to dashboard</Link><h1 className="mb-6 mt-4 text-2xl font-semibold">Edit athlete</h1><AthleteEditor athleteId={id} /></div>
}
