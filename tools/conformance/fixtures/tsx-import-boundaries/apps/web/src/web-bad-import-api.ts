/**
 * FIXTURE - a web module reaching into the API app with a relative path. The
 * typed HTTP client is the only door between the two; a path import ships server
 * code into the browser bundle.
 */
export { AuthController } from "../../api/src/auth/auth.controller.js";
