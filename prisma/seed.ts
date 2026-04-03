import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SALT_ROUNDS = 10

async function main() {
  console.log('🌱 Seeding database...')

  // Clean existing data (order matters due to foreign keys)
  await prisma.message.deleteMany()
  await prisma.messageThread.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.review.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.booking.deleteMany()
  await prisma.favorite.deleteMany()
  await prisma.packageItem.deleteMany()
  await prisma.package.deleteMany()
  await prisma.serviceOffering.deleteMany()
  await prisma.availabilitySlot.deleteMany()
  await prisma.certification.deleteMany()
  await prisma.uploadedAsset.deleteMany()
  await prisma.athleteSport.deleteMany()
  await prisma.athleteProfile.deleteMany()
  await prisma.trainerSpecialty.deleteMany()
  await prisma.trainerSport.deleteMany()
  await prisma.trainerProfile.deleteMany()
  await prisma.parentProfile.deleteMany()
  await prisma.adminAction.deleteMany()
  await prisma.moderationReport.deleteMany()
  await prisma.feeConfig.deleteMany()
  await prisma.coupon.deleteMany()
  await prisma.specialty.deleteMany()
  await prisma.sport.deleteMany()
  await prisma.user.deleteMany()
  console.log('  ✅ Cleaned existing data')

  // ==================
  // CREATE SPORTS
  // ==================
  const sportsData = [
    { name: 'Football', slug: 'football', icon: '🏈', description: 'American football training for all positions', order: 1 },
    { name: 'Baseball', slug: 'baseball', icon: '⚾', description: 'Baseball skills: hitting, pitching, fielding', order: 2 },
    { name: 'Basketball', slug: 'basketball', icon: '🏀', description: 'Basketball fundamentals and advanced skills', order: 3 },
    { name: 'Soccer', slug: 'soccer', icon: '⚽', description: 'Soccer training for all positions and skill levels', order: 4 },
    { name: 'Track & Field', slug: 'track-field', icon: '🏃', description: 'Track events, field events, speed and agility', order: 5 },
  ]

  const specialtiesMap: Record<string, string[]> = {
    'football': ['QB Training', 'WR Training', 'RB Training', 'DB Training', 'OL Training', 'DL Training', 'Kicking', 'Speed & Agility'],
    'baseball': ['Hitting', 'Pitching', 'Catching', 'Fielding', 'Strength & Conditioning', 'Throwing'],
    'basketball': ['Shooting', 'Ball Handling', 'Footwork', 'Defense', 'Post Play', 'Guard Play'],
    'soccer': ['Striker', 'Midfield', 'Defense', 'Goalie', 'Ball Control', 'Conditioning'],
    'track-field': ['Sprinting', 'Hurdles', 'Distance Running', 'Long Jump', 'Shot Put', 'Starts & Form'],
  }

  const sports: Record<string, any> = {}
  const specialties: Record<string, any[]> = {}

  for (const sport of sportsData) {
    sports[sport.slug] = await prisma.sport.create({ data: sport })
    specialties[sport.slug] = []
    for (const specName of specialtiesMap[sport.slug]) {
      const spec = await prisma.specialty.create({
        data: {
          name: specName,
          slug: specName.toLowerCase().replace(/[&]/g, 'and').replace(/[^a-z0-9]+/g, '-'),
          sportId: sports[sport.slug].id,
        },
      })
      specialties[sport.slug].push(spec)
    }
  }
  console.log(`  ✅ Created ${sportsData.length} sports with specialties`)

  // ==================
  // CREATE ADMIN
  // ==================
  const adminPassword = await bcrypt.hash('Admin123!', SALT_ROUNDS)
  const admin = await prisma.user.create({
    data: {
      email: 'admin@trainr.app',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  })
  console.log('  ✅ Created admin user')

  // ==================
  // FEE CONFIG
  // ==================
  await prisma.feeConfig.create({
    data: {
      platformCommissionPercent: 15.0,
      stripeFeePercent: 2.9,
      processingFeeCents: 30,
      minBookingAmountCents: 1500,
      isActive: true,
    },
  })
  console.log('  ✅ Created fee config')

  // ==================
  // CREATE TRAINERS
  // ==================
  const trainerData = [
    // Football trainers
    { firstName: 'Marcus', lastName: 'Johnson', sport: 'football', specialty: 'QB Training', headline: 'Former D1 QB — Elite Quarterback Coaching', bio: 'Played 4 years at University of Texas as starting QB. 8 years coaching youth and high school quarterbacks. Focus on mechanics, reading defenses, and game IQ.', yearsExperience: 8, city: 'Dallas', state: 'TX' },
    { firstName: 'DeAndre', lastName: 'Williams', sport: 'football', specialty: 'WR Training', headline: 'Speed & Route Running Specialist', bio: 'Former CFL wide receiver with 6 years of experience training young athletes. Specialize in route running, catching technique, and speed development.', yearsExperience: 6, city: 'Fort Worth', state: 'TX' },
    { firstName: 'James', lastName: 'Peterson', sport: 'football', specialty: 'Speed & Agility', headline: 'Make Your Athlete Faster — Guaranteed Results', bio: 'Certified speed and agility coach. Track background translated to football-specific training. Helped 50+ athletes improve their 40-yard dash times.', yearsExperience: 10, city: 'Plano', state: 'TX' },
    // Baseball trainers
    { firstName: 'Carlos', lastName: 'Rodriguez', sport: 'baseball', specialty: 'Pitching', headline: 'Former Minor League Pitcher — Arm Care & Mechanics', bio: 'Drafted by the Rangers in 2015. 5 years in the minors. Now dedicated to developing young arms with proper mechanics and arm care protocols.', yearsExperience: 7, city: 'Arlington', state: 'TX' },
    { firstName: 'Mike', lastName: 'Thompson', sport: 'baseball', specialty: 'Hitting', headline: 'D1 College Hitting Coach — .350+ Avg Methods', bio: 'Assistant hitting coach at TCU. Developed a systematic approach to hitting that has helped dozens of youth players make travel and high school teams.', yearsExperience: 12, city: 'Dallas', state: 'TX' },
    // Basketball trainers
    { firstName: 'Tyrone', lastName: 'Jackson', sport: 'basketball', specialty: 'Shooting', headline: 'NBA-Level Shooting Development', bio: 'Former overseas professional player. Trained under some of the best shooting coaches in the world. My system develops consistent, confident shooters.', yearsExperience: 9, city: 'Dallas', state: 'TX' },
    { firstName: 'Sarah', lastName: 'Mitchell', sport: 'basketball', specialty: 'Ball Handling', headline: 'Point Guard Development — Court Vision & Handles', bio: 'Former WNBA training camp invite. 7 years coaching girls and boys basketball. Specialize in point guard play, ball handling, and court awareness.', yearsExperience: 7, city: 'Irving', state: 'TX' },
    // Soccer trainers
    { firstName: 'Elena', lastName: 'Martinez', sport: 'soccer', specialty: 'Ball Control', headline: 'US Soccer Licensed — Technical Skills Master', bio: 'USSF B License holder. Played semi-professionally in the WPSL. 10+ years coaching youth soccer from recreational to competitive levels.', yearsExperience: 10, city: 'Richardson', state: 'TX' },
    { firstName: 'Kofi', lastName: 'Mensah', sport: 'soccer', specialty: 'Striker', headline: 'Goal Scoring Machine — Striker & Finishing Coach', bio: 'Former Ghanaian national team youth player. College soccer at SMU. Specialize in finishing, positioning, and the mentality of a goal scorer.', yearsExperience: 5, city: 'Dallas', state: 'TX' },
    // Track & Field trainers
    { firstName: 'Coach', lastName: 'Williams', sport: 'track-field', specialty: 'Sprinting', headline: 'USATF Certified — Sprint & Speed Development', bio: 'USATF Level 2 certified coach. Former collegiate sprinter at Baylor. Coached 3 state champions in the 100m and 200m. Speed is my specialty.', yearsExperience: 15, city: 'Waco', state: 'TX' },
    { firstName: 'Lisa', lastName: 'Chen', sport: 'track-field', specialty: 'Hurdles', headline: 'Olympic Trials Qualifier — Hurdles & Technique', bio: 'Qualified for 2020 Olympic Trials in the 100m hurdles. NCAA All-American. Passionate about teaching proper hurdle technique and race strategy.', yearsExperience: 4, city: 'Dallas', state: 'TX' },
  ]

  const trainers: any[] = []
  const services: any[] = []

  for (const t of trainerData) {
    const password = await bcrypt.hash('Trainer123!', SALT_ROUNDS)
    const slug = `${t.firstName.toLowerCase()}-${t.lastName.toLowerCase()}`

    const user = await prisma.user.create({
      data: {
        email: `${t.firstName.toLowerCase()}.${t.lastName.toLowerCase()}@email.com`,
        passwordHash: password,
        role: 'TRAINER',
      },
    })

    const sport = sports[t.sport]
    const sportSpecialties = specialties[t.sport]
    const mainSpecialty = sportSpecialties.find(s => s.name === t.specialty) || sportSpecialties[0]

    const trainer = await prisma.trainerProfile.create({
      data: {
        userId: user.id,
        firstName: t.firstName,
        lastName: t.lastName,
        slug,
        headline: t.headline,
        bio: t.bio,
        yearsExperience: t.yearsExperience,
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        city: t.city,
        state: t.state,
        locationType: 'BOTH',
        travelRadius: 25,
        avgRating: 4.2 + Math.random() * 0.7,
        totalReviews: Math.floor(Math.random() * 20) + 3,
        totalSessions: Math.floor(Math.random() * 50) + 10,
        totalBookings: Math.floor(Math.random() * 60) + 15,
        completionPercentage: 95,
        isActive: true,
        featured: Math.random() > 0.6,
      },
    })

    // Link sport
    await prisma.trainerSport.create({
      data: { trainerProfileId: trainer.id, sportId: sport.id },
    })

    // Link specialty
    await prisma.trainerSpecialty.create({
      data: { trainerProfileId: trainer.id, specialtyId: mainSpecialty.id },
    })

    // Add a second specialty randomly
    const secondSpecialty = sportSpecialties.filter(s => s.id !== mainSpecialty.id)
    if (secondSpecialty.length > 0) {
      const randomSpec = secondSpecialty[Math.floor(Math.random() * secondSpecialty.length)]
      await prisma.trainerSpecialty.create({
        data: { trainerProfileId: trainer.id, specialtyId: randomSpec.id },
      })
    }

    // Create service offerings
    const priceBase = 40 + Math.floor(Math.random() * 40) // $40-$80
    const svc1 = await prisma.serviceOffering.create({
      data: {
        trainerProfileId: trainer.id,
        sportId: sport.id,
        title: `Private ${t.sport === 'track-field' ? 'Track' : t.sport} Session`,
        description: `One-on-one ${t.specialty.toLowerCase()} training tailored to your athlete's skill level and goals.`,
        durationMinutes: 60,
        priceInCents: priceBase * 100,
        type: 'INDIVIDUAL',
        isActive: true,
        maxParticipants: 1,
      },
    })

    const svc2 = await prisma.serviceOffering.create({
      data: {
        trainerProfileId: trainer.id,
        sportId: sport.id,
        title: `Group ${t.sport === 'track-field' ? 'Training' : t.sport} Session`,
        description: `Small group training (2-4 athletes) focused on ${t.specialty.toLowerCase()} fundamentals.`,
        durationMinutes: 90,
        priceInCents: Math.round(priceBase * 0.65) * 100,
        type: 'GROUP',
        isActive: true,
        maxParticipants: 4,
      },
    })

    services.push(svc1, svc2)

    // Add availability slots (Mon-Sat)
    for (let day = 1; day <= 6; day++) {
      const slots = [
        { start: '09:00', end: '12:00' },
        { start: '14:00', end: '17:00' },
      ]
      for (const slot of slots) {
        await prisma.availabilitySlot.create({
          data: {
            trainerProfileId: trainer.id,
            dayOfWeek: day,
            startTime: slot.start,
            endTime: slot.end,
            isRecurring: true,
            isAvailable: true,
          },
        })
      }
    }

    trainers.push({ user, trainer, sport: t.sport })
  }
  console.log(`  ✅ Created ${trainerData.length} trainers with services and availability`)

  // ==================
  // CREATE PARENTS
  // ==================
  const parentData = [
    { firstName: 'Jennifer', lastName: 'Davis', email: 'jennifer.davis@email.com', city: 'Dallas', state: 'TX' },
    { firstName: 'Robert', lastName: 'Smith', email: 'robert.smith@email.com', city: 'Plano', state: 'TX' },
    { firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@email.com', city: 'Fort Worth', state: 'TX' },
    { firstName: 'David', lastName: 'Brown', email: 'david.brown@email.com', city: 'Arlington', state: 'TX' },
    { firstName: 'Amanda', lastName: 'Wilson', email: 'amanda.wilson@email.com', city: 'Irving', state: 'TX' },
    { firstName: 'Chris', lastName: 'Taylor', email: 'chris.taylor@email.com', city: 'Richardson', state: 'TX' },
    { firstName: 'Nicole', lastName: 'Anderson', email: 'nicole.anderson@email.com', city: 'Dallas', state: 'TX' },
    { firstName: 'Kevin', lastName: 'Thomas', email: 'kevin.thomas@email.com', city: 'Dallas', state: 'TX' },
  ]

  const parents: any[] = []

  for (const p of parentData) {
    const password = await bcrypt.hash('Parent123!', SALT_ROUNDS)
    const user = await prisma.user.create({
      data: {
        email: p.email,
        passwordHash: password,
        role: 'PARENT',
      },
    })

    const parent = await prisma.parentProfile.create({
      data: {
        userId: user.id,
        phone: `(469) 555-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        city: p.city,
        state: p.state,
      },
    })

    parents.push({ user, parent })
  }
  console.log(`  ✅ Created ${parentData.length} parents`)

  // ==================
  // CREATE ATHLETES
  // ==================
  const athleteData = [
    { parentIdx: 0, firstName: 'Tyler', lastName: 'Davis', dob: '2012-03-15', gender: 'MALE', skill: 'INTERMEDIATE', sports: ['football', 'track-field'] },
    { parentIdx: 0, firstName: 'Emma', lastName: 'Davis', dob: '2014-07-22', gender: 'FEMALE', skill: 'BEGINNER', sports: ['soccer'] },
    { parentIdx: 1, firstName: 'Jake', lastName: 'Smith', dob: '2011-01-10', gender: 'MALE', skill: 'ADVANCED', sports: ['basketball'] },
    { parentIdx: 1, firstName: 'Sophia', lastName: 'Smith', dob: '2013-11-05', gender: 'FEMALE', skill: 'INTERMEDIATE', sports: ['soccer', 'track-field'] },
    { parentIdx: 2, firstName: 'Lucas', lastName: 'Garcia', dob: '2012-09-18', gender: 'MALE', skill: 'INTERMEDIATE', sports: ['baseball'] },
    { parentIdx: 3, firstName: 'Aiden', lastName: 'Brown', dob: '2010-04-25', gender: 'MALE', skill: 'ADVANCED', sports: ['football'] },
    { parentIdx: 3, firstName: 'Olivia', lastName: 'Brown', dob: '2013-12-03', gender: 'FEMALE', skill: 'BEGINNER', sports: ['basketball'] },
    { parentIdx: 4, firstName: 'Ethan', lastName: 'Wilson', dob: '2011-06-14', gender: 'MALE', skill: 'INTERMEDIATE', sports: ['football', 'baseball'] },
    { parentIdx: 5, firstName: 'Mia', lastName: 'Taylor', dob: '2012-08-30', gender: 'FEMALE', skill: 'ADVANCED', sports: ['track-field', 'soccer'] },
    { parentIdx: 6, firstName: 'Noah', lastName: 'Anderson', dob: '2013-02-17', gender: 'MALE', skill: 'BEGINNER', sports: ['basketball'] },
    { parentIdx: 7, firstName: 'Ava', lastName: 'Thomas', dob: '2011-10-09', gender: 'FEMALE', skill: 'INTERMEDIATE', sports: ['soccer'] },
  ]

  const athletes: any[] = []

  for (const a of athleteData) {
    const parent = parents[a.parentIdx]
    const athlete = await prisma.athleteProfile.create({
      data: {
        parentProfileId: parent.parent.id,
        firstName: a.firstName,
        lastName: a.lastName,
        dateOfBirth: new Date(a.dob),
        gender: a.gender as any,
        skillLevel: a.skill as any,
        goals: ['Improve fundamentals', 'Have fun', 'Build confidence'],
      },
    })

    for (const sportSlug of a.sports) {
      await prisma.athleteSport.create({
        data: {
          athleteProfileId: athlete.id,
          sportId: sports[sportSlug].id,
        },
      })
    }

    athletes.push({ athlete, parentIdx: a.parentIdx, sports: a.sports })
  }
  console.log(`  ✅ Created ${athleteData.length} athletes`)

  // ==================
  // CREATE BOOKINGS & PAYMENTS & REVIEWS
  // ==================
  const statuses: any[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELLED']
  let bookingCount = 0
  let reviewCount = 0

  for (const a of athletes) {
    // Create 2-4 bookings per athlete
    const numBookings = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < numBookings; i++) {
      const sportSlug = a.sports[i % a.sports.length]
      const sportTrainers = trainers.filter(t => t.sport === sportSlug)
      if (sportTrainers.length === 0) continue

      const trainer = sportTrainers[Math.floor(Math.random() * sportTrainers.length)]
      const serviceIdx = services.findIndex(s => s.trainerProfileId === trainer.trainer.id)
      if (serviceIdx === -1) continue
      const service = services[serviceIdx]

      const parent = parents[a.parentIdx]
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      const date = new Date()
      date.setDate(date.getDate() - Math.floor(Math.random() * 30) + (status === 'PENDING' || status === 'CONFIRMED' ? Math.floor(Math.random() * 14) : 0))

      const hours = 9 + Math.floor(Math.random() * 8)
      const startTime = `${String(hours).padStart(2, '0')}:00`
      const endTime = `${String(hours + (service.durationMinutes >= 90 ? 2 : 1)).padStart(2, '0')}:00`

      const platformFee = Math.round(service.priceInCents * 0.15)
      const trainerPayout = service.priceInCents - platformFee

      const booking = await prisma.booking.create({
        data: {
          parentProfileId: parent.parent.id,
          trainerProfileId: trainer.trainer.id,
          athleteProfileId: a.athlete.id,
          serviceOfferingId: service.id,
          date,
          startTime,
          endTime,
          status,
          totalAmountInCents: service.priceInCents,
          platformFeeInCents: platformFee,
          trainerPayoutInCents: trainerPayout,
          notes: i === 0 ? 'First session — please focus on fundamentals' : null,
        },
      })

      bookingCount++

      // Create payment for non-pending
      if (status !== 'PENDING' && status !== 'CANCELLED') {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            amountInCents: service.priceInCents,
            platformFeeInCents: platformFee,
            trainerPayoutInCents: trainerPayout,
            processingFeeInCents: Math.round(service.priceInCents * 0.029 + 30),
            status: status === 'COMPLETED' ? 'SUCCEEDED' : 'PENDING',
          },
        })
      }

      // Create review for completed bookings
      if (status === 'COMPLETED' && Math.random() > 0.3) {
        const rating = 3 + Math.floor(Math.random() * 3)
        await prisma.review.create({
          data: {
            bookingId: booking.id,
            trainerProfileId: trainer.trainer.id,
            parentProfileId: parent.parent.id,
            rating,
            knowledgeRating: 3 + Math.floor(Math.random() * 3),
            communicationRating: 3 + Math.floor(Math.random() * 3),
            punctualityRating: 3 + Math.floor(Math.random() * 3),
            comment: [
              'Great session! My kid loved it.',
              'Very patient and knowledgeable trainer.',
              'Good pace and clear instructions.',
              'My son learned so much in just one session!',
              'Professional and fun. Highly recommend.',
              'Excellent communication before and during the session.',
            ][Math.floor(Math.random() * 6)],
          },
        })
        reviewCount++
      }
    }
  }
  console.log(`  ✅ Created ${bookingCount} bookings, ${reviewCount} reviews`)

  // ==================
  // CREATE COUPONS
  // ==================
  await prisma.coupon.createMany({
    data: [
      { code: 'WELCOME10', discountPercent: 10, maxUses: 500, currentUses: 23, expiresAt: new Date('2026-12-31'), isActive: true, createdById: admin.id },
      { code: 'SUMMER20', discountPercent: 20, maxUses: 200, currentUses: 0, expiresAt: new Date('2026-08-31'), isActive: true, createdById: admin.id },
      { code: 'FIRSTSESSION', discountAmountInCents: 1500, maxUses: 1000, currentUses: 45, isActive: true, createdById: admin.id },
      { code: 'FOOTBALL25', discountPercent: 25, maxUses: 50, currentUses: 12, expiresAt: new Date('2026-09-01'), isActive: true, createdById: admin.id, applicableSportId: sports['football'].id },
    ],
  })
  console.log('  ✅ Created 4 coupons')

  // ==================
  // CREATE NOTIFICATIONS
  // ==================
  for (const p of parents.slice(0, 4)) {
    await prisma.notification.create({
      data: {
        userId: p.user.id,
        type: 'BOOKING_CONFIRMED',
        title: 'Booking Confirmed!',
        message: 'Your training session has been confirmed. See you there!',
      },
    })
  }
  console.log('  ✅ Created notifications')

  console.log('\n✅ Seed complete!')
  console.log('\n📋 Test Accounts:')
  console.log('  Admin:   admin@trainr.app / Admin123!')
  console.log('  Trainer: marcus.johnson@email.com / Trainer123!')
  console.log('  Parent:  jennifer.davis@email.com / Parent123!')
  console.log('\n🎉 All passwords follow pattern: [Role]123!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
