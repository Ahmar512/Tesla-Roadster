// All distances are in meters, times in seconds.

export const LANE_WIDTH = 2.6;
export const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
export const ROAD_WIDTH = LANE_WIDTH * 3 + 1.6;

// Speed
export const IDLE_SPEED = 8;
export const START_SPEED = 18;
export const MAX_SPEED = 42;
export const SPEED_RAMP = 0.3; // speed gained per second of play

// Player
export const PLAYER = { width: 1.5, height: 1.1, duckHeight: 0.6, length: 3.6 };
export const LANE_CHANGE_SHARPNESS = 16;
export const JUMP_VELOCITY = 15;
export const GRAVITY = 36;
export const FAST_FALL_VELOCITY = -30;
export const DUCK_TIME = 0.7;
export const BOUNCE_VELOCITY = 9; // landing on top of a vehicle bounces you off it
export const STUMBLE_SLOWDOWN = 0.85; // speed kept after clipping something
export const GRACE_TIME = 1.2; // invulnerable blink after a stumble or power-up ends

// Power-ups
export const FLIGHT_HEIGHT = 6;
export const NITRO_SPEED_FACTOR = 1.6;
export const MAGNET_RANGE = 45;

// Chaser
export const CHASE_TIME = 10; // a second stumble within this window gets you caught

// World
export const SPAWN_DISTANCE = 150; // obstacles appear this far ahead
export const DESPAWN_Z = 12; // and are recycled once this far behind
export const FIRST_CHUNK_Z = -60;
export const CHUNK_GAP_START = 26; // empty road between obstacle patterns
export const CHUNK_GAP_END = 18;
export const CELL_HEIGHT = 0.7;

// Camera
export const CAMERA_HEIGHT = 4.6;
export const CAMERA_DISTANCE = 8.5;

// Visuals
export const SKY_TOP = 0x3f9ef5;
export const SKY_HORIZON = 0xcdeeff;
export const FOG_NEAR = 70;
export const FOG_FAR = 170;
export const CURVE_STRENGTH = 0.0018; // how strongly the world bends away
export const OUTLINE_WIDTH = 0.035;
export const PLAYER_COLOR = 0xe3202e;
