const BFS_BUDGET = 655360;

const MAX_POOL = 31;
const WORKER_STACK = 256 * 1024;

var ctx: struct {
  move_table: Board.MoveTable,
  heuristic: Heuristic,
  searcher: ParallelSearch,

  prev_depth: u6,
  last_depth: u32,
  budget: u32,
} = undefined;

// Called once, by the worker that runs `search`.
export fn init() void {
  ctx.move_table.init();
  ctx.heuristic.init();
  ctx.searcher.init(&ctx.move_table, &ctx.heuristic);
  ctx.prev_depth = 0;
  ctx.last_depth = 0;
  ctx.budget = BFS_BUDGET;
}

// Search budget: how many boards the depth-allocating BFS may expand.
// Bounded by the statically reserved buffer, so any value is safe.
export fn setBudget(budget: u32) void {
  ctx.budget = @max(1, @min(budget, BFS_BUDGET));
}

fn allocDepth(valid: *const Board.ValidMoves) u6 {
  const S = struct {
    var bfs_buffer: [BFS_BUDGET]Board = undefined;
  };
  const buffer = S.bfs_buffer[0..ctx.budget];
  var bfs: Bfs = .new(buffer, &ctx.move_table);
  return bfs.expand(valid.moves[0..valid.len]);
}

export fn reset_depth() void {
  ctx.prev_depth = 0;
}

export fn search(board_data: u64) i32 {
  const board: Board = .{ .data = board_data };
  const moves = ctx.move_table.getMoves(board);
  const valid = board.filterMoves(&moves);

  const predicted = ctx.prev_depth;
  const tag = ctx.searcher.request(&valid, predicted);

  // Runs while the pool is already scoring the frontier, so nothing waits on
  // it -- it settles what depth this move should have had, and predicts the
  // next one.
  const depth = allocDepth(&valid);
  ctx.prev_depth = depth;

  const searchResult = ctx.searcher.finalize(tag, depth);

  // The move is scored at the deeper of the predicted and allocated depths;
  // JS reads it back for the stats display.
  ctx.last_depth = @max(depth, predicted);

  if (searchResult) |dir| {
    return @intFromEnum(dir);
  }
  return -1;
}

// Depth the last `search` was scored at. Only meaningful after `search`.
export fn lastDepth() u32 {
  return ctx.last_depth;
}

// Claims a stack and never returns. Nothing here may need a stack frame of its
// own: the prologue that would reserve one runs before the switch below, and
// would take it from the linker's stack, which the searching thread owns.
export fn poolWorker() noreturn {
  const S = struct {
    // Stack per worker in the shared memory
    var stacks: [MAX_POOL][WORKER_STACK]u8 align(16) = undefined;
    var next_slot: u32 = 0;
  };

  const slot = @atomicRmw(u32, &S.next_slot, .Add, 1, .seq_cst);

  // JS must enforce worker limit
  if (slot >= MAX_POOL) unreachable;

  // Stacks grow down, so the pointer starts at the end
  const stack = &S.stacks[slot];
  const stack_ptr = stack[stack.len..].ptr;

  asm volatile (
    \\ local.get %[ptr]
    \\ global.set __stack_pointer
    :
    : [ptr] "r" (stack_ptr),
  );

  ctx.searcher.poolLoop();
}

const engine = @import("engine");
const Board = engine.Board;
const Heuristic = engine.Heuristic;
const Bfs = engine.Bfs;

const ParallelSearch = @import("ParallelSearch.zig");
