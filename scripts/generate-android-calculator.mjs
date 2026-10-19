import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, parse, resolve, sep } from 'node:path';
import { createCalculatorAndroidProject } from '../lib/android-build.ts';

const outputArgument = process.argv[2];
if (!outputArgument) throw new Error('Usage: node --experimental-strip-types scripts/generate-android-calculator.mjs <output-directory>');

const outputDirectory = resolve(outputArgument);
if (!isAbsolute(outputDirectory) || outputDirectory === parse(outputDirectory).root || outputDirectory === process.cwd()) {
  throw new Error('Choose a dedicated output directory; refusing to write into the repository root or filesystem root.');
}

const files = createCalculatorAndroidProject();
for (const [relativePath, content] of Object.entries(files)) {
  const destination = resolve(outputDirectory, relativePath);
  if (!destination.startsWith(`${outputDirectory}${sep}`)) throw new Error(`Unsafe generated path: ${relativePath}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}
console.log(`Generated ${Object.keys(files).length} Android project files in ${outputDirectory}`);
