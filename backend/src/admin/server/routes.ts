import Elysia, { t } from "elysia";
import { db } from "../../db";
import { adminMiddleware } from "../../auth/middleware";

export const adminServerRoutes = new Elysia({ prefix: "/admin/server" })
  .use(adminMiddleware)

  // ─── GET /admin/server/list ───────────────────────────
  .get("/list", async () => {
    return await db.vpnServer.findMany({
      orderBy: { createdAt: "desc" },
    });
  })

  // ─── PATCH /admin/server/:id ─────────────────────────
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const { location, connectLinkTemplate, status, serverType } = body;
        let finalTemplate = connectLinkTemplate;
        if (
          finalTemplate &&
          finalTemplate.includes("vless://") &&
          !finalTemplate.includes("type=")
        ) {
          const [baseUrl, tag] = finalTemplate.split("#");
          const separator = baseUrl.includes("?") ? "&" : "?";
          finalTemplate = `${baseUrl}${separator}type=tcp${
            tag ? "#" + tag : ""
          }`;
        }

        const updated = await db.vpnServer.update({
          where: { id: params.id },
          data: {
            location,
            connectLinkTemplate: finalTemplate,
            status: status as any,
            serverType,
          },
        });
        return updated;
      } catch (err) {
        console.error(err);
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        location: t.Optional(t.String()),
        connectLinkTemplate: t.Optional(t.Nullable(t.String())),
        status: t.Optional(t.String()),
        serverType: t.Optional(t.String()),
      }),
    },
  )

  // ─── DELETE /admin/server/:id ────────────────────────
  .delete("/:id", async ({ params, set }) => {
    try {
      await db.vpnServer.delete({
        where: { id: params.id },
      });
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  });
