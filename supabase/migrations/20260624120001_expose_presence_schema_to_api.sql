-- Expose presence schema to PostgREST without mixing deck data into catalog/plan/list.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, catalog, presence';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
