import { Injectable } from "@nestjs/common";
import {
  advanceEnrollment,
  claimDueEnrollments,
  createEnrollment,
  createSequence,
  deferEnrollment,
  enqueueMessage,
  getEnrollment,
  getPatientById,
  getSequence,
  fillSessionReminder,
  getSessionStatus,
  insertSwitchStep,
  isOptedOut,
  listEnrollments,
  listInbox,
  listMessages,
  listSequences,
  markMessageFailed,
  markMessageSent,
  markMessageSuppressed,
  markStepsSkipped,
  readInboundBody,
  recordInbound,
  setEnrollmentState,
  setInboundState,
  softDeleteSequence,
  updateSequence,
  type ClaimedEnrollment,
  type EnrollmentAction,
  type EnrollmentCreateInput,
  type EnrollmentFilter,
  type EnrollmentRow,
  type InboundRecordInput,
  type InboxFilter,
  type MessageEnqueueInput,
  type MessageLogFilter,
  type SequenceCreateInput,
  type SequencePatch,
  type SequenceRow,
  type Tx,
} from "@scalpai/db";
import { TenantScope } from "../tenancy/tenant.scope.js";

/**
 * لایه ریپوزیتوری aftercare (فاز ۵a / ADR-0046).
 *
 * تنها جایی در این مادول که تراکنش باز می‌کند. سرویس تصمیم می‌گیرد، اینجا
 * مرز داده است. هر متد از `TenantScope` می‌گذرد، پس هیچ مسیری نمی‌تواند
 * کلینیک دیگری را بخواند — و SQL در packages/db می‌ماند، نه در کنترلر.
 *
 * متدهای `*InTx` برای ورکر اند: ورکر خودش مرز تراکنش را می‌چیند، چون باید
 * چند نوشتن را در یک COMMIT جمع کند.
 */
@Injectable()
export class AftercareRepository {
  constructor(private scope: TenantScope) {}

  /* ── sequences ── */

  listSequences(page: { limit: number; offset: number }): Promise<SequenceRow[]> {
    return this.scope.tx((tx, ctx) => listSequences(tx, ctx.clinicId, page));
  }

  getSequence(id: string): Promise<SequenceRow | null> {
    return this.scope.tx((tx, ctx) => getSequence(tx, ctx.clinicId, id));
  }

  createSequence(input: SequenceCreateInput): Promise<SequenceRow> {
    return this.scope.tx((tx, ctx) => createSequence(tx, ctx.clinicId, ctx.userId, input));
  }

  updateSequence(id: string, patch: SequencePatch): Promise<SequenceRow | null> {
    return this.scope.tx((tx, ctx) => updateSequence(tx, ctx.clinicId, id, patch));
  }

  deleteSequence(id: string): Promise<boolean> {
    return this.scope.tx((tx, ctx) => softDeleteSequence(tx, ctx.clinicId, id));
  }

  /* ── enrollments ── */

  listEnrollments(filter: EnrollmentFilter): Promise<EnrollmentRow[]> {
    return this.scope.tx((tx, ctx) => listEnrollments(tx, ctx.clinicId, filter));
  }

  getEnrollment(id: string): Promise<EnrollmentRow | null> {
    return this.scope.tx((tx, ctx) => getEnrollment(tx, ctx.clinicId, id));
  }

  createEnrollment(input: EnrollmentCreateInput): Promise<EnrollmentRow | null> {
    return this.scope.tx((tx, ctx) => createEnrollment(tx, ctx.clinicId, ctx.userId, input));
  }

  actOnEnrollment(id: string, action: EnrollmentAction, reason?: string): Promise<EnrollmentRow | null> {
    return this.scope.tx((tx, ctx) => setEnrollmentState(tx, ctx.clinicId, id, action, reason));
  }

  /* ── inbox ── */

  listInbox(filter: InboxFilter) {
    return this.scope.tx((tx, ctx) => listInbox(tx, ctx.clinicId, filter));
  }

  readInboundBody(id: string): Promise<string | null> {
    return this.scope.tx((tx, ctx) => readInboundBody(tx, ctx.clinicId, id));
  }

  setInboundState(id: string, state: string, intent?: string): Promise<boolean> {
    return this.scope.tx((tx, ctx) => setInboundState(tx, ctx.clinicId, id, ctx.userId, state, intent));
  }

  recordInbound(input: InboundRecordInput) {
    return this.scope.tx((tx, ctx) => recordInbound(tx, ctx.clinicId, input));
  }

  listMessages(filter: MessageLogFilter) {
    return this.scope.tx((tx, ctx) => listMessages(tx, ctx.clinicId, filter));
  }

  /* ── worker surface — مرز تراکنش دست ورکر است ── */

  claimDue(tx: Tx, clinicId: string, limit: number): Promise<ClaimedEnrollment[]> {
    return claimDueEnrollments(tx, clinicId, limit);
  }

  patientInTx(tx: Tx, clinicId: string, patientId: string) {
    return getPatientById(tx, clinicId, patientId);
  }

  optedOutInTx(tx: Tx, clinicId: string, recipient: string): Promise<boolean> {
    return isOptedOut(tx, clinicId, recipient);
  }

  /** وضعیت فعلی جلسه — شرط condition.sessionStatus گام (موج ۴ / D16). */
  sessionStatusInTx(tx: Tx, clinicId: string, sessionId: string): Promise<string | null> {
    return getSessionStatus(tx, clinicId, sessionId);
  }

  enqueueInTx(tx: Tx, clinicId: string, input: MessageEnqueueInput) {
    return enqueueMessage(tx, clinicId, input);
  }

  markSentInTx(tx: Tx, clinicId: string, id: string, provider: string, providerMessageId?: string) {
    return markMessageSent(tx, clinicId, id, provider, providerMessageId);
  }

  markFailedInTx(tx: Tx, clinicId: string, id: string, reason: string) {
    return markMessageFailed(tx, clinicId, id, reason);
  }

  markSuppressedInTx(tx: Tx, clinicId: string, id: string, reason: string) {
    return markMessageSuppressed(tx, clinicId, id, reason);
  }

  advanceInTx(tx: Tx, clinicId: string, id: string) {
    return advanceEnrollment(tx, clinicId, id);
  }

  deferInTx(tx: Tx, clinicId: string, id: string, attempts: number) {
    return deferEnrollment(tx, clinicId, id, attempts);
  }

  /* ── موج ۴ (D16) — مسیر پاسخ بیمار ── */

  insertSwitchStepInTx(
    tx: Tx,
    clinicId: string,
    enrollmentId: string,
    afterStepIndex: number,
    switchTo: { channel?: string; templateKey?: string },
  ) {
    return insertSwitchStep(tx, clinicId, enrollmentId, afterStepIndex, switchTo);
  }

  markStepsSkippedInTx(tx: Tx, clinicId: string, enrollmentId: string, stepIndexes: readonly number[]) {
    return markStepsSkipped(tx, clinicId, enrollmentId, stepIndexes);
  }

  /** به‌روزرسانی ردیف یادآوری جلسه با مخاطب/متن واقعی (موج ۴ / D15) — در packages/db. */
  updateReminderInTx(
    tx: Tx,
    clinicId: string,
    input: {
      id: string;
      channel: string;
      locale: string;
      recipient: string;
      body: string;
      varsRedacted: Record<string, unknown>;
      provider: string;
    },
  ): Promise<boolean> {
    return fillSessionReminder(tx, clinicId, input);
  }
}
