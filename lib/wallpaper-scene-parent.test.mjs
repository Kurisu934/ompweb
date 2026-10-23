import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { sceneWorldTransforms, sceneAlignmentOffset } = await jiti.import('./wallpaper-scene-parent.ts');
const { sceneLayerOrigin } = await jiti.import('./wallpaper-scene-transform.ts');
const { sceneTextLines } = await jiti.import('./wallpaper-text-layout.ts');
const layer = (id, patch = {}) => ({ id, origin: [0, 0, 0], scale: [1, 1, 1], angle: 0, parallax: [1, 1], ...patch });

test('all nine image anchors use local-space offsets before rotation and scale',()=>{
  for(const [alignment,expected] of Object.entries({center:[0,0],topleft:[10,-20],topright:[-10,-20],bottomleft:[10,20],bottomright:[-10,20],left:[10,0],right:[-10,0],top:[0,-20],bottom:[0,20]}))assert.deepEqual(sceneAlignmentOffset(alignment,[20,40]),expected);
  assert.throws(()=>sceneAlignmentOffset('unknown',[20,40]),/alignment/);
});
test('parent matrices preserve translation, negative scale, shear and inherited depth', () => {
  const data = [layer(1, { origin: [100, 50, 0], scale: [2, 3, 1], parallax: [0, .5] }), layer(2, { parent: 1, origin: [10, 20, 0], angle: Math.PI / 4, scale: [-1, 1, 1], parallaxInherited: true })];
  const child = sceneWorldTransforms(data).get(2);
  assert.equal(child.matrix[4], 120); assert.equal(child.matrix[5], 110);
  assert.ok(Math.abs(child.matrix[0] + Math.SQRT2) < 1e-10);
  assert.ok(Math.abs(child.matrix[1] + 3 * Math.SQRT1_2) < 1e-10);
  assert.deepEqual(child.parallax, [0, .5]);
  data[0].visible = false; assert.equal(sceneWorldTransforms(data).get(2).visible, false);
});
test('parented eyes retain their authored face offset when inheriting parallax', () => {
  const scene = { width: 2570, height: 3640, cameraEffects: { parallax: true, amount: 1.2 } };
  const worlds = sceneWorldTransforms([
    layer(22, { origin: [1285, 1820, 0], parallax: [0, 1] }),
    layer(25, { parent: 22, origin: [-646, 1127.5, 0], parallaxInherited: true }),
  ]);
  const eye = worlds.get(25);
  assert.deepEqual(sceneLayerOrigin(scene, [...eye.matrix.slice(4), 0], eye.parallax, eye.parallaxOrigin), [639, 2947.5, 0]);
});

test('nested inheritance preserves rotated child offsets as an off-center parent moves', () => {
  const scene = { width: 1920, height: 1080, cameraEffects: { parallax: true, amount: .5 } };
  const data = [
    layer(1, { origin: [100, 200, 0], scale: [2, 3, 1], angle: Math.PI / 2, parallax: [.5, .75] }),
    layer(2, { parent: 1, origin: [10, 20, 0], parallaxInherited: true }),
    layer(3, { parent: 2, origin: [5, 0, 0], parallaxInherited: true }),
  ];
  for (const x of [100, 300]) {
    data[0].origin[0] = x;
    const worlds = sceneWorldTransforms(data);
    const displayed = id => { const w = worlds.get(id); return sceneLayerOrigin(scene, [...w.matrix.slice(4), 0], w.parallax, w.parallaxOrigin); };
    const parent = displayed(1), child = displayed(2), grandchild = displayed(3);
    assert.ok(Math.abs(child[0] - parent[0] + 60) < 1e-9);
    assert.ok(Math.abs(child[1] - parent[1] - 20) < 1e-9);
    assert.ok(Math.abs(grandchild[0] - child[0]) < 1e-9);
    assert.ok(Math.abs(grandchild[1] - child[1] - 10) < 1e-9);
  }
});

test('explicit child depth starts its own parallax anchor for descendants', () => {
  const scene = { width: 1000, height: 1000, cameraEffects: { parallax: true, amount: .5 } };
  const worlds = sceneWorldTransforms([
    layer(1, { origin: [500, 500, 0], parallax: [0, 0] }),
    layer(2, { parent: 1, origin: [100, 50, 0], parallax: [1, .5] }),
    layer(3, { parent: 2, origin: [20, -30, 0], parallaxInherited: true }),
  ]);
  for (const [id, expected] of [[2, [650, 562.5, 0]], [3, [670, 532.5, 0]]]) {
    const w = worlds.get(id), origin = [...w.matrix.slice(4), 0];
    assert.deepEqual(sceneLayerOrigin(scene, origin, w.parallax, w.parallaxOrigin), expected);
    assert.deepEqual(sceneLayerOrigin({ ...scene, cameraEffects: { parallax: false, amount: .5 } }, origin, w.parallax, w.parallaxOrigin), origin);
  }
});
test('parent graph rejects cycles, missing parents and duplicate ids', () => {
  assert.throws(() => sceneWorldTransforms([layer(1, { parent: 2 }), layer(2, { parent: 1 })]), /Cyclic/);
  assert.throws(() => sceneWorldTransforms([layer(1, { parent: 9 })]), /Missing/);
  assert.throws(() => sceneWorldTransforms([layer(1), layer(1)]), /Duplicate/);
});

test('named bone attachments compose before child local transform and parent scale',()=>{
  const parent=layer(1,{origin:[100,50,0],scale:[2,3,1]}),child=layer(2,{parent:1,attachment:'hand',origin:[5,7,0]});
  const matrix=[0,1,0,0,-1,0,0,0,0,0,1,0,20,30,0,1];
  const w=sceneWorldTransforms([parent,child],(id,name)=>{assert.equal(id,1);assert.equal(name,'hand');return matrix;}).get(2);
  assert.deepEqual(w.matrix,[0,3,-2,0,126,155]);
  assert.throws(()=>sceneWorldTransforms([parent,child],()=>[NaN]),/attachment/);
});
test('constrained text wraps long words and limits rows with optional ellipsis', () => {
  const measure = s => Array.from(s).length;
  assert.deepEqual(sceneTextLines('one two three', measure, 7), ['one two', 'three']);
  assert.deepEqual(sceneTextLines('abcdefghi', measure, 3), ['abc', 'def', 'ghi']);
  assert.deepEqual(sceneTextLines('abcdefghi', measure, 3, 2, true), ['abc', 'de…']);
  assert.deepEqual(sceneTextLines('a\nb', measure, undefined, 1), ['a']);
});
