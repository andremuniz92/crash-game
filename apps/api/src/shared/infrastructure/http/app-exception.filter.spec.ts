import {
  type ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import {
  InvalidBetAmountError,
  TooLateError,
} from '../../../bets/domain/bet.js';
import { BetAlreadyPlacedError } from '../../../bets/domain/bet-repository.js';
import { CorruptedRoundError } from '../../../rounds/domain/round.js';
import { InsufficientBalanceError } from '../../../wallet/domain/wallet.js';
import { DomainError } from '../../domain/domain-error.js';
import { AppExceptionFilter } from './app-exception.filter.js';

class UnclassifiedError extends DomainError {
  readonly code = 'NOT_IN_THE_TABLE';
}

function setup() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/bets' }),
    }),
  } as unknown as ArgumentsHost;
  const logError = vi.fn();
  const filter = new AppExceptionFilter({ error: logError });

  return {
    logError,
    /** Passa a exceção pelo filtro e devolve o que foi respondido. */
    respond: (exception: unknown) => {
      filter.catch(exception, host);
      expect(response.status).toHaveBeenCalledTimes(1);
      expect(response.json).toHaveBeenCalledTimes(1);
      const [status] = response.status.mock.lastCall as [number];
      const [body] = response.json.mock.lastCall as [unknown];
      response.status.mockClear();
      response.json.mockClear();
      return { status, body };
    },
  };
}

const INTERNAL = { code: 'INTERNAL_ERROR', message: 'erro interno' };

describe('AppExceptionFilter (D58)', () => {
  it('E1: erro de domínio mapeado sai com o status da tabela e { code, message }', () => {
    const { respond, logError } = setup();

    expect(respond(new TooLateError('a rodada já crashou'))).toEqual({
      status: 409,
      body: { code: 'TOO_LATE', message: 'a rodada já crashou' },
    });
    expect(respond(new BetAlreadyPlacedError('já apostou'))).toEqual({
      status: 409,
      body: { code: 'BET_ALREADY_PLACED', message: 'já apostou' },
    });
    expect(respond(new InsufficientBalanceError('sem saldo'))).toEqual({
      status: 422,
      body: { code: 'INSUFFICIENT_BALANCE', message: 'sem saldo' },
    });
    expect(respond(new InvalidBetAmountError('valor fora da faixa'))).toEqual({
      status: 400,
      body: { code: 'INVALID_BET_AMOUNT', message: 'valor fora da faixa' },
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('E2: código de bug ou fora da tabela sai como 500 genérico, e o erro vai para o log', () => {
    const { respond, logError } = setup();

    const corrupted = new CorruptedRoundError('rodada r1: seed adulterada');
    expect(respond(corrupted)).toEqual({ status: 500, body: INTERNAL });
    expect(logError).toHaveBeenLastCalledWith(
      expect.stringContaining('POST /bets'),
      corrupted.stack,
    );

    const unclassified = new UnclassifiedError('detalhe interno');
    expect(respond(unclassified)).toEqual({ status: 500, body: INTERNAL });
    expect(logError).toHaveBeenLastCalledWith(
      expect.stringContaining('NOT_IN_THE_TABLE'),
      unclassified.stack,
    );
  });

  it('E3: HttpException do Nest sai com o próprio status e um code', () => {
    const { respond, logError } = setup();

    expect(respond(new NotFoundException('Cannot GET /nada'))).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Cannot GET /nada' },
    });
    expect(respond(new BadRequestException('corpo inválido'))).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'corpo inválido' },
    });
    expect(respond(new MethodNotAllowedException())).toEqual({
      status: 405,
      body: { code: 'HTTP_ERROR', message: 'Method Not Allowed' },
    });
    expect(logError).not.toHaveBeenCalled();

    // 5xx do Nest é tratado como bug: mensagem genérica e log.
    expect(respond(new InternalServerErrorException('detalhe'))).toEqual({
      status: 500,
      body: INTERNAL,
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('E4: erro que não é DomainError sai como 500 sem vazar a mensagem', () => {
    const { respond, logError } = setup();

    const error = new Error('senha do banco no texto');
    const first = respond(error);
    expect(first).toEqual({ status: 500, body: INTERNAL });
    expect(JSON.stringify(first.body)).not.toContain('senha');
    expect(logError).toHaveBeenLastCalledWith(expect.any(String), error.stack);

    expect(respond('lançou uma string')).toEqual({
      status: 500,
      body: INTERNAL,
    });
    expect(logError).toHaveBeenLastCalledWith(
      expect.any(String),
      'lançou uma string',
    );
  });
});
