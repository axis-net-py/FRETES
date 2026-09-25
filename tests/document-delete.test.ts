import test from "node:test";
import assert from "node:assert/strict";
import { DELETE } from "../src/app/api/documents/[id]/route";
import { prisma } from "../src/lib/prisma";
import { createSession, COOKIE } from "../src/lib/session";

test("document deletion requires login, blocks linked freights and removes pending files", async (t) => {
  process.env.SESSION_SECRET = "fixture-document-deletion-secret-32-characters";
  const cookie = `${COOKIE}=${await createSession()}`;
  const originalFind = prisma.tripDocument.findUnique;
  const originalDelete = prisma.tripDocument.delete;
  let stored: { id: string; containerId: string | null } | null = null;
  let deleted: string[] = [];
  prisma.tripDocument.findUnique = (async () => stored) as unknown as typeof originalFind;
  prisma.tripDocument.delete = (async ({ where }: { where: { id: string } }) => {
    deleted.push(where.id);
    return { id: where.id };
  }) as unknown as typeof originalDelete;
  t.after(() => {
    prisma.tripDocument.findUnique = originalFind;
    prisma.tripDocument.delete = originalDelete;
  });
  const request = (id: string, authenticated = true) =>
    new Request(`https://fretes.example/api/documents/${id}`, {
      method: "DELETE",
      ...(authenticated ? { headers: { cookie } } : {}),
    });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  assert.equal((await DELETE(request("doc-1", false), params("doc-1"))).status, 401);
  stored = null;
  assert.equal((await DELETE(request("missing"), params("missing"))).status, 404);
  stored = { id: "linked", containerId: "freight-1" };
  const blocked = await DELETE(request("linked"), params("linked"));
  assert.equal(blocked.status, 409);
  assert.match(((await blocked.json()) as { error: string }).error, /frete/);
  stored = { id: "pending", containerId: null };
  const removed = await DELETE(request("pending"), params("pending"));
  assert.equal(removed.status, 200);
  assert.deepEqual(deleted, ["pending"]);
});
