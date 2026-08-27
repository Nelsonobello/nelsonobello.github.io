import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across the app (and across
// hot-reloads in dev) instead of opening a new connection pool per import.
export const prisma = new PrismaClient();
