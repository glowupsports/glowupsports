// Task #1566 — Shared hook that detects newly earned achievements and drives
// the global celebration modal queue.
//
// Persists "already celebrated" achievement IDs in AsyncStorage keyed by
// player ID so the modal fires at most once per achievement per player,
// preventing one account from suppressing celebrations for another on shared devices.
// Both ProPlayerHomeDiagnosticScreen and PlayerProfileScreen use this hook so
// celebrations trigger from either context (home tab or profile tab), whichever
// loads first.

import { useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AchievementEarnedInfo } from "@/player/components/AchievementCelebrationModal";

function storageKey(playerId: string) {
  return `gus:celebrated_achievements:${playerId || "anon"}`;
}

interface AchievementLike {
  id: string;
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  rewardLabel: string;
  rewardType: string;
  rarity: string;
}

interface UseAchievementCelebrationResult {
  celebrationAchievement: AchievementEarnedInfo | null;
  onCloseCelebration: () => void;
  enqueueNewlyEarned: (newlyEarned: string[], allAchievements: AchievementLike[]) => void;
}

export function useAchievementCelebration(playerId?: string): UseAchievementCelebrationResult {
  const [queue, setQueue] = useState<AchievementEarnedInfo[]>([]);
  const [current, setCurrent] = useState<AchievementEarnedInfo | null>(null);
  const celebratedIdsRef = useRef<Set<string> | null>(null);
  const loadedRef = useRef(false);
  const playerIdRef = useRef(playerId ?? "");

  // Reload stored celebrations whenever the player ID becomes known/changes.
  useEffect(() => {
    if (!playerId) return;
    playerIdRef.current = playerId;
    loadedRef.current = false;
    celebratedIdsRef.current = null;

    AsyncStorage.getItem(storageKey(playerId))
      .then((raw) => {
        const ids: string[] = raw ? JSON.parse(raw) : [];
        celebratedIdsRef.current = new Set(ids);
        loadedRef.current = true;
      })
      .catch(() => {
        celebratedIdsRef.current = new Set();
        loadedRef.current = true;
      });
  }, [playerId]);

  // Pop next from queue when nothing is showing
  useEffect(() => {
    if (current) return;
    if (queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  const onCloseCelebration = () => setCurrent(null);

  const enqueueNewlyEarned = (newlyEarned: string[], allAchievements: AchievementLike[]) => {
    if (!loadedRef.current) return;
    if (!celebratedIdsRef.current) return;
    if (newlyEarned.length === 0) return;

    const unseen = newlyEarned.filter((id) => !celebratedIdsRef.current!.has(id));
    if (unseen.length === 0) return;

    // Mark as celebrated before queuing to prevent duplicate shows from
    // concurrent calls (home + profile both loading achievements).
    unseen.forEach((id) => celebratedIdsRef.current!.add(id));
    AsyncStorage.setItem(
      storageKey(playerIdRef.current),
      JSON.stringify([...celebratedIdsRef.current]),
    ).catch(() => {});

    const toQueue: AchievementEarnedInfo[] = unseen
      .map((id) => allAchievements.find((a) => a.id === id))
      .filter((a): a is AchievementLike => !!a)
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        iconName: a.iconName,
        iconColor: a.iconColor,
        rewardLabel: a.rewardLabel,
        rewardType: a.rewardType,
        rarity: a.rarity,
      }));

    if (toQueue.length > 0) {
      setQueue((prev) => [...prev, ...toQueue]);
    }
  };

  return { celebrationAchievement: current, onCloseCelebration, enqueueNewlyEarned };
}
