-- 031: PROXe Listen source variety. Add reddit and blog to the source enum so
-- the inbox and evidence board can carry the full social mix.
ALTER TABLE listen_signals DROP CONSTRAINT IF EXISTS listen_signals_source_check;
ALTER TABLE listen_signals ADD CONSTRAINT listen_signals_source_check CHECK (source IN
  ('twitter','facebook','instagram','youtube','news','whatsapp_trend',
   'complaint','call_centre','volunteer_report','survey','reddit','blog'));
