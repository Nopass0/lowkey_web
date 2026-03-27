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
        const { location, hostname, connectLinkTemplate, status, serverType } = body;
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
            hostname: hostname ?? null,
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
        hostname: t.Optional(t.Nullable(t.String())),
        connectLinkTemplate: t.Optional(t.Nullable(t.String())),
        status: t.Optional(t.String()),
        serverType: t.Optional(t.String()),
      }),
    },
  )

  // ─── GET /admin/server/mtproto ───────────────────────
  .get("/mtproto", async ({ set }) => {
    try {
      const settings = await db.mtprotoSettings.findFirst({});
      return settings ?? {
        id: "global", enabled: false, port: 443,
        secret: null, channelUsername: null, botUsername: null, addChannelOnConnect: false,
      };
    } catch (err) {
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // ─── PATCH /admin/server/mtproto ─────────────────────
  .patch(
    "/mtproto",
    async ({ body, set }) => {
      try {
        const existing = await db.mtprotoSettings.findFirst({});
        if (existing) {
          return await db.mtprotoSettings.update({ where: { id: "global" }, data: body });
        }
        return await db.mtprotoSettings.create({ data: { id: "global", ...body } });
      } catch (err) {
        set.status = 500;
        return { message: "Internal server error" };
      }
    },
    {
      body: t.Object({
        enabled: t.Optional(t.Boolean()),
        port: t.Optional(t.Number()),
        secret: t.Optional(t.Nullable(t.String())),
        channelUsername: t.Optional(t.Nullable(t.String())),
        botUsername: t.Optional(t.Nullable(t.String())),
        addChannelOnConnect: t.Optional(t.Boolean()),
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
