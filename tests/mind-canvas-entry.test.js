'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('knowledge entries use canonical chapter identities and same-page canvas paths', async () => {
  const { makeCanvasHref, nodeIdForLesson } = await import('../frontend/assets/mind-canvas-entry.js');
  assert.equal(nodeIdForLesson({chapter:5,index:4}), '5_4');
  assert.equal(makeCanvasHref('local', '5_4'), '/canvas/?view=local&node=5_4');
  assert.equal(makeCanvasHref('network', '9_1'), '/canvas/?view=network&node=9_1');
  assert.equal(makeCanvasHref('network', null), '/canvas/?view=network');
  assert.equal(nodeIdForLesson({chapter:2,index:0}), '2_0');
});

test('invalid source identity and unsupported modes cannot become a canvas link', async () => {
  const { makeCanvasHref, nodeIdForLesson } = await import('../frontend/assets/mind-canvas-entry.js');
  for (const context of [{chapter:0,index:0},{chapter:11,index:0},{chapter:2,index:6},{chapter:10,index:3},{chapter:1,index:-1}]) {
    assert.throws(() => nodeIdForLesson(context), RangeError);
  }
  assert.throws(() => makeCanvasHref('unknown','1_0'), RangeError);
  assert.throws(() => makeCanvasHref('local','https://example.test'), RangeError);
  assert.throws(() => makeCanvasHref('local','2_6'), RangeError);
  assert.throws(() => makeCanvasHref('local',null), RangeError);
});
