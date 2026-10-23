import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4 } from 'three';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { SceneMeshAnimator } = await jiti.import('./wallpaper-skinning.ts');
const { ScenePropertyScripts } = await jiti.import('./wallpaper-property-scripts.ts');
const identity = () => new Matrix4().toArray();
const physics = extra => ({ translation:true, rotation:false, translationAxes:[true,true,true], rotationAxes:[false,false,true], translationStiffness:100, translationFriction:3, translationInertia:1, rotationStiffness:100, rotationFriction:3, rotationInertia:1, maxDistance:100, gravity:[0,0,0], tip:[10,0,0], ...extra });
function mesh(extra) { return { positions:[10,0,0], uvs:[0,0], indices:[], joints:[0,0,0,0], weights:[1,0,0,0], bones:[{parent:-1,name:'tip',matrix:identity(),physics:physics(extra)}] }; }
function animator(t, model=mesh()) { const a=new SceneMeshAnimator(model); a.update(0); t.after(()=>a.dispose()); return a; }

test('dragged spring bones rebound past rest and settle, while pause and seek retain bounded state', t=>{
  const a=animator(t);const transform=new Matrix4().makeTranslation(20,0,0).toArray();
  a.applyLocalTransforms({0:transform});assert.equal(a.positions[0],30);
  assert.equal(a.update(0),false);assert.equal(a.positions[0],30);
  a.update(.1);assert.ok(a.positions[0]>10 && a.positions[0]<30);
  let crossed=false;for(let n=7;n<=600;n++){a.update(n/60);if(a.positions[0]<10)crossed=true;}
  assert.equal(crossed,true);assert.ok(Math.abs(a.positions[0]-10)<.001);
  a.applyLocalTransforms({0:transform});a.update(20);assert.equal(a.positions[0],10,'seek resets accumulated physics');
});

test('impulse integration is frame-rate independent and reset removes stored momentum',t=>{
  const sample=hz=>{const a=animator(t);a.applyPhysicsCommands([{bone:0,action:'impulse',translation:[60,0,0],rotation:[0,0,0]}]);for(let n=1;n<=hz;n++)a.update(n/hz);return a;};
  const low=sample(15),high=sample(120);assert.ok(Math.abs(low.positions[0]-high.positions[0])<1e-5);
  assert.ok(Math.abs(low.positions[0]-10)>.1);
  low.applyPhysicsCommands([{bone:-1,action:'reset'}]);assert.equal(low.positions[0],10);
  low.update(1.05);assert.equal(low.positions[0],10);
});

test('translation axes, maximum displacement and rotation limits constrain large impulses',t=>{
  const a=animator(t,mesh({translationAxes:[true,false,false],maxDistance:2,rotation:true,minAngles:[0,0,-.1],maxAngles:[0,0,.1]}));
  a.applyPhysicsCommands([{bone:0,action:'impulse',translation:[1e6,1e6,1e6],rotation:[1e6,1e6,1e6]}]);a.update(.05);
  const matrix=a.localTransforms()[0];assert.ok(Math.abs(matrix[12])<=2);assert.equal(matrix[13],0);assert.equal(matrix[14],0);
  assert.ok(Math.abs(Math.atan2(matrix[1],matrix[0]))<=.10000001);
  assert.ok([...a.positions].every(Number.isFinite));
});

test('parent animation excites secondary motion and attachments use simulated transforms',t=>{
  const model=mesh();model.bones=[{parent:-1,matrix:identity()},{parent:0,matrix:new Matrix4().makeTranslation(5,0,0).toArray(),physics:physics()}];model.joints=[1,0,0,0];
  model.attachments=[{name:'end',bone:1,matrix:identity()}];
  model.animations=[{id:1,frames:1,fps:1,mode:'once',tracks:[{bone:0,values:[0,0,0,0,0,0,1,1,1,10,0,0,0,0,0,1,1,1]}]}];model.playback={id:1,rate:1,blend:1};
  const a=animator(t,model);a.update(.1);
  assert.ok(a.positions[0]<11 && a.positions[0]>10,'child lags animated parent');
  assert.ok(Math.abs(a.attachment('end')[12]-(a.positions[0]-5))<1e-6);
});

test('gravity and stiff springs remain finite at low frame rates',t=>{
  const a=animator(t,mesh({translationStiffness:1e6,translationInertia:.001,gravity:[0,-20,0]}));
  for(let n=1;n<=150;n++)a.update(n/15);
  assert.ok([...a.positions].every(Number.isFinite));assert.ok(a.positions[1]<0);
  assert.ok(Math.abs(a.positions[1]+20/1e9)<1e-9);
});

test('scripted physics impulses are consumed once, transform from world space and reset via the guest API',async t=>{
  const model=mesh(),a=animator(t,model);
  const layer={id:1,name:'body',origin:[0,0,0],scale:[1,1,1],angle:0,parallax:[0,0],size:[100,100],color:[1,1,1],alpha:1,texture:'@transparent',blending:'normal',passes:[],colorBlendMode:0,mesh:model,
    scripts:[{property:'visible',properties:{},source:'export function init(){thisLayer.applyBonePhysicsImpulse("tip",new Vec3(20,0,0));engine.setTimeout(()=>thisLayer.resetBonePhysicsSimulation(),100);}'}]};
  const scripts=await ScenePropertyScripts.create({width:100,height:100,layers:[layer],textures:[],particles:[]},0);t.after(()=>scripts.dispose());
  const frame=scripts.update(0,0,[],0);a.applyPhysicsCommands(frame.layers[0].boneCommands,new Matrix4().makeRotationZ(Math.PI/2));a.update(.05);
  assert.ok(Math.abs(a.positions[0]-10)<1e-6);assert.ok(a.positions[1]<0);
  assert.deepEqual(scripts.update(.05,.05,[],50).layers[0].boneCommands,[]);
  a.applyPhysicsCommands(scripts.update(.1,.05,[],100).layers[0].boneCommands);assert.deepEqual([...a.positions],[10,0,0]);
});
