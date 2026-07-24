export type EntityId = string;
export type Timestamp = string;

export interface Entity {
  id: EntityId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Person extends Entity {
  name: string;
  email: string;
  photoUrl: string | null;
}
