import { useEffect, useRef, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';

import type {
  BodyArea,
  ExerciseLibraryItem,
  ExerciseLibrarySelection,
} from '@dall-fit/types';

import {
  getActiveSessionGeneration,
  isSessionGenerationActive,
} from '~/auth/session-lifecycle';
import { trackExerciseLibraryAction, trackUiEvent } from '~/core/analytics';
import {
  classifyHttpFailure,
  isExpectedCancellation,
} from '~/core/http/http-error';
import {
  getSignedImageRefreshDelay,
  isSignedImageNearExpiration,
} from '~/routes/training-plan/signed-image-urls';
import { exerciseLibraryQueryOptions } from '~/routes/training-plan/training-plan-queries';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';

export interface ExerciseLibraryProps {
  capacity: number;
  mockScenario: MockTrainingPlansScenario;
  paused: boolean;
  onClose: () => void;
  onCopy: (selections: readonly ExerciseLibrarySelection[]) => Promise<void>;
  onRecover: () => Promise<void>;
  onUnsavedChange: (dirty: boolean) => void;
}

export function useExerciseLibrary({
  mockScenario,
  onClose,
  onCopy,
  onRecover,
  onUnsavedChange,
}: Readonly<ExerciseLibraryProps>) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [bodyArea, setBodyArea] = useState<BodyArea>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<readonly ExerciseLibraryItem[]>([]);
  const [message, setMessage] = useState<string>();
  const [staleGroups, setStaleGroups] = useState<readonly string[]>([]);
  const [recovering, setRecovering] = useState(false);
  const generation = useRef(getActiveSessionGeneration());
  const refreshedExpirations = useRef(new Set<string>());
  const query = useQuery(
    exerciseLibraryQueryOptions({ page, search: term, bodyArea }, mockScenario),
  );
  const refetch = query.refetch;
  const pageCount = Math.max(
    1,
    Math.min(100, Math.ceil((query.data?.total ?? 0) / 20)),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    onUnsavedChange(selected.length > 0);
    return () => onUnsavedChange(false);
  }, [onUnsavedChange, selected.length]);
  useEffect(() => {
    const delay = getSignedImageRefreshDelay(
      query.data?.data.map((item) => item.exercise) ?? [],
    );
    if (delay === undefined) return;
    const timer = setTimeout(() => {
      void refetch().catch(() => undefined);
    }, delay);
    const visible = () => {
      if (document.visibilityState === 'visible')
        void refetch().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [query.data, refetch]);
  if (query.data !== undefined && page > pageCount) setPage(pageCount);

  const mutation = useMutation({
    mutationFn: async () => {
      setMessage(undefined);
      await onCopy(
        selected.map(({ exercise: _exercise, ...selection }) => selection),
      );
    },
    onSuccess: () => {
      if (isSessionGenerationActive(generation.current)) onClose();
    },
    onError: (error: unknown) => {
      if (
        isExpectedCancellation(error) ||
        !isSessionGenerationActive(generation.current)
      )
        return;
      const failure = classifyHttpFailure(error);
      if (
        failure.status === 409 &&
        failure.code === 'EXERCISE_LIBRARY_SELECTION_STALE'
      ) {
        setStaleGroups(readStaleGroups(error, selected));
        setMessage(
          'Alguns exercícios mudaram. Atualize a biblioteca e selecione-os novamente.',
        );
      } else if (
        failure.status === 409 &&
        failure.code === 'EXERCISE_LIMIT_REACHED'
      ) {
        setMessage(
          'O treino não tem espaço para todos os selecionados. Revise a seleção.',
        );
      } else if (
        failure.status === 409 &&
        failure.code === 'TRAINING_PLAN_SIZE_LIMIT_REACHED'
      ) {
        setMessage(
          'O plano atingiu o limite de tamanho. Revise o treino antes de copiar.',
        );
      } else {
        setMessage(
          'Não foi possível confirmar a cópia. A seleção foi preservada.',
        );
      }
    },
    retry: false,
  });
  const pending = mutation.isPending || recovering;
  const close = () => {
    if (pending) return;
    trackUiEvent({
      eventName: 'ui_overlay_closed',
      overlay: 'exercise_library',
      reason: 'cancel',
      control: 'copy_exercises',
      surface: 'workout',
    });
    onClose();
  };
  const toggle = (item: ExerciseLibraryItem, checked: boolean) => {
    trackExerciseLibraryAction(checked ? 'select' : 'deselect');
    setSelected((current) =>
      checked
        ? [...current.filter((entry) => entry.groupId !== item.groupId), item]
        : current.filter((entry) => entry.groupId !== item.groupId),
    );
  };
  const refreshLibrary = async () => {
    trackExerciseLibraryAction('retry');
    const result = await refetch();
    if (result.isError || !isSessionGenerationActive(generation.current))
      return;
    setSelected((current) =>
      current.filter((item) => !staleGroups.includes(item.groupId)),
    );
    setStaleGroups([]);
    setMessage(undefined);
  };
  const recover = async () => {
    trackExerciseLibraryAction('retry');
    setRecovering(true);
    try {
      await onRecover();
      if (isSessionGenerationActive(generation.current)) closeRecovered();
    } catch (error: unknown) {
      if (
        !isExpectedCancellation(error) &&
        isSessionGenerationActive(generation.current)
      )
        setMessage('Não foi possível recarregar o treino. Tente novamente.');
    } finally {
      setRecovering(false);
    }
  };
  const closeRecovered = () => {
    trackUiEvent({
      eventName: 'ui_overlay_closed',
      overlay: 'exercise_library',
      reason: 'confirm',
      control: 'copy_exercises',
      surface: 'workout',
    });
    onClose();
  };
  const refreshImage = (expiration: string) => {
    if (
      !isSignedImageNearExpiration(expiration) ||
      refreshedExpirations.current.has(expiration)
    )
      return;
    refreshedExpirations.current.add(expiration);
    void refetch().catch(() => undefined);
  };

  return {
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
  };
}

function readStaleGroups(
  error: unknown,
  selected: readonly ExerciseLibraryItem[],
): readonly string[] {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === 'object' && data !== null && 'details' in data) {
      const details = data.details;
      if (
        typeof details === 'object' &&
        details !== null &&
        'staleGroupIds' in details
      ) {
        const ids: unknown = details.staleGroupIds;
        if (Array.isArray(ids))
          return ids.filter((id): id is string => typeof id === 'string');
      }
    }
  }
  return selected.map((item) => item.groupId);
}
