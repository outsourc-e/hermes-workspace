-- Workspace Core + Goblin Analytics API grants
-- Allows server-side Supabase secret/service role to use custom schemas through PostgREST.
-- Does not grant anon/authenticated browser access.

grant usage on schema workspace_core to service_role;
grant usage on schema goblin_analytics to service_role;

grant select, insert, update, delete on all tables in schema workspace_core to service_role;
grant select, insert, update, delete on all tables in schema goblin_analytics to service_role;
grant usage, select on all sequences in schema workspace_core to service_role;
grant usage, select on all sequences in schema goblin_analytics to service_role;

alter default privileges in schema workspace_core grant select, insert, update, delete on tables to service_role;
alter default privileges in schema goblin_analytics grant select, insert, update, delete on tables to service_role;
alter default privileges in schema workspace_core grant usage, select on sequences to service_role;
alter default privileges in schema goblin_analytics grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';
