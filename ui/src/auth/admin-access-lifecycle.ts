type AdminAccessHandler = () => Promise<void>;

let handler: AdminAccessHandler | undefined;
let pending: Promise<void> | undefined;

export function configureAdminAccessHandler(
  nextHandler: AdminAccessHandler,
): void {
  handler = nextHandler;
}

export function revalidateAdminAccess(): Promise<void> {
  if (pending !== undefined) return pending;
  if (handler === undefined) return Promise.resolve();
  pending = handler().finally(() => {
    pending = undefined;
  });
  return pending;
}
