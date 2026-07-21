-- Workspace Core + Goblin Analytics PostgREST schema exposure
-- Required for Supabase REST/Data API to serve these custom schemas.
-- RLS remains enabled and no anon/authenticated policies are created here.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, workspace_core, goblin_analytics';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
