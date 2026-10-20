import { expect, test } from '../../src/fixtures';

test('legacy GraphQL returns permit types', { tag: '@smoke' }, async ({ gql, env }) => {
  expect(env.graphqlUrl).toMatch(/\/graphql$/);
  const response = await gql.send('{ permitTypes { code name } }');
  expect(response.status).toBe(200);

  const body = response.body as { data: { permitTypes: { code: string; name: string }[] } };
  expect(body.data.permitTypes).toHaveLength(6);
});
