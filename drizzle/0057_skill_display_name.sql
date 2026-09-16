-- Keep the existing sync field as a projection of the note's editable title.
CREATE FUNCTION skill_name_from_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT title INTO STRICT NEW.name FROM notes WHERE id = NEW.note_id FOR SHARE;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER skill_name_from_note BEFORE INSERT OR UPDATE ON skills
FOR EACH ROW EXECUTE FUNCTION skill_name_from_note();
--> statement-breakpoint
CREATE FUNCTION refresh_skill_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE skills SET name = NEW.title WHERE note_id = NEW.id AND name IS DISTINCT FROM NEW.title;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER refresh_skill_name AFTER UPDATE OF title ON notes
FOR EACH ROW WHEN (OLD.title IS DISTINCT FROM NEW.title) EXECUTE FUNCTION refresh_skill_name();
--> statement-breakpoint
UPDATE skills SET name = notes.title FROM notes
WHERE skills.note_id = notes.id AND skills.name IS DISTINCT FROM notes.title;
