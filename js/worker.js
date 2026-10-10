addEventListener('message', async ({ data }) => {
  const { memory, stats } = data
  const module = /** @type{WebAssembly.Module} */(data.module)

  const instance = await WebAssembly.instantiate(module, { env: { memory } })
  const exports = /** @type{any} */(instance.exports)

  // Builds the tables the whole pool shares. Nothing else touches them until
  // main has seen every worker's 'ready'.
  exports.init()

  // search() runs the batch protocol itself: it publishes the frontier, works
  // the queue alongside the pool and blocks until the last task lands.
  addEventListener('message', ({ data: { board, restart } }) => {
    if (restart) {
      exports.reset_depth()
    }
    const dir = exports.search(board)
    // Stats travel over a shared slot, not the message, so that a cached
    // older main.js -- which reads a bare direction -- never breaks.
    if (stats) {
      Atomics.store(stats, 0, exports.lastDepth())
    }
    postMessage(dir)
  })

  postMessage('ready')
}, { once: true })
