import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), push: vi.fn(), refresh: vi.fn(), state: vi.fn(), toast: vi.fn() }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useState: (initial: unknown) => [initial, mocks.state] }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('next-auth/react', () => ({ signIn: mocks.signIn }))
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }))
import SignInForm from '@/app/auth/signin/signin-form'

function findForm(node: ReactNode): ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => Promise<void> }> | undefined {
  if (Array.isArray(node)) return node.map(findForm).find(Boolean)
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined
  if (node.type === 'form') return node as ReturnType<typeof findForm>
  return findForm(node.props.children)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  mocks.signIn.mockResolvedValue({ ok: true, error: null })
})
afterEach(() => vi.unstubAllGlobals())

async function submit() {
  const form = findForm(SignInForm())
  expect(form).toBeDefined()
  await form!.props.onSubmit({ preventDefault: vi.fn() })
}

it.each([
  ['empty', {}],
  ['null', null],
  ['missing id', { user: { role: 'PARENT' } }],
  ['empty id', { user: { id: '', role: 'PARENT' } }],
  ['non-string id', { user: { id: 42, role: 'PARENT' } }],
  ['unknown role', { user: { id: 'synthetic', role: 'UNKNOWN' } }],
])('does not navigate for a %s session', async (_name, session) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(session)))
  await submit()
  expect(mocks.push).not.toHaveBeenCalled()
  expect(mocks.refresh).not.toHaveBeenCalled()
  expect(mocks.state).toHaveBeenCalledWith(expect.stringContaining('session'))
  expect(mocks.state).toHaveBeenLastCalledWith(false)
})

it.each([undefined, { ok: false }, { ok: false, error: 'CredentialsSignin' }, { ok: true, error: 'CredentialsSignin' }])('rejects an unsuccessful sign-in result: %j', async result => {
  mocks.signIn.mockResolvedValue(result)
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await submit()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(mocks.push).not.toHaveBeenCalled()
  expect(mocks.state).toHaveBeenCalledWith(expect.stringContaining('Sign-in unavailable'))
})

it.each(['PARENT', 'TRAINER', 'ADMIN'])('routes a verified %s session', async role => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ user: { id: 'synthetic', role } })))
  await submit()
  expect(mocks.push).toHaveBeenCalledWith(role === 'ADMIN' ? '/admin' : `/${role.toLowerCase()}/dashboard`)
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
})

it.each(['http', 'json', 'network'])('keeps the form usable after a session %s failure', async failure => {
  vi.stubGlobal('fetch', failure === 'network' ? vi.fn().mockRejectedValue(new Error('Synthetic outage'))
    : vi.fn().mockResolvedValue(failure === 'http' ? Response.json({}, { status: 503 }) : new Response('invalid json')))
  await submit()
  expect(mocks.push).not.toHaveBeenCalled()
  expect(mocks.state).toHaveBeenCalledWith(expect.stringContaining('session'))
  expect(mocks.state).toHaveBeenLastCalledWith(false)
})
