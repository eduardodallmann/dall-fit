import { AlertDialog, Button } from '@heroui/react';

export interface NativeLogoutDialogProps {
  isOpen: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function NativeLogoutDialog({
  isOpen,
  isPending,
  onCancel,
  onConfirm,
}: Readonly<NativeLogoutDialogProps>) {
  return (
    <AlertDialog>
      <AlertDialog.Backdrop
        isKeyboardDismissDisabled
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open && !isPending) onCancel();
        }}
      >
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>Sair e apagar dados?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Há alterações locais pendentes. Ao sair, esses dados serão
              apagados deste aparelho.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button autoFocus isDisabled={isPending} onPress={onCancel}>
                Cancelar
              </Button>
              <Button
                isPending={isPending}
                onPress={onConfirm}
                variant="danger"
              >
                Sair e apagar dados
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
