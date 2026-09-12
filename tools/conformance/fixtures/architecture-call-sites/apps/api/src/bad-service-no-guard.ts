/**
 * FIXTURE - seeds three findings for `architecture-call-sites`:
 *
 *   1. a service importing the database package by path instead of by name;
 *   2. a service importing a CONTROLLER, which inverts the call direction
 *      controller -> service -> repository -> db;
 *   3. an @Injectable no module registers, which throws at boot on the first
 *      injection and is invisible to a typecheck.
 */
import { Injectable } from "@nestjs/common";
import { schema } from "../../../packages/db/src/schema.js";
import { BadDirectDbController } from "./bad-controller-direct-db.js";

@Injectable()
export class BadUnregisteredService {
  constructor(private readonly controller: BadDirectDbController) {}

  list(): unknown {
    return [schema, this.controller];
  }
}
