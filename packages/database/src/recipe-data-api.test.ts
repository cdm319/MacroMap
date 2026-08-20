import type { RDSDataClient } from '@aws-sdk/client-rds-data';
import type { RecipeInput } from '@macromap/contracts';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ drizzle: vi.fn() }));

vi.mock('drizzle-orm/aws-data-api/pg', () => ({ drizzle: mocks.drizzle }));

import { createDataApiRecipeRepository } from './recipe-data-api.js';

describe('Data API recipe repository', () => {
  it('saves a library-only recipe without inserting empty tags', async () => {
    const selectResults: unknown[][] = [
      [{ householdId: '00000000-0000-4000-8000-000000000001' }],
      [],
    ];
    const transaction = {
      insert: vi.fn(() => ({
        values: vi.fn(async (values: unknown) => {
          if (Array.isArray(values) && values.length === 0) {
            throw new Error('Cannot insert an empty array.');
          }
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => selectResults.shift()),
        })),
      })),
    };
    mocks.drizzle.mockReturnValue({
      transaction: vi.fn(async (work: (value: typeof transaction) => unknown) =>
        work(transaction),
      ),
    });
    const repository = createDataApiRecipeRepository(
      {
        databaseName: 'macromap',
        resourceArn: 'resource-arn',
        secretArn: 'secret-arn',
      },
      {} as RDSDataClient,
    );
    const recipe: RecipeInput = {
      description: 'Saved for reference.',
      ingredients: [
        {
          name: 'Dark chocolate',
          preparationNote: '',
          quantity: 100,
          unit: 'g',
        },
      ],
      instructions: [],
      mealTypes: [],
      nutrition: null,
      servingCount: 4,
      source: null,
      tags: { cuisines: [], flavours: [], proteins: [] },
      title: 'Chocolate mousse',
    };

    const saved = await repository.save(
      'subject-1',
      '00000000-0000-4000-8000-000000000201',
      recipe,
      null,
    );

    expect(saved?.planningStatus).toBe('library-only');
    expect(transaction.insert).toHaveBeenCalledTimes(2);
  });
});
