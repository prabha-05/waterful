-- Poster images for video creatives (2026-08). Without one, every card had to
-- download the video itself to draw a thumbnail (29 videos × tens of MB, on
-- every visit). Posters are small JPEGs captured at upload time (or healed on
-- first view) and stored beside the file in the `creatives` bucket.
alter table public.creative_files
  add column if not exists poster_path text;
