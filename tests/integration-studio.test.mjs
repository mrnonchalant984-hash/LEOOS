import test from 'node:test';
import assert from 'node:assert/strict';
import { clampStudioStep, integrationModes, integrationScenarios, isFocusedStudioLine } from '../lib/integration-studio.ts';

test('studio has a walkthrough for each supported developer integration', () => {
  assert.deepEqual(integrationModes.map(mode => mode.id), ['api', 'sdk', 'cli', 'ide', 'plugins', 'webhooks']);
  for (const mode of integrationModes) {
    assert.ok(integrationScenarios[mode.id].length > 0, `${mode.id} needs at least one scenario`);
    for (const scenario of integrationScenarios[mode.id]) {
      assert.ok(scenario.steps.length > 0, `${mode.id}/${scenario.id} needs at least one step`);
      for (const step of scenario.steps) {
        const lineCount = step.code.split('\n').length;
        assert.ok(step.focusLines.length > 0, `${mode.id}/${scenario.id}/${step.id} should highlight a code line`);
        assert.ok(step.focusLines.every(line => Number.isInteger(line) && line >= 1 && line <= lineCount), `${mode.id}/${scenario.id}/${step.id} has an invalid focus line`);
        assert.ok(step.outputLabel.length > 0, `${mode.id}/${scenario.id}/${step.id} must label preview output`);
      }
    }
  }
});

test('step navigation stays within the selected walkthrough', () => {
  assert.equal(clampStudioStep(-1, 3), 0);
  assert.equal(clampStudioStep(1.9, 3), 1);
  assert.equal(clampStudioStep(8, 3), 2);
  assert.equal(clampStudioStep(0, 0), 0);
  assert.equal(clampStudioStep(Number.NaN, 2), 0);
});

test('code focus is synchronized to an explicit set of lines', () => {
  assert.equal(isFocusedStudioLine(2, [1, 2, 4]), true);
  assert.equal(isFocusedStudioLine(3, [1, 2, 4]), false);
});

test('preview copy avoids claims of real API or deployment execution', () => {
  const apiCode = integrationScenarios.api.flatMap(scenario => scenario.steps).map(step => step.terminal.join('\n')).join('\n');
  const cliCode = integrationScenarios.cli.flatMap(scenario => scenario.steps).map(step => step.terminal.join('\n')).join('\n');
  const ideCode = integrationScenarios.ide.flatMap(scenario => scenario.steps).map(step => step.terminal.join('\n')).join('\n');
  const pluginCode = integrationScenarios.plugins.flatMap(scenario => scenario.steps).map(step => step.terminal.join('\n')).join('\n');
  const webhookCode = integrationScenarios.webhooks.flatMap(scenario => scenario.steps).map(step => step.terminal.join('\n')).join('\n');
  assert.match(apiCode, /No request sent/);
  assert.match(cliCode, /No task was submitted/);
  assert.match(cliCode, /No deployment was triggered/);
  assert.match(ideCode, /No save request sent/);
  assert.match(pluginCode, /No extension code is loaded or executed/);
  assert.match(webhookCode, /No delivery received|No request received/);
});
