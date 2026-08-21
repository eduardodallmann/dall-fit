import { createConsola, type ConsolaInstance } from 'consola';

export class WorkflowLogger {
  private readonly logger: ConsolaInstance;

  constructor(private readonly scope: string) {
    this.logger = createConsola({ level: 3 });
  }

  info(method: string, stage: string, data: Record<string, unknown>): void {
    this.logger.info(`${this.scope} -> ${method} -> ${stage}:`, { data });
  }

  warn(method: string, stage: string, data: Record<string, unknown>): void {
    this.logger.warn(`${this.scope} -> ${method} -> ${stage}:`, { data });
  }
}
