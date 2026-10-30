type NotifierFn<T> = (arg: T) => any;
type InterceptorFn<T> = (args: T) => T;

export class NotifierChannel<T> {
  constructor(
    public readonly channelId: string,
    private readonly notifier: NotifierFn<T>,
    private readonly interceptors: InterceptorFn<T>[] = []
  ) {
    notifier.bind(this);
  }

  public addInterceptor(interceptor: InterceptorFn<T>) {
    this.interceptors.push(interceptor);
  }

  public notify(arg: T): void {
    const args: T = this.interceptors.reduce<T>(
      (preInterceptedArgs, interceptor) => interceptor(preInterceptedArgs),
      arg
    );
    this.notifier(args);
  }
}

export class Notifier {
  constructor(
    private readonly channels: Map<string, NotifierChannel<any>> = new Map()
  ) {}

  public subscribe<T>(
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
