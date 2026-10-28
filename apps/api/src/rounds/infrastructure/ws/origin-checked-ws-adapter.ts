import type { IncomingMessage } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { isAllowedOrigin } from '../../../shared/infrastructure/http/origin.js';

/** O que o `ws` passa ao `verifyClient` (sem `@types/ws`, D66). */
interface HandshakeInfo {
  origin: string | undefined;
  req: IncomingMessage;
}

type HandshakeVerdict = (accepted: boolean, code?: number) => void;

/**
 * Recusa no handshake, com 403, quem não vem da origem do front, inclusive
 * sem `Origin` (D70). O decorator do gateway é estático e não lê a
 * configuração; por isso o cheque fica no adaptador. Protege o navegador
 * (CSWSH); não é autenticação.
 */
export class OriginCheckedWsAdapter extends WsAdapter {
  constructor(
    app: INestApplication,
    private readonly webOrigin: string,
  ) {
    super(app);
  }

  override create(
    port: number,
    options: Parameters<WsAdapter['create']>[1] = {},
  ): ReturnType<WsAdapter['create']> {
    return super.create(port, {
      ...options,
      // Com dois parâmetros, o ws aceita o código da recusa.
      verifyClient: (info: HandshakeInfo, verdict: HandshakeVerdict) => {
        if (isAllowedOrigin(this.webOrigin, info.origin)) verdict(true);
        else verdict(false, 403);
      },
    });
  }
}
