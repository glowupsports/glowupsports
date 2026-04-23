import React, { createContext, useContext, useMemo, useState } from "react";

export type DiscoverScope = "country" | "global";

interface DiscoverScopeContextValue {
  scope: DiscoverScope;
  setScope: (next: DiscoverScope) => void;
}

const DiscoverScopeContext = createContext<DiscoverScopeContextValue | null>(null);

export function DiscoverScopeProvider({
  children,
  initialScope = "country",
}: {
  children: React.ReactNode;
  initialScope?: DiscoverScope;
}) {
  const [scope, setScope] = useState<DiscoverScope>(initialScope);
  const value = useMemo(() => ({ scope, setScope }), [scope]);
  return (
    <DiscoverScopeContext.Provider value={value}>{children}</DiscoverScopeContext.Provider>
  );
}

export function useDiscoverScope(): DiscoverScopeContextValue | null {
  return useContext(DiscoverScopeContext);
}
