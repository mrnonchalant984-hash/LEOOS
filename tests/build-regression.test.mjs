import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('administrator 2FA never passes an optional email as an otplib label', () => {
  const route = source('app/api/admin/2fa/route.ts');
  assert.match(route, /const label=typeof user\.email==='string'/);
  assert.match(route, /if\(!label\)return NextResponse\.json/);
  assert.match(route, /label,secret/);
});

test('meeting route model selector and participant types are imported and explicit', () => {
  assert.match(source('app/api/meetings/route.ts'), /import \{ getConfiguredModel \} from '@\/lib\/openai'/);
  assert.match(source('app/api/meetings/[id]/discuss/route.ts'), /\(participantId: string\)/);
  assert.match(source('app/api/meetings/[id]/discuss/route.ts'), /\(typeof PROFESSIONAL_ROLES\)\[number\]/);
});

test('owner navigation includes its workflow icon and customer widget uses Next links', () => {
  assert.match(source('components/LEOAppShell.tsx'), /LockKeyhole, Settings, Workflow/);
  const widget = source('components/LEOWidget.tsx');
  assert.match(widget, /import Link from "next\/link"/);
  assert.doesNotMatch(widget, /<a href="\/(projects|templates|ide)"/);
  assert.doesNotMatch(widget, /sidRef\.current === chat\.id/);
});
