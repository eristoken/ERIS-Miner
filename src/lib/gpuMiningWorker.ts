// WebGPU Mining Worker - GPU-accelerated mining using WebGPU compute shaders
import { keccak256, getBytes, hexlify } from 'ethers';

// Keccak256 hash function (same as CPU worker) - kept for fallback/verification
function hash(challenge: string, address: string, nonce: bigint): bigint {
  const addressHex = address.startsWith('0x') ? address.substring(2) : address;
  const nonceHex = nonce.toString(16).padStart(64, '0');
  const concatenated = challenge + addressHex + nonceHex;
  const hashHex = keccak256(concatenated);
  return BigInt(hashHex);
}

// Generate compute shader code with dynamic workgroup size
// This shader implements full Keccak256 hashing on GPU to bypass CPU bottleneck
// Input format: challenge (64 hex chars) + address (40 hex chars) + nonce (64 hex chars) = 168 hex chars
function generateComputeShaderCode(workgroupSize: number, challengeHex: string, addressHex: string): string {
  // Convert hex strings to u32 arrays (each u32 contains 4 hex chars as bytes)
  function hexToU32Array(hex: string, targetLength: number): number[] {
    const result: number[] = [];
    const padded = hex.padEnd(targetLength, '0');
    // Calculate exact number of u32s needed (each u32 = 4 hex chars)
    const numU32s = Math.ceil(targetLength / 4);
    for (let i = 0; i < numU32s; i++) {
      let u32Value = 0;
      const startIdx = i * 4;
      for (let j = 0; j < 4 && startIdx + j < padded.length; j++) {
        u32Value |= (padded.charCodeAt(startIdx + j) << (j * 8));
      }
      result.push(u32Value);
    }
    return result;
  }
  
  const challengeU32s = hexToU32Array(challengeHex, 64);
  const addressU32s = hexToU32Array(addressHex, 40);
  
  // Ensure exactly 16 u32s each (challenge = 64 hex chars = 16 u32s, address = 40 hex chars = 10 u32s, pad to 16)
  // Trim to 16 if somehow we got more
  while (challengeU32s.length > 16) challengeU32s.pop();
  while (challengeU32s.length < 16) challengeU32s.push(0);
  while (addressU32s.length > 16) addressU32s.pop();
  while (addressU32s.length < 16) addressU32s.push(0);
  
  const challengeArray = challengeU32s.map(v => `${v}u`).join(', ');
  const addressArray = addressU32s.map(v => `${v}u`).join(', ');
  
  return `
// Helper: Convert a nibble (0-15) to hex char ASCII
fn nibbleToHex(nibble: u32) -> u32 {
  if (nibble < 10u) {
    return 0x30u + nibble; // '0'-'9'
  } else {
    return 0x61u + nibble - 10u; // 'a'-'f'
  }
}

// Convert u32 to 8 hex chars (as bytes in u32s)
fn u32ToHexBytes(value: u32) -> array<u32, 2> {
  var result: array<u32, 2>;
  // Each u32 stores 4 bytes (4 hex chars)
  var byte0 = nibbleToHex((value >> 28u) & 0xFu);
  var byte1 = nibbleToHex((value >> 24u) & 0xFu);
  var byte2 = nibbleToHex((value >> 20u) & 0xFu);
  var byte3 = nibbleToHex((value >> 16u) & 0xFu);
  result[0] = byte0 | (byte1 << 8u) | (byte2 << 16u) | (byte3 << 24u);
  
  byte0 = nibbleToHex((value >> 12u) & 0xFu);
  byte1 = nibbleToHex((value >> 8u) & 0xFu);
  byte2 = nibbleToHex((value >> 4u) & 0xFu);
  byte3 = nibbleToHex(value & 0xFu);
  result[1] = byte0 | (byte1 << 8u) | (byte2 << 16u) | (byte3 << 24u);
  
  return result;
}

// Convert 64-bit nonce (vec2<u32>) to 64 hex chars (16 u32s, each with 4 hex chars)
fn nonceToHexBytes(nonce: vec2<u32>) -> array<u32, 16> {
  var result: array<u32, 16>;
  let highHex = u32ToHexBytes(nonce.y);
  let lowHex = u32ToHexBytes(nonce.x);
  
  // Pad with leading zeros first (48 hex chars = 12 u32s)
  // The nonce hex chars (16 hex chars = 4 u32s) go at the end
  for (var i: u32 = 0u; i < 12u; i++) {
    result[i] = 0x30303030u; // '0000' in ASCII
  }
  
  // Store the 16 hex chars from the 64-bit nonce in last 4 u32s
  result[12] = highHex[0]; // First 4 hex chars of high 32 bits
  result[13] = highHex[1]; // Next 4 hex chars of high 32 bits
  result[14] = lowHex[0];  // First 4 hex chars of low 32 bits
  result[15] = lowHex[1];  // Next 4 hex chars of low 32 bits
  
  return result;
}

// Convert hex char ASCII to nibble
fn hexCharToNibble(c: u32) -> u32 {
  if (c >= 0x30u && c <= 0x39u) {
    return c - 0x30u; // '0'-'9'
  } else if (c >= 0x61u && c <= 0x66u) {
    return c - 0x61u + 10u; // 'a'-'f'
  } else if (c >= 0x41u && c <= 0x46u) {
    return c - 0x41u + 10u; // 'A'-'F'
  }
  return 0u;
}

// Convert hex string bytes to binary
// Input: array of u32s, each containing 4 hex chars as bytes (168 hex chars total = 84 bytes)
// Output: binary bytes stored as u32 array (21 u32s = 84 bytes, each u32 stores 4 bytes)
fn hexBytesToBinary(hexBytes: ptr<function, array<u32, 42>>) -> array<u32, 21> {
  var binary: array<u32, 21>;
  // Initialize to zero
  for (var i: u32 = 0u; i < 21u; i++) {
    binary[i] = 0u;
  }
  
  // Process directly: each u32 contains 4 hex chars, 2 hex chars = 1 byte
  // So 1 u32 = 2 bytes, 42 u32s = 84 bytes
  // Store as 21 u32s (each u32 = 4 bytes)
  for (var i: u32 = 0u; i < 42u; i++) {
    let u32Val = (*hexBytes)[i];
    
    // Extract 4 hex chars from u32 (as bytes, little-endian)
    // u32Val = [char0, char1, char2, char3] where char0 is LSB
    let char0 = (u32Val >> 0u) & 0xFFu;  // First hex char (LSB)
    let char1 = (u32Val >> 8u) & 0xFFu;  // Second hex char
    let char2 = (u32Val >> 16u) & 0xFFu; // Third hex char
    let char3 = (u32Val >> 24u) & 0xFFu; // Fourth hex char (MSB)
    
    // Convert pairs of hex chars to bytes
    // char0 and char1 form first byte, char2 and char3 form second byte
    let nibble0 = hexCharToNibble(char0);
    let nibble1 = hexCharToNibble(char1);
    let nibble2 = hexCharToNibble(char2);
    let nibble3 = hexCharToNibble(char3);
    
    let byte0 = (nibble0 << 4u) | nibble1;
    let byte1 = (nibble2 << 4u) | nibble3;
    
    // Store 2 bytes sequentially in the binary array
    // Each input u32 gives us 2 bytes, so we need to pack them into u32s (4 bytes each)
    // Byte index in the output: i * 2 gives us the byte index (0, 2, 4, 6, ...)
    let byteIndex = i * 2u; // Global byte index (0, 2, 4, 6, ...)
    let u32Index = byteIndex / 4u; // Which u32 (0, 0, 1, 1, 2, 2, ...)
    let byteOffsetInU32 = byteIndex % 4u; // Offset within the u32 (0, 2, 0, 2, ...)
    
    if (u32Index < 21u) {
      // Store byte0 and byte1 at consecutive positions (little-endian within u32)
      // byte0 goes at byteOffsetInU32, byte1 goes at byteOffsetInU32 + 1
      binary[u32Index] = binary[u32Index] | (u32(byte0) << (byteOffsetInU32 * 8u));
      if (byteOffsetInU32 + 1u < 4u) {
        // byte1 fits in the same u32
        binary[u32Index] = binary[u32Index] | (u32(byte1) << ((byteOffsetInU32 + 1u) * 8u));
      } else {
        // byte1 goes to the next u32 (this should never happen since byteOffsetInU32 is always 0 or 2)
        if (u32Index + 1u < 21u) {
          binary[u32Index + 1u] = binary[u32Index + 1u] | (u32(byte1) << 0u);
        }
      }
    }
  }
  
  return binary;
}

// Keccak256 round constants
// Returns vec2<u32> where x = low 32 bits, y = high 32 bits
fn getKeccakRC(round: u32) -> vec2<u32> {
  // Round constants as pairs of u32s (low, high)
  let rcLow = array<u32, 24>(
    0x00000001u, 0x00008082u, 0x0000808au, 0x80008000u,
    0x0000808bu, 0x80000001u, 0x80008081u, 0x00008009u,
    0x0000008au, 0x00000088u, 0x80008009u, 0x8000000au,
    0x8000808bu, 0x0000008bu, 0x00008089u, 0x00008003u,
    0x00008002u, 0x00000080u, 0x0000800au, 0x8000000au,
    0x80008081u, 0x00008080u, 0x80000001u, 0x80008008u
  );
  let rcHigh = array<u32, 24>(
    0x00000000u, 0x00000000u, 0x80000000u, 0x80000000u,
    0x00000000u, 0x00000000u, 0x80000000u, 0x80000000u,
    0x00000000u, 0x00000000u, 0x00000000u, 0x00000000u,
    0x00000000u, 0x80000000u, 0x80000000u, 0x80000000u,
    0x80000000u, 0x80000000u, 0x00000000u, 0x80000000u,
    0x80000000u, 0x80000000u, 0x00000000u, 0x80000000u
  );
  // Return as vec2<u32>: x = low, y = high
  return vec2<u32>(rcLow[round], rcHigh[round]);
}

// Rotate left for 64-bit value represented as vec2<u32> (x = low, y = high)
fn rotl64(x: vec2<u32>, n: u32) -> vec2<u32> {
  // Handle n >= 64 by wrapping
  let nMod = n % 64u;
  if (nMod == 0u) {
    return x;
  }
  
  // Split into low and high 32-bit parts
  let low = x.x;
  let high = x.y;
  
  // If rotation is < 32, shift normally
  if (nMod < 32u) {
    let shift = nMod;
    return vec2<u32>(
      (low << shift) | (high >> (32u - shift)),
      (high << shift) | (low >> (32u - shift))
    );
  } else {
    // nMod >= 32, rotate by (nMod - 32) and swap low/high
    let shift = nMod - 32u;
    return vec2<u32>(
      (high << shift) | (low >> (32u - shift)),
      (low << shift) | (high >> (32u - shift))
    );
  }
}

// Keccak-f[1600] permutation
// State is array of vec2<u32> where each vec2 represents a u64 (x = low, y = high)
fn keccakF1600(state: ptr<function, array<vec2<u32>, 25>>) {
  for (var round: u32 = 0u; round < 24u; round++) {
    // Theta
    var c: array<vec2<u32>, 5>;
    for (var x: u32 = 0u; x < 5u; x++) {
      c[x] = (*state)[x] ^ (*state)[x + 5u] ^ (*state)[x + 10u] ^ (*state)[x + 15u] ^ (*state)[x + 20u];
    }
    var d: array<vec2<u32>, 5>;
    for (var x: u32 = 0u; x < 5u; x++) {
      d[x] = c[(x + 4u) % 5u] ^ rotl64(c[(x + 1u) % 5u], 1u);
    }
    for (var x: u32 = 0u; x < 5u; x++) {
      for (var y: u32 = 0u; y < 5u; y++) {
        (*state)[x + 5u * y] = (*state)[x + 5u * y] ^ d[x];
      }
    }
    
    // Rho and Pi
    var temp = (*state)[1];
    (*state)[1] = rotl64((*state)[6], 44u);
    (*state)[6] = rotl64((*state)[9], 20u);
    (*state)[9] = rotl64((*state)[22], 61u);
    (*state)[22] = rotl64((*state)[14], 39u);
    (*state)[14] = rotl64((*state)[20], 18u);
    (*state)[20] = rotl64((*state)[2], 62u);
    (*state)[2] = rotl64((*state)[12], 43u);
    (*state)[12] = rotl64((*state)[13], 25u);
    (*state)[13] = rotl64((*state)[19], 8u);
    (*state)[19] = rotl64((*state)[23], 56u);
    (*state)[23] = rotl64((*state)[15], 41u);
    (*state)[15] = rotl64((*state)[4], 27u);
    (*state)[4] = rotl64((*state)[24], 14u);
    (*state)[24] = rotl64((*state)[21], 2u);
    (*state)[21] = rotl64((*state)[8], 55u);
    (*state)[8] = rotl64((*state)[16], 45u);
    (*state)[16] = rotl64((*state)[5], 36u);
    (*state)[5] = rotl64((*state)[3], 28u);
    (*state)[3] = rotl64((*state)[18], 21u);
    (*state)[18] = rotl64((*state)[17], 15u);
    (*state)[17] = rotl64((*state)[11], 10u);
    (*state)[11] = rotl64((*state)[7], 6u);
    (*state)[7] = rotl64((*state)[10], 3u);
    (*state)[10] = rotl64(temp, 1u);
    
    // Chi
    var b: array<vec2<u32>, 25>;
    for (var y: u32 = 0u; y < 5u; y++) {
      for (var x: u32 = 0u; x < 5u; x++) {
        b[x + 5u * y] = (*state)[x + 5u * y];
      }
    }
    for (var y: u32 = 0u; y < 5u; y++) {
      for (var x: u32 = 0u; x < 5u; x++) {
        (*state)[x + 5u * y] = b[x + 5u * y] ^ ((~b[(x + 1u) % 5u + 5u * y]) & b[(x + 2u) % 5u + 5u * y]);
      }
    }
    
    // Iota - XOR with round constant
    let rc = getKeccakRC(round);
    (*state)[0] = vec2<u32>((*state)[0].x ^ rc.x, (*state)[0].y ^ rc.y);
  }
}

// Byte-swap a u32 (reverse byte order within the u32)
fn byteSwapU32(val: u32) -> u32 {
  let b0 = (val >> 0u) & 0xFFu;
  let b1 = (val >> 8u) & 0xFFu;
  let b2 = (val >> 16u) & 0xFFu;
  let b3 = (val >> 24u) & 0xFFu;
  return (b0 << 24u) | (b1 << 16u) | (b2 << 8u) | b3;
}

// Keccak256 hash function
// Input: 84 bytes stored as u32 array (21 u32s = 84 bytes, each u32 stores 4 bytes)
// Returns array<vec2<u32>, 4> where each vec2<u32> represents a u64 for big-endian comparison
// The output is byte-swapped so that comparing the u32s directly gives correct big-endian ordering
fn keccak256Hash(inputBytes: array<u32, 21>) -> array<vec2<u32>, 4> {
  // Initialize state
  var state: array<vec2<u32>, 25>;
  for (var i: u32 = 0u; i < 25u; i++) {
    state[i] = vec2<u32>(0u, 0u);
  }
  
  // Absorb: pad input to 136 bytes (rate = 1088 bits)
  // 136 bytes = 34 u32s (each u32 = 4 bytes)
  // In little-endian: u32[0] = bytes 0-3, u32[21] = bytes 84-87, u32[33] = bytes 132-135
  var padded: array<u32, 34>;
  for (var i: u32 = 0u; i < 34u; i++) {
    if (i < 21u) {
      padded[i] = inputBytes[i];
    } else if (i == 21u) {
      // Byte 84 (0x01) is the LSB of u32[21] in little-endian
      padded[i] = 0x01u;
    } else if (i == 33u) {
      // Byte 135 (0x80) is the MSB of u32[33] in little-endian
      padded[i] = 0x80000000u;
    } else {
      padded[i] = 0u;
    }
  }
  
  // XOR into state (136 bytes = 17 u64s = 17 vec2<u32>)
  // In little-endian, u64 is constructed from two u32s: low u32 = low 32 bits, high u32 = high 32 bits
  for (var i: u32 = 0u; i < 17u; i++) {
    // Extract 8 bytes (2 u32s) to form 1 u64 (as vec2<u32>)
    let u32Low = padded[i * 2u];
    var u32High: u32 = 0u;
    if (i * 2u + 1u < 34u) {
      u32High = padded[i * 2u + 1u];
    }
    // Combine: low u32 provides low 32 bits (x), high u32 provides high 32 bits (y)
    let word = vec2<u32>(u32Low, u32High);
    state[i] = vec2<u32>(state[i].x ^ word.x, state[i].y ^ word.y);
  }
  
  // Apply permutation
  keccakF1600(&state);
  
  // Squeeze: extract first 256 bits (32 bytes = 4 u64s = 4 vec2<u32>)
  // Keccak state stores data in little-endian format:
  //   state[0].x = bytes 0-3 as little-endian u32 = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0
  //   state[0].y = bytes 4-7 as little-endian u32
  // 
  // For comparison with target (which is a big-endian 256-bit integer):
  //   We need to compare bytes in order: b0, b1, b2, ... (first byte = most significant)
  //   Byte-swapping each u32 converts to big-endian: (b0 << 24) | (b1 << 16) | (b2 << 8) | b3
  //   Then comparing u32s in order gives correct big-endian comparison
  var result: array<vec2<u32>, 4>;
  // Byte-swap each u32 for big-endian comparison, keep word order (state[0] = most significant)
  // x contains the byte-swapped lower bytes (bytes 0-3), y contains byte-swapped higher bytes (bytes 4-7)
  // For big-endian comparison: we want bytes 0-3 to be MORE significant than bytes 4-7
  // So we put byte-swapped state[i].x in result[i].x (will be compared first within the u64)
  result[0] = vec2<u32>(byteSwapU32(state[0].x), byteSwapU32(state[0].y));
  result[1] = vec2<u32>(byteSwapU32(state[1].x), byteSwapU32(state[1].y));
  result[2] = vec2<u32>(byteSwapU32(state[2].x), byteSwapU32(state[2].y));
  result[3] = vec2<u32>(byteSwapU32(state[3].x), byteSwapU32(state[3].y));
  return result;
}

@group(0) @binding(0) var<storage, read_write> nonces: array<vec2<u32>>;
@group(0) @binding(1) var<storage, read_write> results: array<u32>;
@group(0) @binding(2) var<storage, read_write> hashOutputs: array<array<vec2<u32>, 4>>; // Store hash results for debugging (only first 4)
@group(0) @binding(3) var<uniform> params: Params;

struct Params {
  baseNonceLow: u32,
  baseNonceHigh: u32,
  workgroupSize: u32,
  _padding: u32,
  // Full 256-bit target as 8 u32s (big-endian order: target0 = most significant)
  target0: u32, // bits 224-255 (bytes 0-3)
  target1: u32, // bits 192-223 (bytes 4-7)
  target2: u32, // bits 160-191 (bytes 8-11)
  target3: u32, // bits 128-159 (bytes 12-15)
  target4: u32, // bits 96-127 (bytes 16-19)
  target5: u32, // bits 64-95 (bytes 20-23)
  target6: u32, // bits 32-63 (bytes 24-27)
  target7: u32, // bits 0-31 (bytes 28-31)
};

const CHALLENGE_HEX: array<u32, 16> = array<u32, 16>(${challengeArray});
const ADDRESS_HEX: array<u32, 16> = array<u32, 16>(${addressArray});

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let index = global_id.x;
  if (index >= params.workgroupSize) {
    return;
  }
  
  // Generate nonce: baseNonce + index (64-bit addition)
  let indexU32 = u32(index);
  let nonceLow = params.baseNonceLow + indexU32;
  let nonceHigh = params.baseNonceHigh + select(0u, 1u, nonceLow < params.baseNonceLow);
  let nonce = vec2<u32>(nonceLow, nonceHigh);
  
  // Convert nonce to hex bytes (64 hex chars = 16 u32s)
  let nonceHex = nonceToHexBytes(nonce);
  
  // Build input: challenge (64 hex) + address (40 hex) + nonce (64 hex) = 168 hex chars = 42 u32s
  var inputHex: array<u32, 42>;
  // Copy challenge (16 u32s)
  for (var i: u32 = 0u; i < 16u; i++) {
    inputHex[i] = CHALLENGE_HEX[i];
  }
  // Copy address (10 u32s)
  for (var i: u32 = 0u; i < 10u; i++) {
    inputHex[16u + i] = ADDRESS_HEX[i];
  }
  // Copy nonce (16 u32s)
  for (var i: u32 = 0u; i < 16u; i++) {
    inputHex[26u + i] = nonceHex[i];
  }
  
  // Convert hex string to binary
  let inputBinary = hexBytesToBinary(&inputHex);
  
  // Hash
  let hashResult = keccak256Hash(inputBinary);
  
  // Compare with targetValue (targetValue is 256 bits = 4 u64s = 4 vec2<u32>)
  // hashResult is byte-swapped for big-endian comparison:
  //   hashResult[i].x = bytes 4i to 4i+3 (byte-swapped: (b0<<24)|(b1<<16)|(b2<<8)|b3)
  //   hashResult[i].y = bytes 4i+4 to 4i+7 (byte-swapped)
  // hashResult[0] = most significant bytes, hashResult[3] = least significant bytes
  // Within each vec2, .x contains bytes 0-3 and .y contains bytes 4-7
  // For big-endian comparison: compare .x before .y (bytes 0-3 are more significant)
  //
  // Target is passed from JS as 8 u32s in big-endian format:
  //   target0 = bits 224-255 (most significant u32)
  //   target1 = bits 192-223
  //   ... etc ...
  //   target7 = bits 0-31 (least significant u32)
  var targetValue: array<vec2<u32>, 4>;
  targetValue[0] = vec2<u32>(params.target0, params.target1); // bytes 0-7
  targetValue[1] = vec2<u32>(params.target2, params.target3); // bytes 8-15
  targetValue[2] = vec2<u32>(params.target4, params.target5); // bytes 16-23
  targetValue[3] = vec2<u32>(params.target6, params.target7); // bytes 24-31
  
  // Check if hash <= targetValue (compare as 256-bit integers, big-endian)
  // Compare vec2s from [0] to [3] (most significant to least significant)
  // Within each vec2, compare .x before .y (bytes 0-3 before bytes 4-7)
  var isSolution = false;
  
  // Compare [0] (most significant 64 bits = bytes 0-7)
  if (hashResult[0].x < targetValue[0].x) {
    isSolution = true;
  } else if (hashResult[0].x == targetValue[0].x) {
    if (hashResult[0].y < targetValue[0].y) {
      isSolution = true;
    } else if (hashResult[0].y == targetValue[0].y) {
      // Compare [1] (bytes 8-15)
      if (hashResult[1].x < targetValue[1].x) {
        isSolution = true;
      } else if (hashResult[1].x == targetValue[1].x) {
        if (hashResult[1].y < targetValue[1].y) {
          isSolution = true;
        } else if (hashResult[1].y == targetValue[1].y) {
          // Compare [2] (bytes 16-23)
          if (hashResult[2].x < targetValue[2].x) {
            isSolution = true;
          } else if (hashResult[2].x == targetValue[2].x) {
            if (hashResult[2].y < targetValue[2].y) {
              isSolution = true;
            } else if (hashResult[2].y == targetValue[2].y) {
              // Compare [3] (least significant 64 bits = bytes 24-31)
              if (hashResult[3].x < targetValue[3].x) {
                isSolution = true;
              } else if (hashResult[3].x == targetValue[3].x) {
                if (hashResult[3].y <= targetValue[3].y) {
                  isSolution = true;
                }
              }
            }
          }
        }
      }
    }
  }
  
  nonces[index] = nonce;
  results[index] = select(0u, 1u, isSolution);
  // Store hash result for debugging (only for first few indices to save memory)
  if (index < 4u) {
    hashOutputs[index][0] = hashResult[0];
    hashOutputs[index][1] = hashResult[1];
    hashOutputs[index][2] = hashResult[2];
    hashOutputs[index][3] = hashResult[3];
  }
}
`;
}

