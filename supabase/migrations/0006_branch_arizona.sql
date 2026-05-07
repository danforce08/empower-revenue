-- Empower Revenue Dashboard — branch label alignment
-- Jobflo emits "Arizona" as the branch name; our seed used "Phoenix". Rename
-- so uploads match the existing branch row instead of landing as null.
-- (key column stays `phoenix` to avoid breaking any existing FK references.)

update public.branches set name = 'Arizona' where key = 'phoenix';
