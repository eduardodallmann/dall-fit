import type {
  GlobalTrainingPlanLibraryPage,
  GlobalTrainingPlanUsageMap,
  NewTrainingPlanCloneJob,
  PersonalCatalogEntry,
  PersonalTrainingPlanPage,
  TrainingPlanCloneJob,
  TrainingPlanCloneSnapshotDraft,
} from '~/training-plan/domain/personal-training-plan.entity';

export abstract class PersonalTrainingPlanRepository {
  abstract list(
    personId: string,
    page: number,
    pageSize: number,
  ): Promise<PersonalTrainingPlanPage>;
  abstract listLibrary(
    personId: string,
    page: number,
    pageSize: number,
  ): Promise<GlobalTrainingPlanLibraryPage>;
  abstract createOwnedEntry(
    personId: string,
    trainingPlanId: string,
  ): Promise<PersonalCatalogEntry>;
  abstract createOwnedEntryWithId(
    catalogEntryId: string,
    personId: string,
    trainingPlanId: string,
  ): Promise<void>;
  abstract createGlobalReference(
    personId: string,
    globalTrainingPlanId: string,
  ): Promise<PersonalCatalogEntry | null>;
  abstract findEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<PersonalCatalogEntry | null>;
  abstract deleteEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<PersonalCatalogEntry | null>;
  abstract setActive(
    personId: string,
    catalogEntryId: string,
  ): Promise<readonly string[] | null>;
  abstract setInactive(
    personId: string,
    catalogEntryId: string,
  ): Promise<readonly string[]>;
  abstract clearActiveIfEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<void>;
  abstract getActiveCatalogEntryIds(
    personId: string,
  ): Promise<readonly string[]>;
  abstract getGlobalSnapshot(
    globalTrainingPlanId: string,
  ): Promise<TrainingPlanCloneSnapshotDraft | null>;
  abstract createCloneJob(
    input: NewTrainingPlanCloneJob,
  ): Promise<TrainingPlanCloneJob | null>;
  abstract findCloneJob(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJob | null>;
  abstract retryCloneJob(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJob | null>;
  abstract markCloneJobStartFailed(
    personId: string,
    cloneJobId: string,
    generation: number,
  ): Promise<void>;
  abstract requestCloneJobCancellation(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJob | null>;
  abstract usageForGlobals(
    globalTrainingPlanIds: readonly string[],
  ): Promise<GlobalTrainingPlanUsageMap>;
  abstract retainedSourceImageKeys(
    globalTrainingPlanId: string,
  ): Promise<ReadonlySet<string>>;
  abstract cleanupGlobalReferences(globalTrainingPlanId: string): Promise<void>;
}
