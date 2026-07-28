import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppController } from '~/app.controller';
import type { GetRootCommand } from '~/commands/get-root.command';

describe('AppController', () => {
  const getRootCommand = {
    execute: vi.fn(),
  };
  let appController: AppController;

  beforeEach(() => {
    vi.clearAllMocks();
    appController = new AppController(
      getRootCommand as unknown as GetRootCommand,
    );
  });

  it('returns the response prepared by the command', () => {
    getRootCommand.execute.mockReturnValue('Hello World!');

    const result = appController.getRoot();

    expect(result).toBe('Hello World!');
    expect(getRootCommand.execute).toHaveBeenCalledOnce();
  });
});
