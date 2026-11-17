import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidGoogleVideoOperationName,
  validateGoogleVideoBytes,
  validateGoogleVideoOutputUri,
} from '../lib/generation/google-video-validation.ts';

test('Google video operation IDs accept only provider operation resource names', () => {
  assert.equal(isValidGoogleVideoOperationName('operations/op_123-abc'), true);
  assert.equal(isValidGoogleVideoOperationName('projects/demo-123/locations/us-central1/publishers/google/models/veo-3.1-generate-001/operations/op_123'), true);
  assert.equal(isValidGoogleVideoOperationName('https://example.com/video.mp4'), false);
  assert.equal(isValidGoogleVideoOperationName('../operations/op_123'), false);
  assert.equal(isValidGoogleVideoOperationName('operations/op_123?alt=media'), false);
  assert.equal(isValidGoogleVideoOperationName('x'.repeat(513)), false);
});

test('Google video output is restricted to the configured GCS bucket and prefix', () => {
  assert.deepEqual(
    validateGoogleVideoOutputUri('gs://leo-video-output/leonardx/jobs/job-1.mp4', 'gs://leo-video-output/leonardx/'),
    { bucket: 'leo-video-output', object: 'leonardx/jobs/job-1.mp4' },
  );
  assert.deepEqual(
    validateGoogleVideoOutputUri('gs://leo-video-output/result.mp4', 'gs://leo-video-output'),
    { bucket: 'leo-video-output', object: 'result.mp4' },
  );
  assert.throws(
    () => validateGoogleVideoOutputUri('gs://other-bucket/leonardx/job.mp4', 'gs://leo-video-output/leonardx/'),
    /outside the configured storage location/,
  );
  assert.throws(
    () => validateGoogleVideoOutputUri('gs://leo-video-output/other/job.mp4', 'gs://leo-video-output/leonardx/'),
    /outside the configured storage location/,
  );
  assert.throws(
    () => validateGoogleVideoOutputUri('gs://leo-video-output/leonardx/../private.mp4', 'gs://leo-video-output/leonardx/'),
    /unsupported video output URI/,
  );
});

test('Google video output must be a bounded MP4 file with a valid ftyp signature', () => {
  const mp4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assert.equal(validateGoogleVideoBytes(mp4, 'video/mp4'), mp4);
  assert.throws(() => validateGoogleVideoBytes(mp4, 'image/png'), /unsupported video media type/);
  assert.throws(() => validateGoogleVideoBytes(new Uint8Array([1, 2, 3]), 'video/mp4'), /invalid video file size/);
  assert.throws(() => validateGoogleVideoBytes(new Uint8Array(12), 'video/mp4'), /not a valid MP4 container/);
});
