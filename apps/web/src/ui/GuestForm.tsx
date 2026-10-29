import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  parseNickname,
} from '@crash/shared';
import { type FormEvent, useId, useRef, useState } from 'react';
import { useGame } from '../app/game-context.js';
import styles from './GuestForm.module.css';

/** Entrada do guest (D59, D72): as mesmas regras de nickname da API. */
export function GuestForm() {
  const { actions } = useGame();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O estado só muda no próximo render; a ref trava o Enter repetido antes dele.
  const inFlight = useRef(false);
  const id = useId();
  const nickname = parseNickname(value);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nickname === null || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    const result = await actions.createGuest(nickname);
    inFlight.current = false;
    setSending(false);
    if (result.status === 'failed') setError(result.message);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.label} htmlFor={`${id}-nickname`}>
        Nickname
      </label>
      <input
        id={`${id}-nickname`}
        className={styles.input}
        value={value}
        maxLength={NICKNAME_MAX_LENGTH}
        autoComplete="nickname"
        autoCapitalize="off"
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        onChange={(event) => setValue(event.target.value)}
      />
      <p id={`${id}-hint`} className={styles.hint}>
        {NICKNAME_MIN_LENGTH} a {NICKNAME_MAX_LENGTH} caracteres: letras sem
        acento, dígitos, _ e -
      </p>
      <button
        type="submit"
        className={styles.button}
        disabled={nickname === null || sending}
      >
        {sending ? 'Entrando…' : 'Entrar'}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}
