import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../core/api_client.dart';
import '../core/local_db.dart';
import '../core/location_service.dart';
import '../core/models.dart';
import '../core/sync_engine.dart';
import '../core/workspace.dart';

/// URL por defecto del servidor. Se fija al compilar:
///   flutter build apk --dart-define=API_URL=http://192.168.1.25:3000/api
/// Sin ese parámetro apunta al emulador de Android (que ve la PC como 10.0.2.2).
/// En la pantalla de ingreso, "Servidor" permite cambiarla.
const defaultApiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api');
const appVersion = '0.3.0';

class AppState extends ChangeNotifier {
  AppState({required this.db, LocationService? location}) : location = location ?? LocationService();

  final LocalDb db;
  final LocationService location;
  late final Workspace workspace = Workspace(db);
  late ApiClient api;

  String apiUrl = defaultApiUrl;
  String deviceUuid = '';
  SessionUser? user;
  bool sessionExpired = false;

  List<Product> products = [];
  List<Customer> customers = [];
  List<Map<String, String>> customerTypes = [];
  List<Presale> presales = [];
  List<OutboxOp> outbox = [];
  List<DeliveryRoute> routes = [];
  List<Collection> collections = [];

  bool online = true;
  bool syncing = false;
  DateTime? lastSyncAt;
  String? lastSyncError;

  StreamSubscription<List<ConnectivityResult>>? _connSub;
  Timer? _syncTimer;
  Timer? _gpsTimer;

  int get pendingCount => outbox.where((o) => o.type != 'GPS_POSITION').length;
  int get rejectedCount => outbox.where((o) => o.state != 'pending').length;
  bool get loggedIn => user != null;
  bool get isDriver => user?.isDriver ?? false;
  bool get isCollector => user?.isCollector ?? false;
  /// Ruta en curso del chofer (la que se está repartiendo).
  DeliveryRoute? get activeRoute => routes.where((r) => r.inProgress).firstOrNull;

  Future<void> init() async {
    apiUrl = await db.getValue('apiUrl') ?? defaultApiUrl;
    deviceUuid = await db.getValue('deviceUuid') ?? '';
    if (deviceUuid.isEmpty) {
      deviceUuid = const Uuid().v4();
      await db.setValue('deviceUuid', deviceUuid);
    }
    final token = await db.getValue('token');
    final userJson = await db.getValue('user');
    api = ApiClient(baseUrl: apiUrl, token: token);
    if (token != null && userJson != null) {
      // Sesión guardada: se puede trabajar sin conexión aunque el servidor no responda.
      user = SessionUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      _startBackground();
    }
    final last = await db.getValue('lastSyncAt');
    lastSyncAt = last == null ? null : DateTime.parse(last).toLocal();
    await reload();
  }

  Future<void> reload() async {
    products = await db.products();
    customers = await db.customers();
    customerTypes = await db.customerTypes();
    presales = await db.presales();
    outbox = await db.outbox();
    routes = await db.routes();
    collections = await db.collections();
    notifyListeners();
  }

  // ── Sesión ──────────────────────────────────────────────
  Future<void> login(String username, String password, String url) async {
    apiUrl = url.trim();
    api = ApiClient(baseUrl: apiUrl);
    final res = await api.login(username.trim(), password);
    final u = SessionUser.fromJson(Map<String, dynamic>.from(res['user'] as Map));
    if (!u.permissions.contains('presales.create') && !u.permissions.contains('deliveries.register') && !u.permissions.contains('collections.create')) {
      throw ApiException(403, 'Este usuario no es preventista, chofer ni cobrador');
    }
    // Otro usuario en el mismo teléfono: se limpia lo anterior solo si no quedó nada sin enviar.
    final previous = await db.getValue('user');
    if (previous != null && SessionUser.fromJson(jsonDecode(previous) as Map<String, dynamic>).id != u.id) {
      if ((await db.outbox()).isNotEmpty) {
        throw ApiException(409, 'Hay operaciones de otro usuario sin enviar en este teléfono');
      }
      await db.clearAll();
    }
    api.token = res['accessToken'] as String;
    user = u;
    sessionExpired = false;
    await db.setValue('apiUrl', apiUrl);
    await db.setValue('token', api.token);
    await db.setValue('user', jsonEncode(u.toJson()));
    _startBackground();
    await sync();
  }

  Future<void> logout() async {
    _stopBackground();
    await db.setValue('token', null);
    if ((await db.outbox()).isEmpty) {
      await db.setValue('user', null);
      await db.clearAll();
    }
    user = null;
    await reload();
  }

  // ── Sincronización ──────────────────────────────────────
  Future<SyncReport?> sync() async {
    if (syncing || user == null) return null;
    syncing = true;
    notifyListeners();
    try {
      final report = await SyncEngine(db: db, api: api, deviceUuid: deviceUuid, appVersion: appVersion).run();
      online = true;
      lastSyncError = report.failed > 0 ? '${report.failed} operación(es) rechazada(s)' : null;
      lastSyncAt = DateTime.now();
      return report;
    } on OfflineException {
      online = false;
      lastSyncError = null;
      return null;
    } on ApiException catch (e) {
      online = true;
      if (e.isUnauthorized) sessionExpired = true;
      lastSyncError = e.isUnauthorized ? 'Sesión vencida: vuelva a ingresar (sus datos se conservan)' : e.message;
      return null;
    } finally {
      syncing = false;
      await reload();
    }
  }

