import assert from "node:assert/strict";
import { test } from "node:test";
import { getBuilderAvailability } from "../lib/builders/providers.ts";
import { freePlan, getPlan, getPlanPrice, planConfig } from "../lib/pricing.ts";

test("free and paid plans expose bounded builder and image resources", () => {
  assert.deepEqual(freePlan.projectTypes, ["website"]);
  assert.equal(freePlan.limits.maxProjects, 1);
  assert.equal(freePlan.limits.monthlyBuilds, 1);
  assert.equal(freePlan.limits.monthlyImageCredits, 1);
  assert.equal(getPlan("free").limits.monthlyBuilds, 1);
  assert.equal(planConfig.standard.limits.maxProjects, 3);
  assert.equal(planConfig.standard.limits.monthlyImageCredits, 30);
  assert.equal(planConfig.pro.limits.maxProjects, 10);
  assert.equal(planConfig.pro.limits.monthlyImageCredits, 100);
  assert.equal(planConfig.unlimited.limits.maxProjects, 25);
  assert.equal(planConfig.unlimited.limits.monthlyBuilds, 100);
  assert.equal(planConfig.unlimited.limits.monthlyImageCredits, 500);
  for (const plan of Object.values(planConfig)) {
    assert.equal(plan.projectTypes.includes("mobile_app"), false);
    assert.equal(plan.projectTypes.includes("game"), false);
  }
});

test("web provider requires OpenAI, GitHub, and Vercel configuration", () => {
  const keys = ["OPENAI_API_KEY", "GITHUB_TOKEN", "VERCEL_TOKEN"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const unavailable = getBuilderAvailability("website");
    assert.equal(unavailable.status, "not_configured");
    assert.deepEqual(unavailable.requiredEnvironment, keys);

    for (const key of keys) process.env[key] = "test-value";
    assert.equal(getBuilderAvailability("saas").status, "ready");
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test("mobile and game providers remain unavailable until adapters exist", () => {
  assert.equal(getBuilderAvailability("mobile_app").status, "not_integrated");
  assert.equal(getBuilderAvailability("mobile_app").id, "expo-eas");
  assert.equal(getBuilderAvailability("game").status, "not_integrated");
  assert.equal(getBuilderAvailability("game").id, "godot-build-service");
});

test("monthly prices remain environment-configured", () => {
  const key = "NEXT_PUBLIC_STANDARD_MONTHLY_KOBO";
  const original = process.env[key];
  try {
    process.env[key] = "750000";
    assert.equal(getPlanPrice("standard", "monthly"), 750000);
    process.env[key] = "not-a-number";
    assert.equal(getPlanPrice("standard", "monthly"), null);
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});