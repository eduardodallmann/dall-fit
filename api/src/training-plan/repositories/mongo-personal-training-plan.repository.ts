import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';

import type {
  GlobalTrainingPlanLibraryItem,
  GlobalTrainingPlanUsage,
  PersonalTrainingPlanListItem,
  TrainingPlanCloneJobItem,
} from '@dall-fit/types';

import type {
  GlobalTrainingPlanLibraryPage,
  GlobalTrainingPlanUsageMap,
  NewTrainingPlanCloneJob,
  PersonalCatalogEntry,
  PersonalTrainingPlanPage,
  TrainingPlanCloneJob,
  TrainingPlanCloneSnapshot,
  TrainingPlanCloneSnapshotDraft,
} from '~/training-plan/domain/personal-training-plan.entity';
import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';
import { PersonalTrainingPlanRepository } from '~/training-plan/repositories/personal-training-plan.repository';
import {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanCatalogDocument,
  TrainingPlanCloneJobDocument,
  type CloneJobState,
  type PersonalCatalogKind,
} from '~/training-plan/repositories/personal-training-plan.schema';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';

interface PlainCatalogEntry {
  _id: Types.ObjectId;
  createdAt: Date;
  globalTrainingPlanId: Types.ObjectId | null;
  kind: PersonalCatalogKind;
  personId: Types.ObjectId;
  trainingPlanId: Types.ObjectId | null;
  updatedAt: Date;
}

interface PlainActiveSelection {
  catalogEntryId?: Types.ObjectId;
  catalogEntryIds: Types.ObjectId[];
  personId: Types.ObjectId;
}

interface PlainImageVariant {
  etag?: string;
  key: string;
  width: number;
  height: number;
}

interface PlainExercise {
  _id: Types.ObjectId;
  bodyArea?: string;
  durationMinutes?: number;
  instructions?: string;
  image?: {
    display: PlainImageVariant;
    thumbnail: PlainImageVariant;
  } | null;
  name?: string;
  repetitions?: number;
  restSeconds?: number;
  sets?: number;
  type: StoredExercise['type'];
  youtubeId?: string;
}

interface PlainWorkout {
  _id: Types.ObjectId;
  exercises: PlainExercise[];
  name: string;
}

interface PlainPlan {
  _id: Types.ObjectId;
  createdAt: Date;
  description: string;
  name: string;
  ownerPersonId: Types.ObjectId | null;
  updatedAt: Date;
  version: number;
  workouts: PlainWorkout[];
}

interface PlainCloneJob {
  _id: Types.ObjectId;
  cancelRequestedAt: Date | null;
  completedImages: number;
  createdAt: Date;
  failureCategory: string | null;
  generation: number;
  globalTrainingPlanId: Types.ObjectId;
  personId: Types.ObjectId;
  snapshot: TrainingPlanCloneSnapshot;
  sourceName: string;
  state: CloneJobState;
  totalImages: number | null;
  updatedAt: Date;
  workflowRunId: string | null;
}

const visibleCloneStates: readonly CloneJobState[] = [
  'start-failed',
  'queued',
  'running',
  'materializing',
  'cancelling',
  'failed',
];

@Injectable()
export class MongoPersonalTrainingPlanRepository extends PersonalTrainingPlanRepository {
  private readonly logger = new Logger(
    MongoPersonalTrainingPlanRepository.name,
  );

  constructor(
    @InjectModel(PersonalTrainingPlanCatalogDocument.name)
    private readonly catalogModel: Model<PersonalTrainingPlanCatalogDocument>,
    @InjectModel(PersonalTrainingPlanActiveDocument.name)
    private readonly activeModel: Model<PersonalTrainingPlanActiveDocument>,
    @InjectModel(TrainingPlanCloneJobDocument.name)
    private readonly cloneJobModel: Model<TrainingPlanCloneJobDocument>,
    @InjectModel(TrainingPlanDocument.name)
    private readonly trainingPlanModel: Model<TrainingPlanDocument>,
  ) {
    super();
  }