  void _startBackground() {
    _stopBackground();
    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final hasNetwork = results.any((r) => r != ConnectivityResult.none);
      if (hasNetwork && !online) sync(); // al recuperar señal se envía la cola
      if (!hasNetwork) {
        online = false;
        notifyListeners();
      }
    });
    _syncTimer = Timer.periodic(const Duration(minutes: 2), (_) => sync());
    // GPS periódico mientras la app está abierta: cada ~10 min el preventista; cada ~3 min el chofer
    // con una ruta en curso (seguimiento del reparto). No se registra fuera de la ruta.
    _gpsTimer = Timer.periodic(Duration(minutes: isDriver ? 3 : 10), (_) async {
      if (user == null || (isDriver && activeRoute == null)) return;
      final p = await location.current(timeout: const Duration(seconds: 15));
      if (p != null && user != null) {
        await workspace.recordPosition(p, 'PERIODIC');
        await reload();
      }
    });
  }

  void _stopBackground() {
    _connSub?.cancel();
    _syncTimer?.cancel();
    _gpsTimer?.cancel();
  }

  // ── Operaciones ─────────────────────────────────────────
  Future<Customer> createCustomer({
    required String name,
    required String customerTypeId,
    String? phone,
    String? documentId,
    String addressLabel = 'Principal',
    String? address,
    GeoPoint? location,
  }) async {
    final c = await workspace.createCustomer(
        name: name, customerTypeId: customerTypeId, phone: phone, documentId: documentId, addressLabel: addressLabel, address: address, location: location);
    await reload();
    unawaited(sync());
    return c;
  }

  Future<Presale> createPresale({
    required Customer customer,
    required List<PresaleItem> items,
    Address? address,
    String? scheduledDeliveryDate,
    String? notes,
    GeoPoint? location,
  }) async {
    final p = await workspace.createPresale(
        customer: customer, items: items, address: address, scheduledDeliveryDate: scheduledDeliveryDate, notes: notes, location: location);
    await reload();
    unawaited(sync());
    return p;
  }

  Future<Presale> updatePresale(Presale p, {required List<PresaleItem> items, Address? address, String? scheduledDeliveryDate, String? notes}) async {
    final edited = await workspace.updatePresale(p, items: items, address: address, scheduledDeliveryDate: scheduledDeliveryDate, notes: notes);
    await reload();
    unawaited(sync());
    return edited;
  }

  Future<Customer> addAddress(Customer c, {required String label, required String address, GeoPoint? location}) async {
    final updated = await workspace.addAddress(c, label: label, address: address, location: location);
    await reload();
    unawaited(sync());
    return updated;
  }

  Future<void> recordVisit(Customer c, {required String outcome, String? notes, GeoPoint? location}) async {
    await workspace.recordVisit(customer: c, outcome: outcome, notes: notes, location: location);
    await reload();
    unawaited(sync());
  }

  Future<void> cancelPresale(Presale p, String reason) async {
    await workspace.cancelPresale(p, reason);
    await reload();
    unawaited(sync());
  }

  Future<RouteStop> deliverStop(
    RouteStop stop, {
    required List<StopItem> items,
    required double paidAmount,
    String? paymentMethod,
    required String receivedByName,
    String? signaturePng,
    String? notes,
    GeoPoint? location,
    int cratesDelivered = 0,
    int cratesPickedUp = 0,
  }) async {
    final r = await workspace.deliverStop(stop,
        items: items,
        paidAmount: paidAmount,
        paymentMethod: paymentMethod,
        receivedByName: receivedByName,
        signaturePng: signaturePng,
        notes: notes,
        location: location,
        cratesDelivered: cratesDelivered,
        cratesPickedUp: cratesPickedUp);
    await reload();
    unawaited(sync());
    return r;
  }

  Future<RouteStop> failStop(RouteStop stop, {required String problemType, String? notes, GeoPoint? location}) async {
    final r = await workspace.failStop(stop, problemType: problemType, notes: notes, location: location);
    await reload();
    unawaited(sync());
    return r;
  }

  Future<Collection> collect(
    Customer customer, {
    required double amount,
    required String paymentMethod,
    String? referenceNumber,
    String? paidByName,
    String? signaturePng,
    String? notes,
    int cratesPickedUp = 0,
    GeoPoint? location,
  }) async {
    final c = await workspace.collect(customer,
        amount: amount,
        paymentMethod: paymentMethod,
        referenceNumber: referenceNumber,
        paidByName: paidByName,
        signaturePng: signaturePng,
        notes: notes,
        cratesPickedUp: cratesPickedUp,
        location: location);
    await reload();
    unawaited(sync());
    return c;
  }

  Future<void> pickupCrates(Customer customer, int quantity, {String? notes, GeoPoint? location}) async {
    await workspace.pickupCrates(customer, quantity, notes: notes, location: location);
    await reload();
    unawaited(sync());
  }

  Future<void> discard(OutboxOp op) async {
    await workspace.discard(op);
    await reload();
  }

  @override
  void dispose() {
    _stopBackground();
    super.dispose();
  }
}
