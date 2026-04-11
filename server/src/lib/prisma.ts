import { PrismaNeonHttp } from '@prisma/adapter-neon'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {})

export const prisma = new PrismaClient({ adapter })
