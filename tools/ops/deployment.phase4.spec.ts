import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Phase 4 regression suite - "self-hosted infrastructure & secure deployment".
 *
 * Every assertion here maps to a WEAKNESSES item that was closed by editing a
 * config file. Config rots silently, so it gets tests exactly like code does:
 * CI additionally BUILDS the images and boots migrate+api from an empty volume
 * (.github/workflows/ci.yml, job `deployment`).
 *
 * Negative assertions run against the file with comment lines removed: a
 * comment that documents a banned pattern is not the banned pattern.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Drops whole-line `#` comments (Dockerfile, YAML, .dockerignore). */
function code(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

const prod = read("ops/prod.yml");
const dev = read("ops/dev.yml");
const caddy = read("ops/Caddyfile");
const ci = read(".github/workflows/ci.yml");
const apiDockerfile = read("apps/api/Dockerfile");
const webDockerfile = read("apps/web/Dockerfile");
const rootPkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const apiPkg = JSON.parse(read("apps/api/package.json")) as { scripts: Record<string, string> };

const SERVICES = ["caddy", "web", "migrate", "api", "postgres", "minio", "redis", "backup-cron"];

/** Everything between `services:` and the trailing `volumes:` block. */
function servicesBlock(text: string): string {
  const start = text.indexOf("\nservices:");
  const end = text.indexOf("\nvolumes:");
  return text.slice(start, end === -1 ? undefined : end);
}

/** Every `${VAR...}` reference in a compose file, with its default/error suffix. */
function composeVars(text: string): { name: string; raw: string }[] {
  return [...text.matchAll(/\$\{([A-Z0-9_]+)([^}]*)\}/g)].map((m) => ({ name: m[1]!, raw: m[2]! }));
}

