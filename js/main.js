import {GameManager} from "../vendor/2048.min.js"
import {t} from "./i18n.js"
import {initBoardEditor} from "./board-editor.js"

// Mirrors MEMORY_BYTES in build.zig. The module imports its memory so every
// worker can instantiate over the same one; a mismatch is a LinkError here.
const MEMORY_PAGES = 2048

const RELOAD_KEY = '2048-ai:coi-reload'
const MAX_ISOLATION_RELOADS = 2

async function ensureIsolated() {
  if (window.crossOriginIsolated) {
    sessionStorage.removeItem(RELOAD_KEY)
    return true
  }

  if (!navigator.serviceWorker) return false

  // Bounded retries: a single failed attempt (e.g. a hard refresh bypassed
  // the service worker at the wrong moment) must not brick the tab forever.
  const attempts = parseInt(sessionStorage.getItem(RELOAD_KEY) ?? '0', 10)
  if (attempts >= MAX_ISOLATION_RELOADS) return false

  try {
    await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url))
    await navigator.serviceWorker.ready
  } catch {
    return false
  }

  sessionStorage.setItem(RELOAD_KEY, String(attempts + 1))
  location.reload()

  // The reload is async, so keep the caller from starting anything.
  await new Promise(() => {})
}

function createWorker(worker_url, config) {
  const worker = new Worker(worker_url, { type: 'module' })
  worker.postMessage(config)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('worker failed to start in time')), 60000)
    worker.addEventListener('message', e => {
      const msg = e.data
      if (msg != 'ready') reject(new Error(`Expected 'ready', got '${msg}'`))
      clearTimeout(timer)
      resolve(worker)
    }, { once: true })
    worker.addEventListener('error', e => {
      clearTimeout(timer)
      reject(new Error(e.message || 'worker failed to start'))
    }, { once: true })
  })
}

