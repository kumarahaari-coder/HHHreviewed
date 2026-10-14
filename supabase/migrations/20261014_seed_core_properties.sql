-- ============================================================================
-- Seed the 4 canonical HHH properties (idempotent).
-- site_properties.property_id has a FOREIGN KEY to properties(id) and /r/* redirects
-- require an ACTIVE properties row, so site booking-destination setup fails on a
-- database where these rows are missing (e.g. after a wipe).
-- Hostaway listing IDs are the real listings (595515-595518).
-- ============================================================================
INSERT INTO public.properties
  (id, property_name, hospitable_property_id, ownerrez_property_id, hostaway_listing_id, location, timezone, image_url, status)
VALUES
  ('55791a54-b1a3-459e-bbd5-9073a418b774', 'Beech Mountain, North Carolina',    'e5552f35-6f5a-4afc-afd1-d0a676e98dc4', 495423, 595515, 'Beech Mountain, NC', 'America/New_York', 'https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-beeach-img1-scaled.webp', 'active'),
  ('f0fb867d-47cd-47d4-afa6-c4bf226c1768', 'Downtown St. Augustine (Lincoln)',  '5da25edc-88ac-43c4-876a-f7b626c88ecd', 495794, 595516, 'St. Augustine, FL', 'America/New_York', 'https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-down-img1-scaled.webp', 'active'),
  ('38d9159e-a35d-405e-826e-7381ad3c3197', 'Uptown St. Augustine',              '058aed01-470f-4ca7-a191-37c597e7f377', 495793, 595517, 'St. Augustine, FL', 'America/New_York', 'https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-updown-img1-scaled.webp', 'active'),
  ('51be6158-268d-4c96-8f0b-9968f544ddfa', 'Ellsworth, Maine',                  'abe5540b-8cbc-4bc2-b561-b25f7d4d35b0', 495795, 595518, 'Ellsworth, ME', 'America/New_York', 'https://hiddenhoneyhomes.com/wp-content/uploads/2026/03/image1.jpg', 'active')
ON CONFLICT (id) DO UPDATE SET
  property_name          = EXCLUDED.property_name,
  hospitable_property_id = COALESCE(public.properties.hospitable_property_id, EXCLUDED.hospitable_property_id),
  ownerrez_property_id   = COALESCE(public.properties.ownerrez_property_id, EXCLUDED.ownerrez_property_id),
  hostaway_listing_id    = EXCLUDED.hostaway_listing_id,
  location               = COALESCE(public.properties.location, EXCLUDED.location),
  timezone               = COALESCE(public.properties.timezone, EXCLUDED.timezone),
  image_url              = COALESCE(public.properties.image_url, EXCLUDED.image_url),
  status                 = 'active';
