// Run with: npm test
// Fixtures are real Chonks (body + equipped traits) from indexer.chonks.xyz.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  ChonkRig,
  ChonkAnimator,
  parseZMap,
  analyzeVoxels,
  classifyVoxel,
  buildVoxelGeometry,
} from "../index.js";
import { BASE_BODIES } from "../bodies.js";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url)));
const chonk = (tokenId) => fixtures.find((f) => f.tokenId === tokenId);

// Classifies a voxel of a fixture, and fails if the fixture does not have it.
function partOf(tokenId, [x, y, z]) {
  const voxels = parseZMap(chonk(tokenId).zMap);
  assert.ok(
    voxels.some((v) => v.x === x && v.y === y && v.z === z),
    `Chonk ${tokenId} has no voxel at ${x},${y},${z}`
  );
  return classifyVoxel(x, y, z, analyzeVoxels(voxels));
}

const triangles = (geometry) => geometry.index.count / 3;
const assertZero = (value, message) => assert.ok(Math.abs(value) < 1e-9, message ?? `${value} is not 0`);

test("parseZMap reads 0x-prefixed hex and a later voxel replaces an earlier one", () => {
  const voxels = parseZMap("0x0a0b0cff0000" + "0a0b0c00ff00" + "010203000000");
  assert.deepEqual(voxels, [
    { x: 10, y: 11, z: 12, color: 0x00ff00 },
    { x: 1, y: 2, z: 3, color: 0x000000 },
  ]);
});

test("a base body has every limb, no joined legs and no arm locks", () => {
  const rig = new ChonkRig({ zMap: BASE_BODIES[0].zMap });
  for (const [part, group] of Object.entries(rig.parts)) {
    assert.equal(group.children.length, 1, `${part} has a mesh`);
  }
  assert.equal(rig.legsJoined, false);
  assert.deepEqual(rig.armLocks, { left: false, right: false });
});

test("the rest pose puts every voxel where the zMap says", () => {
  const { zMap } = chonk(27543);
  const voxels = parseZMap(zMap);
  const rig = new ChonkRig({ zMap, voxelSize: 1 });
  rig.object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.object);

  const xs = voxels.map((v) => v.x);
  const ys = voxels.map((v) => v.y);
  const zs = voxels.map((v) => v.z);
  const expected = new THREE.Box3(
    new THREE.Vector3(Math.min(...xs) - 14.5, 23 - Math.max(...ys), Math.min(...zs) - 5.5),
    new THREE.Vector3(Math.max(...xs) - 13.5, 24 - Math.min(...ys), Math.max(...zs) - 4.5)
  );
  assert.ok(box.min.distanceTo(expected.min) < 1e-6, `min ${box.min.toArray()} != ${expected.min.toArray()}`);
  assert.ok(box.max.distanceTo(expected.max) < 1e-6, `max ${box.max.toArray()} != ${expected.max.toArray()}`);
  assert.equal(box.min.y, 0, "feet stand on y = 0");
});

test("hoodie sleeves move with the arms", () => {
  assert.equal(partOf(10174, [10, 18, 6]), "leftArm");
  assert.equal(partOf(10174, [18, 18, 6]), "rightArm");
});

test("wide blouse sleeves move with the arms", () => {
  assert.equal(partOf(61028, [8, 19, 5]), "leftArm");
  assert.equal(partOf(61028, [20, 20, 5]), "rightArm");
});

test("long hair over the shoulders stays on the body", () => {
  assert.equal(partOf(7813, [9, 17, 6]), "body");
  assert.equal(partOf(7813, [19, 17, 5]), "body");
  assert.equal(partOf(7813, [8, 18, 5]), "body");
});

test("shoes move with the feet and pants move with the legs", () => {
  assert.equal(partOf(27543, [11, 23, 5]), "leftFoot");
  assert.equal(partOf(27543, [17, 23, 6]), "rightFoot");
  assert.equal(partOf(27543, [12, 22, 5]), "leftLeg");
  assert.equal(partOf(27543, [16, 21, 4]), "rightLeg");
  assert.equal(partOf(27543, [14, 21, 5]), "body", "the crotch stays on the body");
});

test("skirts, dresses, mermaid tails and robes join the legs", () => {
  for (const tokenId of [11890, 45021, 56046]) {
    const rig = new ChonkRig({ zMap: chonk(tokenId).zMap });
    assert.equal(rig.legsJoined, true, `Chonk ${tokenId} (${JSON.stringify(chonk(tokenId).traits)})`);
    for (const part of ["leftLeg", "rightLeg", "leftFoot", "rightFoot"]) {
      assert.equal(rig.parts[part].children.length, 0, `Chonk ${tokenId} ${part} is empty`);
    }
  }
});

