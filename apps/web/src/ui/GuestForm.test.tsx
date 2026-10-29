import { NICKNAME_MAX_LENGTH } from '@crash/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '../app/actions.js';
import { fakeActions, renderWithGame } from '../testing/render-game.js';
import { GuestForm } from './GuestForm.js';

const input = () => screen.getByLabelText<HTMLInputElement>('Nickname');
const button = () => screen.getByRole<HTMLButtonElement>('button');

/** createGuest que só resolve quando o teste mandar. */
function heldGuest() {
  let finish!: (result: ActionResult) => void;
  const createGuest = vi.fn(
    () =>
      new Promise<ActionResult>((resolve) => {
        finish = resolve;
      }),
  );
  return { createGuest, finish: (result: ActionResult) => finish(result) };
}

describe('GuestForm (D59, D72)', () => {
  it('GF1: maxLength e a dica vêm das constantes do @crash/shared', () => {
    renderWithGame(<GuestForm />);

    expect(input().maxLength).toBe(NICKNAME_MAX_LENGTH);
    expect(NICKNAME_MAX_LENGTH).toBe(16);
    const hint = document.getElementById(
      input().getAttribute('aria-describedby') ?? '',
    );
    expect(hint?.textContent).toMatch(/3 a 16 caracteres/);
  });

  it.each(['', 'ab', 'joão', '   ', 'a b'])(
    'GF2: com "%s", o botão fica desabilitado',
    async (value) => {
      const user = userEvent.setup();
      renderWithGame(<GuestForm />);
      if (value) await user.type(input(), value);
      expect(button().disabled).toBe(true);
    },
  );

  it('GF2: com "  ana " (válido depois de aparar), o botão fica habilitado', async () => {
    const user = userEvent.setup();
    renderWithGame(<GuestForm />);
    await user.type(input(), '  ana ');
    expect(button().disabled).toBe(false);
  });

  it('GF3: envia o nickname aparado, pelo clique e pelo Enter', async () => {
    const user = userEvent.setup();
    const createGuest = vi.fn(() =>
      Promise.resolve<ActionResult>({ status: 'done' }),
    );
    renderWithGame(<GuestForm />, { actions: fakeActions({ createGuest }) });

    await user.type(input(), '  ana ');
    await user.click(button());
    await user.type(input(), '{Enter}');

    expect(createGuest).toHaveBeenNthCalledWith(1, 'ana');
    expect(createGuest).toHaveBeenNthCalledWith(2, 'ana');
  });

  it('GF4: durante o envio, o botão fica desabilitado e um segundo envio não sai', async () => {
    const user = userEvent.setup();
    const held = heldGuest();
    renderWithGame(<GuestForm />, {
      actions: fakeActions({ createGuest: held.createGuest }),
    });

    await user.type(input(), 'ana');
    await user.click(button());
    expect(button().disabled).toBe(true);
    await user.type(input(), '{Enter}');
    await user.click(button());

    expect(held.createGuest).toHaveBeenCalledTimes(1);
    held.finish({ status: 'done' });
  });

  it('GF5: na falha, mostra a mensagem em role="alert" e reabilita o botão', async () => {
    const user = userEvent.setup();
    const held = heldGuest();
    renderWithGame(<GuestForm />, {
      actions: fakeActions({ createGuest: held.createGuest }),
    });

    await user.type(input(), 'ana');
    await user.click(button());
    held.finish({ status: 'failed', message: 'Sem conexão com o servidor.' });

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sem conexão com o servidor.',
    );
    expect(button().disabled).toBe(false);
  });
});
