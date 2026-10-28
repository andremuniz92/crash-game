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

type AuthenticatedRequest = Request & { player?: AuthenticatedPlayer };

/**
 * Resolve o `Bearer` para o jogador (D59). Token malformado é recusado sem
 * consultar o banco.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parseBearer(request.headers.authorization);
    if (token === null) {
      throw new UnauthorizedError('credencial ausente ou malformada');
    }
    const player = await new MikroOrmPlayerStore(
      this.orm.em.fork(),
    ).findByTokenHash(hashToken(token));
    if (player === null) {
      throw new UnauthorizedError('token desconhecido');
    }
    request.player = player;
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
