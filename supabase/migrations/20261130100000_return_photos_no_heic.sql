-- Return photos: HEIC/HEIF are no longer accepted. Most desktop browsers cannot show them, so staff could not see the customer's photo.
-- (An iPhone converts a photo to JPEG by itself when the file picker does not offer HEIC.) Photos already stored are left alone.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'return-photos';
