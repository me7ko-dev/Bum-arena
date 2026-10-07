import { describe, expect, it } from 'vitest';
import type { GameEvent, Snapshot } from '@bum/shared';
import { SnapshotBuffer } from './SnapshotBuffer';
import { makeServer, simulateNetwork, type Arrival } from './testUtils';

const TICK = 30;

/**
 * Върти клиентски „кадри“ през пристиганията: преди всеки кадър буферът получава
 * всичко пристигнало дотогава. frameDt(i) – продължителност на кадър i.
 */
function play(
  arrivals: Arrival[],
  buf: SnapshotBuffer,
  frameDt: (i: number) => number,
  extraSec = 1,
  hidden?: (now: number) => boolean,
) {
  const events: GameEvent[] = [];
  const alphas: number[] = [];
  const renderTimes: number[] = [];
  const end = arrivals[arrivals.length - 1]!.at + extraSec;
  let next = 0;
  let now = 0;
  for (let i = 0; now < end; i++) {
    now += frameDt(i);
    while (next < arrivals.length && arrivals[next]!.at <= now) {
      buf.push(arrivals[next]!.snap, arrivals[next]!.at);
      next++;
    }
    if (hidden?.(now)) continue; // скрит таб: няма кадри
    const f = buf.advance(now);
    if (!f) continue;
    alphas.push(f.alpha);
    renderTimes.push(buf.renderTime!);
    expect(f.from.t).toBeLessThanOrEqual(f.to.t);
    events.push(...buf.drainEvents());
  }
  return { events, alphas, renderTimes };
}

const allEvents = (arrivals: Arrival[]): GameEvent[] => arrivals.flatMap((a) => a.snap.events);

function expectMonotonic(times: number[]): void {
  for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
}

describe('SnapshotBuffer', () => {
  it('при трептене: събитията са точно веднъж и по ред, alpha в [0,1], времето не върви назад', () => {
    const server = makeServer(10);
    const arrivals = simulateNetwork(server, TICK * 30, { jitter: 0.06 });
    const expected = allEvents(arrivals);
    expect(expected.length).toBeGreaterThan(50);

    const buf = new SnapshotBuffer(TICK);
    const { events, alphas, renderTimes } = play(arrivals, buf, () => 1 / 60);
    expect(events).toEqual(expected);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expectMonotonic(renderTimes);
    // В крайна сметка рисуваме последната снимка.
    expect(buf.renderTime).toBeCloseTo(arrivals[arrivals.length - 1]!.snap.t / TICK, 5);
  });

  it('задръствания (много снимки в един кадър) и неравни кадри – нищо не се губи и не се повтаря', () => {
    const server = makeServer(12, 21);
    const arrivals = simulateNetwork(server, TICK * 25, { jitter: 0.03, burstEvery: 37, burstDelay: 0.4, seed: 9 });
    const expected = allEvents(arrivals);
    const buf = new SnapshotBuffer(TICK);
    // Кадри от 7 ms до 120 ms (бавен телефон, GC паузи).
    const dts = [0.007, 0.016, 0.016, 0.033, 0.12, 0.016, 0.05];
    const { events, alphas, renderTimes } = play(arrivals, buf, (i) => dts[i % dts.length]!);
    expect(events).toEqual(expected);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(1);
    expectMonotonic(renderTimes);
  });

  it('скрит таб: буферът е ограничен, а след връщане събитията пак са всички', () => {
    const server = makeServer(10, 5);
    const arrivals = simulateNetwork(server, TICK * 20, { seed: 4 });
    const expected = allEvents(arrivals);
    const buf = new SnapshotBuffer(TICK, { maxBuffered: 30 });
    let maxSize = 0;
    const { events, renderTimes } = play(
      arrivals,
      buf,
      () => 1 / 60,
      1,
      (now) => {
        maxSize = Math.max(maxSize, buf.size);
        return now > 4 && now < 12;
      },
    );
    expect(maxSize).toBeLessThanOrEqual(30);
    expect(events).toEqual(expected);
    expectMonotonic(renderTimes);
  });

  it('рисува около delay назад и интерполира между съседни снимки', () => {
    const server = makeServer(4);
    // Идеална мрежа: всяка снимка идва точно 50 ms след тика си.
    const arrivals = simulateNetwork(server, TICK * 5, { latency: 0.05, jitter: 0 });
    const buf = new SnapshotBuffer(TICK, { delay: 0.1 });
    let now = 0;
    let next = 0;
    let checked = 0;
    for (let i = 0; i < 60 * 5; i++) {
      now += 1 / 60;
      while (next < arrivals.length && arrivals[next]!.at <= now) {
        buf.push(arrivals[next]!.snap, arrivals[next]!.at);
        next++;
      }
      const f = buf.advance(now);
      if (!f || now < 1) continue;
      // Последната снимка е от сървърно време now − 0.05 → рисуваме около now − 0.05 − 0.1.
      expect(buf.renderTime!).toBeCloseTo(now - 0.15, 1);
      expect(f.to.t - f.from.t).toBe(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('повторена/стара снимка се пренебрегва; нов свят (тикът отначало) започва наново', () => {
    const server = makeServer(3);
    const snaps: Snapshot[] = [];
    for (let i = 0; i < 10; i++) snaps.push(server.step());
    const buf = new SnapshotBuffer(TICK);
    snaps.forEach((s, i) => buf.push(s, i / TICK));
    buf.push(snaps[5]!, 0.4);
    expect(buf.size).toBe(10);
    const restarted: Snapshot = { ...snaps[0]!, t: 1, events: [{ type: 'countdown', n: 3 }] };
    buf.push({ ...snaps[9]!, t: 200 }, 0.5);
    buf.push(restarted, 0.6);
    expect(buf.size).toBe(1);
    const f = buf.advance(0.6)!;
    expect(f.to.t).toBe(1);
    expect(buf.drainEvents()).toEqual([{ type: 'countdown', n: 3 }]);
  });
});
