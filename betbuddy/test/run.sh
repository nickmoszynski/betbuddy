#!/bin/bash
# Runs the migration + scenarios against a throwaway local Postgres database
set -e
cd "$(dirname "$0")/.."
su postgres -c "dropdb --if-exists bbtest; createdb bbtest"
su postgres -c "psql -v ON_ERROR_STOP=1 -q -d bbtest -f test/00_supabase_stub.sql -f supabase/migrations/001_betbuddy.sql -f supabase/migrations/002_push.sql -f supabase/migrations/003_stats.sql -f supabase/migrations/004_teams_events.sql -f supabase/migrations/005_teams_seed.sql -f supabase/migrations/005_teams_seed.sql -c \"insert into app_config values ('field_enabled','true')\" -f test/01_scenarios.sql -f test/03_push.sql -f test/04_stats.sql -f test/05_field_off.sql -f test/06_h2h.sql"
