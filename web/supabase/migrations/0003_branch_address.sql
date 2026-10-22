-- =============================================================================
-- FDs & OD Tracker: branch postal address for the closure letter.
--
-- Run after 0002_fd_tracker.sql. The Close OD(s) wizard prints a closure letter
-- addressed to "The Manager, <bank>, <branch>, <address>" and signs it from the
-- branch's locality, e.g. 'Mananchira, Kozhikode'. Nullable: the letter just
-- leaves the address line out when it is not set.
-- =============================================================================

alter table public.branches
  add column if not exists address text;
