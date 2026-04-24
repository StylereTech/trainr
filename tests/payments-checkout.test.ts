import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCheckoutCreate = vi.fn()

const mockPrisma = {
  booking: {
    findUnique: vi.fn(),
  },
  payment: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}

vi.mock('@/lib/auth', () => ({
  getRequestUser: vi.fn().mockResolvedValue({
    id: 'parent-user-1',
    email: 'parent@example.com',
    role: 'PARENT',
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

vi.mock('@/lib/app-url', () => ({
  toAbsoluteAppUrl: (path: string) => `http://localhost:3000${path}`,
}))

vi.mock('@/lib/stripe', () => ({
  stripeRuntimeStatus: () => ({ secretConfigured: true }),
  mapStripeError: (error: any, fallback: string) => ({
    message: error?.message || fallback,
    detail: undefined,
    status: 500,
  }),
  stripe: {
    checkout: {
      sessions: {
        create: mockCheckoutCreate,
        retrieve: vi.fn(),
        expire: vi.fn(),
      },
    },
  },
}))

describe('Payments checkout API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a Stripe checkout session for a pending booking from the booking flow', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({
      id: 'booking-1',
      status: 'PENDING',
      totalAmountInCents: 7300,
      platformFeeInCents: 1095,
      trainerPayoutInCents: 6205,
      parentProfile: { id: 'parent-profile-1', userId: 'parent-user-1' },
      trainerProfile: {
        id: 'trainer-profile-1',
        firstName: 'Marcus',
        lastName: 'Johnson',
        stripeAccountId: 'acct_ready',
        stripeOnboardingComplete: true,
      },
      serviceOffering: { id: 'service-1', title: 'Private football Session' },
      athleteProfile: { id: 'athlete-1' },
      payment: null,
      date: new Date('2026-04-27T00:00:00.000Z'),
      startTime: '09:00',
    })
    mockPrisma.payment.create.mockResolvedValue({
      id: 'payment-1',
      status: 'PENDING',
    })
    mockCheckoutCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    })
    mockPrisma.payment.update.mockResolvedValue({
      id: 'payment-1',
      stripeCheckoutSessionId: 'cs_test_123',
    })

    const { POST } = await import('@/app/api/payments/checkout/route')
    const response = await POST(
      new Request('http://localhost:3000/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ bookingId: 'booking-1' }),
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      paymentId: 'payment-1',
    })
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_intent_data: expect.objectContaining({
          application_fee_amount: 1095,
          transfer_data: { destination: 'acct_ready' },
        }),
      })
    )
  })
})
