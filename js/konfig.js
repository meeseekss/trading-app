// Öffentliche Zugangsdaten. Der anon-Schlüssel darf öffentlich sein, die Daten schützen die
// Zugriffsregeln in der Datenbank. Den Service-Schlüssel NIE hier eintragen.

export const konfig = {
  supabaseUrl: 'https://mhueskuqqecqxawtzizr.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1odWVza3VxcWVjcXhhd3R6aXpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NjA3NTcsImV4cCI6MjEwOTQzNjc1N30.k3fYn4ZqFqPLOfzgiymIt4BvDMvlzJo1fLdihD9Kva0',
  // Öffentlicher VAPID-Schlüssel für Mitteilungen (der private liegt nur in Supabase).
  pushSchluessel: 'BC1rpRyc6V3pNc2gRt4cb9CyfbmKjzMtob77M-33wfprB12yz2q_lstPw6qaOEBVDZvnZjT1dEAfboB4wSqxeD4',
  // Zeigt „Konto erstellen“. Seit der ersten Anmeldung aus.
  registrierung: false,
};
