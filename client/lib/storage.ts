import AsyncStorage from "@react-native-async-storage/async-storage";
import { Player, ChatMessage, INITIAL_PLAYER, INITIAL_MESSAGES } from "@/constants/playerData";

const STORAGE_KEYS = {
  PLAYER: "@glow_up_tennis_player",
  MESSAGES: "@glow_up_tennis_messages",
};

export async function getPlayer(): Promise<Player> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PLAYER);
    if (data) {
      return JSON.parse(data);
    }
    await savePlayer(INITIAL_PLAYER);
    return INITIAL_PLAYER;
  } catch (error) {
    console.error("Error loading player:", error);
    return INITIAL_PLAYER;
  }
}

export async function savePlayer(player: Player): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYER, JSON.stringify(player));
  } catch (error) {
    console.error("Error saving player:", error);
  }
}

export async function getMessages(): Promise<ChatMessage[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (data) {
      const messages = JSON.parse(data);
      return messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
    await saveMessages(INITIAL_MESSAGES);
    return INITIAL_MESSAGES;
  } catch (error) {
    console.error("Error loading messages:", error);
    return INITIAL_MESSAGES;
  }
}

export async function saveMessages(messages: ChatMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
  } catch (error) {
    console.error("Error saving messages:", error);
  }
}

// Boot-time multiGet replacing the two sequential getItem calls
// previously made by PlayerContext (Task #1395).
export async function getPlayerAndMessages(): Promise<{
  player: Player;
  messages: ChatMessage[];
}> {
  try {
    const entries = await AsyncStorage.multiGet([
      STORAGE_KEYS.PLAYER,
      STORAGE_KEYS.MESSAGES,
    ]);
    const map = new Map(entries);
    const playerRaw = map.get(STORAGE_KEYS.PLAYER) ?? null;
    const messagesRaw = map.get(STORAGE_KEYS.MESSAGES) ?? null;

    let player = INITIAL_PLAYER;
    if (playerRaw) {
      try {
        player = JSON.parse(playerRaw) as Player;
      } catch {
        await savePlayer(INITIAL_PLAYER);
      }
    } else {
      await savePlayer(INITIAL_PLAYER);
    }

    let messages = INITIAL_MESSAGES;
    if (messagesRaw) {
      try {
        const parsed = JSON.parse(messagesRaw) as Array<
          Omit<ChatMessage, "timestamp"> & { timestamp: string }
        >;
        messages = parsed.map((m) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
      } catch {
        await saveMessages(INITIAL_MESSAGES);
      }
    } else {
      await saveMessages(INITIAL_MESSAGES);
    }

    return { player, messages };
  } catch (error) {
    console.error("Error loading player snapshot:", error);
    return { player: INITIAL_PLAYER, messages: INITIAL_MESSAGES };
  }
}

export async function addXP(amount: number): Promise<{ player: Player; leveledUp: boolean }> {
  const player = await getPlayer();
  let newXP = player.currentXP + amount;
  let newLevel = player.level;
  let leveledUp = false;

  while (newXP >= player.xpToNextLevel) {
    newXP -= player.xpToNextLevel;
    newLevel++;
    leveledUp = true;
  }

  const updatedPlayer: Player = {
    ...player,
    currentXP: newXP,
    level: newLevel,
    xpToNextLevel: Math.floor(player.xpToNextLevel * 1.15),
  };

  await savePlayer(updatedPlayer);
  return { player: updatedPlayer, leveledUp };
}

export async function addCurrency(diamonds: number, coins: number): Promise<Player> {
  const player = await getPlayer();
  const updatedPlayer: Player = {
    ...player,
    diamonds: player.diamonds + diamonds,
    coins: player.coins + coins,
  };
  await savePlayer(updatedPlayer);
  return updatedPlayer;
}

export async function updateSkillScore(skillId: string, amount: number): Promise<Player> {
  const player = await getPlayer();
  const updatedSkills = player.skills.map((skill) => {
    if (skill.id === skillId) {
      const newScore = Math.min(skill.score + amount, skill.maxScore);
      return { ...skill, score: newScore };
    }
    return skill;
  });
  const totalGlowScore = updatedSkills.reduce((sum, skill) => sum + skill.score, 0);
  const updatedPlayer: Player = {
    ...player,
    skills: updatedSkills,
    totalGlowScore,
  };
  await savePlayer(updatedPlayer);
  return updatedPlayer;
}

export async function updatePlayerProfile(name: string, avatar: string): Promise<Player> {
  const player = await getPlayer();
  const updatedPlayer: Player = {
    ...player,
    name,
    avatar,
  };
  await savePlayer(updatedPlayer);
  return updatedPlayer;
}

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEYS.PLAYER, STORAGE_KEYS.MESSAGES]);
  } catch (error) {
    console.error("Error clearing data:", error);
  }
}
