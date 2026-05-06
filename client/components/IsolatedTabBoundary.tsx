import React, { Component, createContext, useContext } from "react";

/**
 * IsolatedTabBoundary — per-tab crash isolation for the player surface.
 *
 * How it works:
 * 1. PlayerV2TabView maintains `currentTabKey` (the active tab).
 * 2. TabResetContext provides that key to every mounted tab.
 * 3. Each tab is wrapped with IsolatedTabBoundary which renders nothing on
 *    error (invisible to the player — no "try again" button).
 * 4. When the player taps a tab icon, `currentTabKey` changes → the context
 *    value changes → `componentDidUpdate` fires → the boundary auto-resets.
 *
 * The result: a crashed tab silently re-mounts the next time the player taps
 * its icon. Completely transparent.
 */

export const TabResetContext = createContext<string>("");

type InnerProps = {
  children: React.ReactNode;
  tabKey: string;
  resetKey: string;
};

type InnerState = { hasError: boolean };

class IsolatedTabBoundaryInner extends Component<InnerProps, InnerState> {
  state: InnerState = { hasError: false };

  static getDerivedStateFromError(): InnerState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error(`[IsolatedTabBoundary:${this.props.tabKey}] Tab crashed — will auto-recover on next focus:`, error);
  }

  componentDidUpdate(prevProps: InnerProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function IsolatedTabBoundaryWrapper({
  tabKey,
  children,
}: {
  tabKey: string;
  children: React.ReactNode;
}): React.ReactElement {
  const resetKey = useContext(TabResetContext);
  return (
    <IsolatedTabBoundaryInner tabKey={tabKey} resetKey={resetKey}>
      {children}
    </IsolatedTabBoundaryInner>
  );
}

export function withIsolatedTabBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  tabKey: string,
): React.ComponentType<P> {
  function IsolatedTab(props: P): React.ReactElement {
    return (
      <IsolatedTabBoundaryWrapper tabKey={tabKey}>
        <WrappedComponent {...props} />
      </IsolatedTabBoundaryWrapper>
    );
  }
  IsolatedTab.displayName = `IsolatedTab(${tabKey})`;
  return IsolatedTab;
}
