// Modelos locales. El servidor envía los decimales como string; aquí se leen como double
// solo para mostrar y cotizar: los importes oficiales los calcula el servidor.

double toDouble(Object? v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);
double? toDoubleOrNull(Object? v) => v == null ? null : toDouble(v);

class Product {
  Product({
    required this.id,
    required this.code,
    required this.name,
    required this.category,
    required this.referencePrice,
    required this.availableKg,
  });

  final String id;
  final String code;
  final String name;
  final String category;
  final double? referencePrice;
  final double availableKg;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as String,
        code: j['code'] as String,
        name: j['name'] as String,
        category: (j['category'] ?? '') as String,
        referencePrice: toDoubleOrNull(j['referencePrice']),
        availableKg: toDouble(j['availableKg']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'name': name,
        'category': category,
        'referencePrice': referencePrice,
        'availableKg': availableKg,
      };
}

class Address {
  Address({required this.id, required this.label, required this.address, this.latitude, this.longitude, this.isPrimary = false});

  final String id;
  final String label;
  final String address;
  final double? latitude;
  final double? longitude;
  final bool isPrimary;

  factory Address.fromJson(Map<String, dynamic> j) => Address(
        id: j['id'] as String,
        label: j['label'] as String,
        address: j['address'] as String,
        latitude: toDoubleOrNull(j['latitude']),
        longitude: toDoubleOrNull(j['longitude']),
        isPrimary: j['isPrimary'] == true,
      );

  Map<String, dynamic> toJson() =>
      {'id': id, 'label': label, 'address': address, 'latitude': latitude, 'longitude': longitude, 'isPrimary': isPrimary};
}

class Customer {
  Customer({
    required this.id,
    required this.name,
    required this.customerTypeId,
    this.code,
    this.phone,
    this.documentId,
    this.rank,
    this.discountPercentage = 0,
    this.creditEnabled = false,
    this.creditAvailable = 0,
    this.currentDebt = 0,
    this.addresses = const [],
    this.pendingSync = false,
  });

  final String id;
  final String? code; // lo asigna el servidor al sincronizar
  final String name;
  final String customerTypeId;
  final String? phone;
  final String? documentId;
  final String? rank;
  final double discountPercentage;
  final bool creditEnabled;
  final double creditAvailable;
  final double currentDebt;
  final List<Address> addresses;
  final bool pendingSync;

  Address? get primaryAddress => addresses.isEmpty ? null : addresses.firstWhere((a) => a.isPrimary, orElse: () => addresses.first);

  factory Customer.fromJson(Map<String, dynamic> j) => Customer(
        id: j['id'] as String,
        code: j['code'] as String?,
        name: j['name'] as String,
        customerTypeId: j['customerTypeId'] as String,
        phone: j['phone'] as String?,
        documentId: j['documentId'] as String?,
        rank: j['rank'] as String?,
        discountPercentage: toDouble(j['discountPercentage']),
        creditEnabled: j['creditEnabled'] == true,
        creditAvailable: toDouble(j['creditAvailable']),
        currentDebt: toDouble(j['currentDebt']),
        addresses: ((j['addresses'] as List?) ?? []).map((a) => Address.fromJson(Map<String, dynamic>.from(a as Map))).toList(),
        pendingSync: j['pendingSync'] == true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'code': code,
        'name': name,
        'customerTypeId': customerTypeId,
        'phone': phone,
        'documentId': documentId,
        'rank': rank,
        'discountPercentage': discountPercentage,
        'creditEnabled': creditEnabled,
        'creditAvailable': creditAvailable,
        'currentDebt': currentDebt,
        'addresses': addresses.map((a) => a.toJson()).toList(),
        'pendingSync': pendingSync,
      };

  Customer withAddress(Address a) => Customer(
        id: id,
        code: code,
        name: name,
        customerTypeId: customerTypeId,
        phone: phone,
        documentId: documentId,
        rank: rank,
        discountPercentage: discountPercentage,
        creditEnabled: creditEnabled,
        creditAvailable: creditAvailable,
        currentDebt: currentDebt,
        addresses: [...addresses, a],
        pendingSync: pendingSync,
      );

  Customer copyWith({String? code, bool? pendingSync}) => Customer(
        id: id,
        code: code ?? this.code,
        name: name,
        customerTypeId: customerTypeId,
        phone: phone,
        documentId: documentId,
        rank: rank,
        discountPercentage: discountPercentage,
        creditEnabled: creditEnabled,
        creditAvailable: creditAvailable,
        currentDebt: currentDebt,
        addresses: addresses,
        pendingSync: pendingSync ?? this.pendingSync,
      );
}

class PresaleItem {
  PresaleItem({required this.productId, required this.productName, required this.weightKg, required this.unitPrice, this.quantity});

  final String productId;
  final String productName;
  final double weightKg;
  final int? quantity;
  final double unitPrice;

  double get subtotal => (weightKg * unitPrice * 100).roundToDouble() / 100;

  factory PresaleItem.fromJson(Map<String, dynamic> j) => PresaleItem(
        productId: j['productId'] as String,
        productName: (j['productName'] ?? '') as String,
        weightKg: toDouble(j['weightKg']),
        quantity: j['quantity'] == null ? null : toDouble(j['quantity']).round(),
        unitPrice: toDouble(j['unitPrice']),
      );

  Map<String, dynamic> toJson() =>
      {'productId': productId, 'productName': productName, 'weightKg': weightKg, 'quantity': quantity, 'unitPrice': unitPrice};
}

/// Estado de sincronización del pedido en el teléfono.
enum SyncState { pending, synced, error }

