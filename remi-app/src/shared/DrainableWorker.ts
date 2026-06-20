/**
 * DrainableWorker - 基于队列的可排空工作器
 *
 * 封装了常见的 `Queue.unbounded` + `Effect.forever` 模式，并增加了一个信号机制，
 * 当队列为空 **且** 当前正在处理的任务完成时，该信号会被 resolve。
 * 这使得测试可以用确定性的 `drain()` 替代对时序敏感的 `Effect.sleep` 调用。
 *
 * @module DrainableWorker
 */
import { Deferred, Effect, Queue, Ref } from "effect";
import type { Scope } from "effect";

/**
 * 可排空工作器接口
 *
 * 提供两个核心能力：
 * 1. 将任务项入队，并跟踪其排空状态
 * 2. 等待所有任务处理完毕后 resolve 的 drain 信号
 *
 * @template A - 工作项的类型
 */
export interface DrainableWorker<A> {
  /**
   * 将一个工作项入队，并同步更新排空追踪状态
   *
   * 该方法封装了 `Queue.offer`，确保排空状态的更新与入队操作原子性地完成，
   * 而不是通过推断队列内部状态来确定。
   *
   * @param item - 要入队的工作项
   * @returns 一个 Effect，入队完成后 resolve
   */
  readonly enqueue: (item: A) => Effect.Effect<void>;

  /**
   * 排空信号 —— 当队列为空且工作器处于空闲状态（没有正在处理的任务）时 resolve
   *
   * 典型用途：在测试中等待所有异步任务处理完毕，替代不确定的延时等待。
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * 创建一个可排空的工作器，从无界队列中取出任务项并逐一处理
 *
 * 工作器会以 fork 的方式运行在当前 Scope 中，当 Scope 关闭时会被自动中断。
 * 同时注册了一个 finalizer，用于在 Scope 结束时关闭队列。
 *
 * 工作原理：
 * 1. 维护一个 `outstanding` 计数器，记录当前尚未完成的任务数量
 * 2. 维护一个 `idle` Deferred 信号，当 outstanding 降为 0 时该信号被 resolve
 * 3. 每次入队时，如果当前处于空闲状态，则创建新的 Deferred 信号并重置计数器
 * 4. 每次任务处理完毕后，递减计数器；当计数器归零时 resolve 当前的 idle 信号
 *
 * @template A - 工作项类型
 * @template E - 处理过程中可能产生的错误类型
 * @template R - 处理过程所需的依赖环境
 * @param process - 对每个队列项执行的处理逻辑
 * @returns 一个包含 `enqueue` 和 `drain` 方法的 DrainableWorker 实例
 */
export const makeDrainableWorker = <A, E, R>(
  process: (item: A) => Effect.Effect<void, E, R>,
): Effect.Effect<DrainableWorker<A>, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    // 创建无界队列，用于存储待处理的工作项
    const queue = yield* Queue.unbounded<A>();
    // 创建初始的空闲信号，并立即 resolve（初始状态为空闲）
    const initialIdle = yield* Deferred.make<void>();
    yield* Deferred.succeed(initialIdle, undefined).pipe(Effect.orDie);
    // 使用 Ref 维护排空状态：outstanding 为未完成的任务数，idle 为当前的空闲信号
    const state = yield* Ref.make({
      outstanding: 0,
      idle: initialIdle,
    });

    // 注册 finalizer：当 Scope 关闭时，确保队列被正确关闭
    yield* Effect.addFinalizer(() => Queue.shutdown(queue).pipe(Effect.asVoid));

    /**
     * 完成一个任务后的状态更新逻辑：
     * - 将 outstanding 计数器减 1
     * - 如果计数器归零，则 resolve 当前的 idle Deferred 信号
     */
    const finishOne = Ref.modify(state, (current) => {
      const remaining = Math.max(0, current.outstanding - 1);
      return [
        remaining === 0 ? current.idle : null,
        {
          outstanding: remaining,
          idle: current.idle,
        },
      ] as const;
    }).pipe(
      Effect.flatMap((idle) =>
        idle === null ? Effect.void : Deferred.succeed(idle, undefined).pipe(Effect.orDie),
      ),
    );

    // 在独立的 fiber 中启动工作循环：不断从队列中取出任务并处理
    // 使用 Effect.ensuring 确保无论处理成功还是失败，都会执行 finishOne 来更新状态
    yield* Effect.forkScoped(
      Effect.forever(
        Queue.take(queue).pipe(
          Effect.flatMap((item) => process(item).pipe(Effect.ensuring(finishOne))),
        ),
      ),
    );

    /**
     * 入队操作：
     * 1. 如果当前处于空闲状态（outstanding === 0），创建新的 Deferred 信号并设置 outstanding 为 1
     * 2. 如果当前有未完成的任务，仅递增 outstanding 计数器
     * 3. 将工作项推入队列；如果队列拒绝接受（理论上不会发生，因为是无界队列），则手动调用 finishOne
     */
    const enqueue: DrainableWorker<A>["enqueue"] = (item) =>
      Effect.gen(function* () {
        const nextIdle = yield* Deferred.make<void>();
        yield* Ref.update(state, (current) =>
          current.outstanding === 0
            ? {
                outstanding: 1,
                idle: nextIdle,
              }
            : {
                outstanding: current.outstanding + 1,
                idle: current.idle,
              },
        );

        const accepted = yield* Queue.offer(queue, item);
        if (!accepted) {
          yield* finishOne;
        }
      });

    /**
     * 排空操作：
     * 读取当前状态中的 idle Deferred 信号并等待其被 resolve。
     * 当 outstanding 归零时，idle 信号会被 finishOne 逻辑 resolve，从而完成排空等待。
     */
    const drain: DrainableWorker<A>["drain"] = Ref.get(state).pipe(
      Effect.flatMap(({ idle }) => Deferred.await(idle)),
    );

    return { enqueue, drain } satisfies DrainableWorker<A>;
  });
