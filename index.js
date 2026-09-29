// RigKitThreeJS: a Chonk rig for three.js.
//
// Builds a rigged, animatable voxel Chonk from a zMap (the hex voxel string the
// Chonks contracts and indexer return). Extracted from the Chonks playground
// (example/ThreeDChonk.jsx + src/EcctrlAnimationCustom.tsx) with no React,
// R3F or wallet dependencies. The only dependency is `three`.
//
// Coordinate conventions:
// - The Chonk faces +Z, stands on y = 0 and is centred on x = 0.
// - "left" / "right" follow the playground naming: left is -X, which is the
//   viewer's left when looking at the Chonk's face.
// - Bones are positioned in voxel units. The root object is scaled by voxelSize.

import * as THREE from "three";

export const CHONKS_INDEXER_URL = "https://indexer.chonks.xyz";

// Grid layout of a Chonk zMap. x is 0..29 left to right, y is 0..29 top to
// bottom (feet on row 23), z is back to front (face on z = 6).
export const CHONK_GRID = {
  MIDDLE_X: 14,
  FEET_Y: 23,
  LEG_ROWS: [21, 22],
  ARM_ROWS: [17, 20],
  ARM_Z: [5, 6],
  LEFT_LIMB_X: [9, 13],
  RIGHT_LIMB_X: [15, 19],
};

export const BONE_NAMES = [
  "torsoBone",
  "bodyBone",
  "leftLegBone",
  "rightLegBone",
  "leftFootBone",
  "rightFootBone",
  "leftArmBone",
  "rightArmBone",
];

// Accessories held in a hand. The playground keeps that arm still so the hand
// stays on the item. Voxels of an accessory always stay on the body.
export const ACCESSORIES_LOCK_RIGHT_ARM = [
  "Torch",
  "Lightblade Red",
  "Lightblade Green",
  "Fishiing Rod",
  "Scythe",
  "Baguette",
  "A Marfa Burrito",
  "Sword",
  "Staff",
  "Red Balloon",
  "Rubber Ducky",
];
export const ACCESSORIES_LOCK_LEFT_ARM = ["Rubber Ducky"];

// Pivot of each limb in model space (voxel units, before voxelSize scaling).
const PIVOTS = {
  leftLeg: [0, 2.5, 0], // centre of the top leg row (y = 21)
  rightLeg: [0, 2.5, 0],
  leftFoot: [0, 0, 0], // sole of the foot
  rightFoot: [0, 0, 0],
  leftArm: [-4, 6.5, 0], // shoulder: inner arm column (x = 10), top arm row (y = 17)
  rightArm: [4, 6.5, 0],
  body: [0, 0, 0],
};

const PART_TO_BONE = {
  body: "bodyBone",
  leftLeg: "leftLegBone",
  rightLeg: "rightLegBone",
  leftFoot: "leftFootBone",
  rightFoot: "rightFootBone",
  leftArm: "leftArmBone",
  rightArm: "rightArmBone",
};

/**
 * Parses a zMap hex string into voxels. Each voxel is 6 bytes: x, y, z, r, g, b.
 * A later voxel at the same position replaces an earlier one (traits are
 * layered on top of the body).
 */
export function parseZMap(zMap) {
  const hex = zMap.startsWith("0x") ? zMap.slice(2) : zMap;
  const byPosition = new Map();
  for (let i = 0; i + 12 <= hex.length; i += 12) {
    const x = parseInt(hex.slice(i, i + 2), 16);
    const y = parseInt(hex.slice(i + 2, i + 4), 16);
    const z = parseInt(hex.slice(i + 4, i + 6), 16);
    const color = parseInt(hex.slice(i + 6, i + 12), 16);
    byPosition.set((x << 16) | (y << 8) | z, { x, y, z, color });
  }
  return [...byPosition.values()];
}

/**
 * Finds how traits change the rig:
 * - legsJoined: a skirt, dress or robe covers the gap between the legs. The
 *   legs then stay on the body so the garment does not tear when walking.
 * - lockLeftArm / lockRightArm: an item sits beside the hand (for example a
 *   balloon or a pet), so that arm should not swing away from it.
 */
