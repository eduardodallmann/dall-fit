let clientInstanceId: string | undefined;

export function getClientInstanceId(): string {
  clientInstanceId ??= crypto.randomUUID();
  return clientInstanceId;
}

export function resetClientInstanceId(): void {
  clientInstanceId = undefined;
}
