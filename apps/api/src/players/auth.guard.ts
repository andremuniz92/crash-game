import { MikroORM } from '@mikro-orm/postgresql';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { UnauthorizedError } from '../shared/infrastructure/http/request-errors.js';
import { parseBearer } from './bearer.js';
import { MikroOrmPlayerStore } from './mikro-orm-player-store.js';
import type { AuthenticatedPlayer } from './player-store.js';
import { hashToken } from './player-token.js';

type AuthenticatedRequest = Request & { player?: AuthenticatedPlayer | null };

/** Header → jogador. Token malformado é recusado sem consultar o banco (D59). */
async function authenticate(
  orm: MikroORM,
  header: string | undefined,
): Promise<AuthenticatedPlayer> {
  const token = parseBearer(header);
  if (token === null) {
    throw new UnauthorizedError('credencial ausente ou malformada');
  }
  const player = await new MikroOrmPlayerStore(orm.em.fork()).findByTokenHash(
    hashToken(token),
  );
  if (player === null) {
    throw new UnauthorizedError('token desconhecido');
  }
  return player;
}

/** Exige o `Bearer` (D59). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.player = await authenticate(
      this.orm,
      request.headers.authorization,
    );
    return true;
  }
}

/**
 * `Bearer` opcional (D63): sem o header, segue anônimo; com o header, ele
 * precisa ser válido (401 caso contrário).
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    request.player =
      header === undefined ? null : await authenticate(this.orm, header);
    return true;
  }
}

/** O jogador resolvido pelo `AuthGuard`. */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPlayer => {
    const { player } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (!player) {
      throw new UnauthorizedError('rota sem AuthGuard');
    }
    return player;
  },
);

/** O jogador resolvido pelo `OptionalAuthGuard`, ou null se anônimo. */
export const OptionalPlayer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPlayer | null =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().player ?? null,
);
