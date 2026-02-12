import { db } from "./db";
import { players } from "@shared/schema";
import { eq } from "drizzle-orm";

export function isMinor(dateOfBirth: string | null | undefined): boolean {
  if (!dateOfBirth) return false;
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age < 18;
}

export function isMinorByAge(age: number | null | undefined): boolean {
  if (age == null) return false;
  return age < 18;
}

export async function getPlayerParentalControls(playerId: string): Promise<{ chatEnabled: boolean; communityEnabled: boolean }> {
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });

  if (!player) {
    return { chatEnabled: false, communityEnabled: false };
  }

  const minor = isMinor(player.dateOfBirth) || isMinorByAge(player.age);

  if (!minor) {
    return { chatEnabled: true, communityEnabled: true };
  }

  return {
    chatEnabled: (player as any).chatEnabled ?? false,
    communityEnabled: (player as any).communityEnabled ?? false,
  };
}

export async function isPlayerMinor(playerId: string): Promise<boolean> {
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });

  if (!player) return false;

  return isMinor(player.dateOfBirth) || isMinorByAge(player.age);
}
