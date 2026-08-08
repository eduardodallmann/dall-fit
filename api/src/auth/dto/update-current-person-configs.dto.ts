import { IsIn } from 'class-validator';

import type { Theme, UpdateCurrentPersonConfigsRequest } from '@dall-fit/types';

const themes = ['light', 'dark'] as const satisfies readonly Theme[];

export class UpdateCurrentPersonConfigsDto implements UpdateCurrentPersonConfigsRequest {
  @IsIn(themes)
  theme!: Theme;
}
