import Dexie, { type EntityTable } from "dexie";

export interface OutboxRecord {
  id: string; // clientMutationId — primary key for dedup
  seq: number; // monotonic ordering
  entity: string;
  op: string;
  schemaVersion: number;
  clientUpdatedAt: string;
  baseVersion: string | null;
  payload: string; // JSON-serialized
  createdAt: number; // Date.now() for priority ordering
}

export interface PendingUpload {
  key: string; // gallery item id or storage key
  totalParts: number;
  completedParts: number[];
  patientId: string;
  createdAt: number;
}

const db = new Dexie("scalpai-offline") as Dexie & {
  outbox: EntityTable<OutboxRecord, "id">;
  pendingUploads: EntityTable<PendingUpload, "key">;
};

db.version(1).stores({
  outbox: "id, seq, createdAt",
  pendingUploads: "key, createdAt",
});

export { db };