window.requestAnimationFrame(async () => {
  // Reloads the page if the worker had to be installed first, so nothing below
  // this line runs twice.
  await ensureIsolated()

  const game = new GameManager(4);
  let aiRunning = false

  if (typeof SharedArrayBuffer == 'undefined') {
    // Isolation could not be established (e.g. the service worker was
    // bypassed). Show actionable guidance instead of a dead page.
    const warning = document.getElementById('ai-warning')
    if (warning) warning.hidden = false
    return
  }

  const requested = new URLSearchParams(location.search).get('threads')
    ?? localStorage.getItem('2048-ai:threads')
  const threads = Math.min(Math.max(
    (requested == null ? navigator.hardwareConcurrency : Number(requested)) | 0, 1), 32)

  const memory = new WebAssembly.Memory({
    initial: MEMORY_PAGES,
    maximum: MEMORY_PAGES,
    shared: true,
  })

  // Shared slot where the engine publishes stats (search depth). Using a
  // separate buffer instead of the worker message keeps the protocol
  // backward/forward compatible across cached JS versions.
  const stats = new Int32Array(new SharedArrayBuffer(16))

  // Compiled once and instantiated per worker, so N workers don't each
  // recompile the module on startup. The `?v=` prefix is part of the
  // engine/JS contract (memory size, exports): bump it on every change so
  // cached older pairs can never mix.
  const module = await WebAssembly.compileStreaming(
    fetch(new URL('../zig-out/main.wasm?v=3', import.meta.url)),
  )

  // The pool parks before it touches anything the searcher builds, but every
  // worker is still handshaken before the first search goes out.
  let worker
  try {
    await Promise.all(Array.from(
      { length: threads - 1 },
      () => createWorker('./js/pool-worker.js', { module, memory }),
    ))
    worker = await createWorker('./js/worker.js?v=3', { module, memory, stats })
  } catch (err) {
    // Engine failed to start (e.g. a mixed-version wasm from the cache).
    // Offer guidance instead of hanging silently.
    console.error(err)
    const warning = document.getElementById('ai-warning')
    if (warning) warning.hidden = false
    return
  }
  console.log(`Compute threads: ${threads}`)

  /** @type{Map<number, bigint>} */
  const log2Lut = new Map()
  for (let i = 1; i < 16; ++i) {
    log2Lut.set(1 << i, BigInt(i))
  }

  function currentState() {
    let result = 0n

    const { cells } = game.grid

    for (let i = 0; i < 4; ++i) {
      for (let j = 0; j < 4; ++j) {
        const tile = cells[j][i]
        result <<= 4n
        if (tile) result |= log2Lut.get(tile.value) ?? 15n
      }
    }
    return result;
  }

  const toggleButton = document.querySelector('#ai-toggle');
  const depthEl = document.querySelector('#ai-depth');
  const speedEl = document.querySelector('#ai-speed');
  const budgetSelect = /** @type{HTMLSelectElement} */(document.querySelector('#ai-budget'));
  const threadsSelect = /** @type{HTMLSelectElement} */(document.querySelector('#ai-threads'));

  // Search budget: read per move, remembered across visits.
  const storedBudget = localStorage.getItem('2048-ai:budget');
  if (storedBudget && [...budgetSelect.options].some(o => o.value === storedBudget)) {
    budgetSelect.value = storedBudget;
  }
  budgetSelect.addEventListener('change', () => {
    localStorage.setItem('2048-ai:budget', budgetSelect.value);
  });

  // Threads: switching requires rebuilding the worker pool, so persist the
  // choice and reload with it in the URL (the game state survives reloads).
  for (let i = 1; i <= threads; ++i) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = String(i);
    threadsSelect.append(option);
  }
  threadsSelect.value = String(threads);
  threadsSelect.addEventListener('change', () => {
    localStorage.setItem('2048-ai:threads', threadsSelect.value);
    const params = new URLSearchParams(location.search);
    params.set('threads', threadsSelect.value);
    location.search = params.toString();
  });

  // Keep the dynamic button label in the current UI language.
  window.addEventListener('i18nchange', () => {
    toggleButton.textContent = aiRunning ? t('stopAI') : t('startAI');
  });

  // Manual board editing: use the game's own Tile class (via a live tile),
  // so edited tiles behave exactly like regular ones.
  const liveTile = [].concat(...game.grid.cells).find(cell => cell)
  initBoardEditor(game, liveTile.constructor, {
    stopAI: () => { if (aiRunning) toggleAI(false) },
  });

  /**
   * @param {boolean} restart 
   */
  function step(restart) {
    const board = currentState()
    worker.postMessage({ board, restart, budget: Number(budgetSelect.value) })
  }

  let randomDir = 0
  let totalMove, startTime

  // Live speed: exponential moving average of the per-move intervals (1 s time
  // constant). The cumulative average since the run started goes stale after a
  // while; this tracks the current throughput, including slowdowns.
  const SPEED_TAU_MS = 1000
  let lastMoveTime = 0
  let moveSpeed = 0

  function noteMoveTime(now) {
    const dt = now - lastMoveTime
    lastMoveTime = now
    if (dt <= 0) return moveSpeed
    const instant = 1000 / dt
    const alpha = 1 - Math.exp(-dt / SPEED_TAU_MS)
    moveSpeed = moveSpeed === 0 ? instant : moveSpeed + (instant - moveSpeed) * alpha
    return moveSpeed
  }

  worker.addEventListener('message', ({ data: dir }) => {
    const depth = Atomics.load(stats, 0)
    depthEl.textContent = depth > 0 ? depth : '–'
    randomDir = (randomDir + 1) % 4
    const finalDir = (dir == -1) ? randomDir : dir
    game.move(finalDir)
    totalMove += 1
    speedEl.textContent = noteMoveTime(performance.now()).toFixed(1)

    if (game.over) toggleAI(false)
    if (game.won) {
      game.keepPlaying = true
      game.actuator.clearMessage()
    }
    if (aiRunning) step(false)
  })

  function toggleAI(running) {
    if (running) {
      totalMove = 0
      startTime = Date.now()
      lastMoveTime = performance.now()
      moveSpeed = 0
      toggleButton.textContent = t('stopAI')
      Atomics.store(stats, 0, 0)
      depthEl.textContent = '–'
      speedEl.textContent = '–'
      step(true)
    } else {
      const endTime = Date.now()
      console.log(`Time elapsed: ${(endTime - startTime) / 1000} seconds
Moves taken: ${totalMove} moves
Average speed: ${totalMove * 1000 / (endTime - startTime)} moves/s
Last live speed: ${moveSpeed.toFixed(1)} moves/s`)
      toggleButton.textContent = t('startAI')
      // Keep the last live reading; the event loop stops here anyway.
      speedEl.textContent = moveSpeed > 0 ? moveSpeed.toFixed(1) : '–'
    }
    aiRunning = running
  }

  document.querySelector("#ai-step").addEventListener('click', () => step(true))
  toggleButton.addEventListener('click', () => toggleAI(!aiRunning))
})
