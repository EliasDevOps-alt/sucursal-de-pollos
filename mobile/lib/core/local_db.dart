import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'models.dart';

/// Base local del teléfono: catálogo, clientes, pedidos y cola de salida (outbox).
/// Lo que se guarda aquí sobrevive a cierres de la app y reinicios del teléfono.
class LocalDb {
  LocalDb._(this._db);
  final Database _db;

  static Future<LocalDb> open({DatabaseFactory? factory, String? path}) async {
    final f = factory ?? databaseFactory;
    final dbPath = path ?? p.join(await f.getDatabasesPath(), 'preventa.db');
    final db = await f.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, _) async {
          await db.execute('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
          await db.execute('CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, json TEXT)');
          await db.execute('CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT, json TEXT)');
          await db.execute('CREATE TABLE customer_types (id TEXT PRIMARY KEY, name TEXT)');
          await db.execute('CREATE TABLE presales (id TEXT PRIMARY KEY, created_at TEXT, json TEXT)');
          await db.execute(
              'CREATE TABLE outbox (id TEXT PRIMARY KEY, type TEXT, payload TEXT, created_at TEXT, state TEXT, error TEXT, attempts INTEGER)');
        },
      ),
    );
    return LocalDb._(db);
  }

  Future<void> close() => _db.close();

  // ── Clave/valor ─────────────────────────────────────────
  Future<String?> getValue(String key) async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: [key]);
    return rows.isEmpty ? null : rows.first['value'] as String?;
  }

  Future<void> setValue(String key, String? value) async {
    if (value == null) {
      await _db.delete('kv', where: 'key = ?', whereArgs: [key]);
    } else {
      await _db.insert('kv', {'key': key, 'value': value}, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  // ── Catálogo ────────────────────────────────────────────
  Future<List<Product>> products() async => (await _db.query('products', orderBy: 'name'))
      .map((r) => Product.fromJson(jsonDecode(r['json'] as String) as Map<String, dynamic>))
      .toList();

  Future<List<Customer>> customers() async => (await _db.query('customers', orderBy: 'name COLLATE NOCASE'))
      .map((r) => Customer.fromJson(jsonDecode(r['json'] as String) as Map<String, dynamic>))
      .toList();

  Future<List<Map<String, String>>> customerTypes() async =>
      (await _db.query('customer_types', orderBy: 'name')).map((r) => {'id': r['id'] as String, 'name': r['name'] as String}).toList();

  Future<void> saveCustomer(Customer c) =>
      _db.insert('customers', {'id': c.id, 'name': c.name, 'json': jsonEncode(c.toJson())}, conflictAlgorithm: ConflictAlgorithm.replace);

  /// Reemplaza el catálogo con lo que envía el servidor, conservando los clientes
  /// creados en el teléfono que todavía no se sincronizaron.
  Future<void> replaceCatalog({
    required List<Product> products,
    required List<Customer> customers,
    required List<Map<String, String>> customerTypes,
  }) async {
    final localPending = (await this.customers()).where((c) => c.pendingSync).toList();
    final serverIds = customers.map((c) => c.id).toSet();
    await _db.transaction((tx) async {
      await tx.delete('products');
      await tx.delete('customers');
      await tx.delete('customer_types');
      for (final pr in products) {
        await tx.insert('products', {'id': pr.id, 'name': pr.name, 'json': jsonEncode(pr.toJson())});
      }
      for (final c in [...customers, ...localPending.where((c) => !serverIds.contains(c.id))]) {
        await tx.insert('customers', {'id': c.id, 'name': c.name, 'json': jsonEncode(c.toJson())});
      }
      for (final t in customerTypes) {
        await tx.insert('customer_types', {'id': t['id'], 'name': t['name']});
      }
    });
  }

  // ── Pedidos ─────────────────────────────────────────────
  Future<List<Presale>> presales() async => (await _db.query('presales', orderBy: 'created_at DESC'))
      .map((r) => Presale.fromJson(jsonDecode(r['json'] as String) as Map<String, dynamic>))
      .toList();

  Future<Presale?> presale(String id) async {
    final rows = await _db.query('presales', where: 'id = ?', whereArgs: [id]);
    return rows.isEmpty ? null : Presale.fromJson(jsonDecode(rows.first['json'] as String) as Map<String, dynamic>);
  }

  Future<void> savePresale(Presale pr) => _db.insert(
        'presales',
        {'id': pr.id, 'created_at': pr.createdAt.toUtc().toIso8601String(), 'json': jsonEncode(pr.toJson())},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );

  Future<void> deletePresale(String id) => _db.delete('presales', where: 'id = ?', whereArgs: [id]);

  // ── Cola de salida ──────────────────────────────────────
  Future<void> enqueue(OutboxOp op) => _db.insert('outbox', {
        'id': op.id,
        'type': op.type,
        'payload': jsonEncode(op.payload),
        'created_at': op.createdAt.toUtc().toIso8601String(),
        'state': op.state,
        'error': op.error,
        'attempts': op.attempts,
      });

  /// Operaciones sin confirmar, en el orden en que se registraron (el orden importa:
  /// un pedido puede depender de un cliente creado antes).
  Future<List<OutboxOp>> outbox() async => (await _db.query('outbox', orderBy: 'created_at, rowid'))
      .map((r) => OutboxOp(
            id: r['id'] as String,
            type: r['type'] as String,
            payload: jsonDecode(r['payload'] as String) as Map<String, dynamic>,
            createdAt: DateTime.parse(r['created_at'] as String),
            state: r['state'] as String,
            error: r['error'] as String?,
            attempts: (r['attempts'] as int?) ?? 0,
          ))
      .toList();

  Future<void> removeOp(String id) => _db.delete('outbox', where: 'id = ?', whereArgs: [id]);

  /// Corrige el contenido de una operación que todavía no salió del teléfono (conserva su id y su orden).
  Future<void> updateOpPayload(String id, Map<String, dynamic> payload) =>
      _db.update('outbox', {'payload': jsonEncode(payload)}, where: 'id = ?', whereArgs: [id]);

  Future<void> markOp(String id, {required String state, String? error}) => _db.rawUpdate(
        'UPDATE outbox SET state = ?, error = ?, attempts = attempts + 1 WHERE id = ?',
        [state, error, id],
      );

  Future<int> pendingCount() async =>
      Sqflite.firstIntValue(await _db.rawQuery("SELECT COUNT(*) FROM outbox WHERE type NOT IN ('GPS_POSITION', 'VISIT_CREATE')")) ?? 0;

  /// Borra todo (al cerrar sesión, solo si no quedan operaciones sin enviar).
  Future<void> clearAll() async {
    for (final t in ['products', 'customers', 'customer_types', 'presales', 'outbox']) {
      await _db.delete(t);
    }
  }
}
