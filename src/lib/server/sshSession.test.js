import test from "node:test";
import assert from "node:assert/strict";

import {
  createSshSession,
  getSshSession,
  shouldUseSecureSessionCookie,
} from "./sshSession.ts";

test("secure session cookies are disabled on localhost", () => {
  assert.equal(shouldUseSecureSessionCookie("localhost"), false);
  assert.equal(shouldUseSecureSessionCookie("127.0.0.1"), false);
});

test("secure session cookies remain enabled for non-local hosts in production", () => {
  assert.equal(shouldUseSecureSessionCookie("remarkable.local"), true);
});

test("session token round-trips credentials without shared memory", () => {
  const token = createSshSession("10.11.99.1", "secret");
  assert.deepEqual(getSshSession(token), {
    ip: "10.11.99.1",
    password: "secret",
  });
});
