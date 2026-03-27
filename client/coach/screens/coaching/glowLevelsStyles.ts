import { StyleSheet } from "react-native";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

export const glowLevelsStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  header: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  stageSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  stageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 2,
    borderColor: "transparent",
  },
  stageButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  levelBadgeText: {
    fontSize: 18,
    fontWeight: "700",
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelIdentity: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  levelContent: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
  },
  courtInfo: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  infoText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    opacity: 0.8,
    textTransform: "capitalize",
  },
  requirementsSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  requirementsList: {
    gap: Spacing.sm,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  requirementText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  pillarsSection: {
    gap: Spacing.sm,
  },
  pillarSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  pillarTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  pillarBadge: {
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pillarCount: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  minRequired: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    marginRight: Spacing.sm,
  },
  skillsList: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  skillItem: {
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  skillHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  skillName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  targetBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  targetText: {
    fontSize: 10,
    fontWeight: "600",
  },
  rubricList: {
    gap: Spacing.xs,
  },
  rubricItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  scoreIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  rubricContent: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  observableText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 16,
  },
});