let gpuDevice: GPUDevice | null = null;
let gpuQueue: GPUQueue | null = null;
let computePipeline: GPUComputePipeline | null = null;
let shouldStop = false;
let currentChallenge: string = '';
let currentAddress: string = '';
let currentTarget: bigint = BigInt(0);
let workerId: number = 0;
let workgroupSize: number = 256;
let actualWorkgroupSize: number = 256; // Actual workgroup size used in shader
let baseNonce: bigint = BigInt(0);
let miningLoop: Promise<void> | null = null;
let isInitializing: boolean = false; // Flag to prevent concurrent initialization
let totalHashesProcessed: number = 0; // Persistent hash count across challenge changes
let lastReportedHashes: number = 0; // Last reported hash count for progress reporting
let lastDebugLogHashes: number = 0; // Last hash count for debug logging

// Initialize WebGPU
// Note: Pipeline needs to be recreated when challenge/address changes
async function initWebGPU(requestedWorkgroupSize: number, forceRecreate: boolean = false): Promise<boolean> {
  // If already initialized and not forcing recreate, verify pipeline exists
  if (gpuDevice && !forceRecreate) {
    // If pipeline is missing, we need to recreate it
    if (!computePipeline) {
      // Pipeline is missing, force recreation
      forceRecreate = true;
    } else {
      // Everything is initialized and pipeline exists, return success
      return true;
    }
  }
  
  // If forcing recreate, destroy old pipeline
  if (forceRecreate && computePipeline) {
    computePipeline = null;
  }

  try {
    if (!navigator.gpu) {
      self.postMessage({ 
        type: 'error', 
        workerId, 
        message: 'WebGPU not supported in this browser' 
      });
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      self.postMessage({ 
        type: 'error', 
        workerId, 
        message: 'Failed to get WebGPU adapter' 
      });
      return false;
    }

    // Get adapter limits to determine what we can request
    const adapterLimits = adapter.limits;
    const maxWorkgroupSizeX = adapterLimits.maxComputeWorkgroupSizeX || 256;
    const maxInvocations = adapterLimits.maxComputeInvocationsPerWorkgroup || 256;
    
    // Determine the actual workgroup size we'll use
    // We need to respect BOTH limits: maxComputeWorkgroupSizeX AND maxComputeInvocationsPerWorkgroup
    // The workgroup size must not exceed either limit
    const effectiveMaxSize = Math.min(maxWorkgroupSizeX, maxInvocations);
    let clampedSize = Math.min(requestedWorkgroupSize, effectiveMaxSize);
    // Round down to nearest power of 2 if needed
    clampedSize = Math.pow(2, Math.floor(Math.log2(clampedSize)));
    // Ensure minimum of 64
    clampedSize = Math.max(64, clampedSize);
    
    actualWorkgroupSize = clampedSize;
    
    if (actualWorkgroupSize !== requestedWorkgroupSize) {
      self.postMessage({ 
        type: 'info', 
        workerId, 
        message: `Workgroup size adjusted from ${requestedWorkgroupSize} to ${actualWorkgroupSize} (adapter limits: maxWorkgroupSizeX=${maxWorkgroupSizeX}, maxInvocations=${maxInvocations})` 
      });
    }
    
    // Request device with appropriate limits - we MUST explicitly request the limits
    // we need, otherwise WebGPU defaults to lower values (256) even if adapter supports more
    // The error message tells us: "which can be specified in requiredLimits when calling requestDevice()"
    gpuDevice = await adapter.requestDevice({
      requiredFeatures: [],
      requiredLimits: {
        maxComputeWorkgroupStorageSize: Math.min(16384, adapterLimits.maxComputeWorkgroupStorageSize || 16384),
        maxComputeInvocationsPerWorkgroup: actualWorkgroupSize, // Request what we'll actually use
        maxComputeWorkgroupSizeX: actualWorkgroupSize, // Request what we'll actually use (this is critical!)
      },
    });

    gpuQueue = gpuDevice.queue;

    // Generate shader with appropriate workgroup size, challenge, and address
    // Format challenge and address: remove '0x' prefix if present
    const challengeHex = currentChallenge.startsWith('0x') ? currentChallenge.substring(2) : currentChallenge;
    const addressHex = currentAddress.startsWith('0x') ? currentAddress.substring(2) : currentAddress;
    const shaderCode = generateComputeShaderCode(actualWorkgroupSize, challengeHex, addressHex);

    // Create compute shader module with error handling
    // Note: createShaderModule is synchronous and validates syntax immediately
    let shaderModule: GPUShaderModule;
    try {
      shaderModule = gpuDevice.createShaderModule({
        code: shaderCode,
      });
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      self.postMessage({ 
        type: 'error', 
        workerId, 
        message: `Failed to create shader module: ${errorMsg}. Check console for shader code.` 
      });
      // Log shader code for debugging (first 3000 chars and last 500 chars)
      console.error('=== SHADER COMPILATION ERROR ===');
      console.error('Error:', errorMsg);
      console.error('Shader code length:', shaderCode.length);
      console.error('Shader code (first 3000 chars):\n', shaderCode.substring(0, 3000));
      if (shaderCode.length > 3000) {
        console.error('Shader code (last 500 chars):\n', shaderCode.substring(shaderCode.length - 500));
      }
      return false;
    }

    // Use async pipeline creation for better error messages
    try {
      // Use createComputePipelineAsync to get detailed error messages
      computePipeline = await gpuDevice.createComputePipelineAsync({
        layout: 'auto',
        compute: {
          module: shaderModule,
          entryPoint: 'main',
        },
      });
      
      // Validate pipeline by getting bind group layout
      try {
        const testLayout = computePipeline.getBindGroupLayout(0);
        if (!testLayout) {
          throw new Error('Pipeline created but bind group layout is invalid');
        }
      } catch (layoutError: any) {
        self.postMessage({ 
          type: 'error', 
          workerId, 
          message: `Pipeline layout validation failed: ${layoutError.message}` 
        });
        return false;
      }
    } catch (error: any) {
      // Pipeline creation failed - shader likely has errors
      const errorMsg = error.message || String(error);
      // Try to get more detailed error information
      let detailedError = errorMsg;
      if (error instanceof GPUValidationError) {
        detailedError = `Validation Error: ${error.message}`;
      } else if (error instanceof GPUPipelineError) {
        detailedError = `Pipeline Error (${error.reason}): ${error.message}`;
      }
      
      self.postMessage({ 
        type: 'error', 
        workerId, 
        message: `Failed to create compute pipeline: ${detailedError}. The shader may have syntax errors or the workgroup size (${actualWorkgroupSize}) may exceed device limits.` 
      });
      console.error('=== PIPELINE CREATION ERROR ===');
      console.error('Error:', error);
      console.error('Error message:', errorMsg);
      console.error('Error type:', error.constructor?.name);
      if (error instanceof GPUPipelineError) {
        console.error('Pipeline error reason:', error.reason);
      }
      // Log shader code for debugging
      console.error('Shader code length:', shaderCode.length);
      console.error('Shader code (first 2000 chars):\n', shaderCode.substring(0, 2000));
      if (shaderCode.length > 2000) {
        console.error('Shader code (last 1000 chars):\n', shaderCode.substring(shaderCode.length - 1000));
      }
      // Also try to get more detailed error if available
      if (error instanceof Error && error.stack) {
        console.error('Error stack:', error.stack);
      }
      return false;
    }
    
    self.postMessage({ 
      type: 'info', 
      workerId, 
      message: `Using workgroup size: ${actualWorkgroupSize}` 
    });

    self.postMessage({ 
      type: 'info', 
      workerId, 
      message: 'WebGPU initialized successfully' 
    });
    return true;
  } catch (error: any) {
    self.postMessage({ 
      type: 'error', 
      workerId, 
      message: `Failed to initialize WebGPU: ${error.message}` 
    });
    return false;
  }
}