  async list(
    personId: string,
    page: number,
    pageSize: number,
  ): Promise<PersonalTrainingPlanPage> {
    this.logger.log('MongoPersonalTrainingPlanRepository -> list -> params:', {
      params: { page, pageSize, personId },
    });
    await this.normalizeActiveSelection(personId);
    const [entries, jobs, active] = await Promise.all([
      this.catalogModel
        .find({ personId })
        .sort({ createdAt: -1, _id: -1 })
        .lean<PlainCatalogEntry[]>()
        .exec(),
      this.cloneJobModel
        .find({ personId, state: { $in: visibleCloneStates } })
        .sort({ createdAt: -1, _id: -1 })
        .lean<PlainCloneJob[]>()
        .exec(),
      this.activeModel
        .findOne({ personId })
        .lean<PlainActiveSelection>()
        .exec(),
    ]);
    const planIds = entries.flatMap((entry) => {
      const id =
        entry.kind === 'owned'
          ? entry.trainingPlanId
          : entry.globalTrainingPlanId;
      return id === null ? [] : [id];
    });
    const plans = await this.trainingPlanModel
      .find({ _id: { $in: planIds } })
      .select({
        createdAt: 1,
        description: 1,
        name: 1,
        updatedAt: 1,
        version: 1,
      })
      .lean<PlainPlan[]>()
      .exec();
    const plansById = new Map(plans.map((plan) => [plan._id.toString(), plan]));
    const planItems = entries.flatMap(
      (entry): PersonalTrainingPlanListItem[] => {
        const targetId =
          entry.kind === 'owned'
            ? entry.trainingPlanId
            : entry.globalTrainingPlanId;
        const plan =
          targetId === null ? undefined : plansById.get(targetId.toString());
        if (plan === undefined) return [];
        return [
          {
            active:
              active?.catalogEntryIds.some((id) => id.equals(entry._id)) ??
              false,
            catalogEntryId: entry._id.toString(),
            createdAt: plan.createdAt.toISOString(),
            description: plan.description,
            id: plan._id.toString(),
            itemType: 'training-plan',
            name: plan.name,
            source: entry.kind,
            updatedAt: plan.updatedAt.toISOString(),
            version: plan.version,
          },
        ];
      },
    );
    const jobItems = jobs.map((job) => this.mapPublicCloneJob(job));
    const items = [...planItems, ...jobItems].sort((left, right) => {
      const leftDate =
        left.itemType === 'clone-job' ? left.createdAt : left.updatedAt;
      const rightDate =
        right.itemType === 'clone-job' ? right.createdAt : right.updatedAt;
      return rightDate.localeCompare(leftDate);
    });
    const offset = (page - 1) * pageSize;
    const result = {
      activeCount: active?.catalogEntryIds.length ?? 0,
      data: items.slice(offset, offset + pageSize),
      total: items.length,
    };
    this.logger.log('MongoPersonalTrainingPlanRepository -> list -> return:', {
      data: { count: result.data.length, personId, total: result.total },
    });
    return result;
  }

