/* Test-only stub of `react-native` for vitest UpdateSheet tests. */
import React from "react";

const passthrough = (name: string) => {
  const C: any = ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  C.displayName = name;
  return C;
};

export const View = passthrough("View");
export const Text = passthrough("Text");
export const Pressable = passthrough("Pressable");
export const Modal = passthrough("Modal");
export const StyleSheet = { create: <T>(s: T): T => s };
export const Platform = { OS: "ios" as const, select: (o: any) => o.ios };
export const AppState = {
  currentState: "active" as const,
  addEventListener: () => ({ remove: () => undefined }),
};
