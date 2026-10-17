import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ auth: vi.fn(), trainer: vi.fn(), findThread: vi.fn(), createThread: vi.fn(),
  message: vi.fn(), updateThread: vi.fn(), notification: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: mock.auth, authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  trainerProfile: { findFirst: mock.trainer },
  messageThread: { findFirst: mock.findThread, create: mock.createThread, update: mock.updateThread },
  message: { create: mock.message }, notification: { create: mock.notification },
} }))
import { POST } from '@/app/api/messages/route'
const post = (body: unknown) => POST(new Request('http://localhost/api/messages', { method: 'POST', body: JSON.stringify(body) }) as never)
beforeEach(() => {
  vi.resetAllMocks()
  mock.auth.mockResolvedValue({ user: { id: 'parent-user', role: 'PARENT' } })
  mock.trainer.mockResolvedValue({ userId: 'trainer-user' })
  mock.findThread.mockResolvedValueOnce(null).mockResolvedValue({ id: 'thread', participantAId: 'parent-user', participantBId: 'trainer-user' })
  mock.createThread.mockResolvedValue({ id: 'thread' })
  mock.message.mockResolvedValue({ id: 'message', threadId: 'thread', content: 'Hello' })
})
it('resolves an approved active trainer profile to its owning user before creating the conversation', async () => {
  const response = await post({ content: ' Hello ', trainerProfileId: 'trainer-profile' })
  expect(response.status).toBe(201)
  expect(mock.trainer).toHaveBeenCalledWith({ where: { id: 'trainer-profile', isActive: true, approvalStatus: 'APPROVED', user: { role: 'TRAINER', deletedAt: null } }, select: { userId: true } })
  expect(mock.createThread).toHaveBeenCalledWith({ data: { participantAId: 'parent-user', participantBId: 'trainer-user' } })
  expect(mock.message).toHaveBeenCalledWith(expect.objectContaining({ data: { threadId: 'thread', senderId: 'parent-user', content: 'Hello' } }))
  expect(mock.notification).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'trainer-user' }) }))
})
it('rejects unavailable trainer profiles without creating anything', async () => {
  mock.trainer.mockResolvedValue(null)
  expect((await post({ content: 'Hello', trainerProfileId: 'missing' })).status).toBe(404)
  expect(mock.createThread).not.toHaveBeenCalled(); expect(mock.message).not.toHaveBeenCalled()
})
it('requires a signed-in account before looking up a recipient', async () => {
  mock.auth.mockResolvedValue(null)
  expect((await post({ content: 'Hello', trainerProfileId: 'trainer-profile' })).status).toBe(401)
  expect(mock.trainer).not.toHaveBeenCalled()
})
it.each([
  { content: 'Hello' }, { content: '  ', trainerProfileId: 'trainer-profile' },
  { content: 'Hello', trainerProfileId: '' },
  { content: 'Hello', trainerProfileId: 'trainer-profile', recipientId: 'another-user' },
  { content: 'Hello', trainerProfileId: 'trainer-profile', threadId: 'thread' },
])('rejects an invalid or ambiguous destination: %j', async body => {
  expect((await post(body)).status).toBe(400)
  expect(mock.createThread).not.toHaveBeenCalled(); expect(mock.message).not.toHaveBeenCalled()
})
it('preserves direct user-id addressing for existing callers', async () => {
  expect((await post({ content: 'Hello', recipientId: 'trainer-user' })).status).toBe(201)
  expect(mock.trainer).not.toHaveBeenCalled()
  expect(mock.createThread).toHaveBeenCalledWith({ data: { participantAId: 'parent-user', participantBId: 'trainer-user' } })
})
it('does not allow sending to yourself through a trainer profile', async () => {
  mock.trainer.mockResolvedValue({ userId: 'parent-user' })
  expect((await post({ content: 'Hello', trainerProfileId: 'trainer-profile' })).status).toBe(400)
  expect(mock.createThread).not.toHaveBeenCalled()
})
it('retains thread membership checks for replies', async () => {
  mock.findThread.mockReset().mockResolvedValue(null)
  expect((await post({ content: 'Hello', threadId: 'someone-elses-thread' })).status).toBe(404)
  expect(mock.message).not.toHaveBeenCalled(); expect(mock.trainer).not.toHaveBeenCalled()
})
