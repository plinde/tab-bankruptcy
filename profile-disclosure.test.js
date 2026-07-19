const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatProfileDisclosure } = require('./profile-disclosure.js');

const NOT_SIGNED_IN = 'Running as: this Chrome profile (not signed in)';

test('signed-in profile: shows the account email', () => {
  assert.equal(
    formatProfileDisclosure({ email: 'alice@example.com', id: '123' }),
    'Running as: alice@example.com'
  );
});

test('not signed in: empty email falls back to generic text', () => {
  assert.equal(formatProfileDisclosure({ email: '', id: '' }), NOT_SIGNED_IN);
});

test('missing/undefined info is defensive', () => {
  assert.equal(formatProfileDisclosure(undefined), NOT_SIGNED_IN);
  assert.equal(formatProfileDisclosure(null), NOT_SIGNED_IN);
  assert.equal(formatProfileDisclosure({}), NOT_SIGNED_IN);
});

test('whitespace-only email is treated as empty', () => {
  assert.equal(formatProfileDisclosure({ email: '   ' }), NOT_SIGNED_IN);
});

test('surrounding whitespace on a real email is trimmed', () => {
  assert.equal(
    formatProfileDisclosure({ email: '  bob@example.com  ' }),
    'Running as: bob@example.com'
  );
});
