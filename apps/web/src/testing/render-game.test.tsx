import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithGame } from './render-game.js';

function Effect({ log }: { log: string[] }) {
  useEffect(() => {
    log.push('mount');
    return () => {
      log.push('cleanup');
    };
  }, [log]);
  return null;
}

describe('renderWithGame', () => {
  it('RG1: com strict, os efeitos montam, desmontam e montam de novo, como no main.tsx', () => {
    const log: string[] = [];
    renderWithGame(<Effect log={log} />, { strict: true });
    expect(log).toEqual(['mount', 'cleanup', 'mount']);
  });
});
