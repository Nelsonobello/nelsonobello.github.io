import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 12);

export function signAdminToken(adminId: string) {
  return jwt.sign({ adminId }, JWT_SECRET, {
    expiresIn: `${SESSION_HOURS}h`,
  });
}

export function verifyAdminToken(token: string): { adminId: string } {
  return jwt.verify(token, JWT_SECRET) as { adminId: string };
}
