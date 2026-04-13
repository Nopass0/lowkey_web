/**
 * @fileoverview JOPA relay auth proxy.
 * Proxies bootstrap requests to the JOPA relay API so clients get a valid
 * sub_token without exposing master credentials.
 */

import Elysia from "elysia";
import { authMiddleware } from "../auth/middleware";
import { config } from "../config";

export const jopaRoutes = new Elysia({ prefix: "/user/jopa-token" })
  .use(authMiddleware)
  .get("/", async ({ user, set }) => {
    try {
      const url = `${config.JOPA_API_URL}/api/v1/client/bootstrap`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: config.JOPA_LOGIN,
          password: config.JOPA_PASSWORD,
          sub_token: "auto",
          device_id: `lowkey-${user.userId}`,
          device_name: "lowkey-client",
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        set.status = 502;
        return { message: "JOPA bootstrap failed" };
      }

      const data = (await resp.json()) as any;
      const sub_token =
        data?.subscription?.token ?? data?.token ?? null;

      if (!sub_token) {
        set.status = 502;
        return { message: "No sub_token in bootstrap response" };
      }

      return { sub_token };
    } catch (err) {
      set.status = 502;
      return { message: "JOPA bootstrap error" };
    }
  });
