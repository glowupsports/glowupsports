import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

export interface SkillEntry {
  id: string;
  label: string;
  pillar: "technique" | "tactical";
  levelKey: string;
}

interface SkillTaxonomyResponse {
  levelKey: string;
  skills: SkillEntry[];
}

/**
 * Fetches level-aware skill entries for the Technique and Tactical pillars.
 *
 * @param level - The player's ballLevel ("red" | "orange" | "yellow" | "green" | "adult" | "glow")
 *                Pass `null` or `undefined` to skip fetching (returns empty arrays).
 */
export function useSkillTaxonomy(level: string | null | undefined) {
  const { data } = useQuery<SkillTaxonomyResponse>({
    queryKey: ["/api/coach/skill-taxonomy", level ?? "adult"],
    queryFn: async () => {
      const url = new URL("/api/coach/skill-taxonomy", getApiUrl());
      url.searchParams.set("level", level ?? "adult");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch skill taxonomy");
      return res.json() as Promise<SkillTaxonomyResponse>;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const techniqueSkills = data?.skills.filter((s) => s.pillar === "technique") ?? [];
  const tacticalSkills  = data?.skills.filter((s) => s.pillar === "tactical")  ?? [];

  return { techniqueSkills, tacticalSkills, levelKey: data?.levelKey };
}
