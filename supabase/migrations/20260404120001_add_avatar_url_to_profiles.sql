-- Add avatar_url column to profiles table for storing user profile pictures
alter table profiles add column if not exists avatar_url text;

-- Create index for faster lookups if needed
create index if not exists idx_profiles_avatar_url on profiles(avatar_url);
