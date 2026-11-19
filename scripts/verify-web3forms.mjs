const accessKey = process.env.WEB3FORMS_ACCESS_KEY || process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
const senderEmail = process.env.WEB3FORMS_TEST_SENDER_EMAIL;
if (!accessKey || !senderEmail || process.env.WEB3FORMS_TEST_CONFIRM !== 'SEND') {
  console.error('Set WEB3FORMS_ACCESS_KEY (or NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY), WEB3FORMS_TEST_SENDER_EMAIL and WEB3FORMS_TEST_CONFIRM=SEND.');
  process.exit(2);
}
const response = await fetch('https://api.web3forms.com/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    access_key: accessKey,
    name: 'Braverton automated delivery check',
    email: senderEmail,
    subject: '[Braverton] Web3Forms delivery verification',
    from_name: 'Braverton Web3Forms verification',
    message: 'This is a controlled delivery test. Confirm that this message arrived at the destination configured in the Web3Forms dashboard.',
  }),
  redirect: 'error',
  signal: AbortSignal.timeout(20_000),
});
const result = await response.json().catch(() => ({}));
if (!response.ok || result.success !== true) {
  console.error(`Web3Forms delivery was not confirmed (HTTP ${response.status}): ${result.message || 'provider returned success=false'}`);
  process.exit(1);
}
console.log('PASS Web3Forms accepted the controlled test submission. Check the configured destination inbox to confirm final delivery.');
