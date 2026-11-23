export type UnsubscribeFn = () => void;

export type SubscriberFn<Event> = (event: Event) => void;

export class PubSub<Event> {
  private readonly subscribers = new Set<SubscriberFn<Event>>();

  public subscribe(subscriber: SubscriberFn<Event>): UnsubscribeFn {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public publish(event: Event): void {
    this.subscribers.forEach(subscriber => subscriber(event));
  }

  public get subscriberCount(): number {
    return this.subscribers.size;
  }
}
