import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterNotImplementedError } from "./types.js";
import type { MessagingAdapter, OutboundMessage, SendResult } from "./types.js";
import { DEFAULT_CHANNEL_ORDER, routeAfterFailure, routeChannel, sendWithChannelFailover } from "./router.js";
import type { RouteRequest } from "./router.js";

const reachable: RouteRequest["recipient"] = {
  optedIn: ["bale", "eitaa", "telegram", "whatsapp"],
  hasMobile: true,
};

const smsOnly: RouteRequest["recipient"] = {
  optedIn: [],
  hasMobile: true,
};

const iranEnv = {
  KAVENEGAR_API_KEY: "key",
  KAVENEGAR_SENDER: "1000",
  BALE_BOT_TOKEN: "bale-token",
};

describe("DEFAULT_CHANNEL_ORDER", () => {
  it("is SMS-first", () => {
    expect(DEFAULT_CHANNEL_ORDER[0]).toBe("kavenegar");
  });
});

describe("routeChannel", () => {
  it.each([
    {
      name: "preferred bale when configured and opted-in",
      request: { preferred: "bale" as const, recipient: reachable, env: iranEnv },
      channel: "bale",
    },
    {
      name: "kavenegar when messenger not opted-in",
      request: { preferred: "bale" as const, recipient: smsOnly, env: iranEnv },
      channel: "kavenegar",
      fallbackFrom: "bale",
    },
    {
      name: "kavenegar when only SMS is configured",
      request: { preferred: "bale" as const, recipient: reachable, env: { KAVENEGAR_API_KEY: "k", KAVENEGAR_SENDER: "1" } },
      channel: "kavenegar",
      fallbackFrom: "bale",
    },
  ])("$name", ({ request, channel, fallbackFrom }) => {
    const decision = routeChannel(request);
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.channel).toBe(channel);
      expect(decision.fallbackFrom).toBe(fallbackFrom);
    }
  });

  it("refuses opted-out recipients before any channel", () => {
    const decision = routeChannel({
      preferred: "kavenegar",
      recipient: { ...reachable, optedOut: true },
      env: iranEnv,
    });
    expect(decision).toMatchObject({ ok: false, reason: "recipient-opted-out" });
  });
});

describe("routeAfterFailure", () => {
  it("drops the failed channel and lands on kavenegar", () => {
    const decision = routeAfterFailure(
      { preferred: "bale", recipient: reachable, env: iranEnv },
      "bale",
    );
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.channel).toBe("kavenegar");
      expect(decision.fallbackFrom).toBe("bale");
    }
  });

  it("does not retry a channel already tried", () => {
    const decision = routeAfterFailure(
      { preferred: "bale", recipient: reachable, env: iranEnv },
      "bale",
      ["bale", "kavenegar"],
    );
    expect(decision.ok).toBe(false);
  });
});

describe("sendWithChannelFailover (Bale → SMS)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const message: Omit<OutboundMessage, "channel"> = {
    to: "09120000000",
    body: "یادآوری نوبت",
    locale: "fa",
    idempotencyKey: "enroll-1:0",
  };

  it("sends once on kavenegar after Bale throws AdapterNotImplementedError", async () => {
    const send = vi.fn(async (adapter: MessagingAdapter, outbound: OutboundMessage): Promise<SendResult> => {
      if (adapter.channel === "bale") throw new AdapterNotImplementedError("bale");
      expect(outbound.channel).toBe("kavenegar");
      return { outcome: "accepted", provider: "kavenegar", providerMessageId: "sms-1" };
    });

    const result = await sendWithChannelFailover({
      request: { preferred: "bale", recipient: reachable, env: iranEnv },
      message,
      initial: "bale",
      send,
    });

    expect(result.attempted).toEqual(["bale", "kavenegar"]);
    expect(result.channel).toBe("kavenegar");
    expect(result.result.outcome).toBe("accepted");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].channel).toBe("kavenegar");
  });

  it("falls through on a rejected Bale send without deferring", async () => {
    const send = vi.fn(async (adapter: MessagingAdapter): Promise<SendResult> => {
      if (adapter.channel === "bale") {
        return { outcome: "rejected", provider: "bale", reason: "provider-unreachable", retryable: true };
      }
      return { outcome: "accepted", provider: "kavenegar", providerMessageId: "sms-2" };
    });

    const result = await sendWithChannelFailover({
      request: { preferred: "bale", recipient: reachable, env: iranEnv },
      message,
      initial: "bale",
      send,
    });

    expect(result.channel).toBe("kavenegar");
    expect(result.result.outcome).toBe("accepted");
    expect(result.attempted).toEqual(["bale", "kavenegar"]);
  });
});
