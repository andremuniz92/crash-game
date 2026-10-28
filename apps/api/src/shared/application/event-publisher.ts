/** Evento publicado depois do commit (D62). Os eventos de domínio têm `type` (D31). */
export interface PublishedEvent {
  readonly type: string;
}

/** Entrega os eventos de uma operação já commitada aos ouvintes (D62). */
export interface EventPublisher {
  publish(events: readonly PublishedEvent[]): void;
}
