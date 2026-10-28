import { InMemoryEventPublisher } from './in-memory-event-publisher.js';

describe('InMemoryEventPublisher (D62)', () => {
  it('EP1: entrega os eventos em ordem a todos os ouvintes; unsubscribe remove o ouvinte', () => {
    const publisher = new InMemoryEventPublisher({ error: vi.fn() });
    const first: string[] = [];
    const second: string[] = [];
    publisher.subscribe((event) => first.push(event.type));
    const unsubscribe = publisher.subscribe((event) => second.push(event.type));

    publisher.publish([{ type: 'A' }, { type: 'B' }]);
    unsubscribe();
    publisher.publish([{ type: 'C' }]);

    expect(first).toEqual(['A', 'B', 'C']);
    expect(second).toEqual(['A', 'B']);
  });

  it('EP2: um ouvinte que lança não impede os outros e vai para o log', () => {
    const logger = { error: vi.fn() };
    const publisher = new InMemoryEventPublisher(logger);
    const received: string[] = [];
    const failure = new Error('ouvinte quebrado');
    publisher.subscribe(() => {
      throw failure;
    });
    publisher.subscribe((event) => received.push(event.type));

    expect(() => publisher.publish([{ type: 'A' }])).not.toThrow();
    expect(received).toEqual(['A']);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('A'),
      failure.stack,
    );
  });
});
