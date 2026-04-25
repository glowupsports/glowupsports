/**
 * UpdateSheet tests.
 *
 * `@testing-library/react-native` isn't a workspace dependency (and this task
 * can't add one), so these tests inspect the React element tree returned by
 * the component directly. That's enough to verify the prop contract this
 * component is responsible for: the labels reach the rendered Text nodes, and
 * the press handlers wire to the correct callbacks (with `disabled` guarding
 * the primary press). Native primitives (`react-native`,
 * `react-native-safe-area-context`, `@expo/vector-icons/Feather`,
 * `expo-linear-gradient`) are aliased to lightweight stubs in
 * `vitest.config.ts` so the suite runs in a plain Node environment.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { UpdateSheet, type UpdateSheetProps } from "@/components/update/UpdateSheet";

type Element = React.ReactElement<any> | null;

function flattenChildren(node: any): any[] {
  if (node === null || node === undefined || node === false) return [];
  if (Array.isArray(node)) return node.flatMap(flattenChildren);
  return [node];
}

function walk(node: any, visit: (el: any) => void): void {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((c) => walk(c, visit));
    return;
  }
  if (typeof node !== "object") return;
  visit(node);
  const children = node?.props?.children;
  if (children !== undefined) {
    flattenChildren(children).forEach((c) => walk(c, visit));
  }
}

function findTextNodes(tree: Element): string[] {
  const labels: string[] = [];
  walk(tree, (el) => {
    if (el?.type?.displayName === "Text") {
      const c = el.props?.children;
      const text = Array.isArray(c) ? c.join("") : String(c ?? "");
      if (text) labels.push(text);
    }
  });
  return labels;
}

function findPressables(tree: Element): any[] {
  const pressables: any[] = [];
  walk(tree, (el) => {
    if (el?.type?.displayName === "Pressable") pressables.push(el);
  });
  return pressables;
}

function callStyleFn(style: any): any {
  // Pressable's style prop can be either an object/array or a function of
  // ({ pressed }). Normalize to an inert call so we exercise that branch.
  if (typeof style === "function") return style({ pressed: false });
  return style;
}

describe("UpdateSheet", () => {
  let onPrimary: ReturnType<typeof vi.fn>;
  let onSecondary: ReturnType<typeof vi.fn>;

  const baseProps = (): UpdateSheetProps => ({
    iconName: "download-cloud",
    title: "Update ready",
    subtitle: "A new version is ready.",
    primaryLabel: "Restart now",
    secondaryLabel: "Later",
    onPrimary: onPrimary as unknown as () => void,
    onSecondary: onSecondary as unknown as () => void,
  });

  beforeEach(() => {
    onPrimary = vi.fn();
    onSecondary = vi.fn();
  });

  it("renders the provided title, subtitle and labels", () => {
    const tree = UpdateSheet(baseProps()) as Element;
    const texts = findTextNodes(tree);
    expect(texts).toContain("Update ready");
    expect(texts).toContain("A new version is ready.");
    expect(texts).toContain("Restart now");
    expect(texts).toContain("Later");
  });

  it("primary press fires onPrimary", () => {
    const tree = UpdateSheet(baseProps()) as Element;
    const pressables = findPressables(tree);
    expect(pressables.length).toBeGreaterThanOrEqual(2);
    callStyleFn(pressables[0].props.style);
    pressables[0].props.onPress();
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).not.toHaveBeenCalled();
  });

  it("secondary press fires onSecondary", () => {
    const tree = UpdateSheet(baseProps()) as Element;
    const pressables = findPressables(tree);
    pressables[1].props.onPress();
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("primaryDisabled state prevents primary press but still allows secondary press", () => {
    const tree = UpdateSheet({ ...baseProps(), primaryDisabled: true }) as Element;
    const pressables = findPressables(tree);
    expect(pressables[0].props.disabled).toBe(true);

    pressables[1].props.onPress();
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("renders releaseNotes when provided", () => {
    const tree = UpdateSheet({
      ...baseProps(),
      releaseNotes: "Fixes a crash on cold start.",
    }) as Element;
    const texts = findTextNodes(tree);
    expect(texts).toContain("Fixes a crash on cold start.");
  });

  it("omits releaseNotes node when not provided", () => {
    const tree = UpdateSheet(baseProps()) as Element;
    const texts = findTextNodes(tree);
    // exactly the four label/text nodes — title, subtitle, primary, secondary
    expect(texts).toHaveLength(4);
  });
});