export function analyzeVoxels(voxels) {
  const { MIDDLE_X, FEET_Y, LEG_ROWS, LEFT_LIMB_X, RIGHT_LIMB_X } = CHONK_GRID;
  let legsJoined = false;
  let lockLeftArm = false;
  let lockRightArm = false;
  for (const { x, y } of voxels) {
    if (x === MIDDLE_X && y >= LEG_ROWS[1] && y <= FEET_Y) legsJoined = true;
    if (y >= 18 && y <= 20) {
      if (x < LEFT_LIMB_X[0] - 1) lockLeftArm = true;
      if (x > RIGHT_LIMB_X[1] + 1) lockRightArm = true;
    }
  }
  return { legsJoined, lockLeftArm, lockRightArm };
}

/**
 * Returns the body part a voxel belongs to: "leftFoot", "rightFoot",
 * "leftLeg", "rightLeg", "leftArm", "rightArm" or "body".
 */
export function classifyVoxel(x, y, z, { legsJoined = false } = {}) {
  const { FEET_Y, LEG_ROWS, ARM_ROWS, ARM_Z, LEFT_LIMB_X, RIGHT_LIMB_X } = CHONK_GRID;
  const isLeft = x >= LEFT_LIMB_X[0] && x <= LEFT_LIMB_X[1];
  const isRight = x >= RIGHT_LIMB_X[0] && x <= RIGHT_LIMB_X[1];

  if (!legsJoined) {
    if (y === FEET_Y) {
      if (isLeft) return "leftFoot";
      if (isRight) return "rightFoot";
    } else if (y >= LEG_ROWS[0] && y <= LEG_ROWS[1]) {
      if (isLeft) return "leftLeg";
      if (isRight) return "rightLeg";
    }
  }

  // Arms are 2 columns wide. The top row only has the inner column, so hair
  // that falls over the shoulder stays on the body. Wide sleeves add a third
  // column on the two lowest rows.
  if (y >= ARM_ROWS[0] && y <= ARM_ROWS[1] && z >= ARM_Z[0] && z <= ARM_Z[1]) {
    if (x === 10 || (x === 9 && y >= 18) || (x === 8 && y >= 19 && z === 5)) return "leftArm";
    if (x === 18 || (x === 19 && y >= 18) || (x === 20 && y >= 19 && z === 5)) return "rightArm";
  }

  return "body";
}

/**
 * Builds one mesh geometry from voxels, with vertex colours. Only faces that
 * touch empty space are kept, and touching faces of the same colour are merged
 * into one quad (greedy meshing). This removes the seams you see between
 * separate cubes and keeps the triangle count low.
 * @param {{ x: number, y: number, z: number, color: number }[]} cells Integer grid cells, y up.
 * @param {number[]} offset Added to every vertex.
 */
