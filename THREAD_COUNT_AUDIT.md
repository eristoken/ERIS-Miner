# Thread Count Implementation Audit

## Issue Found: Thread Count Setting Not Working

### Current Implementation Analysis

**Problem**: The `cpu_thread_count` setting is **NOT actually creating parallel workers**. 

### Current Code Flow

1. **Line 486**: `const threads = this.settings.cpu_thread_count;` - Gets thread count ✓
2. **Line 493-497**: Creates multiple promises by calling `this.mineRandom()` multiple times
3. **Line 500**: `await Promise.race(promises);` - Waits for any to complete

### The Problem

**`mineRandom()` is an async function running in the MAIN JavaScript thread**, not in separate Web Workers. This means:

- ❌ All "threads" run on the same CPU core
- ❌ They're just interleaved async operations, not parallel
- ❌ No actual CPU parallelism is achieved
- ❌ Thread count setting has minimal/no effect on performance

### Evidence

1. **`createWorker()` method exists but is NEVER called**
   - Method defined at line 339
   - Workers array initialized at line 13
   - But `createWorker()` is never invoked

2. **Workers array is only used for cleanup**
   - Line 429: `this.workers.forEach((worker) => worker.terminate());`
   - But workers array is never populated, so this does nothing

3. **Mining happens in main thread**
   - `mineRandom()` is an async function (line 551)
   - It does hashing directly using `ethers.keccak256()` (line 573)
   - All hashing happens in the main JavaScript thread

### JavaScript Threading Reality

JavaScript is single-threaded. To achieve true parallelism:
- ✅ Must use Web Workers (separate threads)
- ✅ Workers run in separate OS threads
- ❌ Multiple async functions ≠ multiple threads

### Current Behavior

When `cpu_thread_count = 4`:
- Creates 4 promises
- All 4 run in the same JavaScript thread
- They take turns (event loop interleaving)
- Still using only 1 CPU core
- No performance improvement

### What Should Happen

When `cpu_thread_count = 4`:
- Create 4 Web Workers
- Each worker runs in a separate OS thread
- Each uses a different CPU core
- True parallel processing
- ~4x performance improvement (theoretical)

### Additional Issues

1. **`createWorker()` has broken keccak256 implementation**
   - Line 346-349: Placeholder hash function that doesn't work
   - Returns `BigInt('0x' + data)` which is not keccak256
   - Would need proper keccak256 library in worker

2. **Worker code uses sequential nonce range**
   - Lines 359-365: Iterates through nonce range sequentially
   - Doesn't match the random nonce generation used in main thread
   - Would need to be updated to use random nonces

## Conclusion

**The thread count setting is currently non-functional.** All mining happens in the main thread regardless of the setting. To fix this, we need to:

1. Actually create and use Web Workers
2. Implement proper keccak256 in workers (or use a library)
3. Send mining work to workers
4. Use random nonce generation in workers (matching main thread)
5. Collect results from workers

