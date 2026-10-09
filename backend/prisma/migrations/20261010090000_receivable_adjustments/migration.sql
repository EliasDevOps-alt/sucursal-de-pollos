-- Ajustes de deuda: saldos iniciales al empezar a usar el sistema y correcciones autorizadas (solo Administración).
INSERT INTO "permissions" ("id", "code", "module", "description") VALUES
  (gen_random_uuid(), 'receivables.adjust', 'collections', 'Cargar saldos iniciales y ajustar la deuda de un cliente')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r JOIN "permissions" p ON r.code = 'ADMIN' AND p.code = 'receivables.adjust'
ON CONFLICT DO NOTHING;
