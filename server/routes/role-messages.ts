import { Router, Response } from "express";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware } from "../auth";
import { getMessage, getMessagesForAllRoles, getDefaultTemplates, RoleType } from "../services/role-language-engine";

const router = Router();

router.get("/api/role-messages/templates", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templates = getDefaultTemplates();
    const templateKeys = Object.keys(templates);
    
    res.json({
      templates: templateKeys.map(key => ({
        key,
        description: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      })),
    });
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/api/role-messages/get", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateKey, role, context } = req.body;
    const academyId = req.user?.academyId;
    
    if (!templateKey || !role) {
      return res.status(400).json({ error: "templateKey and role are required" });
    }
    
    if (!["coach", "player", "parent"].includes(role)) {
      return res.status(400).json({ error: "role must be 'coach', 'player', or 'parent'" });
    }
    
    const message = await getMessage(templateKey, role as RoleType, context || {}, academyId);
    
    res.json({ message });
  } catch (error) {
    console.error("Error getting role message:", error);
    res.status(500).json({ error: "Failed to get message" });
  }
});

router.post("/api/role-messages/get-all-roles", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateKey, context } = req.body;
    const academyId = req.user?.academyId;
    
    if (!templateKey) {
      return res.status(400).json({ error: "templateKey is required" });
    }
    
    const messages = await getMessagesForAllRoles(templateKey, context || {}, academyId);
    
    res.json(messages);
  } catch (error) {
    console.error("Error getting role messages:", error);
    res.status(500).json({ error: "Failed to get messages" });
  }
});

export default router;
