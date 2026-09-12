/**
 * FIXTURE - a web component importing the database layer. Types come from
 * '@scalpai/shared'; rows only ever arrive over HTTP.
 */
import { DbService } from "@scalpai/db";

export const BadPatients = (): unknown => new DbService();
