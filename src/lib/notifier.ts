type NotifierFn<T extends any[]> = (...parameters: T) => any;

export class NotifierChannel<T extends any[]> {
  constructor(
    public readonly channelId: string,
    private readonly notifier: NotifierFn<T>,
    private readonly interceptors: ((...args: T) => T)[] = []
  ) {
    notifier.bind(this);
  }

  public addInterceptor(interceptor: (...args: T) => T) {
    this.interceptors.push(interceptor);
  }

  public notify(...parameters: T): void {
    const args: T = this.interceptors.reduce<T>(
      (preInterceptedArgs, interceptor) => interceptor(...preInterceptedArgs),
      parameters
    );
    this.notifier(...args);
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
    if (this.channels.has(channelId)) {
      throw new Error(`Channel '${channelId}' is already subscribed to`);
    }
    const channel = new NotifierChannel(channelId, notifier);
    this.channels.set(channelId, channel);
    return channel;
  }

  public unsubscribe(channelId: string): void {
    if (!this.channels.has(channelId)) {
      throw new Error(`Channel '${channelId}' does not exist`);
    }

    this.channels.delete(channelId);
  }
}
