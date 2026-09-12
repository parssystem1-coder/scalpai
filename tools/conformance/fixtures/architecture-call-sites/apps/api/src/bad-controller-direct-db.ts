/**
 * FIXTURE - seeds two findings for `architecture-call-sites`:
 *
 *   1. a controller that walks AROUND the '@scalpai/db' public surface and
 *      imports the package by path;
 *   2. a controller no module mounts, so its endpoints answer nothing.
 */
import { Controller, Get } from "@nestjs/common";
import { db } from "../../../packages/db/src/index.js";

@Controller("bad")
export class BadDirectDbController {
  @Get("/rows")
  async rows(): Promise<unknown> {
    return db.select();
  }
}
