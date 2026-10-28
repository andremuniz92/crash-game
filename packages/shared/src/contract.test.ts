import { describe, expectTypeOf, it } from 'vitest';
import type {
  BetCashedOutMessage,
  BetPlacedMessage,
  RoundBetDto,
} from './index.js';

/*
 * Testes de tipo: quem os verifica é o `tsc` do `pnpm typecheck`; no
 * `vitest run`, as chamadas não fazem nada.
 */
describe('contrato das apostas públicas (D71)', () => {
  it('S1: bet:placed, bet:cashed_out e RoundBetDto têm betId e nunca playerId', () => {
    expectTypeOf<BetPlacedMessage['payload']>().toEqualTypeOf<{
      roundId: string;
      betId: string;
      nickname: string;
      amount: number;
    }>();
    expectTypeOf<BetCashedOutMessage['payload']>().toEqualTypeOf<{
      roundId: string;
      betId: string;
      nickname: string;
      multiplier: number;
      payout: number;
    }>();
    expectTypeOf<RoundBetDto>().toHaveProperty('betId').toEqualTypeOf<string>();
    expectTypeOf<RoundBetDto>().not.toHaveProperty('playerId');
  });
});