export function buildVoxelGeometry(cells, offset = [0, 0, 0]) {
  const key = (p) => ((p[0] + 128) << 16) | ((p[1] + 128) << 8) | (p[2] + 128);
  const colorAt = new Map();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const cell of cells) {
    const p = [cell.x, cell.y, cell.z];
    colorAt.set(key(p), cell.color);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  const p = [0, 0, 0];

  for (let d = 0; d < 3 && cells.length > 0; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const width = max[u] - min[u] + 1;
    const height = max[v] - min[v] + 1;
    const mask = new Int32Array(width * height);

    for (const sign of [1, -1]) {
      for (let slice = min[d]; slice <= max[d]; slice++) {
        // Mark the faces in this slice that touch empty space.
        mask.fill(-1);
        for (let b = 0; b < height; b++) {
          for (let a = 0; a < width; a++) {
            p[d] = slice;
            p[u] = min[u] + a;
            p[v] = min[v] + b;
            const c = colorAt.get(key(p));
            if (c === undefined) continue;
            p[d] = slice + sign;
            if (colorAt.has(key(p))) continue;
            mask[a + b * width] = c;
          }
        }

        // Merge same-colour faces into rectangles.
        for (let b = 0; b < height; b++) {
          for (let a = 0; a < width; ) {
            const c = mask[a + b * width];
            if (c < 0) {
              a++;
              continue;
            }
            let w = 1;
            while (a + w < width && mask[a + w + b * width] === c) w++;
            let h = 1;
            grow: while (b + h < height) {
              for (let k = 0; k < w; k++) if (mask[a + k + (b + h) * width] !== c) break grow;
              h++;
            }

            const n = positions.length / 3;
            const plane = slice + (sign > 0 ? 1 : 0);
            color.setHex(c);
            for (const [cu, cv] of [[a, b], [a + w, b], [a + w, b + h], [a, b + h]]) {
              p[d] = plane;
              p[u] = min[u] + cu;
              p[v] = min[v] + cv;
              positions.push(p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]);
              normals.push(d === 0 ? sign : 0, d === 1 ? sign : 0, d === 2 ? sign : 0);
              colors.push(color.r, color.g, color.b);
            }
            if (sign > 0) indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
            else indices.push(n, n + 2, n + 1, n, n + 3, n + 2);

            for (let j = 0; j < h; j++) mask.fill(-1, a + (b + j) * width, a + w + (b + j) * width);
            a += w;
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A rigged voxel Chonk.
 *
 *   const chonk = new ChonkRig({ zMap });
 *   scene.add(chonk.object);
 *   chonk.bones.leftArmBone.rotation.z = -1;
 */
export class ChonkRig {
  /**
   * @param {object} [options]
   * @param {string} [options.zMap] Hex voxel string. Can be set later with setZMap.
   * @param {string} [options.accessory] Accessory trait name, used to lock arms.
   * @param {number} [options.voxelSize=0.075] World size of one voxel. 0.075 makes a Chonk about 1.8 units tall.
   * @param {boolean} [options.castShadow=true]
   * @param {boolean} [options.receiveShadow=true]
   * @param {THREE.Material} [options.material] Material for all voxels. It must use vertexColors.
   */
  constructor(options = {}) {
    const {
      zMap,
      accessory = null,
      voxelSize = 0.075,
      castShadow = true,
      receiveShadow = true,
      material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    } = options;

    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.material = material;
    this.legsJoined = false;
    this.armLocks = { left: false, right: false };
    this.accessory = null;

    this.object = new THREE.Group();
    this.object.name = "chonk";
    this.object.scale.setScalar(voxelSize);

    this.bones = {};
    for (const name of BONE_NAMES) {
      const bone = new THREE.Bone();
      bone.name = name;
      this.bones[name] = bone;
    }
    const b = this.bones;
    b.torsoBone.add(b.bodyBone, b.leftLegBone, b.rightLegBone, b.leftArmBone, b.rightArmBone);
    b.leftLegBone.add(b.leftFootBone);
    b.rightLegBone.add(b.rightFootBone);
    this.object.add(b.torsoBone);

    b.leftLegBone.position.fromArray(PIVOTS.leftLeg);
    b.rightLegBone.position.fromArray(PIVOTS.rightLeg);
    b.leftFootBone.position.fromArray(PIVOTS.leftFoot).sub(b.leftLegBone.position);
    b.rightFootBone.position.fromArray(PIVOTS.rightFoot).sub(b.rightLegBone.position);
    b.leftArmBone.position.fromArray(PIVOTS.leftArm);
    b.rightArmBone.position.fromArray(PIVOTS.rightArm);

    this.restPose = {};
    for (const name of BONE_NAMES) {
      const bone = this.bones[name];
      this.restPose[name] = { position: bone.position.clone(), quaternion: bone.quaternion.clone() };
    }

    // One group per body part, attached to its bone. The part's mesh goes in here.
    this.parts = {};
    for (const [part, boneName] of Object.entries(PART_TO_BONE)) {
      const group = new THREE.Group();
      group.name = part;
      this.parts[part] = group;
      this.bones[boneName].add(group);
    }

    // Lets SkeletonHelper and skinning tools see the bones.
    this.skeleton = new THREE.Skeleton(BONE_NAMES.map((name) => this.bones[name]));

    if (zMap) this.setZMap(zMap, { accessory });
  }

  /**
   * Replaces the voxels. Pass the full zMap (body + traits) from the indexer
   * or a base body zMap.
   * @param {string} zMap
   * @param {object} [options]
   * @param {string} [options.accessory] Accessory trait name, used to lock arms.
   */
  setZMap(zMap, { accessory = null } = {}) {
    this.clearVoxels();

    const voxels = parseZMap(zMap);
    const analysis = analyzeVoxels(voxels);
    this.legsJoined = analysis.legsJoined;
    this.accessory = accessory;
    this.armLocks = {
      left: analysis.lockLeftArm || ACCESSORIES_LOCK_LEFT_ARM.includes(accessory),
      right: analysis.lockRightArm || ACCESSORIES_LOCK_RIGHT_ARM.includes(accessory),
    };

    // Grid cells per part, with y flipped so it points up (the feet row is 0).
    const cellsByPart = {};
    for (const { x, y, z, color } of voxels) {
      const part = classifyVoxel(x, y, z, analysis);
      (cellsByPart[part] ??= []).push({ x, y: CHONK_GRID.FEET_Y - y, z, color });
    }

    // One mesh per part. Cell corners move to model space, relative to the part's pivot.
    for (const [part, cells] of Object.entries(cellsByPart)) {
      const pivot = PIVOTS[part];
      const offset = [-CHONK_GRID.MIDDLE_X - 0.5 - pivot[0], -pivot[1], -5.5 - pivot[2]];
      const mesh = new THREE.Mesh(buildVoxelGeometry(cells, offset), this.material);
      mesh.name = `${part}Mesh`;
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      this.parts[part].add(mesh);
    }
    return this;
  }

  /** Puts every bone back to its rest position and rotation. */
  resetPose() {
    for (const name of BONE_NAMES) {
      const bone = this.bones[name];
      const rest = this.restPose[name];
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
      bone.scale.set(1, 1, 1);
    }
  }

  clearVoxels() {
    for (const group of Object.values(this.parts)) {
      for (const mesh of [...group.children]) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
    }
  }

  dispose() {
    this.clearVoxels();
    this.material.dispose();
    this.object.removeFromParent();
  }
}

export const ANIMATIONS = ["idle", "walk", "run", "jump", "wave", "bow"];

/**
 * Procedural animations from the playground. Call update(delta) every frame.
 *
 *   const animator = new ChonkAnimator(chonk);
 *   animator.play("walk");
 *   renderer.setAnimationLoop(() => animator.update(clock.getDelta()));
 */
export class ChonkAnimator {
  /** @param {ChonkRig} rig */
  constructor(rig, { animation = "idle" } = {}) {
    this.rig = rig;
    this.time = 0;
    this.jumpTime = 0;
    this.play(animation);
  }

  /** @param {"idle"|"walk"|"run"|"jump"|"wave"|"bow"} name */
  play(name) {
    if (!ANIMATIONS.includes(name)) throw new Error(`Unknown Chonk animation "${name}"`);
    if (name === "jump" && this.animation !== "jump") this.jumpTime = 0;
    this.animation = name;
  }

  /** @param {number} delta Seconds since the last frame. */
  update(delta) {
    this.time += delta;
    const t = this.time;
    const rig = this.rig;
    const { torsoBone, bodyBone, leftLegBone, rightLegBone, leftFootBone, rightFootBone, leftArmBone, rightArmBone } = rig.bones;
    const moveLeftArm = !rig.armLocks.left;
    const moveRightArm = !rig.armLocks.right;

    rig.resetPose();

    const walkAmplitude = 0.5;
    const torsoAmplitude = 0.05;
    const armAmplitude = 0.5;
    const footAmplitude = 0.3;
    const sideAmplitude = 0.03;
    const bobHeight = 0.4;
    const zFightOffset = 0.01;

    switch (this.animation) {
      case "idle": {
        torsoBone.position.y += Math.sin(t * 0.5) * 0.05;
        torsoBone.rotation.z = Math.sin(t * 0.6) * 0.02;
        break;
      }
      case "walk":
      case "run": {
        const isRun = this.animation === "run";
        const phase = t * (isRun ? 16 : 8);
        const s = Math.sin(phase);
        torsoBone.position.y += Math.abs(s) * bobHeight;
        torsoBone.position.x += s * sideAmplitude;
        torsoBone.rotation.z = s * torsoAmplitude;
        torsoBone.rotation.x = s * 0.1;
        leftLegBone.rotation.x = s * walkAmplitude;
        rightLegBone.rotation.x = -s * walkAmplitude;
        leftLegBone.position.x += zFightOffset;
        rightLegBone.position.x += zFightOffset;
        if (!isRun) {
          leftFootBone.rotation.x = Math.sin(phase - 0.3) * footAmplitude;
          rightFootBone.rotation.x = Math.sin(phase + Math.PI - 0.3) * footAmplitude;
        }
        if (moveLeftArm) leftArmBone.rotation.x = -s * armAmplitude;
        if (moveRightArm) rightArmBone.rotation.x = s * armAmplitude;
        break;
      }
      case "jump": {
        this.jumpTime += delta * 10;
        const jt = this.jumpTime;
        const tuck = -Math.PI / 2 * 0.4 + Math.sin(jt) * 0.25;
        leftLegBone.rotation.x = tuck;
        rightLegBone.rotation.x = tuck;
        if (moveLeftArm) leftArmBone.rotation.x = tuck;
        if (moveRightArm) rightArmBone.rotation.x = tuck;
        torsoBone.position.y += Math.abs(Math.sin(jt)) * bobHeight;
        torsoBone.rotation.z = Math.sin(jt) * 0.025;
        break;
      }
      case "wave": {
        // Wave with the left arm, or with the right arm if the left one holds an item.
        const phase = t * 3;
        const raise = Math.sin(phase) * 0.5 - Math.PI * 0.4;
        if (moveLeftArm || !moveRightArm) leftArmBone.rotation.z = raise;
        else rightArmBone.rotation.z = -raise;
        torsoBone.rotation.z = Math.sin(phase) * 0.025;
        break;
      }
      case "bow": {
        const bow = 0.5 + 0.5 * Math.sin(t * 2);
        bodyBone.rotation.x = 0.2 * bow;
        if (moveLeftArm) {
          leftArmBone.rotation.x = 0.2 * bow;
          leftArmBone.position.z += 0.9 * bow;
        }
        if (moveRightArm) {
          rightArmBone.rotation.x = 0.2 * bow;
          rightArmBone.position.z += 0.9 * bow;
        }
        break;
      }
    }
  }
}

/**
 * Decodes a tokenURI. 2D Chonks use `data:application/json;base64,...` and
 * 3D Chonks use URL-encoded `data:application/json,...`.
 */
export function decodeTokenURI(tokenURI) {
  const commaIndex = tokenURI.indexOf(",");
  const header = tokenURI.slice(0, commaIndex);
  const payload = tokenURI.slice(commaIndex + 1);
  if (header.endsWith(";base64")) {
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  return JSON.parse(decodeURIComponent(payload));
}

/**
 * Loads a Chonk with all its equipped traits from the Chonks indexer.
 * @returns {Promise<{ tokenId: number, zMap: string, accessory: string | null, metadata: object }>}
 */
export async function fetchChonk(tokenId, { indexerUrl = CHONKS_INDEXER_URL } = {}) {
  const response = await fetch(`${indexerUrl}/chonk/zmap?tokenId=${tokenId}`);
  if (!response.ok) throw new Error(`Chonk ${tokenId}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  const chonk = data.chonks?.[0];
  if (!data.success || !chonk?.z_map) throw new Error(`Chonk ${tokenId}: no zMap from the indexer`);

  const metadata = decodeTokenURI(chonk.token_uri);
  const accessory = metadata.attributes?.find((a) => a.trait_type === "Accessory")?.value ?? null;
  return { tokenId: Number(chonk.token_id ?? tokenId), zMap: chonk.z_map, accessory, metadata };
}

/** Returns the token IDs of the Chonks an address owns. */
export async function fetchChonkIdsByOwner(address, { indexerUrl = CHONKS_INDEXER_URL } = {}) {
  const response = await fetch(`${indexerUrl}/chonk/owner/${address.toLowerCase()}`);
  if (!response.ok) throw new Error(`Owner ${address}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  if (!data.success || !data.chonks) return [];
  return data.chonks.map((chonk) => Number(chonk.id));
}

/** Loads a Chonk from the indexer and builds its rig. */
export async function loadChonk(tokenId, options = {}) {
  const { indexerUrl, ...rigOptions } = options;
  const chonk = await fetchChonk(tokenId, { indexerUrl });
  const rig = new ChonkRig({ ...rigOptions, zMap: chonk.zMap, accessory: chonk.accessory });
  return { rig, ...chonk };
}
