/* eslint-disable @typescript-eslint/no-require-imports -- Node-only browser QA. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE || 'http://127.0.0.1:13034';
const out = process.env.QA_OUT || '.tmp/memos-browser-qa';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname) || new URL(base).port === '30177') throw new Error('Use an isolated local test server with an empty agent directory');
const sid = '00000000-0000-4000-8000-000000000001', wid = 'a'.repeat(32), cwd = '/workspace/demo';
const info = {id:sid,path:'/demo/session.jsonl',cwd,projectRoot:cwd,name:'Memo QA',created:'2026-01-01',modified:'2026-01-01',messageCount:2,firstMessage:'Memo QA'};
const context = {entryIds:['u','a'],thinkingLevel:'high',model:null,todoPhases:[],messages:[{role:'user',content:'Memo QA',timestamp:1000},{role:'assistant',content:[{type:'text',text:'A place for notes.'}],timestamp:2000}]};
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const errors=[], owned=new Set(), report=[];
  const api=await browser.newContext();
  const list=async()=>{const r=await api.request.get(base+'/api/memos');assert.equal(r.status(),200);return (await r.json()).memos;};
  assert.deepEqual(await list(),[], 'Test agent directory must start with no memos');
  async function setup(page, control={}) {
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({wid})=>{
      localStorage.setItem('omp-lang','en');localStorage.setItem('omp-theme','light');
      localStorage.setItem('omp-web:wallpaper',JSON.stringify({id:wid,kind:'image',glass:'default',glassOpacity:40,textMode:'auto',muted:true}));
      window.qaEscape=0; window.addEventListener('keydown',e=>{if(e.key==='Escape')window.qaEscape++;});
    },{wid});
    const artwork=Buffer.from(await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=1200;c.height=800;const g=c.getContext('2d');
      const gradient=g.createLinearGradient(0,0,1200,800);gradient.addColorStop(0,'#496f75');gradient.addColorStop(.5,'#bbc8b1');gradient.addColorStop(1,'#87788b');
      g.fillStyle=gradient;g.fillRect(0,0,1200,800);return c.toDataURL().split(',')[1];
    }),'base64');
    await page.route('**/api/**',async route=>{
      const p=new URL(route.request().url()).pathname, method=route.request().method(), reply=json=>route.fulfill({json});
      if(p.startsWith('/api/memos')) {
        if(method==='PUT' && control.offline)return route.abort('internetdisconnected');
        if(method==='PUT' && control.slow)await delay(1200);
        if(method==='GET' && control.staleList){const response=await route.fetch();const json=await response.json();await delay(1800);return reply(json);}
        return route.continue();
      }
      if(p.endsWith('/events'))return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
      if(p===`/api/wallpapers/${wid}/media`)return route.fulfill({contentType:'image/png',body:artwork});
      if(p==='/api/sessions')return reply({sessions:[info],runningSessionIds:[],runningSessions:[]});
      if(p===`/api/sessions/${sid}`)return reply({sessionId:sid,filePath:info.path,info,leafId:'a',tree:[],context,agent:{running:false}});
      if(p===`/api/sessions/${sid}/context`)return reply({context,leafId:'a',tree:[]});
      if(p===`/api/agent/${sid}`)return reply({running:false});
      if(p==='/api/projects')return reply({projects:[{path:cwd}]});
      if(p==='/api/cwd/validate')return reply({valid:true,cwd,isDirectory:true});
      if(p==='/api/models')return reply({models:{},modelList:[]});
      if(p==='/api/provider-usage')return reply({reports:[],generatedAt:Date.now()});
      if(p==='/api/pets')return reply({pets:[],skipped:0});
      if(p==='/api/git/status')return reply({isGitRepo:false,files:[]});
      if(p==='/api/omp-settings')return reply({settings:{},catalog:[]});
      if(p==='/api/wallpapers')return reply({wallpapers:[],roots:[],warnings:[]});
      if(p==='/api/wallpapers/bgm')return reply({tracks:[]});
      return reply({ok:true,entries:[],files:[],worktrees:[],providers:[],settings:{},tools:[],commands:[],sessions:[],version:'QA'});
    });
    await page.goto(`${base}/?session=${sid}`);
    await page.locator('.chat-input-shell').waitFor();
  }
  const saved=page=>page.waitForFunction(()=>document.querySelector('.memo-editor-footer [role="status"]')?.textContent==='Saved');
  const open=async page=>{await page.waitForFunction(()=>document.documentElement.dataset.wallpaper==='on');await page.keyboard.press('Insert');await page.getByRole('dialog',{name:'Memos',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.memo-list')?.getAttribute('aria-busy')||document.querySelector('.memo-list').getAttribute('aria-busy')==='false');};
  try {
    const page=await api.newPage(), control={};await page.setViewportSize({width:1440,height:1000});await setup(page,control);
    await page.locator('.chat-input-shell textarea').first().focus();await open(page);
    await page.locator('.memo-list-toolbar').getByRole('button',{name:'New memo',exact:true}).click();
    await page.getByRole('textbox',{name:'Memo title',exact:true}).fill('Field notes');
    await page.getByRole('textbox',{name:'Memo content',exact:true}).fill('## Today\n\n- [ ] Read the paper\n- [x] Save an experiment\n\nA short note.');
    await page.keyboard.press('Insert');await page.getByRole('dialog',{name:'Memos',exact:true}).waitFor({state:'hidden'});
    for(let i=0;i<40;i++){const items=await list();items.forEach(m=>owned.add(m.id));if(items[0]?.content.includes('short note'))break;await delay(100);}
    assert.equal((await list())[0].title,'Field notes');await open(page);
    assert.match(await page.getByRole('textbox',{name:'Memo content',exact:true}).inputValue(),/short note/);
    await page.getByRole('button',{name:'Preview',exact:true}).click();await page.locator('.memo-preview h2').waitFor();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download Markdown',exact:true}).click();
    const file=await download;await file.saveAs(path.join(out,'memo.md'));assert.match(fs.readFileSync(path.join(out,'memo.md'),'utf8'),/# Field notes/);
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    control.slow=true;
    const pending=page.waitForRequest(r=>r.method()==='PUT'&&r.url().includes('/api/memos/'));
    await page.getByRole('textbox',{name:'Memo content',exact:true}).fill('First revision');await pending;
    await page.getByRole('textbox',{name:'Memo content',exact:true}).fill('Latest text typed during saving');await saved(page);
    assert.equal((await list())[0].content,'Latest text typed during saving');
    const pendingAgain=page.waitForRequest(r=>r.method()==='PUT'&&r.url().includes('/api/memos/'));
    await page.getByRole('textbox',{name:'Memo content',exact:true}).fill('Keep this after stale refresh');await pendingAgain;
    await page.keyboard.press('Insert');control.staleList=true;await open(page);await saved(page);
    assert.equal(await page.getByRole('textbox',{name:'Memo content',exact:true}).inputValue(),'Keep this after stale refresh');
    control.slow=false;control.staleList=false;
    await page.getByRole('button',{name:'Pin memo',exact:true}).click();await saved(page);assert.equal((await list())[0].pinned,true);
    const other=await api.newPage(), second={offline:true};await setup(other,second);await open(other);
    await other.getByRole('textbox',{name:'Memo content',exact:true}).fill('Unsaved second-window draft');
    await other.getByText('Saving failed. Your draft is still here; retry when connected.',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Memo content',exact:true}).fill('Server version from first window');await saved(page);
    second.offline=false;await other.getByRole('button',{name:'Retry',exact:true}).click();
    await other.getByText('This memo changed in another window. Your draft has been kept.',{exact:true}).waitFor();
    assert.equal(await other.getByRole('textbox',{name:'Memo content',exact:true}).inputValue(),'Unsaved second-window draft');
    await other.getByRole('button',{name:'Save my version as a copy',exact:true}).click();await saved(other);
    const copies=await list();copies.forEach(m=>owned.add(m.id));assert.equal(copies.length,2);assert.ok(copies.some(m=>m.content==='Server version from first window'));assert.ok(copies.some(m=>m.content==='Unsaved second-window draft'));
    second.offline=true;await other.getByRole('textbox',{name:'Memo content',exact:true}).fill('Draft restored after reload');
    await other.getByText('Saving failed. Your draft is still here; retry when connected.',{exact:true}).waitFor();
    other.once('dialog',dialog=>dialog.accept());await other.reload();await open(other);
    assert.equal(await other.getByRole('textbox',{name:'Memo content',exact:true}).inputValue(),'Draft restored after reload');
    await other.getByText('Saving failed. Your draft is still here; retry when connected.',{exact:true}).waitFor();
    second.offline=false;await other.getByRole('button',{name:'Retry',exact:true}).click();await saved(other);
    await other.keyboard.press('Escape');assert.equal(await other.evaluate(()=>window.qaEscape),0);await other.close();
    await page.getByRole('button',{name:'Refresh memos',exact:true}).click();await delay(200);
    await page.getByRole('searchbox',{name:'Search memos'}).fill('no-such-note');await page.getByText('No matching memos',{exact:true}).waitFor();
    await page.getByRole('searchbox',{name:'Search memos'}).fill('');
    await page.getByRole('button',{name:'Delete memo',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Memos',exact:true}).isVisible(),true);
    assert.equal(await page.getByText('Delete this memo? This cannot be undone.',{exact:true}).count(),0);
    for(const theme of ['light','dark'])for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:3840,height:2160}]) {
      await page.setViewportSize(viewport);await page.evaluate(theme=>{const root=document.documentElement;root.dataset.theme=theme;for(const c of [...root.classList])if(c.startsWith('theme-'))root.classList.remove(c);root.classList.toggle('dark',theme==='dark');root.classList.add(`theme-${theme}`);},theme);await delay(300);
      if(viewport.width<640){await page.getByRole('button',{name:'Back to memos',exact:true}).click();await page.locator('.memo-list-item').first().click();}
      const dimensions=await page.locator('.memo-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:el.scrollWidth>el.clientWidth};});
      assert.ok(dimensions.left>=0&&dimensions.right<=dimensions.width&&dimensions.top>=0&&dimensions.bottom<=dimensions.height&&!dimensions.overflow);
      await page.screenshot({path:path.join(out,`${theme}-${viewport.width}.png`)});report.push({theme,viewport,dimensions});
    }
    for(const flags of [{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true}]) {
      const prevented=await page.evaluate(flags=>{const event=new KeyboardEvent('keydown',{key:'Insert',bubbles:true,cancelable:true,...flags});document.querySelector('.memo-content').dispatchEvent(event);return event.defaultPrevented;},flags);
      assert.equal(prevented,false);assert.equal(await page.locator('.memo-dialog').isVisible(),true);
    }
    for(const mode of ['clear','frosted','default']) {
      await page.evaluate(mode=>{const key='omp-web:wallpaper';localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)),glass:mode}));dispatchEvent(new Event('omp-web:wallpaper-preferences'));},mode);
      await page.waitForFunction(mode=>document.documentElement.dataset.glass===mode,mode);
      assert.equal(await page.locator('.memo-dialog').evaluate(el=>getComputedStyle(el).backdropFilter),mode==='clear'?'none':'blur(20px)');
    }
    await page.evaluate(()=>{const key='omp-web:wallpaper';localStorage.setItem(key,JSON.stringify({...JSON.parse(localStorage.getItem(key)),id:null}));dispatchEvent(new Event('omp-web:wallpaper-preferences'));});
    await page.waitForFunction(()=>document.documentElement.dataset.wallpaper==='off');
    for(const theme of ['light','dark']) {
      const ratio=await page.evaluate(theme=>{
        const root=document.documentElement;root.dataset.theme=theme;for(const c of [...root.classList])if(c.startsWith('theme-'))root.classList.remove(c);root.classList.toggle('dark',theme==='dark');root.classList.add(`theme-${theme}`);
        const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d');
        const luminance=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
        const a=luminance(getComputedStyle(document.querySelector('.memo-content')).color),b=luminance(getComputedStyle(document.querySelector('.memo-dialog')).backgroundColor);
        return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      },theme);assert.ok(ratio>=4.5,`${theme}: ${ratio}`);
      await page.screenshot({path:path.join(out,`solid-${theme}.png`)});
    }
    await page.getByRole('button',{name:'Delete memo',exact:true}).click();
    await page.locator('.memo-alert').getByRole('button',{name:'Delete memo',exact:true}).click();
    for(let i=0;i<30&&(await list()).length!==1;i++)await delay(100);
    assert.equal((await list()).length,1);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.qaEscape),0);
    await page.locator('.memo-dialog').waitFor({state:'detached'});
    await page.keyboard.press('Control+k');await page.getByPlaceholder(/^Search commands/).waitFor();await page.keyboard.press('Insert');assert.equal(await page.locator('.memo-dialog').count(),0);
    await page.getByPlaceholder(/^Search commands/).fill('Memos');
    await page.locator('[cmdk-item][data-selected="true"][data-value="Memos"]').waitFor();
    await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Memos',exact:true}).waitFor();
    await page.keyboard.press('Insert');await page.getByRole('dialog',{name:'Memos',exact:true}).waitFor({state:'hidden'});
    const showSidebar=page.getByRole('button',{name:'Show sidebar',exact:true});
    if(await showSidebar.isVisible())await showSidebar.click();
    await page.locator('.sidebar-settings-row').click();await page.locator('.settings-view').waitFor();
    await page.keyboard.press('Insert');await page.getByRole('dialog',{name:'Memos',exact:true}).waitFor();await page.keyboard.press('Insert');await page.getByRole('dialog',{name:'Memos',exact:true}).waitFor({state:'hidden'});assert.equal(await page.locator('.settings-view').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({report,errors,checks:['Insert from chat/settings and close','modified Insert and IME left intact','autosave on close','slow saves','stale refresh','pin','Markdown preview/export','offline reload recovery','multi-window conflicts/copy','search','confirmed deletion and cancel','Escape isolation','command palette','other dialog isolation','glass modes','solid theme contrast']}));
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({report,errors},null,2));
  } catch(error) {
    for (const [index,page] of api.pages().entries()) {
      await page.screenshot({path:path.join(out,`failure-${index}.png`)}).catch(()=>{});
      console.error(JSON.stringify(await page.evaluate(()=>({dialog:!!document.querySelector('.memo-dialog'),status:document.querySelector('.memo-editor-footer')?.textContent,alerts:[...document.querySelectorAll('.memo-alert')].map(e=>e.textContent),value:document.querySelector('.memo-content')?.value,backup:sessionStorage.getItem('omp-web:memo-draft:v1')})).catch(()=>({closed:true}))));
    }
    throw error;
  } finally {
    for(const memo of await list()) if(owned.has(memo.id)) await api.request.delete(base+'/api/memos/'+memo.id,{data:{revision:memo.revision}});
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
