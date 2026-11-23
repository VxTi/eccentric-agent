import { describe, it, vi, expect } from 'vitest';
import { PubSub } from './pub-sub';

describe('pub-sub', () => {
  it('notifies every subscriber on publish', () => {
    const pubSub = new PubSub<string>();
    const first = vi.fn();
    const second = vi.fn();

    pubSub.subscribe(first);
    pubSub.subscribe(second);
    pubSub.publish('event');

    expect(first).toHaveBeenCalledWith('event');
    expect(second).toHaveBeenCalledWith('event');
  });

  it('stops notifying a subscriber after unsubscribing', () => {
    const pubSub = new PubSub<string>();
    const subscriber = vi.fn();

    const unsubscribe = pubSub.subscribe(subscriber);
    unsubscribe();
    pubSub.publish('event');

    expect(subscriber).not.toHaveBeenCalled();
    expect(pubSub.subscriberCount).toBe(0);
  });

  it('does not unsubscribe other subscribers of the same event', () => {
    const pubSub = new PubSub<number>();
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = pubSub.subscribe(first);
    pubSub.subscribe(second);
    unsubscribeFirst();
    pubSub.publish(1);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(1);
  });
});
