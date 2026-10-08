import { rm } from 'node:fs/promises';

await rm('.next', { recursive: true, force: true });
console.log('Removed stale .next build/type artifacts.');
