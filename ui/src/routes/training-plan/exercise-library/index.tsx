import {
  Button,
  Checkbox,
  Label,
  ListBox,
  Modal,
  Pagination,
  SearchField,
  Select,
  Spinner,
} from '@heroui/react';

import {
  BODY_AREAS,
  type BodyArea,
  type ExerciseLibraryItem,
} from '@dall-fit/types';

import { trackExerciseLibraryAction } from '~/core/analytics';
import {
  bodyAreaLabels,
  exerciseTypeLabels,
} from '~/routes/training-plan/exercise-presentation';

import { exerciseLibraryStyles } from './styles';
import { LibraryThumbnail } from './thumbnail';
import {
  useExerciseLibrary,
  type ExerciseLibraryProps,
} from './use-exercise-library';

const styles = exerciseLibraryStyles();

export function ExerciseLibrary(props: Readonly<ExerciseLibraryProps>) {
  const { capacity, paused } = props;
  const {
    query,
    pageCount,
    selected,
    message,
    staleGroups,
    recovering,
    mutation,
    pending,
    close,
    toggle,
    refreshLibrary,
    recover,
    refreshImage,
    page,
    bodyArea,
    search,
    term,
    setBodyArea,
    setPage,
    setSearch,
  } = useExerciseLibrary(props);
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
      isDismissable={!pending}
      isKeyboardDismissDisabled={pending}
    >
      <Modal.Container size="lg">
        <Modal.Dialog
          aria-label="Copiar exercícios"
          className={styles.dialog()}
        >
          <Modal.Header>
            <Modal.Heading>Copiar exercícios</Modal.Heading>
          </Modal.Header>
          <Modal.Body className={styles.body()}>
            <LibraryFilters
              bodyArea={bodyArea}
              disabled={pending}
              onArea={(area) => {
                setBodyArea(area);
                setPage(1);
                trackExerciseLibraryAction('filter');
              }}
              onSearch={(value) => {
                setSearch(value);
                trackExerciseLibraryAction('search');
              }}
              search={search}
            />
            <p className={styles.description()}>
              Os exercícios selecionados são mantidos ao mudar a área do corpo
              ou a busca.
            </p>
            {query.isFetching ? (
              <Spinner aria-label="Carregando exercícios disponíveis" />
            ) : null}
            {query.isError ? (
              <div className={styles.message()} role="alert">
                Não foi possível carregar os exercícios.{' '}
                <Button
                  onPress={() => {
                    void refreshLibrary().catch(() => undefined);
                  }}
                  variant="ghost"
                >
                  Tentar novamente
                </Button>
              </div>
            ) : null}
            {query.isSuccess && query.data.data.length === 0 ? (
              <p className={styles.message()}>
                {term || bodyArea !== undefined
                  ? 'Nenhum exercício encontrado'
                  : 'Nenhum exercício disponível'}
              </p>
            ) : null}
            <div aria-label="Exercícios disponíveis" className={styles.list()}>
              {query.data?.data.map((item) => (
                <LibraryItem
                  checked={selected.some(
                    (entry) => entry.groupId === item.groupId,
                  )}
                  disabled={
                    pending ||
                    (selected.length >= capacity &&
                      !selected.some((entry) => entry.groupId === item.groupId))
                  }
                  item={item}
                  key={item.groupId}
                  onImageFailure={refreshImage}
                  onToggle={(checked) => toggle(item, checked)}
                />
              ))}
            </div>
            {selected.length >= capacity ? (
              <p className={styles.description()}>
                Você pode adicionar até {capacity} exercícios a este treino.
                Desmarque um item para escolher outro.
              </p>
            ) : null}
            <Pagination aria-label="Paginação dos exercícios disponíveis">
              <Pagination.Summary>
                Página {page} de {pageCount}
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous
                    isDisabled={pending || page <= 1}
                    onPress={() => {
                      setPage((current) => current - 1);
                      trackExerciseLibraryAction('page');
                    }}
                  >
                    Anterior
                  </Pagination.Previous>
                </Pagination.Item>
                <Pagination.Item>
                  <Pagination.Next
                    isDisabled={pending || page >= pageCount}
                    onPress={() => {
                      setPage((current) => current + 1);
                      trackExerciseLibraryAction('page');
                    }}
                  >
                    Próxima
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
            {message !== undefined ? (
              <p className={styles.message()} role="alert">
                {message}
              </p>
            ) : null}
            {staleGroups.length > 0 ? (
              <Button
                isDisabled={pending}
                onPress={() => {
                  void refreshLibrary().catch(() => undefined);
                }}
                variant="secondary"
              >
                Atualizar biblioteca
              </Button>
            ) : null}
            {paused ? (
              <div className={styles.message()} role="alert">
                <p>
                  A cópia precisa de uma leitura atual do treino. Recarregar
                  descarta os rascunhos e a seleção; revise os exercícios antes
                  de copiar novamente.
                </p>
                <Button
                  isPending={recovering}
                  onPress={() => {
                    void recover();
                  }}
                  variant="secondary"
                >
                  Recarregar treino e descartar rascunhos
                </Button>
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer className={styles.footer()}>
            <p aria-live="polite" className={styles.count()}>
              {selected.length}{' '}
              {selected.length === 1 ? 'selecionado' : 'selecionados'}
            </p>
            <div className={styles.actions()}>
              <Button isDisabled={pending} onPress={close} variant="secondary">
                Cancelar
              </Button>
              <Button
                isDisabled={
                  selected.length === 0 ||
                  selected.length > capacity ||
                  paused ||
                  staleGroups.length > 0
                }
                isPending={mutation.isPending}
                onPress={() => {
                  void mutation.mutateAsync().catch(() => undefined);
                }}
              >
                Copiar {selected.length}{' '}
                {selected.length === 1 ? 'exercício' : 'exercícios'}
              </Button>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function LibraryFilters({
  bodyArea,
  disabled,
  onArea,
  onSearch,
  search,
}: Readonly<{
  bodyArea?: BodyArea;
  disabled: boolean;
  onArea: (area?: BodyArea) => void;
  onSearch: (search: string) => void;
  search: string;
}>) {
  return (
    <div className={styles.filters()}>
      <SearchField isDisabled={disabled} onChange={onSearch} value={search}>
        <Label>Buscar exercício</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input autoFocus maxLength={120} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <Select
        isDisabled={disabled}
        onChange={(value) => {
          if (typeof value === 'string')
            onArea(value === 'all' ? undefined : (value as BodyArea));
        }}
        value={bodyArea ?? 'all'}
      >
        <Label>Área do corpo</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox
            items={[
              { id: 'all', label: 'Todas as áreas' },
              ...BODY_AREAS.map((id) => ({ id, label: bodyAreaLabels[id] })),
            ]}
          >
            {(item) => (
              <ListBox.Item id={item.id} textValue={item.label}>
                {item.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}

function LibraryItem({
  checked,
  disabled,
  item,
  onImageFailure,
  onToggle,
}: Readonly<{
  checked: boolean;
  disabled: boolean;
  item: ExerciseLibraryItem;
  onImageFailure: (expiration: string) => void;
  onToggle: (checked: boolean) => void;
}>) {
  const exercise = item.exercise;
  const name = exercise.type === 'pause' ? 'Pausa' : exercise.name;
  return (
    <Checkbox
      aria-label={`Selecionar ${name}`}
      className={styles.field()}
      isDisabled={disabled}
      isSelected={checked}
      onChange={onToggle}
    >
      <Checkbox.Content className={styles.row()}>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <LibraryThumbnail item={item} onImageFailure={onImageFailure} />
        <Label className={styles.label()}>
          <span className={styles.name()}>{name}</span>
          <span className={styles.metadata()}>
            {exerciseTypeLabels[exercise.type]} ·{' '}
            {'bodyArea' in exercise
              ? bodyAreaLabels[exercise.bodyArea]
              : 'Não se aplica'}
          </span>
        </Label>
      </Checkbox.Content>
    </Checkbox>
  );
}
