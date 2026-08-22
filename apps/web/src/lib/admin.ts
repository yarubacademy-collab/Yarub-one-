import { AppError } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { requireUserId } from './session';

/**
 * Role-based access control.
 *
 * No identity is hard-coded. The first administrator is promoted by the
 * operator through the seed script, and every check below reads the role from
 * the database rather than from anything the client can influence.
 */
export async function requireAdmin(): Promise<string> {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

  if (user?.role !== 'ADMIN') {
    // Deliberately indistinguishable from "not signed in" to a caller probing
    // for the existence of an admin area.
    throw new AppError('FORBIDDEN', `User ${userId} is not an administrator`, 'اجازت نہیں ہے۔');
  }
  return userId;
}

export async function isAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}
