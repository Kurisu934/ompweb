import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const store = await jiti.import('./memo-store.ts');
const model = await jiti.import('./memos.ts');
const collection = await jiti.import('../app/api/memos/route.ts');
const item = await jiti.import('../app/api/memos/[id]/route.ts');
const fields = { title: 'Research', content: 'A persistent note\n- [ ] Review', pinned: false };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ompweb-memos-'));
  const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    const real = await fs.realpath(root), temp = await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(real).toLowerCase(), temp.toLowerCase()); assert.ok(path.basename(real).startsWith('ompweb-memos-'));
    await fs.rm(real, { recursive: true, force: true });
  });
  return root;
}
test('memo CRUD persists metadata and pin ordering, accepts empty drafts and bounds content', async t => {
  await fixture(t); assert.deepEqual(await store.listMemos(), []);
  const first = await store.createMemo(fields), second = await store.createMemo({ title: '', content: '', pinned: true });
  assert.ok(model.validMemo(first)); assert.equal(first.revision, 1);
  assert.deepEqual((await store.listMemos()).map(m => m.id), [second.id, first.id]);
  const edited = await store.updateMemo(first.id, { ...first, content: 'New text' });
  assert.equal(edited.revision, 2); assert.equal(edited.createdAt, first.createdAt);
  await assert.rejects(async () => store.createMemo({ ...fields, content: 'a'.repeat(model.MAX_MEMO_CONTENT + 1) }), { code: 'invalid' });
  await assert.rejects(async () => store.createMemo({ ...fields, title: 'a'.repeat(model.MAX_MEMO_TITLE + 1) }), { code: 'invalid' });
  await assert.rejects(async () => store.updateMemo('../secret', { ...fields, revision: 1 }), { code: 'invalid' });
  await store.deleteMemo(edited.id, edited.revision); assert.equal((await store.listMemos()).length, 1);
});
test('concurrent memo revisions never silently overwrite each other; stale deletion is rejected', async t => {
  await fixture(t); const memo = await store.createMemo(fields);
  const attempts = await Promise.allSettled(['A','B','C'].map(content => store.updateMemo(memo.id, { ...memo, content })));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = attempts.filter(r => r.status === 'rejected');
  assert.ok(rejected.every(r => r.reason.code === 'conflict' && r.reason.current.revision === 2));
  await assert.rejects(store.deleteMemo(memo.id, 1), { code: 'conflict' });
  assert.equal((await store.listMemos())[0].content, 'A');
});
test('malformed storage is not replaced with an empty memo list', async t => {
  const root = await fixture(t), file = path.join(root, 'web-memos.json');
  for (const content of ['{broken', JSON.stringify({version:1,memos:[{id:'bad'}]})]) {
    await fs.writeFile(file, content);
    await assert.rejects(store.listMemos(), { code: 'storage_invalid' });
    await assert.rejects(store.createMemo(fields), { code: 'storage_invalid' });
    assert.equal(await fs.readFile(file,'utf8'),content);
  }
});
test('memo API handles bounds, invalid JSON, updates, conflicts and deletion without path leaks', async t => {
  await fixture(t);
  const request = (method, value) => new Request('http://localhost/api/memos', {method, body:JSON.stringify(value)});
  const created = await collection.POST(request('POST',fields)); assert.equal(created.status,201);
  const {memo} = await created.json(), context = {params:Promise.resolve({id:memo.id})};
  const updated = await item.PUT(request('PUT',{...memo,content:'Changed'}),context); assert.equal(updated.status,200);
  const conflict = await item.PUT(request('PUT',memo),context); assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).current.content,'Changed');
  const listed = await collection.GET(); assert.equal(listed.headers.get('cache-control'),'no-store');
  assert.equal((await listed.json()).memos.length,1);
  const bad = await collection.POST(new Request('http://localhost/api/memos',{method:'POST',body:'{'})); assert.equal(bad.status,400);
  const oversized = await collection.POST(new Request('http://localhost/api/memos',{method:'POST',body:' '.repeat(128*1024+1)})); assert.equal(oversized.status,413);
  assert.equal((await item.DELETE(request('DELETE',{revision:2}),context)).status,200);
  assert.equal((await item.PUT(request('PUT',memo),context)).status,404);
});
test('a full collection rejects new notes but still allows edits and deletion', async t => {
  const root=await fixture(t), original=await store.createMemo(fields);
  const memos=Array.from({length:model.MAX_MEMOS},(_,i)=>({...original,id:`${i.toString(16).padStart(8,'0')}-0000-4000-8000-000000000001`}));
  await fs.writeFile(path.join(root,'web-memos.json'),JSON.stringify({version:1,memos}));
  await assert.rejects(store.createMemo(fields),{code:'limit'});
  const updated=await store.updateMemo(memos[0].id,{...memos[0],content:'Still editable'});
  await store.deleteMemo(updated.id,updated.revision);
  await store.createMemo(fields);assert.equal((await store.listMemos()).length,model.MAX_MEMOS);
});
