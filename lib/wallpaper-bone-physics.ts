import { Bone, Euler, Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import type { SceneBoneCommand, SceneBonePhysics, SceneMesh } from "./wallpaper-scene-types";

// Exact damped-spring integration for a constant target/force over one step.
// This stays stable for stiff authored springs and low display frame rates.
function integrate(position: Vector3, velocity: Vector3, axis: number, target: number, stiffness: number, friction: number, force: number, dt: number) {
  let x = position.getComponent(axis), v = velocity.getComponent(axis);
  if (stiffness < 1e-9) {
    if (friction < 1e-9) { x += v * dt + force * dt * dt / 2; v += force * dt; }
    else { const decay = Math.exp(-friction * dt), terminal = force / friction; x += terminal * dt + (v - terminal) * (1 - decay) / friction; v = terminal + (v - terminal) * decay; }
  } else {
    const equilibrium = target + force / stiffness, y = x - equilibrium, half = friction / 2, discriminant = stiffness - half * half;
    if (Math.abs(discriminant) < 1e-8) {
      const decay = Math.exp(-half * dt), b = v + half * y;
      x = equilibrium + (y + b * dt) * decay; v = (v - half * b * dt) * decay;
    } else if (discriminant > 0) {
      const frequency = Math.sqrt(discriminant), decay = Math.exp(-half * dt), sin = Math.sin(frequency * dt), cos = Math.cos(frequency * dt);
      x = equilibrium + decay * (y * cos + (v + half * y) * sin / frequency);
      v = decay * (v * cos - (half * v + stiffness * y) * sin / frequency);
    } else {
      const root = Math.sqrt(-discriminant), slow = -stiffness / (half + root), fast = -half - root;
      const a = (v - fast * y) / (slow - fast), b = y - a, e1 = Math.exp(slow * dt), e2 = Math.exp(fast * dt);
      x = equilibrium + a * e1 + b * e2; v = slow * a * e1 + fast * b * e2;
    }
  }
  position.setComponent(axis, x); velocity.setComponent(axis, v);
}

type Body = {
  index: number; config: SceneBonePhysics; initialized: boolean;
  position: Vector3; rotation: Quaternion; velocity: Vector3; angularVelocity: Vector3;
  targetPosition: Vector3; targetRotation: Quaternion; previousTarget: Vector3; targetVelocity: Vector3;
};

export class SceneBoneSimulation {
  private bodies: Body[];
  private byIndex = new Map<number, Body>();
  private inverse = new Matrix4();
  private parentRotation = new Quaternion();
  private quaternion = new Quaternion();
  private directionTransform = new Matrix3();
  private layerRotation = new Quaternion();
  private offset = new Vector3();
  private angles = new Vector3();
  private force = new Vector3();
  private acceleration = new Vector3();
  private tip = new Vector3();
  private scale = new Vector3();
  private euler = new Euler();
  constructor(private bones: Bone[], definition: NonNullable<SceneMesh["bones"]>) {
    this.bodies = definition.flatMap((bone, index) => bone.physics ? [{ index, config: bone.physics, initialized: false,
      position: new Vector3(), rotation: new Quaternion(), velocity: new Vector3(), angularVelocity: new Vector3(),
      targetPosition: new Vector3(), targetRotation: new Quaternion(), previousTarget: new Vector3(), targetVelocity: new Vector3() }] : []);
    const depth = (index: number) => { let value = 0; for (let parent = definition[index].parent; parent >= 0; parent = definition[parent].parent) value++; return value; };
    this.bodies.sort((a, b) => depth(a.index) - depth(b.index));
    for (const body of this.bodies) this.byIndex.set(body.index, body);
  }
  private initialize(body: Body) {
    body.position.copy(body.targetPosition); body.rotation.copy(body.targetRotation);
    body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0);
    body.previousTarget.copy(body.targetPosition); body.targetVelocity.set(0, 0, 0); body.initialized = true;
  }
  step(dt: number) {
    // Rewinding/seeking starts a fresh simulation. Pauses retain all state.
    const reset = !Number.isFinite(dt) || dt < 0 || dt > .25;
    if (reset) dt = 0;
    for (const body of this.bodies) {
      const bone = this.bones[body.index], config = body.config;
      bone.updateWorldMatrix(true, false);
      bone.matrixWorld.decompose(body.targetPosition, body.targetRotation, this.scale);
      if (!body.initialized || reset) this.initialize(body);
      if (dt > 0) {
        this.acceleration.subVectors(body.targetPosition, body.previousTarget).divideScalar(dt);
        this.force.copy(this.acceleration).sub(body.targetVelocity).divideScalar(dt);
        body.targetVelocity.copy(this.acceleration); body.previousTarget.copy(body.targetPosition);
        if (config.translation) {
          for (let axis = 0; axis < 3; axis++) integrate(body.position, body.velocity, axis, body.targetPosition.getComponent(axis), config.translationStiffness / config.translationInertia, config.translationFriction, config.gravity[axis], dt);
        } else body.position.copy(body.targetPosition);
        if (config.rotation) {
          // Acceleration of the animated anchor and gravity act at the authored tip.
          this.tip.fromArray(config.tip).applyQuaternion(body.targetRotation);
          const tipLengthSq = Math.max(1, this.tip.lengthSq());
          this.acceleration.fromArray(config.gravity).sub(this.force);
          this.force.crossVectors(this.tip, this.acceleration).divideScalar(tipLengthSq);
          if (config.maxTorque !== undefined) this.force.clampLength(0, config.maxTorque);
          this.quaternion.copy(body.targetRotation).invert(); this.force.applyQuaternion(this.quaternion);
          this.quaternion.multiply(body.rotation);
          this.euler.setFromQuaternion(this.quaternion, "XYZ"); this.angles.set(this.euler.x, this.euler.y, this.euler.z);
          for (let axis = 0; axis < 3; axis++) integrate(this.angles, body.angularVelocity, axis, 0, config.rotationStiffness / config.rotationInertia, config.rotationFriction, this.force.getComponent(axis) / config.rotationInertia, dt);
          for (let axis = 0; axis < 3; axis++) {
            const angle = this.angles.getComponent(axis);
            const bounded = config.rotationAxes[axis] ? Math.max(config.minAngles?.[axis] ?? -Math.PI, Math.min(config.maxAngles?.[axis] ?? Math.PI, angle)) : 0;
            this.angles.setComponent(axis, bounded);
            if (angle !== bounded) body.angularVelocity.setComponent(axis, 0);
          }
          body.rotation.copy(body.targetRotation).multiply(this.quaternion.setFromEuler(this.euler.set(this.angles.x, this.angles.y, this.angles.z, "XYZ"))).normalize();
        } else body.rotation.copy(body.targetRotation);
      }
      this.constrainTranslation(body);
      this.apply(body);
    }
  }
  private constrainTranslation(body: Body) {
    const parent = this.bones[body.index].parent;
    if (parent) parent.getWorldQuaternion(this.parentRotation); else this.parentRotation.identity();
    this.quaternion.copy(this.parentRotation).invert();
    this.offset.subVectors(body.position, body.targetPosition).applyQuaternion(this.quaternion);
    body.velocity.applyQuaternion(this.quaternion);
    for (let axis = 0; axis < 3; axis++) if (!body.config.translation || !body.config.translationAxes[axis]) { this.offset.setComponent(axis, 0); body.velocity.setComponent(axis, 0); }
    if (this.offset.lengthSq() > body.config.maxDistance ** 2) {
      this.offset.clampLength(0, body.config.maxDistance);
      const distanceSq = this.offset.lengthSq(), outward = this.offset.dot(body.velocity);
      if (distanceSq && outward > 0) body.velocity.addScaledVector(this.offset, -outward / distanceSq);
    }
    body.velocity.applyQuaternion(this.parentRotation);
    body.position.copy(body.targetPosition).add(this.offset.applyQuaternion(this.parentRotation));
  }
  private apply(body: Body) {
    const bone = this.bones[body.index];
    if (bone.parent) {
      this.inverse.copy(bone.parent.matrixWorld).invert();
      bone.position.copy(body.position).applyMatrix4(this.inverse);
      bone.parent.getWorldQuaternion(this.parentRotation);
      bone.quaternion.copy(this.parentRotation).invert().multiply(body.rotation);
    } else { bone.position.copy(body.position); bone.quaternion.copy(body.rotation); }
    bone.updateMatrixWorld(true);
  }
  override(index: number) {
    const body = this.byIndex.get(index);
    if (!body) return;
    const bone = this.bones[index]; bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(body.position, body.rotation, this.scale);
    body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0);
  }
  command(command: SceneBoneCommand, world?: Matrix4) {
    this.inverse.copy(world || this.inverse.identity()).invert();
    this.directionTransform.setFromMatrix4(this.inverse);
    if (world) world.decompose(this.offset, this.layerRotation, this.scale); else this.layerRotation.identity();
    this.layerRotation.invert();
    for (const body of this.bodies) {
      if (command.bone !== -1 && body.index !== command.bone) continue;
      if (command.action === "reset") { this.initialize(body); this.apply(body); }
      else {
        this.force.fromArray(command.translation).applyMatrix3(this.directionTransform);
        body.velocity.addScaledVector(this.force, 1 / body.config.translationInertia);
        this.quaternion.copy(body.targetRotation).invert();
        this.force.fromArray(command.rotation).applyQuaternion(this.layerRotation).applyQuaternion(this.quaternion);
        body.angularVelocity.addScaledVector(this.force, 1 / body.config.rotationInertia);
      }
    }
  }
}
