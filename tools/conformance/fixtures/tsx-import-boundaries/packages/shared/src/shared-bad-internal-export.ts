/**
 * FIXTURE - a public package re-exporting ANOTHER package's internal path. The
 * published entrypoint is the contract; `packages/*\/src` is an implementation
 * detail that no consumer may depend on.
 */
export { patients } from "packages/db/src/schema.js";
