"next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: string
      profileId: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string
    profileId: string | null
  }
}
