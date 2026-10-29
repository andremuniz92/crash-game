import { useEffect, useState } from 'react';
import type { VerifyResult } from '../app/actions.js';
import { useGame } from '../app/game-context.js';
import { formatMultiplier } from '../format/multiplier.js';
import styles from './VerifyPanel.module.css';

/** Seção do README com os comandos de SHA-256 e HMAC (D23, D80). */
export const README_VERIFY_URL =
  'https://github.com/andremuniz92/crash-game#verificando-uma-rodada';

/**
 * Verificação de uma rodada (D7, D80, D86): confere o SHA-256 da seed contra
 * o hash publicado antes do crash. O crash point não é recalculado aqui; o
 * comando HMAC do README faz isso por fora.
 */
export function VerifyPanel({
  roundId,
  onClose,
}: {
  roundId: string;
  onClose: () => void;
}) {
  const { actions } = useGame();
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    let current = true;
    setResult(null);
    void actions.verifyRound(roundId).then((value) => {
      // Outra rodada foi escolhida antes da resposta: esta não vale mais.
      if (current) setResult(value);
    });
    return () => {
      current = false;
    };
  }, [actions, roundId]);

  return (
    <section className={styles.panel} aria-label="Verificação">
      <div className={styles.header}>
        <h3 className={styles.title}>Verificação da rodada</h3>
        <button type="button" className={styles.close} onClick={onClose}>
          Fechar
        </button>
      </div>
      {result === null && <p className={styles.muted}>Verificando…</p>}
      {result?.status === 'failed' && (
        <p role="alert" className={styles.bad}>
          {result.message}
        </p>
      )}
      {result?.status === 'done' && <Details result={result} />}
    </section>
  );
}

function Details({
  result,
}: {
  result: Extract<VerifyResult, { status: 'done' }>;
}) {
  return (
    <>
      <dl className={styles.data}>
        <dt>Crash point</dt>
        <dd>{formatMultiplier(result.crashPoint)}</dd>
        <dt>Seed</dt>
        <dd className={styles.code}>{result.serverSeed}</dd>
        <dt>
          {result.seenLive
            ? 'Hash publicado antes da rodada'
            : 'Hash informado na verificação'}
        </dt>
        <dd className={styles.code}>{result.seedHash}</dd>
      </dl>
      {!result.seenLive && (
        <p className={styles.muted}>
          Esta página não viu o hash publicado antes desta rodada; a conferência
          usa o hash informado agora, que sozinho não prova a fixação da seed.
        </p>
      )}
      {result.hashMatches === null ? (
        <p className={styles.muted}>
          Conferência indisponível. O navegador só libera o SHA-256 em HTTPS ou
          localhost.
        </p>
      ) : result.hashMatches ? (
        <p className={styles.good}>
          Confere: o SHA-256 da seed é o hash publicado.
        </p>
      ) : (
        <p className={styles.bad}>Não confere: o SHA-256 da seed é outro.</p>
      )}
      <p className={styles.muted}>
        O SHA-256 batendo mostra que a seed estava fixada antes da rodada. O
        crash point sai da seed por um HMAC, que esta página não recalcula:
        confira pelo comando do README.
      </p>
      <pre className={styles.command}>
        {`printf '%s' '${result.serverSeed}' | sha256sum`}
      </pre>
      <a
        className={styles.link}
        href={README_VERIFY_URL}
        target="_blank"
        rel="noreferrer"
      >
        Como conferir por fora (SHA-256 e HMAC)
      </a>
    </>
  );
}
