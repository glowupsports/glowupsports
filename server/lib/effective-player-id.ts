// Resolves the playerId a request is acting on. In a family-switch
// session the JWT carries the child's playerId while the user row
// belongs to the parent — prefer the token's playerId so endpoints
// scope to the child. Both /api/me and /api/player/me must use this
// helper so they cannot drift (Task #1468).

export interface EffectivePlayerIdInputs {
  tokenUser: { playerId: string | null | undefined } | null | undefined;
  freshUser: { playerId: string | null | undefined } | null | undefined;
}

export function resolveEffectivePlayerId(
  inputs: EffectivePlayerIdInputs,
): string | null {
  const tokenPlayerId = inputs.tokenUser?.playerId ?? null;
  const freshPlayerId = inputs.freshUser?.playerId ?? null;

  if (tokenPlayerId && tokenPlayerId !== freshPlayerId) {
    return tokenPlayerId;
  }

  return freshPlayerId ?? null;
}
