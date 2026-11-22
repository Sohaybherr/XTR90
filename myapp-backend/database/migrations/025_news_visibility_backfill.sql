UPDATE news
SET
    published = TRUE,
    ai_completed = TRUE,
    processing_status = 'completed'
WHERE title IS NOT NULL
  AND url IS NOT NULL;
