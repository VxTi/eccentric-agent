import { describe, it, vi, expect } from 'vitest';
import { Notifier } from './notifier';

describe('notifier', () => {
  it('invokes callback function when channel is notified', () => {
    const notifier = new Notifier();
    const callbackFn = vi.fn();
    const channel = notifier.subscribe('some channel', callbackFn);

    channel.notify('hey!');

    expect(callbackFn).toHaveBeenCalledTimes(1);
    expect(callbackFn).toHaveBeenCalledWith('hey!');
  });

  it('throws an error when trying to subscribe to an already-subscribed channel', () => {
    const notifier = new Notifier();
    const callbackFn = vi.fn();
    // Should be fine
    notifier.subscribe('some channel', callbackFn);
    expect(() =>
      notifier.subscribe('some channel', callbackFn)
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Channel 'some channel' is already subscribed to]`
    );
  });

  describe('interception', () => {
    it('intercepts function parameters before final notification', () => {
      const notifier = new Notifier();
      const interceptor = vi.fn(
        (input: string) => [`${input} intercepted`] as [_input: string]
      );

      const messenger = vi.fn((_input: string) => 'test');

      const channel = notifier.subscribe('test-channel', messenger);
      channel.addInterceptor(interceptor);
      channel.notify('hello world');

      expect(interceptor).toHaveBeenCalledTimes(1);
      expect(interceptor).toHaveBeenCalledWith('hello world');
      expect(messenger).toHaveBeenCalledTimes(1);
      expect(messenger).toHaveBeenCalledWith('hello world intercepted');
    });
  });
});
