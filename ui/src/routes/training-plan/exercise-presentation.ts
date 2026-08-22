import {
  CirclePause,
  Clock,
  FileImage,
  TvMinimalPlay,
  Video,
  type LucideIcon,
} from 'lucide-react';

import type { BodyArea, Exercise } from '@dall-fit/types';

export const bodyAreaLabels: Record<BodyArea, string> = {
  stretching: 'Alongamentos',
  abdomen: 'Abdômen',
  quadriceps: 'Quadríceps',
  mobility: 'Mobilidade',
  other: 'Outros',
  chest: 'Peito',
  shoulder: 'Ombro',
  triceps: 'Tríceps',
  back: 'Costas',
  biceps: 'Bíceps',
  'lower-back': 'Lombar',
  glutes: 'Glúteo',
  calf: 'Panturrilha',
  adductor: 'Adutor',
  hamstrings: 'Posterior de coxa',
  cardio: 'Cardio',
};

export const exerciseTypeLabels: Record<Exercise['type'], string> = {
  'youtube-short': 'YouTube Short',
  image: 'Imagem',
  'youtube-long': 'YouTube Longo',
  pause: 'Pausa',
  duration: 'Duração',
};

export const exerciseTypeIcons: Record<Exercise['type'], LucideIcon> = {
  'youtube-short': Video,
  'youtube-long': TvMinimalPlay,
  image: FileImage,
  pause: CirclePause,
  duration: Clock,
};
