/** Base dos agregados: acumula eventos de domínio até a infraestrutura publicá-los (D31). */
export abstract class AggregateRoot<TEvent extends { type: string }> {
  private events: TEvent[] = [];

  protected record(event: TEvent): void {
    this.events.push(event);
  }

  /** Devolve os eventos acumulados, em ordem, e esvazia a lista. */
  pullEvents(): TEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
