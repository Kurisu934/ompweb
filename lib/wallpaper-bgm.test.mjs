import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {createJiti} from 'jiti';
const jiti=createJiti(import.meta.url,{tsconfigPaths:true});
const store=await jiti.import('./wallpaper-bgm-store.ts');
const {parseWallpaperPreferences}=await jiti.import('./wallpapers.ts');
const {MAX_BGM_BYTES}=await jiti.import('./wallpaper-bgm.ts');
const ffmpeg=process.env.OMP_WEB_FFMPEG_BIN||'ffmpeg';
const ffprobe=process.env.OMP_WEB_FFPROBE_BIN||'ffprobe';
const available=spawnSync(ffmpeg,['-version'],{windowsHide:true}).status===0&&spawnSync(ffprobe,['-version'],{windowsHide:true}).status===0;
const wav=()=>{
 const size=48000*2, b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(size+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);
 for(let i=0;i<size/2;i++)b.writeInt16LE(Math.round(3000*Math.sin(i/48000*440*2*Math.PI)),44+i*2);return b;
};
const request=(body,headers)=>new Request('http://localhost/api/wallpapers/bgm/upload',{method:'POST',body,headers});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(tmpdir(),'omp-bgm-test-')),old=process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR=path.join(root,'agent');
 t.after(async()=>{if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;
  const resolved=await fs.realpath(root);assert.ok(resolved.startsWith(await fs.realpath(tmpdir()))&&path.basename(resolved).startsWith('omp-bgm-test-'));await fs.rm(resolved,{recursive:true,force:true});});
 return root;
}
test('BGM preference accepts only cache IDs; signatures cannot substitute playlists',()=>{
 assert.equal(parseWallpaperPreferences(null).bgmId,null);
 assert.equal(parseWallpaperPreferences(JSON.stringify({bgmId:'b'.repeat(64)})).bgmId,'b'.repeat(64));
 for(const id of ['../../secret','http://example.test/song','a'.repeat(32)])assert.equal(parseWallpaperPreferences(JSON.stringify({bgmId:id})).bgmId,null);
 assert.equal(store.bgmDemuxer(wav(),'.wav'),'wav');
 assert.throws(()=>store.bgmDemuxer(Buffer.from('#EXTM3U\nhttp://example.test/private'),'.mp3'));
});
test('uploads are bounded, reject truncated/spoofed files and remove temporary data',async t=>{
 const root=await fixture(t);
 await assert.rejects(store.importBgm(request(wav(),{'content-length':String(MAX_BGM_BYTES+1)}),'huge.wav'),e=>e.code==='too_large');
 await assert.rejects(store.importBgm(request(wav(),{'content-length':'2'}),'truncated.wav'),e=>e.code==='invalid_media');
 await assert.rejects(store.importBgm(request('<html>not audio</html>'),'fake.mp3'),e=>e.code==='invalid_media');
 await assert.rejects(store.importBgm(request(wav()),'song.m3u8'),e=>e.code==='invalid_media');
 assert.deepEqual(await store.listBgm(),[]);
 assert.deepEqual(await fs.readdir(path.join(root,'agent/web-wallpapers/bgm')),[]);
});
test('audio is extracted once, concurrent/renamed uploads reuse durable cache, and ranges are served', {skip:!available},async t=>{
 const root=await fixture(t);
 const first=store.importBgm(request(wav()),'tone.wav'), second=store.importBgm(request(wav()),'renamed.wav');
 const results=await Promise.all([first,second]);
 assert.equal(results[0].track.id,results[1].track.id);assert.deepEqual(results.map(r=>r.cached).sort(),[false,true]);
 const track=results[0].track;assert.equal(track.source,'audio');assert.equal(track.duration,1);
 const old=process.env.OMP_WEB_FFPROBE_BIN;process.env.OMP_WEB_FFPROBE_BIN='nonexistent-ffprobe-for-cache-test';
 try{assert.equal((await store.importBgm(request(wav()),'another-name.wav')).cached,true);}finally{if(old===undefined)delete process.env.OMP_WEB_FFPROBE_BIN;else process.env.OMP_WEB_FFPROBE_BIN=old;}
 assert.equal((await store.listBgm()).length,1);
 const route=await jiti.import('../app/api/wallpapers/bgm/[id]/route.ts'),context={params:Promise.resolve({id:track.id})};
 const response=await route.GET(new Request('http://localhost/media',{headers:{range:'bytes=0-15'}}),context);
 assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/wav');assert.equal((await response.arrayBuffer()).byteLength,16);
 assert.equal((await route.HEAD(new Request('http://localhost/media'),context)).status,200);
 assert.equal((await route.GET(new Request('http://localhost/media',{headers:{range:'bytes=999999999-'}}),context)).status,416);
 const folder=path.join(root,'agent/web-wallpapers/bgm',track.id);assert.deepEqual((await fs.readdir(folder)).sort(),['audio.wav','track.json']);
 await assert.rejects(store.resolveBgm('../secret'));await assert.rejects(store.deleteBgm('../secret'));
 await store.deleteBgm(track.id);assert.deepEqual(await store.listBgm(),[]);
});
test('video caches only its first audio stream without re-encoding AAC; silent videos fail cleanly',{skip:!available},async t=>{
 const root=await fixture(t),video=path.join(root,'clip.mp4'),silent=path.join(root,'silent.mp4');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=32x32:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-c:a','aac',video],{windowsHide:true});
 execFileSync(ffmpeg,['-v','error','-i',video,'-an','-c:v','copy',silent],{windowsHide:true});
 const result=await store.importBgm(request(await fs.readFile(video)),'clip.mp4');assert.equal(result.track.source,'video');
 const folder=path.join(root,'agent/web-wallpapers/bgm',result.track.id);assert.deepEqual((await fs.readdir(folder)).sort(),['audio.m4a','track.json']);
 const output=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-of','json',path.join(folder,'audio.m4a')],{encoding:'utf8',windowsHide:true}));
 assert.deepEqual(output.streams.map(s=>[s.codec_type,s.codec_name]),[['audio','aac']]);
 await assert.rejects(store.importBgm(request(await fs.readFile(silent)),'silent.mp4'),e=>e.code==='no_audio');
 assert.equal((await store.listBgm()).length,1);
 assert.deepEqual((await fs.readdir(path.join(root,'agent/web-wallpapers/bgm'))),[result.track.id]);
});
test('streaming upload retains same-origin protection',async()=>{
 const {NextRequest}=await import('next/server.js');
 const {POST}=await jiti.import('../app/api/wallpapers/bgm/upload/route.ts');
 const response=await POST(new NextRequest('http://localhost/api/wallpapers/bgm/upload?name=song.wav',{method:'POST',headers:{origin:'https://untrusted.example'},body:wav()}));
 assert.equal(response.status,403);
});
