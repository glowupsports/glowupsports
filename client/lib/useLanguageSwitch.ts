import { useMemo } from "react";
import {
  BallStage,
  ViewRole,
  translateSkillName,
  translatePillarName,
  translateProgressLabel,
  translateLevelLabel,
  getStageFromLevel,
  getStageColor,
  getProgressionPercentage,
  LANGUAGE_TIPS,
} from "@shared/language-switch";

interface UseLanguageSwitchOptions {
  levelId?: string | null;
  role: ViewRole;
}

export function useLanguageSwitch({ levelId, role }: UseLanguageSwitchOptions) {
  const stage = useMemo(() => {
    if (!levelId) return "GREEN" as BallStage;
    return getStageFromLevel(levelId);
  }, [levelId]);

  const config = useMemo(() => ({ stage, role }), [stage, role]);

  const translate = useMemo(() => ({
    skill: (name: string) => translateSkillName(name, config),
    pillar: (pillar: string) => translatePillarName(pillar, config),
    progress: (status: "improving" | "stable" | "declining") => translateProgressLabel(status, config),
    level: (id: string) => translateLevelLabel(id, config),
  }), [config]);

  const stageColor = useMemo(() => getStageColor(stage), [stage]);
  const progression = useMemo(() => levelId ? getProgressionPercentage(levelId) : 0, [levelId]);
  const tips = useMemo(() => LANGUAGE_TIPS[stage], [stage]);

  return {
    stage,
    stageColor,
    progression,
    translate,
    tips,
    config,
  };
}

export function usePillarDisplay(
  pillar: string,
  options: UseLanguageSwitchOptions
) {
  const { translate } = useLanguageSwitch(options);
  return translate.pillar(pillar);
}

export function useProgressDisplay(
  status: "improving" | "stable" | "declining",
  options: UseLanguageSwitchOptions
) {
  const { translate } = useLanguageSwitch(options);
  return translate.progress(status);
}
