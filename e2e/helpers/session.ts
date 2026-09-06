import { expect, type Page } from "@playwright/test";

/**
 * One place that knows how to get a browser into an authenticated ScalpAI
 * session (WEAKNESSES H15).
 *
 * Why it exists: every spec used to navigate to "/" (the marketing landing
 * page) and then look for Persian labels that the login form does not have, so
 * the whole suite was unrunnable. Everything here goes through the real /login
 * route and stable data-testid hooks, never through copy that i18n may change.
 */

export interface Credentials {
  email: string;
  password: string;
}

/** Seeded by npm run db:seed (packages/db/src/seed.ts). */
export const CLINIC_A_OWNER: Credentials = { email: "owner@clinic-a.test", password: "Dev12345!" };
export const CLINIC_A_TRICHOLOGIST: Credentials = { email: "tricho@clinic-a.test", password: "Dev12345!" };

/** A phone number no other run can collide with. */
export function uniquePhone(prefix = "0912"): string {
  return `${prefix}${String(Date.now()).slice(-7)}`;
}

export async function login(page: Page, who: Credentials = CLINIC_A_OWNER): Promise<void> {
  await page.goto("/login");
  await expect(page.getByTestId("login-form")).toBeVisible();
  await page.getByTestId("login-email").fill(who.email);
  await page.getByTestId("login-password").fill(who.password);
  await page.getByTestId("login-submit").click();
  // The app routes to /dashboard on success; a server error renders login-error.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function openPatients(page: Page): Promise<void> {
  await page.goto("/patients");
  await expect(page.getByTestId("patients-title")).toBeVisible({ timeout: 20_000 });
}

export async function loginAndOpenPatients(page: Page, who: Credentials = CLINIC_A_OWNER): Promise<void> {
  await login(page, who);
  await openPatients(page);
}

export interface NewPatient {
  firstName: string;
  lastName: string;
  phone: string;
}

/** Fills the add-patient form and submits it. Assertions belong to the spec. */
export async function fillNewPatient(page: Page, patient: NewPatient): Promise<string> {
  await page.getByTestId("patient-first-name").fill(patient.firstName);
  await page.getByTestId("patient-last-name").fill(patient.lastName);
  await page.getByTestId("patient-phone").fill(patient.phone);
  await page.getByTestId("patient-add").click();
  return patient.phone;
}

/** Opens the gallery of the topmost patient row (newest first). */
export async function openFirstPatientGallery(page: Page): Promise<void> {
  await page.getByTestId("patient-gallery-link").first().click();
  await expect(page.getByTestId("gallery-upload-input").or(page.locator("input[type='file']")).first()).toBeAttached({
    timeout: 20_000,
  });
}
