BEGIN;

ALTER TABLE user_favorites
    DROP CONSTRAINT IF EXISTS user_favorites_entity_type_check,
    ADD CONSTRAINT user_favorites_entity_type_check
        CHECK (entity_type IN ('competition', 'team', 'player', 'match', 'news'));

COMMIT;