function imageTags(text: string): string[] {
  return [...text.matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map((m) => m[1]!);
}

describe("C8 - production secrets have no fallbacks", () => {
  it("drops every shared default password", () => {
    expect(prod).not.toContain("scalpai_secure_pwd");
    expect(prod).not.toContain("scalpai_secure_backup_key");
  });

  it("requires (`:?`) every secret-bearing variable", () => {
    const mustBeRequired = new Set([
      "POSTGRES_USER",
      "POSTGRES_PASSWORD",
      "POSTGRES_DB",
      "APP_ROLE_PASSWORD",
      "MINIO_ROOT_USER",
      "MINIO_ROOT_PASSWORD",
      "S3_BUCKET",
      "JWT_SECRET",
      "BACKUP_ENCRYPTION_PASSPHRASE",
      "SCALPAI_DOMAIN",
      "ACME_EMAIL",
    ]);
    for (const { name, raw } of composeVars(prod)) {
      if (!mustBeRequired.has(name)) continue;
      expect(raw.startsWith(":?"), `${name} must be declared as \${${name}:?...}`).toBe(true);
    }
    for (const name of mustBeRequired) expect(prod).toContain(`\${${name}:?`);
  });
});

describe("C8 - runtime never uses the database owner role", () => {
  it("connects the API as scalpai_app", () => {
    const dbUrls = [...prod.matchAll(/DATABASE_URL=([^\n]+)/g)].map((m) => m[1]!);
    expect(dbUrls.length).toBeGreaterThan(0);
    const runtime = dbUrls.filter((u) => !u.startsWith("postgres://${POSTGRES_USER"));
    expect(runtime.length).toBeGreaterThan(0);
    for (const url of runtime) expect(url).toContain("postgres://scalpai_app:");
  });

  it("reserves the owner credentials for the migration and the server itself", () => {
    for (const line of code(prod).split("\n")) {
      if (!line.includes("${POSTGRES_USER:?")) continue;
      const ownerUsage = /MIGRATE_DATABASE_URL|POSTGRES_USER: |POSTGRES_USER=/.test(line);
      expect(ownerUsage, `owner credentials leaked into: ${line.trim()}`).toBe(true);
    }
  });
});

describe("C8 - migrations are a separate one-shot service the app waits for", () => {
  it("declares a migrate service that runs once", () => {
    expect(prod).toMatch(/^ {2}migrate:$/m);
    expect(prod).toContain('command: ["npm", "run", "db:migrate"]');
    expect(prod).toContain('restart: "no"');
  });

  it("blocks the API until the migration exits successfully", () => {
    const apiBlock = prod.slice(prod.indexOf("\n  api:"), prod.indexOf("\n  postgres:"));
    expect(apiBlock).toMatch(/migrate:\s*\n\s*condition: service_completed_successfully/);
  });
});

describe("C8 - the worker claim is gone", () => {
  it("has no service pointing at a non-existent dist/worker.js", () => {
    expect(prod).not.toContain("dist/worker.js");
    expect(prod).not.toMatch(/^ {2}worker:$/m);
    expect(existsSync(join(ROOT, "apps/api/src/worker.ts"))).toBe(false);
  });
});

describe("C8/H16 - images build from the lockfile with real native modules", () => {
  for (const [name, dockerfile] of [
    ["api", apiDockerfile],
    ["web", webDockerfile],
  ] as const) {
    it(`${name}: npm ci, no --ignore-scripts, turbo build`, () => {
      const directives = code(dockerfile);
      expect(directives).toContain("npm ci");
      expect(directives).not.toContain("npm install");
      expect(directives).not.toContain("--ignore-scripts");
      expect(directives).not.toContain("npm run build --filter");
      expect(directives).toContain("npm exec -- turbo run build --filter");
    });

    it(`${name}: ships a container healthcheck`, () => {
      expect(dockerfile).toContain("HEALTHCHECK");
    });
  }

  it("keeps the libvips toolchain for sharp", () => {
    expect(code(apiDockerfile)).toContain("vips-dev");
  });

  it("has a .dockerignore that excludes host artifacts and secrets", () => {
    const ignore = code(read(".dockerignore"));
    for (const entry of ["node_modules", ".git", "dist", ".env", "ops/prod.env"]) {
      expect(ignore).toContain(entry);
    }
  });

  it("installs with npm ci in CI, without an npm install fallback", () => {
    const steps = code(ci);
    expect(steps).toContain("npm ci --legacy-peer-deps");
    expect(steps).not.toContain("npm install");
    expect(steps).not.toContain("if [ -f package-lock.json ]");
  });
});

describe("M17 - runtime healthchecks, limits and pinned images", () => {
  it("health-checks api and web", () => {
    const apiBlock = prod.slice(prod.indexOf("\n  api:"), prod.indexOf("\n  postgres:"));
    const webBlock = prod.slice(prod.indexOf("\n  web:"), prod.indexOf("\n  migrate:"));
    expect(apiBlock).toContain("healthcheck:");
    expect(apiBlock).toContain("/api/v1/health");
    expect(webBlock).toContain("healthcheck:");
  });

  it("gives every service a resource ceiling", () => {
    const block = servicesBlock(prod);
    const services = [...block.matchAll(/^ {2}([a-z][a-z-]*):$/gm)].map((m) => m[1]!);
    expect(services).toEqual(SERVICES);
    expect([...block.matchAll(/limits:/g)]).toHaveLength(SERVICES.length);
  });

  it("pins every image (no :latest, no bare repository)", () => {
    for (const tag of [...imageTags(prod), ...imageTags(dev)]) {
      expect(tag, `${tag} is not pinned`).toContain(":");
      expect(tag).not.toContain(":latest");
    }
  });

  it("uses one Postgres major across CI, dev and prod", () => {
    const majors = new Set(
      [ci, dev, prod].map((text) => {
        const m = /pgvector\/pgvector:pg(\d+)/.exec(text);
        expect(m, "pgvector image tag not found").not.toBeNull();
        return m![1]!;
      }),
    );
    expect([...majors]).toHaveLength(1);
    const backupMajor = /postgres:(\d+)-alpine/.exec(prod)?.[1];
    expect(backupMajor).toBe([...majors][0]);
  });

  it("drains gracefully on SIGTERM", () => {
    const main = read("apps/api/src/main.ts");
    expect(main).toContain("enableShutdownHooks");
    expect(main).toContain("SIGTERM");
    expect(prod).toContain("stop_grace_period");
  });
});

describe("C8/R10 - Caddy terminates TLS on a real domain", () => {
  it("has automatic HTTPS enabled", () => {
    const directives = code(caddy);
    expect(directives).not.toContain("auto_https off");
    expect(directives).not.toMatch(/^:80 \{/m);
    expect(directives).toContain("{$SCALPAI_DOMAIN}");
    expect(directives).toContain("{$ACME_EMAIL}");
  });

  it("redirects plain HTTP to HTTPS", () => {
    expect(code(caddy)).toMatch(/http:\/\/\{\$SCALPAI_DOMAIN\}\s*\{\s*redir https:\/\//);
  });

  it("forwards the /api prefix untouched (the API serves /api/v1)", () => {
    const directives = code(caddy);
    expect(directives).not.toContain("strip_prefix /api");
    expect(directives).toContain("reverse_proxy api:3000");
  });

  it("sends HSTS", () => {
    expect(code(caddy)).toContain("Strict-Transport-Security");
  });
});

describe("H14/R7/R9 - root scripts really cover every workspace", () => {
  it("builds and typechecks through turbo, not just app-web", () => {
    expect(rootPkg.scripts.build).toContain("turbo run build");
    expect(rootPkg.scripts.build).not.toContain("--workspace=@scalpai/app-web");
    expect(rootPkg.scripts.typecheck).toContain("turbo run typecheck");
    expect(rootPkg.scripts.typecheck).not.toContain("--workspace=@scalpai/app-web");
  });

  it("never nests turbo inside a turbo task", () => {
    expect(apiPkg.scripts.build).not.toContain("turbo run build");
    expect(apiPkg.scripts.build).not.toContain("dist/index.html");
  });
});

describe("C8/R10 - exactly one deployment model", () => {
  it("has no Vercel project for the API", () => {
    expect(existsSync(join(ROOT, "apps/api/vercel.json"))).toBe(false);
  });

  it("limits the root Vercel project to the static web bundle", () => {
    const vercel = JSON.parse(read("vercel.json")) as { buildCommand: string; installCommand: string };
    expect(vercel.buildCommand).toBe("npm run build:vercel");
    expect(vercel.installCommand).toContain("npm ci");
  });
});

describe("H15 - npm is the only package manager on executable surfaces", () => {
  const files = [
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "playwright.config.ts",
    "vitest.config.ts",
    ".husky/pre-commit",
    ".husky/commit-msg",
    ".github/workflows/ci.yml",
    "tools/graph/extract.ts",
    "tools/bundle-budget.ts",
    "tools/conformance/run.ts",
    "ops/prod.yml",
    "ops/dev.yml",
    "ops/README.md",
    "apps/api/Dockerfile",
    "apps/web/Dockerfile",
    "vercel.json",
    "docs/ops/DEPLOYMENT.md",
  ];

  for (const rel of files) {
    it(`${rel} contains no pnpm invocation`, () => {
      expect(existsSync(join(ROOT, rel)), `${rel} is missing`).toBe(true);
      expect(read(rel)).not.toMatch(/\bpnpm\b/);
    });
  }
});
