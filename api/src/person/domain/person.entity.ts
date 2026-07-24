import type { Person } from '@dall-fit/types';

export interface PersonEntity extends Person {
  googleSubject: string;
}

export interface NewPerson {
  googleSubject: string;
  name: string;
  email: string;
  photoUrl: string | null;
}
