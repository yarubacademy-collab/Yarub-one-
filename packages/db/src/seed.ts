import { prisma } from './index.js';

/**
 * Seeds the Plan table and promotes the first administrator.
 *
 * No identity is hard-coded: the operator names the admin by email on the
 * command line. Re-running is safe — plans upsert and an existing admin is
 * left alone.
 *
 *   pnpm --filter @yarub/db exec tsx src/seed.ts owner@example.com
 */

const PLANS = [
  {
    code: 'free',
    name: 'Free',
    priceMinor: 0,
    currency: 'USD',
    intervalDays: 30,
    imageQuota: 2,
    videoQuota: 2,
    maxVideoSeconds: 10,
    websiteQuota: 1,
    gameQuota: 1,
    documentQuota: 5,
  },
  {
    // Prices start unset. The owner sets them in the admin area; the UI shows
    // "price not set yet" rather than inventing a figure.
    code: 'premium_monthly',
    name: 'Premium Monthly',
    priceMinor: 0,
    currency: 'USD',
    intervalDays: 30,
    imageQuota: 200,
    videoQuota: 30,
    maxVideoSeconds: 60,
    websiteQuota: 25,
    gameQuota: 25,
    documentQuota: 200,
  },
  {
    code: 'premium_yearly',
    name: 'Premium Yearly',
    priceMinor: 0,
    currency: 'USD',
    intervalDays: 365,
    imageQuota: 3000,
    videoQuota: 400,
    maxVideoSeconds: 60,
    websiteQuota: 300,
    gameQuota: 300,
    documentQuota: 2400,
  },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {},
      create: plan,
    });
    console.log(`plan ready: ${plan.code}`);
  }

  const email = process.argv[2];
  if (!email) {
    console.log('No admin email given. Run with an email to promote an administrator.');
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}. Register first, then re-run.`);
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  await prisma.auditLog.create({ data: { userId: user.id, action: 'admin.promote.seed' } });
  console.log(`promoted to ADMIN: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
