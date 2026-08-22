import type { RDSDataClient } from '@aws-sdk/client-rds-data';
import type { GeneratedWeeklyPlan } from '@macromap/domain';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ drizzle: vi.fn() }));

vi.mock('drizzle-orm/aws-data-api/pg', () => ({ drizzle: mocks.drizzle }));

import { createDataApiWeeklyPlanRepository } from './weekly-plan-data-api.js';

describe('Data API weekly plan repository', () => {
  it('stores the complete draft in one transaction', async () => {
    const selectResults: unknown[][] = [
      [{ householdId: '00000000-0000-4000-8000-000000000001' }],
      [],
    ];
    const inserted: unknown[] = [];
    const transaction = {
      insert: vi.fn(() => ({
        values: vi.fn(async (values: unknown) => inserted.push(values)),
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
    const repository = createDataApiWeeklyPlanRepository(
      {
        databaseName: 'macromap',
        resourceArn: 'resource-arn',
        secretArn: 'secret-arn',
      },
      {} as RDSDataClient,
    );

    const plan = weeklyPlan();
    const stored = await repository.replace('subject-1', plan);

    expect(stored).toMatchObject({ status: 'draft', version: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ draft: plan, status: 'draft' });
  });

  it('replaces the existing draft and advances its version', async () => {
    const selectResults: unknown[][] = [
      [{ householdId: '00000000-0000-4000-8000-000000000001' }],
      [{ id: '00000000-0000-4000-8000-000000000401', version: 3 }],
    ];
    const savePlan = vi.fn();
    const transaction = {
      insert: vi.fn(),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => selectResults.shift()),
        })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: savePlan })) })),
    };
    mocks.drizzle.mockReturnValue({
      transaction: vi.fn(async (work: (value: typeof transaction) => unknown) =>
        work(transaction),
      ),
    });
    const repository = createDataApiWeeklyPlanRepository(
      {
        databaseName: 'macromap',
        resourceArn: 'resource-arn',
        secretArn: 'secret-arn',
      },
      {} as RDSDataClient,
    );

    const stored = await repository.replace('subject-1', weeklyPlan());

    expect(stored).toMatchObject({
      id: '00000000-0000-4000-8000-000000000401',
      version: 4,
    });
    expect(savePlan).toHaveBeenCalledOnce();
    expect(transaction.insert).not.toHaveBeenCalled();
  });
});

function weeklyPlan(): GeneratedWeeklyPlan {
  return {
    days: Array.from({ length: 7 }, (_, day) => ({
      date: `2026-08-${String(24 + day).padStart(2, '0')}`,
      macros: [],
      slots: (['breakfast', 'lunch', 'dinner'] as const).map((mealType) => ({
        meal: {
          batchServings: 1.75,
          portions: [
            {
              personId: '00000000-0000-4000-8000-000000000101',
              servings: 1,
            },
            {
              personId: '00000000-0000-4000-8000-000000000102',
              servings: 0.75,
            },
          ],
          recipeId: '00000000-0000-4000-8000-000000000201',
          recipeTitle: 'Planning recipe',
        },
        mealType,
      })),
    })),
    diagnostics: [],
    seed: '2026-08-24',
    weekStart: '2026-08-24',
  };
}
