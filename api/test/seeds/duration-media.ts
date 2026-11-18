import { writeFile } from 'node:fs/promises';

import { Types, type Model } from 'mongoose';
import sharp from 'sharp';

import type { PersonDocument } from '~/person/repositories/person.schema';
import type {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanCatalogDocument,
} from '~/training-plan/repositories/personal-training-plan.schema';
import type { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';

export async function seedDurationMedia(
  models: {
    personModel: Model<PersonDocument>;
    trainingPlanModel: Model<TrainingPlanDocument>;
    catalogModel: Model<PersonalTrainingPlanCatalogDocument>;
    activeModel: Model<PersonalTrainingPlanActiveDocument>;
  },
  seedSession: (
    personId: string,
    channel: 'native',
    outputFile: string,
  ) => Promise<void>,
): Promise<void> {
  const personId = new Types.ObjectId('110000000000000000000010');
  const planId = new Types.ObjectId('110000000000000000000001');
  const catalogId = new Types.ObjectId('110000000000000000000020');
  await models.personModel
    .findOneAndUpdate(
      { _id: personId },
      {
        $set: {
          googleSubject: 'google-fit110-fixture',
          name: 'Pessoa FIT110',
          email: 'fit110@example.test',
          photoUrl: null,
        },
      },
      { upsert: true },
    )
    .exec();
  await models.trainingPlanModel.deleteMany({ _id: planId }).exec();
  const personal = await models.trainingPlanModel.create({
    _id: planId,
    ownerPersonId: personId,
    name: 'Mídia de duração',
    description: 'Fixture sintética FIT110.',
    version: 0,
    workouts: [
      {
        _id: new Types.ObjectId('110000000000000000000101'),
        name: 'Duração',
        exercises: [
          {
            _id: new Types.ObjectId('110000000000000000000201'),
            type: 'duration',
            name: 'Alongamento',
            bodyArea: 'other',
            durationMinutes: 2,
            instructions: 'Mantenha a posição confortável.',
            youtubeId: 'ir-XXTWVm7g',
          },
        ],
      },
    ],
  });
  const adminId = new Types.ObjectId('110000000000000000000011');
  const globalId = new Types.ObjectId('110000000000000000000003');
  await models.personModel
    .findOneAndUpdate(
      { _id: adminId },
      {
        $set: {
          googleSubject: 'google-fit110-admin',
          name: 'Admin FIT110',
          email: 'admin110@example.test',
          photoUrl: null,
          isAdmin: true,
        },
      },
      { upsert: true },
    )
    .exec();
  await models.trainingPlanModel.deleteMany({ _id: globalId }).exec();
  await models.trainingPlanModel.create({
    _id: globalId,
    ownerPersonId: null,
    name: 'Global de duração',
    description: 'Origem sintética FIT110.',
    version: 0,
    workouts: personal.toObject().workouts,
  });
  await seedSession(
    adminId.toString(),
    'native',
    '/tmp/dall-fit-duration-admin-token.txt',
  );
  await models.catalogModel
    .findOneAndUpdate(
      { _id: catalogId },
      {
        $set: {
          kind: 'owned',
          personId,
          trainingPlanId: planId,
          globalTrainingPlanId: null,
        },
      },
      { upsert: true },
    )
    .exec();
  await models.activeModel
    .findOneAndUpdate(
      { personId },
      { $set: { catalogEntryIds: [catalogId] } },
      { upsert: true },
    )
    .exec();
  await writeFile(
    '/tmp/dall-fit-duration.png',
    await sharp({
      create: { width: 160, height: 160, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer(),
    { mode: 0o600 },
  );
  await seedSession(
    personId.toString(),
    'native',
    '/tmp/dall-fit-duration-token.txt',
  );
}
