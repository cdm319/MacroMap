import {
  ExecuteStatementCommand,
  type RDSDataClient,
} from '@aws-sdk/client-rds-data';
import { describe, expect, it, vi } from 'vitest';
import { createDataApiRecipeRepository } from './recipe-data-api.js';

describe('Data API recipe list', () => {
  it('searches titles and ingredients before applying stable title pagination', async () => {
    const commands: ExecuteStatementCommand[] = [];
    class FakeDataClient {
      public readonly send = vi.fn(async (command: ExecuteStatementCommand) => {
        commands.push(command);
        return commands.length === 1
          ? {
              records: [
                [
                  {
                    stringValue: '00000000-0000-4000-8000-000000000001',
                  },
                ],
              ],
            }
          : { records: [] };
      });
    }
    const client = new FakeDataClient() as unknown as RDSDataClient;
    const repository = createDataApiRecipeRepository(
      {
        databaseName: 'macromap',
        resourceArn: 'resource-arn',
        secretArn: 'secret-arn',
      },
      client,
    );

    const page = await repository.list('subject-1', {
      cursor: {
        id: '00000000-0000-4000-8000-000000000201',
        sort: 'title',
        titleKey: 'lemon chicken',
      },
      search: '50% chicken_\\',
      sort: 'title',
    });

    expect(page).toEqual({ items: [], nextCursor: null });
    const listCommand = commands[1];
    expect(listCommand?.input.sql).toContain('lower("recipe"."title")');
    expect(listCommand?.input.sql).toContain('ilike');
    expect(listCommand?.input.sql).toContain('recipe_ingredient');
    expect(listCommand?.input.sql).toContain(
      'order by lower("recipe"."title") asc',
    );
    expect(
      listCommand?.input.parameters?.map((parameter) =>
        'stringValue' in (parameter.value ?? {})
          ? parameter.value?.stringValue
          : undefined,
      ),
    ).toContain('%50\\% chicken\\_\\\\%');
  });
});
