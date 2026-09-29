import type { Bone, BufferGeometry, Group, Material, Quaternion, Skeleton, Vector3 } from "three";

export declare const CHONKS_INDEXER_URL: string;

export declare const CHONK_GRID: {
  MIDDLE_X: number;
  FEET_Y: number;
  LEG_ROWS: [number, number];
  ARM_ROWS: [number, number];
  ARM_Z: [number, number];
  LEFT_LIMB_X: [number, number];
  RIGHT_LIMB_X: [number, number];
};

export type ChonkBoneName =
  | "torsoBone"
  | "bodyBone"
  | "leftLegBone"
  | "rightLegBone"
  | "leftFootBone"
  | "rightFootBone"
  | "leftArmBone"
  | "rightArmBone";

export type ChonkPart = "body" | "leftLeg" | "rightLeg" | "leftFoot" | "rightFoot" | "leftArm" | "rightArm";

export type ChonkAnimation = "idle" | "walk" | "run" | "jump" | "wave" | "bow";

export interface ChonkVoxel {
  x: number;
  y: number;
  z: number;
  /** 0xRRGGBB */
  color: number;
}

export interface ChonkVoxelAnalysis {
  legsJoined: boolean;
  lockLeftArm: boolean;
  lockRightArm: boolean;
}

export declare const BONE_NAMES: ChonkBoneName[];
export declare const ANIMATIONS: ChonkAnimation[];
export declare const ACCESSORIES_LOCK_RIGHT_ARM: string[];
export declare const ACCESSORIES_LOCK_LEFT_ARM: string[];

export declare function parseZMap(zMap: string): ChonkVoxel[];
export declare function analyzeVoxels(voxels: ChonkVoxel[]): ChonkVoxelAnalysis;
export declare function classifyVoxel(x: number, y: number, z: number, options?: { legsJoined?: boolean }): ChonkPart;
/** Merged, vertex-coloured geometry of the outer faces of integer grid cells (y up). */
export declare function buildVoxelGeometry(cells: ChonkVoxel[], offset?: [number, number, number]): BufferGeometry;

export interface ChonkRigOptions {
  /** Hex voxel string (body + traits). Can be set later with setZMap. */
  zMap?: string;
  /** Accessory trait name, used to lock the arm that holds it. */
  accessory?: string | null;
  /** World size of one voxel. Default 0.075 (a Chonk is about 1.8 units tall). */
  voxelSize?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Material for all voxels. It must set `vertexColors: true`. Default: MeshStandardMaterial, roughness 1. */
  material?: Material;
}

export declare class ChonkRig {
  constructor(options?: ChonkRigOptions);
  /** Add this to your scene. */
  readonly object: Group;
  readonly bones: Record<ChonkBoneName, Bone>;
  readonly parts: Record<ChonkPart, Group>;
  readonly skeleton: Skeleton;
  readonly restPose: Record<ChonkBoneName, { position: Vector3; quaternion: Quaternion }>;
  readonly material: Material;
  /** True when a skirt, dress or robe joins the legs. The legs then stay on the body. */
  legsJoined: boolean;
  /** Arms that hold an item and should not swing. */
  armLocks: { left: boolean; right: boolean };
  accessory: string | null;
  setZMap(zMap: string, options?: { accessory?: string | null }): this;
  resetPose(): void;
  clearVoxels(): void;
  dispose(): void;
}

export declare class ChonkAnimator {
  constructor(rig: ChonkRig, options?: { animation?: ChonkAnimation });
  readonly rig: ChonkRig;
  animation: ChonkAnimation;
  time: number;
  play(name: ChonkAnimation): void;
  /** @param delta Seconds since the last frame. */
  update(delta: number): void;
}

export interface FetchedChonk {
  tokenId: number;
  zMap: string;
  accessory: string | null;
  metadata: { name?: string; attributes?: { trait_type: string; value: string }[]; [key: string]: unknown };
}

export declare function decodeTokenURI(tokenURI: string): any;
export declare function fetchChonk(tokenId: number | string, options?: { indexerUrl?: string }): Promise<FetchedChonk>;
export declare function fetchChonkIdsByOwner(address: string, options?: { indexerUrl?: string }): Promise<number[]>;
export declare function loadChonk(
  tokenId: number | string,
  options?: ChonkRigOptions & { indexerUrl?: string }
): Promise<FetchedChonk & { rig: ChonkRig }>;