  async listLibrary(
    personId: string,
    page: number,
    pageSize: number,
  ): Promise<GlobalTrainingPlanLibraryPage> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> listLibrary -> params:',
      { params: { page, pageSize, personId } },
    );
    const [plans, total, references, jobs] = await Promise.all([
      this.trainingPlanModel
        .find({ ownerPersonId: null })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<PlainPlan[]>()
        .exec(),
      this.trainingPlanModel.countDocuments({ ownerPersonId: null }).exec(),
      this.catalogModel
        .find({ kind: 'global-reference', personId })
        .select({ globalTrainingPlanId: 1 })
        .lean<PlainCatalogEntry[]>()
        .exec(),
      this.cloneJobModel
        .find({
          personId,
          state: { $in: ['queued', 'running', 'materializing', 'cancelling'] },
        })
        .select({ globalTrainingPlanId: 1 })
        .lean<PlainCloneJob[]>()
        .exec(),
    ]);
    const referenced = new Set(
      references.flatMap((entry) =>
        entry.globalTrainingPlanId === null
          ? []
          : [entry.globalTrainingPlanId.toString()],
      ),
    );
    const blocked = new Set(
      jobs.map((job) => job.globalTrainingPlanId.toString()),
    );
    const data = plans.map((plan) =>
      this.mapLibraryPlan(
        plan,
        referenced.has(plan._id.toString()),
        blocked.has(plan._id.toString()),
      ),
    );
    const result = { data, total };
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> listLibrary -> return:',
      { data: { count: data.length, personId, total } },
    );
    return result;
  }

  async createOwnedEntry(
    personId: string,
    trainingPlanId: string,
  ): Promise<PersonalCatalogEntry> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> createOwnedEntry -> params:',
      { params: { personId, trainingPlanId } },
    );
    const document = await this.catalogModel.create({
      globalTrainingPlanId: null,
      kind: 'owned',
      personId,
      trainingPlanId,
    });
    const result = this.mapCatalogEntry(document.toObject());
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> createOwnedEntry -> return:',
      { data: { catalogEntryId: result.id, personId, trainingPlanId } },
    );
    return result;
  }

  async createOwnedEntryWithId(
    catalogEntryId: string,
    personId: string,
    trainingPlanId: string,
  ): Promise<void> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> createOwnedEntryWithId -> params:',
      { params: { catalogEntryId, personId, trainingPlanId } },
    );
    await this.catalogModel
      .updateOne(
        { _id: catalogEntryId },
        {
          $setOnInsert: {
            globalTrainingPlanId: null,
            kind: 'owned',
            personId,
            trainingPlanId,
          },
        },
        { runValidators: true, upsert: true },
      )
      .exec();
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> createOwnedEntryWithId -> completed:',
      { data: { catalogEntryId, personId, trainingPlanId } },
    );
  }

  async createGlobalReference(
    personId: string,
    globalTrainingPlanId: string,
  ): Promise<PersonalCatalogEntry | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> createGlobalReference -> params:',
      { params: { globalTrainingPlanId, personId } },
    );
    try {
      const document = await this.catalogModel.create({
        globalTrainingPlanId,
        kind: 'global-reference',
        personId,
        trainingPlanId: null,
      });
      const result = this.mapCatalogEntry(document.toObject());
      this.logger.log(
        'MongoPersonalTrainingPlanRepository -> createGlobalReference -> return:',
        { data: { catalogEntryId: result.id, created: true, personId } },
      );
      return result;
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        this.logger.warn(
          'MongoPersonalTrainingPlanRepository -> createGlobalReference -> duplicate branch:',
          { data: { globalTrainingPlanId, personId } },
        );
        return null;
      }
      throw error;
    }
  }

  async findEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<PersonalCatalogEntry | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> findEntry -> params:',
      {
        params: { catalogEntryId, personId },
      },
    );
    const document = await this.catalogModel
      .findOne({ _id: catalogEntryId, personId })
      .lean<PlainCatalogEntry>()
      .exec();
    const result = document === null ? null : this.mapCatalogEntry(document);
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> findEntry -> return:',
      {
        data: { catalogEntryId, found: result !== null, personId },
      },
    );
    return result;
  }

  async deleteEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<PersonalCatalogEntry | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> deleteEntry -> params:',
      {
        params: { catalogEntryId, personId },
      },
    );
    const document = await this.catalogModel
      .findOneAndDelete({ _id: catalogEntryId, personId })
      .lean<PlainCatalogEntry>()
      .exec();
    const result = document === null ? null : this.mapCatalogEntry(document);
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> deleteEntry -> return:',
      {
        data: { catalogEntryId, deleted: result !== null, personId },
      },
    );
    return result;
  }

  async setActive(
    personId: string,
    catalogEntryId: string,
  ): Promise<readonly string[] | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> setActive -> params:',
      {
        params: { catalogEntryId, personId },
      },
    );
    await this.normalizeActiveSelection(personId);
    const entryId = new Types.ObjectId(catalogEntryId);
    let document = await this.activeModel
      .findOneAndUpdate(
        {
          personId,
          $or: [
            { catalogEntryIds: entryId },
            { 'catalogEntryIds.4': { $exists: false } },
          ],
        },
        { $addToSet: { catalogEntryIds: entryId } },
        { new: true, runValidators: true },
      )
      .lean<PlainActiveSelection>()
      .exec();
    if (document === null) {
      try {
        const created = await this.activeModel.create({
          catalogEntryIds: [entryId],
          personId,
        });
        document = created.toObject();
      } catch (error) {
        if (!this.isDuplicateKey(error)) throw error;
        document = await this.activeModel
          .findOneAndUpdate(
            {
              personId,
              $or: [
                { catalogEntryIds: entryId },
                { 'catalogEntryIds.4': { $exists: false } },
              ],
            },
            { $addToSet: { catalogEntryIds: entryId } },
            { new: true, runValidators: true },
          )
          .lean<PlainActiveSelection>()
          .exec();
      }
    }
    const result =
      document === null
        ? null
        : document.catalogEntryIds.map((id) => id.toString());
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> setActive -> return:',
      {
        data: { activeCount: result?.length ?? 5, personId },
      },
    );
    return result;
  }

  async setInactive(
    personId: string,
    catalogEntryId: string,
  ): Promise<readonly string[]> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> setInactive -> params:',
      { params: { catalogEntryId, personId } },
    );
    await this.normalizeActiveSelection(personId);
    const document = await this.activeModel
      .findOneAndUpdate(
        { personId },
        { $pull: { catalogEntryIds: new Types.ObjectId(catalogEntryId) } },
        { new: true },
      )
      .lean<PlainActiveSelection>()
      .exec();
    const result = document?.catalogEntryIds.map((id) => id.toString()) ?? [];
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> setInactive -> return:',
      { data: { activeCount: result.length, personId } },
    );
    return result;
  }

  async clearActiveIfEntry(
    personId: string,
    catalogEntryId: string,
  ): Promise<void> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> clearActiveIfEntry -> params:',
      { params: { catalogEntryId, personId } },
    );
    await this.normalizeActiveSelection(personId);
    await this.activeModel
      .updateOne(
        { personId },
        { $pull: { catalogEntryIds: new Types.ObjectId(catalogEntryId) } },
      )
      .exec();
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> clearActiveIfEntry -> completed:',
      { data: { catalogEntryId, personId } },
    );
  }

  async getActiveCatalogEntryIds(personId: string): Promise<readonly string[]> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> getActiveCatalogEntryIds -> params:',
      { params: { personId } },
    );
    await this.normalizeActiveSelection(personId);
    const document = await this.activeModel
      .findOne({ personId })
      .lean<PlainActiveSelection>()
      .exec();
    const result = document?.catalogEntryIds.map((id) => id.toString()) ?? [];
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> getActiveCatalogEntryIds -> return:',
      { data: { activeCount: result.length, personId } },
    );
    return result;
  }

  async getGlobalSnapshot(
    globalTrainingPlanId: string,
  ): Promise<TrainingPlanCloneSnapshotDraft | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> getGlobalSnapshot -> params:',
      { params: { globalTrainingPlanId } },
    );
    const plan = await this.trainingPlanModel
      .findOne({ _id: globalTrainingPlanId, ownerPersonId: null })
      .lean<PlainPlan>()
      .exec();
    const result = plan === null ? null : this.mapSnapshot(plan);
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> getGlobalSnapshot -> return:',
      { data: { found: result !== null, globalTrainingPlanId } },
    );
    return result;
  }

  async createCloneJob(
    input: NewTrainingPlanCloneJob,
  ): Promise<TrainingPlanCloneJob | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> createCloneJob -> params:',
      {
        params: {
          globalTrainingPlanId: input.globalTrainingPlanId,
          personId: input.personId,
          totalImages: input.totalImages,
        },
      },
    );
    try {
      const document = await this.cloneJobModel.create({
        cancelRequestedAt: null,
        completedImages: 0,
        deduplicationKey: `${input.personId}:${input.globalTrainingPlanId}`,
        failureCategory: null,
        generation: 1,
        globalTrainingPlanId: input.globalTrainingPlanId,
        personId: input.personId,
        snapshot: input.snapshot as unknown as Record<string, unknown>,
        sourceName: input.sourceName,
        state: 'queued',
        totalImages: input.totalImages,
        workflowRunId: null,
      });
      const result = this.mapCloneJob(
        document.toObject() as unknown as PlainCloneJob,
      );
      this.logger.log(
        'MongoPersonalTrainingPlanRepository -> createCloneJob -> return:',
        { data: { cloneJobId: result.cloneJobId, created: true } },
      );
      return result;
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        this.logger.warn(
          'MongoPersonalTrainingPlanRepository -> createCloneJob -> duplicate branch:',
          {
            data: {
              globalTrainingPlanId: input.globalTrainingPlanId,
              personId: input.personId,
            },
          },
        );
        return null;
      }
      throw error;
    }
  }

  async findCloneJob(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJob | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> findCloneJob -> params:',
      { params: { cloneJobId, personId } },
    );
    const document = await this.cloneJobModel
      .findOne({ _id: cloneJobId, personId })
      .lean<PlainCloneJob>()
      .exec();
    const result = document === null ? null : this.mapCloneJob(document);
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> findCloneJob -> return:',
      { data: { cloneJobId, found: result !== null, personId } },
    );
    return result;
  }

  async retryCloneJob(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJob | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> retryCloneJob -> params:',
      { params: { cloneJobId, personId } },
    );
    const queuedDocument = await this.cloneJobModel
      .findOne({ _id: cloneJobId, personId, state: 'queued' })
      .lean<PlainCloneJob>()
      .exec();
    if (queuedDocument !== null) {
      const queuedResult = this.mapCloneJob(queuedDocument);
      this.logger.log(
        'MongoPersonalTrainingPlanRepository -> retryCloneJob -> queued branch:',
        { data: { cloneJobId, generation: queuedResult.generation, personId } },
      );
      return queuedResult;
    }
    const document = await this.cloneJobModel
      .findOneAndUpdate(
        {
          _id: cloneJobId,
          personId,
          state: { $in: ['failed', 'start-failed'] },
        },
        {
          $inc: { generation: 1 },
          $set: {
            cancelRequestedAt: null,
            failureCategory: null,
            state: 'queued',
            workflowRunId: null,
          },
        },
        { returnDocument: 'after' },
      )
      .lean<PlainCloneJob>()
      .exec();
    const result = document === null ? null : this.mapCloneJob(document);
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> retryCloneJob -> return:',
      { data: { cloneJobId, retried: result !== null, personId } },
    );
    return result;
  }

  async retainedSourceImageKeys(
    globalTrainingPlanId: string,
  ): Promise<ReadonlySet<string>> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> retainedSourceImageKeys -> params:',
      { params: { globalTrainingPlanId } },
    );
    const jobs = await this.cloneJobModel
      .find({
        globalTrainingPlanId,
        state: { $in: visibleCloneStates },
      })
      .select({ snapshot: 1 })
      .lean<PlainCloneJob[]>()
      .exec();
    const result = new Set(
      jobs.flatMap((job) =>
        job.snapshot.workouts.flatMap((workout) =>
          workout.exercises.flatMap((exercise) =>
            !('image' in exercise) || exercise.image == null
              ? []
              : [exercise.image.thumbnail.key, exercise.image.display.key],
          ),
        ),
      ),
    );
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> retainedSourceImageKeys -> return:',
      { data: { count: result.size, globalTrainingPlanId } },
    );
    return result;
  }

  async markCloneJobStartFailed(
    personId: string,
    cloneJobId: string,
    generation: number,
  ): Promise<void> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> markCloneJobStartFailed -> params:',
      { params: { cloneJobId, generation, personId } },
    );
    await this.cloneJobModel
      .updateOne(
        { _id: cloneJobId, generation, personId, state: 'queued' },
        {
          $set: {
            failureCategory: 'scheduling-unavailable',
            state: 'start-failed',
          },
        },
      )
      .exec();
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> markCloneJobStartFailed -> completed:',
      { data: { cloneJobId, generation, personId } },
    );
  }

  async requestCloneJobCancellation(
    personId: string,
    cloneJobId: string,
  ): Promise<TrainingPlanCloneJob | null> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> requestCloneJobCancellation -> params:',
      { params: { cloneJobId, personId } },
    );
    const now = new Date();
    const document = await this.cloneJobModel
      .findOneAndUpdate(
        {
          _id: cloneJobId,
          personId,
          state: { $in: ['queued', 'running', 'failed', 'start-failed'] },
        },
        { $set: { cancelRequestedAt: now, state: 'cancelling' } },
        { returnDocument: 'after' },
      )
      .lean<PlainCloneJob>()
      .exec();
    const result = document === null ? null : this.mapCloneJob(document);
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> requestCloneJobCancellation -> return:',
      { data: { cancelledRequested: result !== null, cloneJobId, personId } },
    );
    return result;
  }

  async usageForGlobals(
    globalTrainingPlanIds: readonly string[],
  ): Promise<GlobalTrainingPlanUsageMap> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> usageForGlobals -> params:',
      { params: { count: globalTrainingPlanIds.length } },
    );
    const objectIds = globalTrainingPlanIds.map((id) => new Types.ObjectId(id));
    const linked = await this.catalogModel
      .find({
        globalTrainingPlanId: { $in: objectIds },
        kind: 'global-reference',
      })
      .select({ globalTrainingPlanId: 1 })
      .lean<PlainCatalogEntry[]>()
      .exec();
    const entryIds = linked.map((entry) => entry._id);
    const actives = await this.activeModel
      .find({
        $or: [
          { catalogEntryIds: { $in: entryIds } },
          { catalogEntryId: { $in: entryIds } },
        ],
      })
      .select({ catalogEntryId: 1, catalogEntryIds: 1 })
      .lean<PlainActiveSelection[]>()
      .exec();
    const activeIds = new Set(
      actives.flatMap((item) => [
        ...(item.catalogEntryIds ?? []).map((id) => id.toString()),
        ...(item.catalogEntryId === undefined
          ? []
          : [item.catalogEntryId.toString()]),
      ]),
    );
    const mutable = new Map<string, GlobalTrainingPlanUsage>();
    for (const id of globalTrainingPlanIds)
      mutable.set(id, { activePeople: 0, linkedPeople: 0 });
    for (const entry of linked) {
      if (entry.globalTrainingPlanId === null) continue;
      const id = entry.globalTrainingPlanId.toString();
      const current = mutable.get(id) ?? { activePeople: 0, linkedPeople: 0 };
      mutable.set(id, {
        activePeople:
          current.activePeople + (activeIds.has(entry._id.toString()) ? 1 : 0),
        linkedPeople: current.linkedPeople + 1,
      });
    }
    const result = mutable as GlobalTrainingPlanUsageMap;
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> usageForGlobals -> return:',
      { data: { count: result.size } },
    );
    return result;
  }

  async cleanupGlobalReferences(globalTrainingPlanId: string): Promise<void> {
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> cleanupGlobalReferences -> params:',
      { params: { globalTrainingPlanId } },
    );
    const entries = await this.catalogModel
      .find({ globalTrainingPlanId, kind: 'global-reference' })
      .select({ _id: 1 })
      .lean<PlainCatalogEntry[]>()
      .exec();
    const ids = entries.map((entry) => entry._id);
    await Promise.all([
      this.activeModel
        .updateMany({}, { $pull: { catalogEntryIds: { $in: ids } } })
        .exec(),
      this.activeModel
        .updateMany(
          { catalogEntryId: { $in: ids } },
          { $unset: { catalogEntryId: 1 } },
        )
        .exec(),
      this.catalogModel.deleteMany({ _id: { $in: ids } }).exec(),
    ]);
    this.logger.log(
      'MongoPersonalTrainingPlanRepository -> cleanupGlobalReferences -> completed:',
      { data: { globalTrainingPlanId, removedCount: ids.length } },
    );
  }

  private async normalizeActiveSelection(personId: string): Promise<void> {
    const legacy = await this.activeModel
      .findOne({ catalogEntryId: { $exists: true }, personId })
      .select({ catalogEntryId: 1 })
      .lean<PlainActiveSelection>()
      .exec();
    if (legacy?.catalogEntryId === undefined) return;
    await this.activeModel
      .updateOne(
        { catalogEntryId: legacy.catalogEntryId, personId },
        {
          $addToSet: { catalogEntryIds: legacy.catalogEntryId },
          $unset: { catalogEntryId: 1 },
        },
      )
      .exec();
  }

  private mapCatalogEntry(document: PlainCatalogEntry): PersonalCatalogEntry {
    return {
      createdAt: document.createdAt.toISOString(),
      globalTrainingPlanId: document.globalTrainingPlanId?.toString() ?? null,
      id: document._id.toString(),
      kind: document.kind,
      personId: document.personId.toString(),
      trainingPlanId: document.trainingPlanId?.toString() ?? null,
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private mapPublicCloneJob(document: PlainCloneJob): TrainingPlanCloneJobItem {
    return {
      cloneJobId: document._id.toString(),
      completedImages: document.completedImages,
      createdAt: document.createdAt.toISOString(),
      generation: document.generation,
      itemType: 'clone-job' as const,
      sourceName: document.sourceName,
      state:
        document.state === 'materializing'
          ? 'running'
          : (document.state as TrainingPlanCloneJobItem['state']),
      totalImages: document.totalImages,
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private mapCloneJob(document: PlainCloneJob): TrainingPlanCloneJob {
    return {
      cancelRequestedAt: document.cancelRequestedAt?.toISOString() ?? null,
      cloneJobId: document._id.toString(),
      completedImages: document.completedImages,
      createdAt: document.createdAt.toISOString(),
      failureCategory: document.failureCategory,
      generation: document.generation,
      globalTrainingPlanId: document.globalTrainingPlanId.toString(),
      personId: document.personId.toString(),
      snapshot: document.snapshot,
      sourceName: document.sourceName,
      state: document.state,
      totalImages: document.totalImages,
      updatedAt: document.updatedAt.toISOString(),
      workflowRunId: document.workflowRunId,
    };
  }

  private mapLibraryPlan(
    plan: PlainPlan,
    referenced: boolean,
    cloneBlocked: boolean,
  ): GlobalTrainingPlanLibraryItem {
    const workoutCount = plan.workouts.length;
    const exerciseCount = plan.workouts.reduce(
      (total, workout) => total + workout.exercises.length,
      0,
    );
    const workouts = plan.workouts.slice(0, 5).map((workout) => ({
      exerciseCount: workout.exercises.length,
      exercises: workout.exercises.slice(0, 3).map((exercise) => ({
        id: exercise._id.toString(),
        name: exercise.name ?? this.exerciseFallbackName(exercise.type),
        type: exercise.type,
      })),
      hiddenExerciseCount: Math.max(0, workout.exercises.length - 3),
      id: workout._id.toString(),
      name: workout.name,
    }));
    return {
      cloneBlocked,
      createdAt: plan.createdAt.toISOString(),
      description: plan.description,
      exerciseCount,
      hiddenWorkoutCount: Math.max(0, workoutCount - 5),
      id: plan._id.toString(),
      name: plan.name,
      referenced,
      updatedAt: plan.updatedAt.toISOString(),
      version: plan.version,
      workoutCount,
      workouts,
    };
  }

  private mapSnapshot(plan: PlainPlan): TrainingPlanCloneSnapshotDraft {
    return {
      description: plan.description,
      name: plan.name,
      sourceTrainingPlanId: plan._id.toString(),
      sourceVersion: plan.version,
      workouts: plan.workouts.map((workout) => ({
        exercises: workout.exercises.map((exercise) =>
          this.mapStoredExercise(exercise),
        ),
        id: workout._id.toString(),
        name: workout.name,
      })),
    };
  }

  private mapStoredExercise(exercise: PlainExercise): StoredExercise {
    const common = { id: exercise._id.toString(), type: exercise.type };
    if (exercise.type === 'pause')
      return {
        ...common,
        restSeconds: exercise.restSeconds ?? 1,
        type: 'pause',
      };
    const named = {
      bodyArea: exercise.bodyArea as Extract<
        StoredExercise,
        { type: 'duration' }
      >['bodyArea'],
      name: exercise.name ?? '',
    };
    if (exercise.type === 'duration')
      return {
        ...common,
        ...named,
        durationMinutes: exercise.durationMinutes ?? 1,
        ...(exercise.image === undefined
          ? {}
          : {
              image:
                exercise.image === null
                  ? null
                  : {
                      display: { ...exercise.image.display },
                      thumbnail: { ...exercise.image.thumbnail },
                    },
            }),
        ...(exercise.instructions === undefined
          ? {}
          : { instructions: exercise.instructions }),
        ...(exercise.youtubeId === undefined
          ? {}
          : { youtubeId: exercise.youtubeId }),
        type: 'duration',
      };
    if (exercise.type === 'youtube-long')
      return {
        ...common,
        ...named,
        type: 'youtube-long',
        youtubeId: exercise.youtubeId ?? '',
      };
    const sets = {
      ...named,
      repetitions: exercise.repetitions ?? 1,
      restSeconds: exercise.restSeconds ?? 0,
      sets: exercise.sets ?? 1,
    };
    if (exercise.type === 'image')
      return {
        ...common,
        ...sets,
        image:
          exercise.image === null || exercise.image === undefined
            ? null
            : {
                display: { ...exercise.image.display },
                thumbnail: { ...exercise.image.thumbnail },
              },
        type: 'image',
      };
    return {
      ...common,
      ...sets,
      type: 'youtube-short',
      youtubeId: exercise.youtubeId ?? '',
    };
  }

  private exerciseFallbackName(type: StoredExercise['type']): string {
    const result = type === 'pause' ? 'Pausa' : 'Exercício';
    return result;
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11_000
    );
  }
}
