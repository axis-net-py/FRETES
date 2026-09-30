import test from "node:test";
import assert from "node:assert/strict";
import { POST as createClient } from "../src/app/api/clients/route";
import {
  PATCH as updateClient,
  DELETE as deleteClient,
} from "../src/app/api/clients/[id]/route";
import { prisma } from "../src/lib/prisma";
import { createSession, COOKIE } from "../src/lib/session";

test("client registration accepts optional whatsapp and updates via PATCH", async (t) => {
  process.env.SESSION_SECRET = "fixture-client-registration-secret-32-chars";
  const cookie = `${COOKIE}=${await createSession()}`;

  const originalCreate = prisma.client.create;
  const originalUpdate = prisma.client.update;
  const originalFindUnique = prisma.client.findUnique;

  prisma.client.create = t.mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "c-1",
    ...data,
  })) as unknown as typeof originalCreate;

  prisma.client.findUnique = t.mock.fn(async () => ({
    id: "c-1",
    name: "COTRIPAR S.A.",
    whatsapp: "+595982109823",
    consent: false,
    _count: { containers: 0 },
  })) as unknown as typeof originalFindUnique;

  prisma.client.update = t.mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "c-1",
    name: "COTRIPAR S.A.",
    ...data,
  })) as unknown as typeof originalUpdate;

  t.after(() => {
    prisma.client.create = originalCreate;
    prisma.client.update = originalUpdate;
    prisma.client.findUnique = originalFindUnique;
  });

  // Client without whatsapp
  const res1 = await createClient(
    new Request("https://fretes.example/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "COTRIPAR S.A.", whatsapp: "" }),
    }),
  );
  assert.equal(res1.status, 201);
  const data1 = await res1.json();
  assert.equal(data1.whatsapp, "");

  // Update client to clear wrong whatsapp number
  const res2 = await updateClient(
    new Request("https://fretes.example/api/clients/c-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ whatsapp: "", consent: false }),
    }),
    { params: Promise.resolve({ id: "c-1" }) },
  );
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.whatsapp, "");
});

test("client delete supports merging containers into target client", async (t) => {
  process.env.SESSION_SECRET = "fixture-client-registration-secret-32-chars";
  const cookie = `${COOKIE}=${await createSession()}`;

  const originalFindUnique = prisma.client.findUnique;
  const originalTransaction = prisma.$transaction;
  const originalDelete = prisma.client.delete;

  const mockTx = {
    container: {
      updateMany: t.mock.fn(async () => ({ count: 2 })),
    },
    client: {
      delete: t.mock.fn(async () => ({ id: "c-duplicate" })),
    },
  };

  prisma.client.findUnique = t.mock.fn(async ({ where }: { where: { id: string } }) => {
    if (where.id === "c-duplicate") {
      return { id: "c-duplicate", name: "COTRIPAR SA", _count: { containers: 2 } };
    }
    if (where.id === "c-canonical") {
      return { id: "c-canonical", name: "COTRIPAR S.A.", _count: { containers: 1 } };
    }
    return null;
  }) as unknown as typeof originalFindUnique;

  prisma.$transaction = t.mock.fn(async (cb: (tx: typeof mockTx) => unknown) => {
    return cb(mockTx);
  }) as unknown as typeof originalTransaction;

  t.after(() => {
    prisma.client.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
    prisma.client.delete = originalDelete;
  });

  // Attempting to delete when containers exist returns 409
  const resConflict = await deleteClient(
    new Request("https://fretes.example/api/clients/c-duplicate", {
      method: "DELETE",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id: "c-duplicate" }) },
  );
  assert.equal(resConflict.status, 409);
  const conflictData = await resConflict.json();
  assert.equal(conflictData.canMerge, true);

  // Deleting with ?mergeInto transfers containers and deletes duplicate
  const resMerged = await deleteClient(
    new Request("https://fretes.example/api/clients/c-duplicate?mergeInto=c-canonical", {
      method: "DELETE",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id: "c-duplicate" }) },
  );
  assert.equal(resMerged.status, 200);
  const mergedData = await resMerged.json();
  assert.equal(mergedData.ok, true);
  assert.equal(mergedData.mergedInto, "c-canonical");
  assert.equal(mergedData.reassignedContainers, 2);
});
