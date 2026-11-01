// One vote per network: stores only a salted hash of the visitor's IP, one blob per vote.
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const count = async store => (await store.list()).blobs.length;

export default async req => {
  const store = getStore({ name: "interest", consistency: "strong" });
  if (req.method === "POST") {
    const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
    const key = createHash("sha256").update(`islet-interest:${ip}`).digest("hex");
    await store.set(key, "1");
  } else if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  return Response.json({ count: await count(store) }, { headers: { "cache-control": "no-store" } });
};

export const config = {
  path: "/api/interest",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
