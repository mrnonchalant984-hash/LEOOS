import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageOrganization, canReadOrganizationRole, canWriteOrganization, isOrganizationRole } from '../lib/organization-access-core.ts';

test('organization roles fail closed for unknown or missing membership', () => {
  assert.equal(isOrganizationRole(null), false);
  assert.equal(isOrganizationRole('OWNER'), true);
  assert.equal(isOrganizationRole('owner'), false);
  assert.equal(canReadOrganizationRole(null), false);
  assert.equal(canWriteOrganization(null), false);
  assert.equal(canManageOrganization(null), false);
});

test('viewer can read but cannot write or manage', () => {
  assert.equal(canReadOrganizationRole('VIEWER'), true);
  assert.equal(canWriteOrganization('VIEWER'), false);
  assert.equal(canManageOrganization('VIEWER'), false);
});

test('developer can write but cannot manage membership', () => {
  assert.equal(canWriteOrganization('DEVELOPER'), true);
  assert.equal(canManageOrganization('DEVELOPER'), false);
});

test('unknown roles cannot cross a tenant boundary', () => {
  for (const role of ['UNKNOWN', 'owner', '', null, undefined]) {
    assert.equal(canReadOrganizationRole(role), false);
    assert.equal(canWriteOrganization(role), false);
  }
});
