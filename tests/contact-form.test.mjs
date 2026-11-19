import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTACT_SERVICES,
  validateContactSubmission,
} from "../lib/contact-form.ts";
import { readFileSync } from "node:fs";

const contactRoute = readFileSync(new URL("../app/api/contact/route.ts", import.meta.url), "utf8");
const contactPage = readFileSync(new URL("../app/contact/page.tsx", import.meta.url), "utf8");
const leadRoute = readFileSync(new URL("../app/api/lead/route.ts", import.meta.url), "utf8");
const leadCapture = readFileSync(new URL("../components/LeadCapture.tsx", import.meta.url), "utf8");

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


test("Web3Forms is submitted from the browser, not proxied through the server route", () => {
  assert.doesNotMatch(contactRoute, /api\.web3forms\.com\/submit/);
  assert.doesNotMatch(contactRoute, /notifyWeb3Forms/);
  assert.match(contactPage, /fetch\('https:\/\/api\.web3forms\.com\/submit'/);
  assert.match(contactPage, /NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY/);
  assert.match(contactPage, /web3Result\.success === true/);
});

test("contact and Bram lead notifications use Web3Forms only, never Resend or SMTP", () => {
  assert.doesNotMatch(contactRoute, /RESEND_API_KEY|api\.resend\.com|sendSmtpMail|SMTP_HOST/);
  assert.doesNotMatch(leadRoute, /RESEND_API_KEY|api\.resend\.com|sendSmtpMail|SMTP_HOST/);
  assert.match(contactPage, /if \(!result\.emailSent\)/);
  assert.match(contactPage, /fetch\('https:\/\/api\.web3forms\.com\/submit'/);
  assert.match(contactPage, /NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY/);
  assert.match(contactPage, /result\.emailSent === true \|\| web3FormsSent/);
  assert.match(leadCapture, /fetch\('https:\/\/api\.web3forms\.com\/submit'/);
  assert.match(leadCapture, /NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY/);
  assert.match(leadCapture, /New Braverton lead captured by Bram/);
  assert.match(leadCapture, /web3Result\.success !== true/);
  assert.match(leadRoute, /enforceIpRateLimit/);
});
