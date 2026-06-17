/**
 * 文件: DrainableWorker.ts
 * 用途: 基于队列的可排空工作器，对外暴露 `drain()` 效应。
 * 层级: 共享工具模块
 * 主要导出: DrainableWorker 接口、makeDrainableWorker 工厂函数
 *
 * 封装了常见的 `Queue.unbounded` + `Effect.forever` 模式，并添加了一个信号量，
 * 当队列为空 **且** 当前项已完成处理时触发。这使得测试可以用确定性的 `drain()`
 * 替代对时序敏感的 `Effect.sleep` 调用。
 */
import { Deferred, Effect, Queue, Ref } from "effect";
import type { Scope } from "effect";

/** 可排空工作器接口 */
export interface DrainableWorker<A> {
  /**
   * 将工作项入队，并为其跟踪 `drain()` 状态。
   *
   * 此方法封装了 `Queue.offer`，确保 drain 状态与入队路径原子化更新，
   * 而非从队列内部状态推断。
   */
  readonly enqueue: (item: A) => Effect.Effect<void>;

  /**
   * 当队列为空且工作器空闲（未在处理中）时完成。
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * 创建一个可排空工作器，从无界队列中消费并处理工作项。
 *
 * 工作器被 fork 到当前作用域中，当作用域关闭时会被中断。
 * 注册的终结器会在作用域关闭时关闭队列。
 *
 * @param process - 对每个入队项执行的处理效应。
 * @returns 包含 `enqueue` 和 `drain` 方法的 `DrainableWorker` 实例。
 */
export const makeDrainableWorker = <A, E, R>(
  process: (item: A) => Effect.Effect<void, E, R>,
): Effect.Effect<DrainableWorker<A>, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    // 创建无界队列和初始空闲信号
    const queue = yield* Queue.unbounded<A>();
    const initialIdle = yield* Deferred.make<void>();
    yield* Deferred.succeed(initialIdle, undefined).pipe(Effect.orDie);
    const state = yield* Ref.make({
      outstanding: 0,
      idle: initialIdle,
    });

    // 作用域关闭时关闭队列
    yield* Effect.addFinalizer(() => Queue.shutdown(queue).pipe(Effect.asVoid));

    // 完成一个工作项：减少待处理计数，若归零则触发空闲信号
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

    // 启动后台工作循环：不断从队列取元素并处理
    yield* Effect.forkScoped(
      Effect.forever(
        Queue.take(queue).pipe(
          Effect.flatMap((item) => process(item).pipe(Effect.ensuring(finishOne))),
        ),
      ),
    );

    // 入队方法：将项加入队列并更新待处理计数
    const enqueue: DrainableWorker<A>["enqueue"] = (item) =>
      Effect.gen(function* () {
        const nextIdle = yield* Deferred.make<void>();
        // 更新状态：若当前无待处理项，则切换空闲信号
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
          // 队列已关闭，回退待处理计数
          yield* finishOne;
        }
      });

    // 排空方法：等待当前空闲信号完成
    const drain: DrainableWorker<A>["drain"] = Ref.get(state).pipe(
      Effect.flatMap(({ idle }) => Deferred.await(idle)),
    );

    return { enqueue, drain } satisfies DrainableWorker<A>;
  });
