import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LoginThrottleService } from "../src/auth/login-throttle.service.js";
import { MemoryKvStore, RedisKvStore, type KvStore } from "../src/common/state/kv.store.js";
import { RedisClient } from "../src/common/state/redis.client.js";
import { StateStore } from "../src/common/state/state.store.js";

/**
 * WEAKNESSES R11/M6 — the shared-state contract (ADR-0034).
 *
 * The memory driver is exercised always; the Redis driver runs whenever
 * REDIS_TEST_URL points at a reachable instance (CI always sets it), so the
 * hand-rolled RESP client is proven against a real server and not just a mock.
 */

const REDIS_URL = process.env.REDIS_TEST_URL?.trim();

function kvContract(name: string, make: () => KvStore): void {
  describe(`kv contract — ${name}`, () => {
    let store: KvStore;

    beforeAll(() => {
      store = make();
    });

    afterAll(async () => {
      await store?.close();
    });

    it("writes, reads and deletes a value", async () => {
      const key = `phase3:${randomUUID()}`;
      expect(await store.get(key)).toBeNull();
      await store.set(key, "value-1", 5_000);
      expect(await store.get(key)).toBe("value-1");
      await store.del(key);
      expect(await store.get(key)).toBeNull();
    });

    it("drops a value when its TTL elapses (no sweeper needed)", async () => {
      const key = `phase3:${randomUUID()}`;
      await store.set(key, "short-lived", 150);
      expect(await store.get(key)).toBe("short-lived");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await store.get(key)).toBeNull();
    });

    it("counts hits inside one fixed window and starts over after it", async () => {
      const key = `phase3:${randomUUID()}`;
      expect(await store.hit(key, 250)).toBe(1);
      expect(await store.hit(key, 250)).toBe(2);
      expect(await store.hit(key, 250)).toBe(3);
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(await store.hit(key, 250)).toBe(1);
    });
  });
}

kvContract("memory", () => new MemoryKvStore());

if (REDIS_URL) {
  describe("redis transport", () => {
    it("speaks RESP to a real server", async () => {
      const client = new RedisClient({ url: REDIS_URL });
      try {
        expect(await client.command("PING")).toBe("PONG");
        const key = `phase3:${randomUUID()}`;
        await client.command("SET", key, "pipelined", "PX", 2_000);
        expect(await client.command("GET", key)).toBe("pipelined");
        expect(await client.command("DEL", key)).toBe(1);
        expect(await client.command("GET", key)).toBeNull();
      } finally {
        await client.close();
      }
    });
  });

  kvContract("redis", () => new RedisKvStore(new RedisClient({ url: REDIS_URL })));

  describe("two replicas, one shared budget (R11)", () => {
    const saved = {
      url: process.env.REDIS_URL,
      namespace: process.env.REDIS_NAMESPACE,
      max: process.env.AUTH_IP_MAX,
      window: process.env.AUTH_IP_WINDOW_MS,
    };
    let replicaA: StateStore;
    let replicaB: StateStore;

    beforeAll(() => {
      process.env.REDIS_URL = REDIS_URL;
      process.env.REDIS_NAMESPACE = `phase3-replicas-${randomUUID()}`;
      process.env.AUTH_IP_MAX = "4";
      process.env.AUTH_IP_WINDOW_MS = "5000";
      // Two independent stores over one Redis == two API replicas.
      replicaA = new StateStore();
      replicaB = new StateStore();
    });

    afterAll(async () => {
      await replicaA?.onModuleDestroy();
      await replicaB?.onModuleDestroy();
      restore("REDIS_URL", saved.url);
      restore("REDIS_NAMESPACE", saved.namespace);
      restore("AUTH_IP_MAX", saved.max);
      restore("AUTH_IP_WINDOW_MS", saved.window);
    });

    it("refuses at the shared limit instead of once per process", async () => {
      expect(replicaA.driver).toBe("redis");
      expect(replicaB.driver).toBe("redis");

      const throttleA = new LoginThrottleService(replicaA);
      const throttleB = new LoginThrottleService(replicaB);
      const ip = "203.0.113.7";

      await throttleA.assertBucketAllowed("login", ip);
      await throttleA.assertBucketAllowed("login", ip);
      await throttleB.assertBucketAllowed("login", ip);
      await throttleB.assertBucketAllowed("login", ip);

      // Fifth attempt anywhere in the cluster is over the shared budget of 4 —
      // with per-process Maps each replica would still have two attempts left.
      await expect(throttleB.assertBucketAllowed("login", ip)).rejects.toMatchObject({ status: 429 });
      await expect(throttleA.assertBucketAllowed("login", ip)).rejects.toMatchObject({ status: 429 });
    });
  });
} else {
  describe.skip("kv contract — redis (REDIS_TEST_URL not set)", () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
}

describe("state namespacing (M6)", () => {
  const previousNamespace = process.env.REDIS_NAMESPACE;

  afterAll(() => {
    restore("REDIS_NAMESPACE", previousNamespace);
  });

  it("scopes tenant state per clinic and stores no raw identifier in a key", async () => {
    process.env.REDIS_NAMESPACE = "phase3-spec";
    const store = new StateStore();
    try {
      expect(store.tenantKey("clinic-1", "entitlement")).toBe("scalpai:phase3-spec:t:clinic-1:entitlement");
      expect(store.tenantKey("clinic-2", "entitlement")).not.toBe(store.tenantKey("clinic-1", "entitlement"));

      const lockKey = store.key("auth", "lock", StateStore.digest("owner@clinic-a.test"));
      expect(lockKey).not.toContain("owner@clinic-a.test");
      expect(lockKey.startsWith("scalpai:phase3-spec:auth:lock:")).toBe(true);
      expect(StateStore.digest("a")).not.toBe(StateStore.digest("b"));
    } finally {
      await store.onModuleDestroy();
    }
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
