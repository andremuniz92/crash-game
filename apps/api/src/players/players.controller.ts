import type { GuestResponse } from '@crash/shared';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { CreateGuest } from './create-guest.js';
import { parseGuestBody } from './guest-body.js';

@Controller('players')
export class PlayersController {
  constructor(@Inject(CreateGuest) private readonly createGuest: CreateGuest) {}

  @Post('guest')
  guest(@Body() body: unknown): Promise<GuestResponse> {
    return this.createGuest.execute(parseGuestBody(body));
  }
}
