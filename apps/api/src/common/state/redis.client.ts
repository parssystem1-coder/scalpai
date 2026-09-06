import { createConnection, type Socket } from "node:net";

/**
 * Minimal RESP2 client (ADR-0034).
 *
 * Shared auth/rate-limit state must live outside the process, but the whole
 * command surface we need is GET/SET/DEL/INCR/PEXPIRE/TTL — not enough to justify
 * a new runtime dependency (and a lockfile churn) in a self-hosted clinical
 * stack. This is a single-connection, pipelining-safe client over `node:net`:
 * replies are matched to commands in order, a protocol desync or timeout drops
 * the socket instead of answering the wrong caller, and the next command
 * reconnects lazily.
 *
 * TLS is intentionally out of scope: the API talks to Redis over the private
 * compose/network segment (`redis://`), never across the internet.
 */

export type RedisReply = string | number | null | RedisReply[];

interface Pending {
  resolve: (value: RedisReply) => void;
  reject: (err: Error) => void;
}

interface Parsed {
  value: RedisReply;
  offset: number;
  error?: string;
}

const CRLF = "\r\n";
const DEFAULT_PORT = 6379;
const CR = 0x0d;
const LF = 0x0a;

function indexOfCrlf(buf: Buffer, from: number): number {
  for (let i = from; i + 1 < buf.length; i += 1) {
    if (buf[i] === CR && buf[i + 1] === LF) return i;
  }
  return -1;
}

/** Returns null when the buffer does not yet hold a complete reply. */
function parseReply(buf: Buffer, at: number): Parsed | null {
  if (at >= buf.length) return null;
  const type = buf[at];
  const lineEnd = indexOfCrlf(buf, at + 1);
  if (lineEnd < 0) return null;
  const line = buf.toString("utf8", at + 1, lineEnd);
  const next = lineEnd + 2;

  switch (type) {
    case 0x2b: // + simple string
      return { value: line, offset: next };
    case 0x2d: // - error
      return { value: null, offset: next, error: line };
    case 0x3a: // : integer
      return { value: Number(line), offset: next };
    case 0x24: {
      // $ bulk string
      const length = Number(line);
      if (!Number.isFinite(length) || length < 0) return { value: null, offset: next };
      if (buf.length < next + length + 2) return null;
      return { value: buf.toString("utf8", next, next + length), offset: next + length + 2 };
    }
    case 0x2a: {
      // * array
      const count = Number(line);
      if (!Number.isFinite(count) || count < 0) return { value: null, offset: next };
      const items: RedisReply[] = [];
      let cursor = next;
      for (let i = 0; i < count; i += 1) {
        const item = parseReply(buf, cursor);
        if (!item) return null;
        if (item.error !== undefined) return { value: null, offset: item.offset, error: item.error };
        items.push(item.value);
        cursor = item.offset;
      }
      return { value: items, offset: cursor };
    }
    default:
      return { value: null, offset: next, error: "unsupported RESP reply type" };
  }
}

function encode(args: (string | number)[]): string {
  let out = `*${args.length}${CRLF}`;
  for (const arg of args) {
    const value = String(arg);
    out += `$${Buffer.byteLength(value)}${CRLF}${value}${CRLF}`;
  }
  return out;
}

export interface RedisClientOptions {
  url: string;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
}

export class RedisClient {
  private socket: Socket | null = null;
  private connecting: Promise<Socket> | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private pending: Pending[] = [];
  private closed = false;

  private readonly host: string;
  private readonly port: number;
  private readonly username: string | null;
  private readonly password: string | null;
  private readonly database: number;
  private readonly connectTimeoutMs: number;
  private readonly commandTimeoutMs: number;

  constructor(options: RedisClientOptions) {
    const url = new URL(options.url);
    if (url.protocol !== "redis:") {
      throw new Error(
        `unsupported REDIS_URL protocol '${url.protocol}' — use redis:// on a private network (ADR-0034)`,
      );
    }
    this.host = url.hostname.length > 0 ? url.hostname : "127.0.0.1";
    this.port = url.port.length > 0 ? Number(url.port) : DEFAULT_PORT;
    this.username = url.username.length > 0 ? decodeURIComponent(url.username) : null;
    this.password = url.password.length > 0 ? decodeURIComponent(url.password) : null;
    const dbPath = url.pathname.replace(/^\//, "");
    const db = dbPath.length > 0 ? Number(dbPath) : 0;
    this.database = Number.isFinite(db) && db > 0 ? db : 0;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 1_500;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 1_500;
  }

  async command(...args: (string | number)[]): Promise<RedisReply> {
    const socket = await this.ensureConnected();
    return this.send(socket, args);
  }

  async close(): Promise<void> {
    this.closed = true;
    const socket = this.socket;
    this.socket = null;
    this.failPending(new Error("redis client closed"));
    if (socket && !socket.destroyed) socket.destroy();
    await Promise.resolve();
  }

  private ensureConnected(): Promise<Socket> {
    if (this.closed) return Promise.reject(new Error("redis client is closed"));
    const socket = this.socket;
    if (socket && !socket.destroyed) return Promise.resolve(socket);
    if (!this.connecting) {
      this.connecting = this.open().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private open(): Promise<Socket> {
    return new Promise<Socket>((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let timer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const finish = (err: Error | null, value?: Socket): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (err || !value) {
          socket.destroy();
          reject(err ?? new Error("redis connection failed"));
          return;
        }
        resolve(value);
      };

      timer = setTimeout(
        () => finish(new Error(`redis connect timed out (${this.host}:${this.port})`)),
        this.connectTimeoutMs,
      );

      socket.setNoDelay(true);
      socket.on("data", (chunk: Buffer) => this.onData(chunk));
      socket.on("error", (err: Error) => {
        this.drop(err);
        finish(err);
      });
      socket.on("close", () => this.drop(new Error("redis connection closed")));
      socket.once("connect", () => {
        this.socket = socket;
        this.handshake(socket).then(
          () => finish(null, socket),
          (err: unknown) => finish(err instanceof Error ? err : new Error(String(err))),
        );
      });
    });
  }

  private async handshake(socket: Socket): Promise<void> {
    if (this.password) {
      const args = this.username
        ? ["AUTH", this.username, this.password]
        : ["AUTH", this.password];
      await this.send(socket, args);
    }
    if (this.database > 0) await this.send(socket, ["SELECT", this.database]);
  }

  private send(socket: Socket, args: (string | number)[]): Promise<RedisReply> {
    return new Promise<RedisReply>((resolve, reject) => {
      const timer = setTimeout(
        () => this.drop(new Error("redis command timed out")),
        this.commandTimeoutMs,
      );
      this.pending.push({
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      socket.write(encode(args), (err) => {
        if (err) this.drop(err);
      });
    });
  }

  /** Any protocol/transport fault kills the socket: never answer the wrong caller. */
  private drop(err: Error): void {
    const socket = this.socket;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.failPending(err);
    if (socket && !socket.destroyed) socket.destroy();
  }

  private failPending(err: Error): void {
    const waiting = this.pending;
    this.pending = [];
    for (const entry of waiting) entry.reject(err);
  }

  private onData(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const parsed = parseReply(this.buffer, 0);
      if (!parsed) return;
      this.buffer = this.buffer.subarray(parsed.offset);
      const next = this.pending.shift();
      if (!next) continue;
      if (parsed.error !== undefined) next.reject(new Error(parsed.error));
      else next.resolve(parsed.value);
    }
  }
}
