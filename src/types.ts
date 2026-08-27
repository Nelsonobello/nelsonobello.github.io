import type { Context } from "hono";

export type Variables = {
  adminId: string;
};

export type AppContext = Context<{ Variables: Variables }>;
