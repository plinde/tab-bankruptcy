const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planDomainGrouping } = require('./domain-grouping.js');

const tab = (url, id, title = url) => ({ url, id, title });
const window = (windowNumber, windowId, tabs) => ({ windowNumber, windowId, tabs });

test('groups every HTTP(S) hostname, including singletons, in first-seen order', () => {
  const plan = planDomainGrouping([
    window(1, 101, [
      tab('file:///tmp/report.html', 1),
      tab('https://app.example/one', 2),
      tab('https://dashboard.stripe.com/', 3),
      tab('https://us-east-1.signin.aws.amazon.com/', 4),
    ]),
  ]);

  assert.deepEqual(plan.groups.map(group => group.domain), [
    'app.example',
    'dashboard.stripe.com',
    'us-east-1.signin.aws.amazon.com',
  ]);
  assert.deepEqual(plan.groups.map(group => group.tabs.map(item => item.id)), [[2], [3], [4]]);
});

test('deduplicates normalized exact URLs and records original-window provenance', () => {
  const kept = tab('HTTPS://GITHUB.COM/org/repo/issues/1', 1, 'Issue first');
  const removed2 = tab('https://github.com/org/repo/issues/1', 2, 'Issue second');
  const removed3 = tab('https://github.com/org/repo/issues/1', 3, 'Issue third');
  const plan = planDomainGrouping([
    window(1, 101, [kept]),
    window(2, 202, [removed2, removed3]),
  ]);

  assert.equal(plan.groups.length, 1);
  assert.deepEqual(plan.groups[0].tabs.map(item => item.id), [1]);
  assert.equal(plan.duplicates.length, 1);
  assert.equal(plan.duplicates[0].url, 'https://github.com/org/repo/issues/1');
  assert.equal(plan.duplicates[0].kept.windowNumber, 1);
  assert.deepEqual(plan.duplicates[0].removed.map(item => item.windowNumber), [2, 2]);
  assert.deepEqual(plan.duplicates[0].removed.map(item => item.tab.id), [2, 3]);
});

test('query and fragment differences are not exact duplicates', () => {
  const plan = planDomainGrouping([
    window(1, 101, [
      tab('https://example.com/page?a=1', 1),
      tab('https://example.com/page?a=2', 2),
      tab('https://example.com/page?a=1#section', 3),
    ]),
  ]);

  assert.equal(plan.duplicates.length, 0);
  assert.deepEqual(plan.groups[0].tabs.map(item => item.id), [1, 2, 3]);
});

test('keeps distinct subdomains separate and preserves tab order', () => {
  const plan = planDomainGrouping([
    window(1, 101, [
      tab('https://github.com/', 1),
      tab('https://gist.github.com/a', 2),
    ]),
    window(2, 202, [tab('http://GITHUB.COM/explore', 3)]),
  ]);

  assert.deepEqual(plan.groups.map(group => group.domain), ['github.com', 'gist.github.com']);
  assert.deepEqual(plan.groups[0].tabs.map(item => item.id), [1, 3]);
});

test('splits github.com tabs by case-insensitive owner and repository slug', () => {
  const plan = planDomainGrouping([
    window(1, 101, [
      tab('https://github.com/Elastic/Kibana', 1),
      tab('https://github.com/elastic/kibana/issues/1', 2),
      tab('https://github.com/elastic/elasticsearch/pull/2', 3),
      tab('https://github.com/openai/codex', 4),
    ]),
  ]);

  assert.deepEqual(plan.groups.map(group => group.domain), [
    'github.com/elastic/kibana',
    'github.com/elastic/elasticsearch',
    'github.com/openai/codex',
  ]);
  assert.deepEqual(plan.groups.map(group => group.tabs.map(item => item.id)), [
    [1, 2],
    [3],
    [4],
  ]);
});

test('keeps github.com URLs without a repository slug in the hostname group', () => {
  const plan = planDomainGrouping([
    window(1, 101, [
      tab('https://github.com/', 1),
      tab('https://github.com/notifications', 2),
      tab('https://github.com/elastic/kibana', 3),
    ]),
  ]);

  assert.deepEqual(plan.groups.map(group => group.domain), [
    'github.com',
    'github.com/elastic/kibana',
  ]);
  assert.deepEqual(plan.groups.map(group => group.tabs.map(item => item.id)), [[1, 2], [3]]);
});

test('ignores local, internal, non-HTTP, malformed, and missing URLs', () => {
  const plan = planDomainGrouping([
    window(1, 101, [
      tab('chrome://extensions', 1),
      tab('file:///tmp/file', 2),
      tab('ftp://example.com/file', 3),
      tab('not a URL', 4),
      { id: 5 },
      null,
    ]),
  ]);

  assert.deepEqual(plan, { groups: [], duplicates: [] });
});

test('only supplied scoped windows contribute groups or duplicates', () => {
  const current = window(3, 303, [tab('https://github.com/one', 1)]);
  const other = window(4, 404, [tab('https://github.com/one', 2)]);

  const currentPlan = planDomainGrouping([current]);
  assert.equal(currentPlan.groups.length, 1);
  assert.equal(currentPlan.duplicates.length, 0);

  const allPlan = planDomainGrouping([current, other]);
  assert.equal(allPlan.duplicates.length, 1);
  assert.equal(allPlan.duplicates[0].removed[0].windowNumber, 4);
});

test('handles degenerate window lists safely', () => {
  assert.deepEqual(planDomainGrouping(), { groups: [], duplicates: [] });
  assert.deepEqual(planDomainGrouping([null, undefined, { tabs: null }]), {
    groups: [],
    duplicates: [],
  });
});
