import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem os globals do Vitest, a Testing Library não desmonta sozinha.
afterEach(() => {
  cleanup();
});
