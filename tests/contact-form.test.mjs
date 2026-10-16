import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTACT_SERVICES,
  validateContactSubmission,
} from "../lib/contact-form.ts";

const validSubmission = {
  name: "Alex Builder",
  email: "alex@example.com",
  service: CONTACT_SERVICES[0],
  message: "I would like to discuss a website project.",
};

test("contact form accepts a complete supported service request", () => {
  assert.deepEqual(validateContactSubmission(validSubmission), {
    ok: true,
    data: validSubmission,
  });
});

test("contact form rejects invalid names, emails, service values, and short messages", () => {
  assert.equal(validateContactSubmission({ ...validSubmission, name: "A" }).ok, false);
  assert.equal(validateContactSubmission({ ...validSubmission, email: "not-an-email" }).ok, false);
  assert.equal(validateContactSubmission({ ...validSubmission, service: "Unsupported service" }).ok, false);
  assert.equal(validateContactSubmission({ ...validSubmission, message: "Too short" }).ok, false);
  assert.equal(validateContactSubmission(null).ok, false);
});
