import { NextResponse } from 'next/server'
import { getPublicTrainerBySlug } from '@/lib/trainer-detail'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const trainer = await getPublicTrainerBySlug(slug)

    if (!trainer) {
      return NextResponse.json({ error: 'Trainer not found' }, { status: 404 })
    }

    return NextResponse.json(trainer)
  } catch (error) {
    console.error('Trainer profile error:', error)
    return NextResponse.json({ error: 'Failed to fetch trainer' }, { status: 500 })
  }
}
