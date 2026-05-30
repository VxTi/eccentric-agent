type NotifierFn<T extends any[]> = (...parameters: T) => any;

export class NotifierChannel<T extends any[]> {
  constructor(
    public readonly channelId: string,
    private readonly notifier: NotifierFn<T>
  ) {
    notifier.bind(this);
  }

  public notify(...parameters: T): void {
    this.notifier(...parameters);
  }
}

export class Notifier {
  constructor(
    private readonly channels: Map<string, NotifierChannel<any>> = new Map()
  ) {}

  public subscribe<T extends any[]>(
    channelId: string,
    notifier: NotifierFn<T>
  ): NotifierChannel<T> {
    const channel = new NotifierChannel(channelId, notifier);
    this.channels.set(channelId, channel);
    return channel;
  }

  public unsubscribe(channelId: string): void {
    if (!this.channels.has(channelId)) {
      throw new Error(`Channel ${channelId} does not exist`);
    }

    this.channels.delete(channelId);
  }
}
