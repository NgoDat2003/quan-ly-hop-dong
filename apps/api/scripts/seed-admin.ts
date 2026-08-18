// Must run before any import that reads process.env.DATABASE_URL at
// module-load time (PrismaService's adapter reads it directly) — same
// reasoning as main.ts's leading dotenv/config import.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import { ARGON2_OPTIONS } from '../src/modules/auth/argon2-options.constant';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin12345'; // dev-only seed password, không dùng cho production thật

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-admin in production (NODE_ENV=production). Seed data is dev-only.');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const hashedPassword = await argon2.hash(ADMIN_PASSWORD, ARGON2_OPTIONS);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: 'Admin User',
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  console.log(`Seeded admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  await app.close();
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
