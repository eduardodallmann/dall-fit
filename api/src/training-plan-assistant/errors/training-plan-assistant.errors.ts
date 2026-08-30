import { HttpException } from '@nestjs/common';

function assistantError(status: number, code: string, message: string) {
  const result = new HttpException({ code, details: {}, message }, status);
  return result;
}

export const assistantDisabled = () =>
  assistantError(503, 'ASSISTANT_DISABLED', 'O assistente está indisponível.');
export const assistantSessionNotFound = () =>
  assistantError(404, 'ASSISTANT_SESSION_NOT_FOUND', 'Sessão não encontrada.');
export const assistantSessionExpired = () =>
  assistantError(410, 'ASSISTANT_SESSION_EXPIRED', 'A sessão expirou.');
export const assistantVersionConflict = () =>
  assistantError(
    412,
    'ASSISTANT_SESSION_VERSION_CONFLICT',
    'A sessão foi atualizada em outro lugar.',
  );
export const assistantInvalidState = () =>
  assistantError(409, 'ASSISTANT_INVALID_STATE', 'A ação não é válida agora.');
export const assistantMessageLimit = () =>
  assistantError(
    422,
    'ASSISTANT_MESSAGE_LIMIT_REACHED',
    'O limite de mensagens foi atingido.',
  );
export const assistantProviderUnavailable = () =>
  assistantError(
    503,
    'ASSISTANT_PROVIDER_UNAVAILABLE',
    'Não foi possível gerar a sugestão agora.',
  );
export const assistantDraftInvalid = () =>
  assistantError(
    502,
    'ASSISTANT_DRAFT_INVALID',
    'A sugestão gerada é inválida.',
  );
export const assistantScreeningBlocked = () =>
  assistantError(
    409,
    'ASSISTANT_SCREENING_BLOCKED',
    'A triagem não permite gerar um plano nesta sessão.',
  );
export const assistantCatalogMismatch = () =>
  assistantError(
    409,
    'ASSISTANT_CATALOG_VERSION_MISMATCH',
    'O catálogo do assistente foi atualizado.',
  );
export const assistantIdempotencyReused = () =>
  assistantError(
    409,
    'IDEMPOTENCY_KEY_REUSED',
    'A chave de idempotência já foi usada com outro conteúdo.',
  );
export const assistantValidationError = () =>
  assistantError(400, 'VALIDATION_ERROR', 'A entrada informada é inválida.');