class Presale {
  Presale({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.items,
    required this.createdAt,
    this.number,
    this.status = 'LOCAL',
    this.total,
    this.scheduledDeliveryDate,
    this.notes,
    this.addressId,
    this.saleNumber,
    this.cancelReason,
    this.syncState = SyncState.pending,
    this.error,
  });

  final String id;
  final String? number; // P-000123, asignado por el servidor
  /// LOCAL (aún no llegó al servidor), PENDING, DELIVERED, CANCELLED, CANCEL_PENDING...
  final String status;
  final String customerId;
  final String customerName;
  final List<PresaleItem> items;
  final DateTime createdAt;
  final double? total;
  final String? scheduledDeliveryDate;
  final String? notes;
  final String? addressId;
  final String? saleNumber;
  final String? cancelReason;
  final SyncState syncState;
  final String? error;

  double get quotedTotal => total ?? items.fold(0, (s, i) => s + i.subtotal);
  bool get canCancel => status == 'LOCAL' || status == 'PENDING' || status == 'CONFIRMED';

  /// Se puede editar mientras no fue atendido, asignado ni cancelado.
  bool get canEdit => canCancel;

  /// Copia con los productos y datos editados (los totales se recalculan desde los ítems).
  Presale withEdits({required List<PresaleItem> items, String? addressId, String? scheduledDeliveryDate, String? notes}) => Presale(
        id: id,
        number: number,
        status: status,
        customerId: customerId,
        customerName: customerName,
        items: items,
        createdAt: createdAt,
        scheduledDeliveryDate: scheduledDeliveryDate,
        notes: notes,
        addressId: addressId,
        saleNumber: saleNumber,
        syncState: SyncState.pending,
      );

  factory Presale.fromJson(Map<String, dynamic> j) => Presale(
        id: j['id'] as String,
        number: (j['number'] ?? j['presaleNumber']) as String?,
        status: (j['status'] ?? 'LOCAL') as String,
        customerId: j['customerId'] as String,
        customerName: (j['customerName'] ?? '') as String,
        items: ((j['items'] as List?) ?? []).map((i) => PresaleItem.fromJson(Map<String, dynamic>.from(i as Map))).toList(),
        createdAt: DateTime.parse(j['createdAt'] as String).toLocal(),
        total: toDoubleOrNull(j['total'] ?? j['totalAmount']),
        scheduledDeliveryDate: (j['scheduledDeliveryDate'] as String?)?.substring(0, 10),
        notes: j['notes'] as String?,
        addressId: j['addressId'] as String?,
        saleNumber: j['saleNumber'] as String?,
        cancelReason: j['cancelReason'] as String?,
        syncState: SyncState.values.firstWhere((s) => s.name == j['syncState'], orElse: () => SyncState.synced),
        error: j['error'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'status': status,
        'customerId': customerId,
        'customerName': customerName,
        'items': items.map((i) => i.toJson()).toList(),
        'createdAt': createdAt.toUtc().toIso8601String(),
        'total': total,
        'scheduledDeliveryDate': scheduledDeliveryDate,
        'notes': notes,
        'addressId': addressId,
        'saleNumber': saleNumber,
        'cancelReason': cancelReason,
        'syncState': syncState.name,
        'error': error,
      };

  Presale copyWith({String? number, String? status, SyncState? syncState, String? error, bool clearError = false, String? cancelReason}) => Presale(
        id: id,
        number: number ?? this.number,
        status: status ?? this.status,
        customerId: customerId,
        customerName: customerName,
        items: items,
        createdAt: createdAt,
        total: total,
        scheduledDeliveryDate: scheduledDeliveryDate,
        notes: notes,
        addressId: addressId,
        saleNumber: saleNumber,
        cancelReason: cancelReason ?? this.cancelReason,
        syncState: syncState ?? this.syncState,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Operación en la cola de salida. Su id es el device_operation_id que garantiza la idempotencia.
class OutboxOp {
  OutboxOp({required this.id, required this.type, required this.payload, required this.createdAt, this.state = 'pending', this.error, this.attempts = 0});

  final String id;
  final String type; // CUSTOMER_CREATE, CUSTOMER_ADDRESS_ADD, PRESALE_CREATE, PRESALE_UPDATE, PRESALE_CANCEL, VISIT_CREATE, GPS_POSITION
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final String state; // pending | review | error
  final String? error;
  final int attempts;

  Map<String, dynamic> toSyncJson() => {
        'deviceOperationId': id,
        'operationType': type,
        'payload': payload,
        'createdAtDevice': createdAt.toUtc().toIso8601String(),
      };

  String get label => switch (type) {
        'CUSTOMER_CREATE' => 'Alta de cliente: ${payload['name'] ?? ''}',
        'PRESALE_CREATE' => 'Pedido nuevo',
        'PRESALE_CANCEL' => 'Cancelación de pedido',
        'PRESALE_UPDATE' => 'Edición de pedido',
        'CUSTOMER_ADDRESS_ADD' => 'Dirección adicional: ${payload['label'] ?? ''}',
        'VISIT_CREATE' => 'Visita',
        'GPS_POSITION' => 'Posición GPS',
        _ => type,
      };
}

class SessionUser {
  SessionUser({required this.id, required this.username, required this.fullName, required this.roleName, required this.permissions});

  final String id;
  final String username;
  final String fullName;
  final String roleName;
  final List<String> permissions;

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: j['id'] as String,
        username: j['username'] as String,
        fullName: j['fullName'] as String,
        roleName: j['roleName'] as String,
        permissions: List<String>.from(j['permissions'] as List),
      );

  Map<String, dynamic> toJson() => {'id': id, 'username': username, 'fullName': fullName, 'roleName': roleName, 'permissions': permissions};
}
