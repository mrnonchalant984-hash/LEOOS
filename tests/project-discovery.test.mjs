import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectStrategy, validateDiscoveryAnswers } from '../lib/project-discovery.ts';
import {
  capabilityCatalog,
  detectExistingCapabilities,
  optionsAffordableForBudget,
  recommendOption,
} from '../lib/capability-alternatives.ts';
import { CONTACT_DELIVERY_STRATEGIES } from '../lib/contact-form.ts';
import { createEmptyVisualContext, distinguishArtifactKind, sanitizeVisualContext } from '../lib/agent-visual-context.ts';

test('discovery validation requires a product summary and budget', () => {
  const invalid = validateDiscoveryAnswers({ productSummary: 'short', productKind: 'website', budgetTier: 'free' });
  assert.equal(invalid.ok, false);
  const valid = validateDiscoveryAnswers({
    productSummary: 'A budget-aware SaaS dashboard for freelancers',
    productKind: 'saas',
    budgetTier: 'low',
    mode: 'discovery',
    needsAuth: true,
  });
  assert.equal(valid.ok, true);
});

test('strategy generation prefers already-implemented free alternatives on a free budget', () => {
  const answers = validateDiscoveryAnswers({
    productSummary: 'Contact-ready marketing site for a studio',
    productKind: 'website',
    budgetTier: 'free',
    needsEmail: true,
    mode: 'autonomous',
    hasExistingRepo: true,
    isUpgrade: true,
  });
  assert.equal(answers.ok, true);
  const strategy = buildProjectStrategy(answers.data, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  });
  assert.ok(strategy.preserveExisting.length > 0);
  assert.ok(strategy.freeAndPaidAlternatives.some((item) => item.capability.toLowerCase().includes('contact')));
  assert.ok(strategy.assumptions.some((item) => /autonomous/i.test(item)));
});

test('contact delivery strategies are explicit and do not invent completeness', () => {
  assert.ok(CONTACT_DELIVERY_STRATEGIES.some((item) => item.id === 'web3forms'));
  assert.ok(CONTACT_DELIVERY_STRATEGIES.every((item) => item.limitation.length > 10));
  const catalog = capabilityCatalog(detectExistingCapabilities({}));
  const contact = catalog.find((item) => item.capability === 'contact_form');
  assert.ok(contact);
  const affordable = optionsAffordableForBudget(contact.options, 'free');
  assert.ok(affordable.length > 0);
  const recommendation = recommendOption(contact, 'free');
  assert.ok(recommendation.reason.length > 0);
});

test('agent visual context redacts secret-looking fragments and distinguishes artifact kinds', () => {
  const context = sanitizeVisualContext({
    route: '/engineering',
    consoleErrors: ['Authorization Bearer abcdefghijklmnop failed'],
    screenshotKind: 'concept',
  });
  assert.match(context.consoleErrors[0], /\[redacted\]/);
  assert.match(distinguishArtifactKind('concept'), /not implemented/i);
  assert.equal(createEmptyVisualContext().screenshotAvailable, false);
});
