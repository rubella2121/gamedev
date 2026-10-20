import * as THREE from 'three';

/** Where the Mash stands and where its parts hang. Model space is the root's own (before the scale). */

/** the Mash is drawn bigger than its build: it should fill the game camera's view of the far end of the arena */
export const MASH_S = 1.5;
/** the bell's front just touches the rim of the platform (the rim is 17.4 from the middle of the floor) */
export const MASH_Z = -26.2;
export const MASH_Y = 0;

export const BLOOM_POS = new THREE.Vector3(0, 5.0, 3.3);
export const BLOOM_TILT = -0.2;
/** the flower is a little wider than it is tall (the camera's band is short and wide) */
export const BLOOM_SQUASH = 0.87;
export const EYE_POS = new THREE.Vector3(0, 2.1, 5.5);
export const SHELL_DOCK = new THREE.Vector3(-5.5, 3.4, 1.6);
export const TAIL_BASE = new THREE.Vector3(2.6, 2.4, -3.0);
