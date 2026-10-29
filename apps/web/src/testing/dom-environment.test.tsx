import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ambiente de componentes (D82)', () => {
  it('renderiza React num DOM do jsdom e desmonta entre os testes', () => {
    render(<p>pipa</p>);
    expect(screen.getByText('pipa').tagName).toBe('P');
  });

  it('começa cada teste com o documento vazio', () => {
    expect(document.body.textContent).toBe('');
  });
});
