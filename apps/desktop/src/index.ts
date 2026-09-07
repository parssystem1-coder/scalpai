/**
 * ScalpAI desktop shell — CONTRACT ONLY.
 *
 * WEAKNESSES M3. This module used to export a manager that returned a
 * hard-coded list of two trichoscopes (brand A model X and brand B model Y),
 * set a flag to true, and logged "Initialized with 2 detected UVC
 * trichoscopy drivers" at import time. None of that was real: there is no
 * Electron main process in this repository, no IPC bridge, no UVC enumeration and
 * no local SQLite cache. The claim was reachable from docs and from the product
 * copy, which is exactly the kind of unprovable statement phase 10 removes.
 *
 * The honest version keeps the CONTRACT — the channel names and payload shapes a
 * real shell would have to implement — and reports capability as false. Anything
 * that asks "can this installation talk to a trichoscope?" now gets `false` until
 * a shell exists to answer otherwise.
 */

export interface DesktopAppConfig {
  appName: string;
  appVersion: string;
  apiBaseUrl: string;
  isOfflineMode: boolean;
}

/**
 * The shape a real shell would return from `ENUMERATE_UVC_DEVICES`. It exists so
 * the web app can be written against a stable type, not so anything can pretend
 * to have found one.
 */
export interface UvcTrichoscopeDevice {
  deviceId: string;
  label: string;
  manufacturer: string;
  maxResolution: { width: number; height: number };
  supportsCrossPolarization: boolean;
  supportsOpticalMagnification: boolean;
}

/** IPC channel names a desktop shell would have to implement. */
export const TRICHOSCOPY_IPC_CHANNELS = {
  ENUMERATE_UVC_DEVICES: "trichoscopy:enumerate-devices",
  SELECT_UVC_DEVICE: "trichoscopy:select-device",
  GRAB_FRAME_RAW: "trichoscopy:grab-frame",
  GET_OFFLINE_STORAGE_PATH: "storage:get-local-path",
  CHECK_LICENSE_STATUS: "license:check-status",
} as const;

/**
 * What a desktop shell would have to inject on `globalThis` for any of the above
 * to be callable. Nothing in this repository provides it.
 */
export interface DesktopBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
}

function resolveBridge(): DesktopBridge | null {
  const candidate = (globalThis as { scalpaiDesktop?: unknown }).scalpaiDesktop;
  if (candidate && typeof (candidate as DesktopBridge).invoke === "function") {
    return candidate as DesktopBridge;
  }
  return null;
}

/**
 * Capability report. `available` is the ONLY honest answer about hardware: it is
 * true when, and only when, a shell has injected a bridge to ask.
 */
export interface TrichoscopyCapability {
  available: boolean;
  reason: string;
}

export function trichoscopyCapability(): TrichoscopyCapability {
  return resolveBridge()
    ? { available: true, reason: "desktop bridge present" }
    : {
        available: false,
        reason: "no desktop shell: UVC trichoscopy capture is not implemented in this build",
      };
}

/**
 * Enumerate devices THROUGH the bridge. With no bridge the answer is an empty
 * list — never a fabricated one.
 */
export async function listTrichoscopes(): Promise<UvcTrichoscopeDevice[]> {
  const bridge = resolveBridge();
  if (!bridge) return [];
  const devices = await bridge.invoke(TRICHOSCOPY_IPC_CHANNELS.ENUMERATE_UVC_DEVICES);
  return Array.isArray(devices) ? (devices as UvcTrichoscopeDevice[]) : [];
}

export const DEFAULT_DESKTOP_CONFIG: DesktopAppConfig = {
  appName: "ScalpAI Clinical Studio",
  appVersion: "0.0.0",
  apiBaseUrl: process.env.SCALPAI_API_URL ?? "http://localhost:3001/api",
  isOfflineMode: false,
};
