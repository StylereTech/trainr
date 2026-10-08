import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { TrainerEditConflict } from '@/lib/trainer-services'

export const trainerCertificationSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  name: z.string().trim().min(1).max(200),
  issuingOrg: z.string().trim().max(200).optional(),
  credentialId: z.string().trim().max(200).optional(),
}).strict()

export function certificationForEditor(cert: { id: string; name: string; issuingOrg: string | null; credentialId: string | null; isVerified: boolean }) {
  return { id: cert.id, name: cert.name, issuingOrg: cert.issuingOrg || '', credentialId: cert.credentialId || '', isVerified: cert.isVerified }
}

// Caller holds the trainer row lock and validates the profile edit revision.
export async function saveTrainerCertifications(tx: Prisma.TransactionClient, trainerId: string, input: z.infer<typeof trainerCertificationSchema>[] | undefined) {
  const existing = await tx.certification.findMany({ where: { trainerProfileId: trainerId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  if (input === undefined) return existing.map(certificationForEditor)
  const byId = new Map(existing.map((cert) => [cert.id, cert]))
  const ids = input.flatMap((cert) => cert.id ? [cert.id] : [])
  if (new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
    throw new TrainerEditConflict('Certification identity changed or is not owned by this trainer. Reload before saving.')
  }
  const saved = []
  for (const cert of input) {
    const previous = cert.id ? byId.get(cert.id) : undefined
    const data = { name: cert.name, issuingOrg: cert.issuingOrg ?? previous?.issuingOrg ?? null,
      credentialId: cert.credentialId ?? previous?.credentialId ?? null }
    const changed = previous && (data.name !== previous.name || (data.issuingOrg || '') !== (previous.issuingOrg || '') ||
      (data.credentialId || '') !== (previous.credentialId || ''))
    if (previous) {
      saved.push(changed ? await tx.certification.update({ where: { id: previous.id }, data: { ...data, isVerified: false } }) : previous)
    } else {
      // Old clients must not accidentally replace an existing verified credential without its ID.
      if (existing.some((row) => row.name === data.name && (row.issuingOrg || '') === (data.issuingOrg || ''))) {
        throw new TrainerEditConflict('Existing certification IDs are required. Reload before saving.')
      }
      saved.push(await tx.certification.create({ data: { ...data, trainerProfileId: trainerId, isVerified: false } }))
    }
  }
  const removed = existing.filter((cert) => !ids.includes(cert.id)).map((cert) => cert.id)
  if (removed.length) await tx.certification.deleteMany({ where: { trainerProfileId: trainerId, id: { in: removed } } })
  return saved.map(certificationForEditor)
}
