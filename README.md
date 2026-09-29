# RigKitThreeJS

npm package: `rigkit-threejs` · Source: [github.com/chonksxyz/rigkit-threejs](https://github.com/chonksxyz/rigkit-threejs)

A rigged, animated voxel Chonk for any three.js project. It has no React, R3F or wallet dependencies. The only dependency is `three`.

This is the Chonk from the playground (`example/ThreeDChonk.jsx` and `src/EcctrlAnimationCustom.tsx`), extracted into one plain ES module.

## Files

| File | Contents |
| --- | --- |
| `index.js` | `ChonkRig`, `ChonkAnimator` and indexer helpers |
| `index.d.ts` | TypeScript types |
| `bodies.js` | The 5 base bodies (no traits), for use without a network request |
| `demo.html` | A playable demo |

## Run the demo

```bash
cd rigkit-threejs
python3 -m http.server 8765
# open http://localhost:8765/demo.html
# or http://localhost:8765/demo.html?id=27543 to load a Chonk
```

Controls: WASD to walk, Shift to run, Space to jump, Q to wave, E to bow.

## Use it

```bash
npm install rigkit-threejs three
```

You can also copy the `rigkit-threejs` folder into your project, or run `npm install ./path/to/rigkit-threejs`.

```js
import * as THREE from "three";
import { ChonkRig, ChonkAnimator, fetchChonk } from "rigkit-threejs";

// 1. Load a Chonk with its traits from indexer.chonks.xyz
const { zMap, accessory } = await fetchChonk(27543);

// 2. Build the rig and add it to your scene
const chonk = new ChonkRig({ zMap, accessory });
scene.add(chonk.object);

// 3. Animate it
const animator = new ChonkAnimator(chonk);
animator.play("walk"); // "idle" | "walk" | "run" | "jump" | "wave" | "bow"

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  animator.update(timer.getDelta());
  renderer.render(scene, camera);
});
```

Move and turn `chonk.object` as a whole. The animator only changes the bones inside it.

The animations do not move the Chonk through the world. For example, "jump" tucks the legs and arms, but it does not lift the Chonk off the ground. Your physics or game code must move `chonk.object` up and down, and play "jump" while the Chonk is in the air. The demo shows a simple version with gravity.

To load a bare body without a network request:

```js
import { BASE_BODIES } from "rigkit-threejs/bodies";
const chonk = new ChonkRig({ zMap: BASE_BODIES[0].zMap });
```

To change the Chonk later, call `chonk.setZMap(zMap, { accessory })`. To free GPU memory, call `chonk.dispose()`.

### React Three Fiber

```jsx
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { ChonkRig, ChonkAnimator, fetchChonk } from "rigkit-threejs";

function Chonk({ tokenId, animation = "idle" }) {
  const rig = useMemo(() => new ChonkRig(), []);
  const animator = useMemo(() => new ChonkAnimator(rig), [rig]);

  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => {
    fetchChonk(tokenId).then(({ zMap, accessory }) => rig.setZMap(zMap, { accessory }));
  }, [rig, tokenId]);
  useEffect(() => animator.play(animation), [animator, animation]);
  useFrame((_, delta) => animator.update(delta));

  return <primitive object={rig.object} />;
}
```

## The rig

The Chonk faces +Z and stands on y = 0. With the default `voxelSize` of 0.075 it is about 1.8 units tall.

```
chonk.object (Group, scaled by voxelSize)
└── torsoBone             root of the rig, use it for bob and lean
    ├── bodyBone          head, torso, hair, hats and accessories
    ├── leftLegBone       pivot at the hip
    │   └── leftFootBone  pivot at the sole
    ├── rightLegBone
    │   └── rightFootBone
    ├── leftArmBone       pivot at the shoulder
    └── rightArmBone
```

"left" and "right" follow the playground naming: left is -X, the viewer's left when you look at the Chonk's face. The bone names are the same as in the playground, so code that finds bones by name still works.

You can pose the bones yourself instead of using `ChonkAnimator`:

```js
chonk.resetPose();
chonk.bones.leftArmBone.rotation.z = -1.2; // raise the left arm
chonk.bones.rightLegBone.rotation.x = 0.5; // step with the right leg
```

Bone positions are in voxel units. `chonk.restPose` has the rest position of each bone. To see the bones, add `new THREE.SkeletonHelper(chonk.object)` to the scene.

## Traits

The indexer zMap has the body and all equipped traits in one voxel list. The rig sorts each voxel into a body part by its position, so traits move with the limb they cover:

- **Shoes** move with the feet. **Pants** move with the legs.
- **Sleeves** move with the arms, including thick hoodie sleeves and wide blouse sleeves.
- **Long hair** that falls over the shoulders stays on the head. It does not move with the arm.
- **Skirts, dresses and robes** join the legs together. When a garment covers the gap between the legs, `chonk.legsJoined` is `true` and the legs stay on the body, so the garment does not tear when the Chonk walks.
- **Held accessories** (for example a balloon, a pet or a sword) stay on the body. The arm that holds the item is locked so the hand does not swing away from it. `chonk.armLocks` shows which arm is locked. The rig locks an arm if an item is beside the hand, or if the accessory name is in `ACCESSORIES_LOCK_RIGHT_ARM` or `ACCESSORIES_LOCK_LEFT_ARM`. If the left arm is locked, "wave" uses the right arm.

You can change the locks yourself after `setZMap`: `chonk.armLocks.right = false`.

These rules were checked against about 170 Chonks from the indexer.

## API

- `new ChonkRig({ zMap?, accessory?, voxelSize?, castShadow?, receiveShadow?, material? })`
  - `material` is used for all voxels. It must set `vertexColors: true`. The default is `MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })`.
  - `.object`, `.bones`, `.parts`, `.skeleton`, `.restPose`, `.legsJoined`, `.armLocks`
  - `.setZMap(zMap, { accessory })`, `.resetPose()`, `.dispose()`
- `new ChonkAnimator(rig, { animation? })`: `.play(name)`, `.update(deltaSeconds)`
- `fetchChonk(tokenId)`: `{ tokenId, zMap, accessory, metadata }` from indexer.chonks.xyz
- `fetchChonkIdsByOwner(address)`: token IDs owned by a wallet
- `loadChonk(tokenId, rigOptions)`: `fetchChonk` and `new ChonkRig` in one call
- `parseZMap(zMap)`, `classifyVoxel(x, y, z, { legsJoined })`, `analyzeVoxels(voxels)`, `buildVoxelGeometry(cells, offset)`: low-level helpers

## Tests

```bash
npm install
npm test
```

The tests use 10 real Chonks from the indexer (in `test/fixtures.json`). They check the trait rules: sleeves, long hair, shoes, pants, skirts, robes and held items. They also check the mesh builder and the animations.

## Rendering

Each body part is one mesh with vertex colours, so a Chonk is 7 draw calls. The mesh keeps only the faces that touch empty space, and it merges touching faces of the same colour into one quad. There are no seams between voxels of the same colour.

If you see shadow stripes on the Chonk, set a small `normalBias` on your light, for example `light.shadow.normalBias = 0.02`.
