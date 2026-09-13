import { IsString, MinLength } from 'class-validator';

import type { CreateNativeSessionRequest } from '@dall-fit/types';

export class CreateNativeSessionDto implements CreateNativeSessionRequest {
  @IsString()
  @MinLength(1)
  identityToken!: string;
}
