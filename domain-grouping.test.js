const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planDomainGroups } = require('./domain-grouping.js');

const tab = (url, id) => ({ url, id, title: url });

test('groups repeated hostnames across windows in first-seen order', () => {
  const github1 = tab('https://github.com/org/repo/issues/1', 1);
  const hn1 = tab('https://news.ycombinator.com/item?id=1', 2);
  const github2 = tab('https://github.com/org/repo/pull/2', 3);
  const hn2 = tab('https://news.ycombinator.com/newest', 4);

  const plan = planDomainGroups([[github1, hn1], [github2, hn2]]);

  assert.deepEqual(plan.map(group => group.domain), [
    'github.com',
    'news.ycombinator.com',
  ]);
  assert.deepEqual(plan[0].tabs, [github1, github2]);
  assert.deepEqual(plan[1].tabs, [hn1, hn2]);
});

test('groups mixed HTTP/HTTPS and hostname case while preserving tab order', () => {
  const first = tab('HTTP://EXAMPLE.COM/first', 1);
  const second = tab('https://example.com/second?query=yes#fragment', 2);

  assert.deepEqual(planDomainGroups([[first], [second]]), [
    { domain: 'example.com', tabs: [first, second] },
  ]);
});

test('keeps distinct subdomains separate', () => {
  const plan = planDomainGroups([[
    tab('https://github.com/a', 1),
    tab('https://gist.github.com/a', 2),
    tab('https://github.com/b', 3),
    tab('https://gist.github.com/b', 4),
  ]]);

  assert.deepEqual(plan.map(group => group.domain), [
    'github.com',
    'gist.github.com',
  ]);
});

test('leaves singleton domains out of the action plan', () => {
  assert.deepEqual(planDomainGroups([[
    tab('https://one.example/a', 1),
    tab('https://two.example/b', 2),
  ]]), []);
});

test('ignores internal, non-HTTP, malformed, and missing URLs', () => {
  assert.deepEqual(planDomainGroups([[
    tab('chrome://extensions', 1),
    tab('file:///tmp/file', 2),
    tab('ftp://example.com/file', 3),
    tab('not a URL', 4),
    { id: 5 },
    null,
  ]]), []);
});

test('only the supplied scope contributes tabs', () => {
  const currentWindowTabs = [tab('https://github.com/one', 1)];
  const otherWindowTabs = [tab('https://github.com/two', 2)];

  assert.deepEqual(planDomainGroups([currentWindowTabs]), []);
  assert.equal(planDomainGroups([currentWindowTabs, otherWindowTabs]).length, 1);
});

test('handles degenerate window lists safely', () => {
  assert.deepEqual(planDomainGroups(), []);
  assert.deepEqual(planDomainGroups([null, undefined, []]), []);
});