// Process a batch of nonces on GPU
// Returns nonces, results (solutions), hashes processed, and optionally GPU hashes for debugging
async function processBatchGPU(batchSize: number): Promise<{ nonces: bigint[], results: number[], hashesProcessed: number, gpuHashes?: bigint[] }> {
  if (!gpuDevice || !gpuQueue || !computePipeline) {
    throw new Error('WebGPU not initialized');
  }

  // Create buffers
  // vec2<u32> = 2 * 4 bytes = 8 bytes (same as u64)
  const noncesBuffer = gpuDevice.createBuffer({
    size: batchSize * 8, // vec2<u32> = 8 bytes
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  const resultsBuffer = gpuDevice.createBuffer({
    size: batchSize * 4, // u32 = 4 bytes
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  // Hash output buffer for debugging (only first 4 hashes: 4 * 4 * 8 bytes = 128 bytes)
  const hashOutputsBuffer = gpuDevice.createBuffer({
    size: 4 * 4 * 8, // 4 hashes * 4 vec2<u32> * 8 bytes = 128 bytes
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  // Create uniform buffer for parameters
  // Layout: baseNonceLow (4) + baseNonceHigh (4) + workgroupSize (4) + padding (4) + 
  //         target0-7 (8 * 4 = 32 bytes) = 48 bytes total
  // Must be aligned to 16 bytes for uniform buffers
  const paramsBufferSize = 48;
  const paramsBuffer = gpuDevice.createBuffer({
    size: paramsBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Split 64-bit values into two 32-bit parts
  const baseNonceLow = Number(baseNonce & BigInt('0xFFFFFFFF'));
  const baseNonceHigh = Number(baseNonce >> BigInt(32));
  
  // Split full 256-bit target into 8 u32 parts (big-endian order)
  // Target format: bytes 0-31 where byte 0 is most significant
  // target0 = bits 224-255 (most significant), target7 = bits 0-31 (least significant)
  const target0 = Number((currentTarget >> BigInt(224)) & BigInt('0xFFFFFFFF'));
  const target1 = Number((currentTarget >> BigInt(192)) & BigInt('0xFFFFFFFF'));
  const target2 = Number((currentTarget >> BigInt(160)) & BigInt('0xFFFFFFFF'));
  const target3 = Number((currentTarget >> BigInt(128)) & BigInt('0xFFFFFFFF'));
  const target4 = Number((currentTarget >> BigInt(96)) & BigInt('0xFFFFFFFF'));
  const target5 = Number((currentTarget >> BigInt(64)) & BigInt('0xFFFFFFFF'));
  const target6 = Number((currentTarget >> BigInt(32)) & BigInt('0xFFFFFFFF'));
  const target7 = Number(currentTarget & BigInt('0xFFFFFFFF'));

  // Write parameters with proper alignment
  const paramsArray = new ArrayBuffer(paramsBufferSize);
  const paramsView = new DataView(paramsArray);
  paramsView.setUint32(0, baseNonceLow, true); // Offset 0
  paramsView.setUint32(4, baseNonceHigh, true); // Offset 4
  paramsView.setUint32(8, batchSize, true); // Offset 8
  paramsView.setUint32(12, 0, true); // Padding at offset 12
  // Full 256-bit target (8 u32s)
  paramsView.setUint32(16, target0, true); // bits 224-255 (most significant)
  paramsView.setUint32(20, target1, true); // bits 192-223
  paramsView.setUint32(24, target2, true); // bits 160-191
  paramsView.setUint32(28, target3, true); // bits 128-159
  paramsView.setUint32(32, target4, true); // bits 96-127
  paramsView.setUint32(36, target5, true); // bits 64-95
  paramsView.setUint32(40, target6, true); // bits 32-63
  paramsView.setUint32(44, target7, true); // bits 0-31 (least significant)

  gpuQueue.writeBuffer(paramsBuffer, 0, paramsArray);

  // Get bind group layout from pipeline
  const bindGroupLayout = computePipeline.getBindGroupLayout(0);
  
  // Create bind group
  const bindGroup = gpuDevice.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: noncesBuffer } },
      { binding: 1, resource: { buffer: resultsBuffer } },
      { binding: 2, resource: { buffer: hashOutputsBuffer } },
      { binding: 3, resource: { buffer: paramsBuffer } },
    ],
  });

  // Create command encoder
  const encoder = gpuDevice.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(batchSize / actualWorkgroupSize));
  pass.end();

  // Create readback buffers for both nonces and results
  const noncesReadbackBuffer = gpuDevice.createBuffer({
    size: batchSize * 8,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const resultsReadbackBuffer = gpuDevice.createBuffer({
    size: batchSize * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // Hash outputs readback buffer (only first 4)
  const hashOutputsReadbackBuffer = gpuDevice.createBuffer({
    size: 4 * 4 * 8, // 4 hashes * 4 vec2<u32> * 8 bytes
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  encoder.copyBufferToBuffer(noncesBuffer, 0, noncesReadbackBuffer, 0, batchSize * 8);
  encoder.copyBufferToBuffer(resultsBuffer, 0, resultsReadbackBuffer, 0, batchSize * 4);
  encoder.copyBufferToBuffer(hashOutputsBuffer, 0, hashOutputsReadbackBuffer, 0, 4 * 4 * 8);
  gpuQueue.submit([encoder.finish()]);

  // Read back nonces (as vec2<u32> = 2 u32s = 8 bytes)
  await noncesReadbackBuffer.mapAsync(GPUMapMode.READ);
  const noncesMappedRange = noncesReadbackBuffer.getMappedRange();
  const noncesU32Array = new Uint32Array(noncesMappedRange);
  // Convert vec2<u32> pairs back to bigint (64-bit)
  const nonces: bigint[] = [];
  for (let i = 0; i < batchSize; i++) {
    const low = noncesU32Array[i * 2];
    const high = noncesU32Array[i * 2 + 1];
    // Reconstruct 64-bit value: high << 32 | low
    const nonce = (BigInt(high) << BigInt(32)) | BigInt(low);
    nonces.push(nonce);
  }
  noncesReadbackBuffer.unmap();

  // Read back results (u32 = 4 bytes)
  await resultsReadbackBuffer.mapAsync(GPUMapMode.READ);
  const resultsMappedRange = resultsReadbackBuffer.getMappedRange();
  const resultsArray = new Uint32Array(resultsMappedRange);
  const results: number[] = [];
  for (let i = 0; i < batchSize; i++) {
    results.push(resultsArray[i]);
  }
  resultsReadbackBuffer.unmap();

  // Read back hash outputs for debugging (only first 4)
  let gpuHashes: bigint[] | undefined = undefined;
  try {
    await hashOutputsReadbackBuffer.mapAsync(GPUMapMode.READ);
    const hashOutputsMappedRange = hashOutputsReadbackBuffer.getMappedRange();
    const hashOutputsU32Array = new Uint32Array(hashOutputsMappedRange);
    gpuHashes = [];
    for (let i = 0; i < 4; i++) {
      // Each hash is 4 vec2<u32> = 8 u32s = 256 bits
      // GPU shader output format (after byte-swap in shader):
      //   result[j].x = bytes 4j to 4j+3 byte-swapped: (b0<<24)|(b1<<16)|(b2<<8)|b3
      //   result[j].y = bytes 4j+4 to 4j+7 byte-swapped
      // Memory layout: [r0.x, r0.y, r1.x, r1.y, r2.x, r2.y, r3.x, r3.y]
      const baseIdx = i * 8; // 8 u32s per hash (4 vec2<u32>)
      
      // Read the 8 u32 values (each vec2<u32> is stored as x, y in memory)
      const r0x = hashOutputsU32Array[baseIdx + 0] ?? 0;
      const r0y = hashOutputsU32Array[baseIdx + 1] ?? 0;
      const r1x = hashOutputsU32Array[baseIdx + 2] ?? 0;
      const r1y = hashOutputsU32Array[baseIdx + 3] ?? 0;
      const r2x = hashOutputsU32Array[baseIdx + 4] ?? 0;
      const r2y = hashOutputsU32Array[baseIdx + 5] ?? 0;
      const r3x = hashOutputsU32Array[baseIdx + 6] ?? 0;
      const r3y = hashOutputsU32Array[baseIdx + 7] ?? 0;
      
      // Convert each u32 to BigInt safely (>>> 0 ensures unsigned interpretation)
      const toUnsignedBigInt = (val: number): bigint => BigInt(val >>> 0);
      
      // The shader output is already in big-endian u32 format (byte-swapped)
      // Each u32 is (b0<<24)|(b1<<16)|(b2<<8)|b3 which is exactly how BigInt would interpret hex
      // So we can directly combine them as a 256-bit big-endian integer:
      // hash = (r0x << 224) | (r0y << 192) | (r1x << 160) | (r1y << 128) | ...
      const fullHash = 
        (toUnsignedBigInt(r0x) << BigInt(224)) |
        (toUnsignedBigInt(r0y) << BigInt(192)) |
        (toUnsignedBigInt(r1x) << BigInt(160)) |
        (toUnsignedBigInt(r1y) << BigInt(128)) |
        (toUnsignedBigInt(r2x) << BigInt(96)) |
        (toUnsignedBigInt(r2y) << BigInt(64)) |
        (toUnsignedBigInt(r3x) << BigInt(32)) |
        toUnsignedBigInt(r3y);
      gpuHashes.push(fullHash);
    }
    hashOutputsReadbackBuffer.unmap();
  } catch (e) {
    // If hash output reading fails, just continue without it
    if (hashOutputsReadbackBuffer) {
      try {
        hashOutputsReadbackBuffer.unmap();
      } catch {}
    }
  }

  // Update base nonce for next batch
  baseNonce += BigInt(batchSize);

  return { nonces, results, hashesProcessed: batchSize, gpuHashes };
}

self.onmessage = async function(e: MessageEvent) {
  const { challenge, address, target, workerId: id, stop, workgroupSize: wgSize } = e.data;
  
  if (stop) {
    shouldStop = true;
    if (gpuDevice) {
      gpuDevice.destroy();
      gpuDevice = null;
      gpuQueue = null;
      computePipeline = null;
    }
    // Reset hash counts when stopping
    totalHashesProcessed = 0;
    lastReportedHashes = 0;
    lastDebugLogHashes = 0;
    self.postMessage({ type: 'stopped', workerId: id });
    return;
  }
  
  // Check if challenge or address changed - if so, we need to recreate the pipeline
  const challengeChanged = currentChallenge !== challenge;
  const addressChanged = currentAddress !== address;
  
  // Store mining parameters
  currentChallenge = challenge;
  currentAddress = address;
  currentTarget = BigInt(target);
  workerId = id;
  workgroupSize = wgSize || 256;
  shouldStop = false;
  baseNonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  
  // If challenge or address changed, we need to recreate the pipeline
  // Do this BEFORE checking if mining loop is running, so the pipeline is ready
  if (gpuDevice && (challengeChanged || addressChanged)) {
    // Reinitialize with new challenge/address - force recreation of pipeline
    // This will set computePipeline to null temporarily, then recreate it
    const initialized = await initWebGPU(workgroupSize, true);
    if (!initialized) {
      self.postMessage({ 
        type: 'error', 
        workerId, 
        message: 'Failed to recreate GPU pipeline with new challenge/address' 
      });
      // If pipeline recreation failed, stop the mining loop if it's running
      if (miningLoop) {
        shouldStop = true;
        miningLoop = null;
      }
      return;
    }
  }
  
  // If mining loop is already running, just update parameters and return
  // The loop will continue with the new pipeline (it waits for pipeline if needed)
  if (miningLoop) {
    return;
  }
  
  // Initialize WebGPU if not already done (pass the requested workgroup size)
  // This must complete before starting the mining loop
  if (!gpuDevice) {
    // Prevent concurrent initialization attempts
    if (isInitializing) {
      self.postMessage({ 
        type: 'info', 
        workerId, 
        message: 'WebGPU initialization already in progress, waiting...' 
      });
      // Wait for initialization to complete
      while (isInitializing && !gpuDevice) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // If initialization failed, return
      if (!gpuDevice) {
        self.postMessage({ 
          type: 'error', 
          workerId, 
          message: 'WebGPU initialization failed. GPU mining cannot start.' 
        });
        return;
      }
    } else {
      // Start initialization
      isInitializing = true;
      try {
        const initialized = await initWebGPU(workgroupSize);
        if (!initialized) {
          self.postMessage({ 
            type: 'error', 
            workerId, 
            message: 'Failed to initialize WebGPU. GPU mining cannot start.' 
          });
          isInitializing = false;
          return;
        }
      } catch (error: any) {
        self.postMessage({ 
          type: 'error', 
          workerId, 
          message: `WebGPU initialization error: ${error.message}` 
        });
        isInitializing = false;
        return;
      } finally {
        isInitializing = false;
      }
    }
  } else {
    // If already initialized but workgroup size changed, we'd need to recreate
    // For now, just use the existing pipeline (workgroup size is fixed at creation)
    if (workgroupSize !== actualWorkgroupSize) {
      self.postMessage({ 
        type: 'info', 
        workerId, 
        message: `Note: GPU workgroup size is ${actualWorkgroupSize} (set at initialization). Restart mining to change.` 
      });
    }
  }
  
  // Verify WebGPU is still initialized before starting mining loop
  if (!gpuDevice || !gpuQueue || !computePipeline) {
    self.postMessage({ 
      type: 'error', 
      workerId, 
      message: 'WebGPU initialization completed but device/pipeline is missing. Cannot start mining.' 
    });
    return;
  }
  
  // Use persistent hash count - don't reset on challenge changes
  // Only reset if this is a completely new mining session (miningLoop was null)
  if (!miningLoop) {
    // Only reset if we're starting a brand new mining loop
    totalHashesProcessed = 0;
    lastReportedHashes = 0;
    lastDebugLogHashes = 0;
  }
  
  const reportInterval = 10000; // Report hashes every 10k
  const batchSize = actualWorkgroupSize * 4; // Process 4 workgroups at a time (use actual workgroup size)
  
  // Log that GPU mining is starting
  self.postMessage({ 
    type: 'info', 
    workerId, 
    message: `GPU mining loop started with batch size: ${batchSize}, workgroup size: ${actualWorkgroupSize}` 
  });
  
  // Mining loop - runs continuously
  miningLoop = (async function mineLoop() {
    while (!shouldStop) {
      try {
        // Double-check WebGPU is still initialized before each batch
        // If pipeline is missing (e.g., being recreated), wait for it to be available
        if (!gpuDevice || !gpuQueue) {
          self.postMessage({ 
            type: 'error', 
            workerId, 
            message: 'WebGPU device lost during mining. Stopping GPU mining loop.' 
          });
          break;
        }
        
        // If pipeline is missing, it might be getting recreated - wait for it
        if (!computePipeline) {
          // Pipeline is being recreated, wait for it to be available
          let waitCount = 0;
          while (!computePipeline && !shouldStop && waitCount < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
          }
          if (!computePipeline) {
            self.postMessage({ 
              type: 'error', 
              workerId, 
              message: 'Pipeline recreation timed out. Stopping GPU mining loop.' 
            });
            break;
          }
          // Pipeline is now available, continue mining
        }
        
        // Process batch on GPU - this now includes full Keccak256 hashing and solution checking
        const { nonces, results, hashesProcessed: batchHashes, gpuHashes } = await processBatchGPU(batchSize);
        totalHashesProcessed += batchHashes;
        
        // Check GPU results for solutions (results[i] = 1 means solution found)
        let solutionCount = 0;
        // Test: verify GPU hash calculation by comparing GPU hash with CPU hash
        // Only do this for the first batch and then every 10M hashes to reduce noise
        const isFirstBatch = totalHashesProcessed <= batchSize;
        const is10MillionInterval = totalHashesProcessed > 0 && totalHashesProcessed % 10000000 < batchSize;
        if ((isFirstBatch || is10MillionInterval) && nonces.length > 0 && gpuHashes && gpuHashes.length > 0) {
          try {
            const testNonce = nonces[0];
            // Strip 0x prefixes to match GPU shader input
            const challengeHex = currentChallenge.startsWith('0x') ? currentChallenge.substring(2) : currentChallenge;
            const addressHex = currentAddress.startsWith('0x') ? currentAddress.substring(2) : currentAddress;
            const nonceHex = testNonce.toString(16).padStart(64, '0');
            const concatenated = challengeHex + addressHex + nonceHex;
            
            // Convert to bytes for CPU hash (matching what ethers does internally)
            // hexlify needs "0x" prefix, or we can convert hex string to bytes directly
            const inputBytes = getBytes(hexlify('0x' + concatenated));
            const hashHex = keccak256(inputBytes);
            const cpuHash = BigInt(hashHex);
            
            // Log input details for debugging
            const inputHex = Array.from(inputBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const inputFirst16 = inputHex.substring(0, 32);
            const inputLast16 = inputHex.substring(inputHex.length - 32);
            
            const gpuHash = gpuHashes[0];
            if (gpuHash !== undefined) {
              const match = cpuHash === gpuHash;
              // Log for debugging - this will help us see if GPU hash matches CPU
              self.postMessage({ 
                type: 'info', 
                workerId, 
                message: `Hash test: nonce ${testNonce.toString()}, input len: ${concatenated.length} (${inputBytes.length} bytes), input[0-15]: 0x${inputFirst16}..., input[last-15]: ...${inputLast16}, CPU: 0x${cpuHash.toString(16).padStart(64, '0')}, GPU: 0x${gpuHash.toString(16).padStart(64, '0')}, Match: ${match}` 
              });
            }
          } catch (e: any) {
            // Log error for debugging
            self.postMessage({ 
              type: 'error', 
              workerId, 
              message: `Hash test error: ${e.message}` 
            });
          }
        }
        
        for (let i = 0; i < nonces.length; i++) {
          if (shouldStop) break;
          
          if (results[i] === 1) {
            solutionCount++;
            // Solution found by GPU! Report it (verification will happen on CPU side in miner.ts)
            self.postMessage({ 
              type: 'solution', 
              workerId, 
              nonce: nonces[i].toString(), 
              hashesProcessed: totalHashesProcessed,
              challenge: currentChallenge
            });
            // Continue mining - don't return, keep looking for more solutions
          }
        }
        
        // Debug: log periodically to verify GPU is running and processing batches
        // Log every 10M hashes to reduce noise (use separate counter to avoid conflicts)
        const hashesSinceLastDebugLog = totalHashesProcessed - lastDebugLogHashes;
        if (hashesSinceLastDebugLog >= 10000000) {
          self.postMessage({ 
            type: 'info', 
            workerId, 
            message: `GPU: ${(totalHashesProcessed / 1000000).toFixed(1)}M hashes processed` 
          });
          lastDebugLogHashes = totalHashesProcessed;
        }
        
        // Report progress periodically (every 10k hashes or every batch if batch is large)
        // This ensures we report frequently enough to show GPU contribution
        if (totalHashesProcessed - lastReportedHashes >= reportInterval || batchSize >= reportInterval) {
          self.postMessage({ type: 'progress', workerId, hashesProcessed: totalHashesProcessed });
          lastReportedHashes = totalHashesProcessed;
        }
        
        // Yield to event loop periodically to check for messages and allow other work
        // Yield after each batch to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (error: any) {
        self.postMessage({ 
          type: 'error', 
          workerId, 
          message: `GPU mining error: ${error.message}` 
        });
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    miningLoop = null;
  })();
};

