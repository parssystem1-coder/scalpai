import { readFileSync } from "node:fs";

/**
 * Licence material resolution (phase 10 / M2, ADR-0043).
 *
 * Following the phase 9 rule for every other secret: the value may come from an
 * env var for development, but the SUPPORTED production path is a mounted file,
 * so the token never appears in `docker inspect` or a process listing.
 *
 * Nothing here has a fallback. A missing licence is the `unlicensed` state, not
 * a silently "valid" one.
 */
export interface LicenseMaterial {
  token: string | null;
  publicKeyPem: string | null;
  /** Where each value came from — surfaced in diagnostics, never the value itself. */
  source: { token: "env" | "file" | "none"; publicKey: "env" | "file" | "none" };
}

function readSecretFile(path: string): string | null {
  try {
    const text = readFileSync(path, "utf8").trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function resolveOne(inline: string | undefined, filePath: string | undefined): { value: string | null; source: "env" | "file" | "none" } {
  if (filePath) {
    const fromFile = readSecretFile(filePath);
    if (fromFile) return { value: fromFile, source: "file" };
  }
  const trimmed = inline?.trim();
  if (trimmed && trimmed.length > 0) return { value: trimmed, source: "env" };
  return { value: null, source: "none" };
}

export function resolveLicenseMaterial(env: NodeJS.ProcessEnv = process.env): LicenseMaterial {
  const token = resolveOne(env.LICENSE_TOKEN, env.LICENSE_TOKEN_FILE);
  const publicKey = resolveOne(env.LICENSE_PUBLIC_KEY, env.LICENSE_PUBLIC_KEY_FILE);
  return {
    token: token.value,
    // A PEM in an env var arrives with literal \n sequences more often than not.
    publicKeyPem: publicKey.value ? publicKey.value.replace(/\\n/g, "\n") : null,
    source: { token: token.source, publicKey: publicKey.source },
  };
}