test("pants do not join the legs", () => {
  for (const tokenId of [38870, 10174, 61028, 7813, 27543, 12799, 2]) {
    assert.equal(new ChonkRig({ zMap: chonk(tokenId).zMap }).legsJoined, false, `Chonk ${tokenId}`);
  }
});

test("an item beside the right hand locks the right arm", () => {
  for (const tokenId of [27543, 12799, 2]) {
    const rig = new ChonkRig({ zMap: chonk(tokenId).zMap });
    assert.deepEqual(rig.armLocks, { left: false, right: true }, `Chonk ${tokenId} (${chonk(tokenId).traits.Accessory})`);
  }
});

test("an accessory name from the lock list locks the arm", () => {
  const rig = new ChonkRig({ zMap: BASE_BODIES[0].zMap, accessory: "Rubber Ducky" });
  assert.deepEqual(rig.armLocks, { left: true, right: true });
});

test("a floor accessory next to the foot stays on the body", () => {
  assert.equal(partOf(2, [20, 23, 6]), "body");
});

test("setZMap replaces the voxels and the analysis", () => {
  const rig = new ChonkRig({ zMap: chonk(27543).zMap });
  rig.setZMap(chonk(11890).zMap);
  assert.equal(rig.legsJoined, true);
  assert.deepEqual(rig.armLocks, { left: false, right: false });
  assert.equal(rig.parts.body.children.length, 1);
});

test("buildVoxelGeometry keeps only outer faces and merges same-colour faces", () => {
  assert.equal(triangles(buildVoxelGeometry([{ x: 0, y: 0, z: 0, color: 1 }])), 12);

  const sameColour = [
    { x: 0, y: 0, z: 0, color: 1 },
    { x: 1, y: 0, z: 0, color: 1 },
  ];
  assert.equal(triangles(buildVoxelGeometry(sameColour)), 12, "a 2x1x1 block is 6 quads");

  const twoColours = [
    { x: 0, y: 0, z: 0, color: 1 },
    { x: 1, y: 0, z: 0, color: 2 },
  ];
  assert.equal(triangles(buildVoxelGeometry(twoColours)), 20, "no face between the two cells");
});

test("buildVoxelGeometry normals point out of the solid", () => {
  const geometry = buildVoxelGeometry([{ x: 0, y: 0, z: 0, color: 1 }]);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.index;
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    const faceNormal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    const vertexNormal = new THREE.Vector3().fromBufferAttribute(normal, index.getX(i));
    assert.ok(faceNormal.equals(vertexNormal), `triangle ${i / 3} winding matches its normal`);
    const centre = a.clone().add(b).add(c).divideScalar(3).subScalar(0.5);
    assert.ok(centre.dot(vertexNormal) > 0, `triangle ${i / 3} normal points out`);
  }
});

test("walk swings the legs in opposite directions", () => {
  const rig = new ChonkRig({ zMap: BASE_BODIES[0].zMap });
  const animator = new ChonkAnimator(rig, { animation: "walk" });
  animator.update(0.2);
  const { leftLegBone, rightLegBone, leftArmBone, rightArmBone } = rig.bones;
  assert.notEqual(leftLegBone.rotation.x, 0);
  assert.ok(Math.abs(leftLegBone.rotation.x + rightLegBone.rotation.x) < 1e-9);
  assert.ok(Math.abs(leftArmBone.rotation.x + rightArmBone.rotation.x) < 1e-9);
});

test("a locked arm does not swing", () => {
  const rig = new ChonkRig({ zMap: chonk(27543).zMap });
  const animator = new ChonkAnimator(rig, { animation: "walk" });
  animator.update(0.2);
  assertZero(rig.bones.rightArmBone.rotation.x);
  assert.notEqual(rig.bones.leftArmBone.rotation.x, 0);
});

test("wave uses the right arm when the left arm is locked", () => {
  const rig = new ChonkRig({ zMap: BASE_BODIES[0].zMap });
  rig.armLocks.left = true;
  const animator = new ChonkAnimator(rig, { animation: "wave" });
  animator.update(0.5);
  assertZero(rig.bones.leftArmBone.rotation.z);
  assert.ok(rig.bones.rightArmBone.rotation.z > 0, "the right arm goes up and out");
});

test("each frame starts from the rest pose", () => {
  const rig = new ChonkRig({ zMap: BASE_BODIES[0].zMap });
  const animator = new ChonkAnimator(rig, { animation: "wave" });
  animator.update(0.5);
  animator.play("idle");
  animator.update(0.016);
  assertZero(rig.bones.leftArmBone.rotation.z);
  assert.ok(rig.bones.leftArmBone.position.equals(rig.restPose.leftArmBone.position));
});

test("play rejects an unknown animation", () => {
  const rig = new ChonkRig({ zMap: BASE_BODIES[0].zMap });
  assert.throws(() => new ChonkAnimator(rig).play("dance"), /Unknown Chonk animation/);
});
