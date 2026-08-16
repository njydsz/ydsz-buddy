/**
 * @file EventReplay 单元测试（P2-3）
 *
 * 覆盖目标:
 * - 打开时显示 0 事件空状态
 * - 传入事件后显示第一条(current=0)
 * - 点击 step-forward 推进 cursor
 * - 到达末尾时 step-forward 禁用
 * - 点击 step-back 回退
 * - 点击 reset 回到 0
 * - 切换 speed 不影响 cursor
 * - 列表项点击跳转
 * - 键盘 Space 触发 play/pause
 * - 键盘 ArrowRight/Left 触发 step
 * - 键盘 Home/End 跳转
 *
 * 通过 mock timer + happy-dom 验证自动推进逻辑。
 */
import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "~/i18n/I18nContext";
import { EventReplay } from "./EventReplay";
import type { OrchestrationEvent } from "~/contracts";

function makeEvent(seq: number, type = "thread.test", payload: unknown = {}): OrchestrationEvent {
  return {
    sequence: seq,
    eventId: `e${seq}` as OrchestrationEvent["eventId"],
    type,
    aggregateKind: "thread",
    aggregateId: "thread-1" as OrchestrationEvent["aggregateId"],
    occurredAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload,
  } as unknown as OrchestrationEvent;
}

function makeEvents(count: number): OrchestrationEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent(i + 1, `thread.event-${i + 1}`, { n: i + 1 }),
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider language="en">{children}</I18nProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("EventReplay - 基础渲染", () => {
  it("打开时显示标题", () => {
    render(
      <EventReplay
        open={true}
        onOpenChange={() => {}}
        events={makeEvents(3)}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Replay events")).toBeTruthy();
  });

  it("0 事件时显示 empty 提示", () => {
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={[]} />,
      { wrapper: Wrapper },
    );
    expect(screen.getAllByText("No events to replay.").length).toBeGreaterThan(0);
  });

  it("显示当前事件序列号 + 类型", () => {
    const events = makeEvents(2);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    // 当前事件 detail 区域包含 #1
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#1");
    expect(current.textContent).toContain("thread.event-1");
  });

  it("列表渲染全部事件", () => {
    const events = makeEvents(5);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    const list = screen.getByTestId("event-replay-list");
    expect(list.querySelectorAll('[data-testid="event-replay-item"]').length).toBe(5);
  });
});

describe("EventReplay - 单步控制", () => {
  // 单步控制测试不需要 fake timers
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("点击 step-forward 把 cursor 从 0 推到 1", () => {
    const events = makeEvents(3);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("event-replay-step-forward"));
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#2");
  });

  it("到末尾时 step-forward 禁用", () => {
    const events = makeEvents(2);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    // 先推到末尾
    fireEvent.click(screen.getByTestId("event-replay-step-forward"));
    const btn = screen.getByTestId("event-replay-step-forward") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("起始位置 step-back 禁用", () => {
    const events = makeEvents(3);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    const btn = screen.getByTestId("event-replay-step-back") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("reset 回到第一条", () => {
    const events = makeEvents(3);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("event-replay-step-forward"));
    fireEvent.click(screen.getByTestId("event-replay-reset"));
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#1");
  });

  it("点击列表项跳转 cursor", () => {
    const events = makeEvents(5);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    const items = screen.getAllByTestId("event-replay-item");
    // item 内的 button 才是真正接收 click 的元素
    const button = items[3]!.querySelector("button") as HTMLButtonElement;
    fireEvent.click(button);
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#4");
  });

  it("拖动 scrubber 改变 cursor", () => {
    const events = makeEvents(5);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    const scrubber = screen.getByTestId("event-replay-scrubber") as HTMLInputElement;
    fireEvent.change(scrubber, { target: { value: "3" } });
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#4");
  });
});

describe("EventReplay - 播放循环", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("点击 play 后,经过 1s 自动推进一格", () => {
    const events = makeEvents(3);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("event-replay-play"));
    // 1x = 1000ms
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#2");
  });

  it("到达末尾自动停止播放", () => {
    const events = makeEvents(2);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("event-replay-play"));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // 此时应停在 #2,播放按钮文案回到 Play
    const playBtn = screen.getByTestId("event-replay-play");
    expect(playBtn.textContent).toMatch(/Play/);
  });

  it("切换 speed 不影响 cursor 位置", () => {
    const events = makeEvents(5);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("event-replay-step-forward"));
    fireEvent.change(screen.getByTestId("event-replay-speed"), {
      target: { value: "200" }, // 4x
    });
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#2");
  });

  it("在末尾点 play 应从头重新播放", () => {
    const events = makeEvents(2);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    // 走到末尾
    fireEvent.click(screen.getByTestId("event-replay-step-forward"));
    // 在末尾点 play → 触发 reset + 播放
    fireEvent.click(screen.getByTestId("event-replay-play"));
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#1");
  });
});

describe("EventReplay - 键盘快捷键", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("Space 触发 play / pause", () => {
    const events = makeEvents(3);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    // 找到 dialog 容器派发 keyDown
    const dialog = screen.getByTestId("event-replay");
    fireEvent.keyDown(dialog, { key: " " });
    const playBtn = screen.getByTestId("event-replay-play");
    // 正在播放 → 按钮文案为 Pause
    expect(playBtn.textContent).toMatch(/Pause/);
    fireEvent.keyDown(dialog, { key: " " });
    expect(playBtn.textContent).toMatch(/Play/);
  });

  it("ArrowRight 推进, ArrowLeft 回退", () => {
    const events = makeEvents(3);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    const dialog = screen.getByTestId("event-replay");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    const current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#2");
  });

  it("Home 跳到首, End 跳到尾", () => {
    const events = makeEvents(5);
    render(
      <EventReplay open={true} onOpenChange={() => {}} events={events} />,
      { wrapper: Wrapper },
    );
    const dialog = screen.getByTestId("event-replay");
    fireEvent.keyDown(dialog, { key: "End" });
    let current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#5");
    fireEvent.keyDown(dialog, { key: "Home" });
    current = screen.getByTestId("event-replay-current");
    expect(current.textContent).toContain("#1");
  });
});
