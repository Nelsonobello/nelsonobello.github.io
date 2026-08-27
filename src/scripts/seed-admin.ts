import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

/**
 * Run once (npm run seed:admin) to create the single Admin row.
 * Reads credentials from env vars so nothing is hardcoded in source.
 * There is no signup route — this script is the only way an Admin row
 * gets created.
 */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  if (!email || !password) {
    throw new Error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in your .env before running this script"
    );
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists for ${email} — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.create({
    data: { email, passwordHash, name },
  });

  console.log(`Admin created: ${admin.email} (id: ${admin.id})`);
  console.log("You can now log in via POST /admin/login with this email/password.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
