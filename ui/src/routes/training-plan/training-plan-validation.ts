export function validateTrainingPlanName(value: string): string | undefined {
  const length = value.trim().length;
  let result: string | undefined;
  if (length === 0) {
    result = 'Informe o nome do plano.';
  } else if (length > 120) {
    result = 'Use no máximo 120 caracteres.';
  }

  return result;
}

export function validateTrainingPlanDescription(
  value: string,
): string | undefined {
  const length = value.trim().length;
  let result: string | undefined;
  if (length === 0) {
    result = 'Informe a descrição do plano.';
  } else if (length > 1000) {
    result = 'Use no máximo 1000 caracteres.';
  }

  return result;
}
