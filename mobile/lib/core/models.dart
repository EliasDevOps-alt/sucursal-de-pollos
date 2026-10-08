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
    this.cratesHeld = 0,
    this.debtSince,
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
  final int cratesHeld; // canastillos del negocio en poder del cliente
  final DateTime? debtSince; // cargo más antiguo sin saldar

  /// Días que lleva la deuda (para priorizar la cobranza).
  int? get debtDays => currentDebt > 0 && debtSince != null ? DateTime.now().difference(debtSince!).inDays : null;

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
        cratesHeld: (j['cratesHeld'] as num?)?.toInt() ?? 0,
        debtSince: j['debtSince'] == null ? null : DateTime.parse(j['debtSince'] as String),
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
        'cratesHeld': cratesHeld,
        'debtSince': debtSince?.toUtc().toIso8601String(),
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
        cratesHeld: cratesHeld,
        debtSince: debtSince,
      );

  Customer copyWith({String? code, bool? pendingSync, double? currentDebt, int? cratesHeld}) => Customer(
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
        currentDebt: currentDebt ?? this.currentDebt,
        addresses: addresses,
        pendingSync: pendingSync ?? this.pendingSync,
        cratesHeld: cratesHeld ?? this.cratesHeld,
        debtSince: debtSince,
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
        'DELIVERY_COMPLETE' => 'Entrega registrada',
        'DELIVERY_FAIL' => 'Entrega no realizada',
        'COLLECTION_CREATE' => 'Cobro de ${payload['amount']} Bs',
        'CRATE_PICKUP' => 'Canastillos recogidos: ${payload['quantity']}',
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

  /// Chofer: registra entregas de sus rutas (la app muestra el modo de entregas en lugar del de preventa).
  bool get isDriver => permissions.contains('deliveries.register') && !permissions.contains('presales.create');

  /// Cobrador: cobra deudas en la calle (la app muestra el modo de cobranza).
  bool get isCollector => permissions.contains('collections.create') && !permissions.contains('presales.create') && !permissions.contains('deliveries.register');

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: j['id'] as String,
        username: j['username'] as String,
        fullName: j['fullName'] as String,
        roleName: j['roleName'] as String,
        permissions: List<String>.from(j['permissions'] as List),
      );

  Map<String, dynamic> toJson() => {'id': id, 'username': username, 'fullName': fullName, 'roleName': roleName, 'permissions': permissions};
}

// ── Chofer: rutas de entrega ─────────────────────────────

class StopItem {
  StopItem({required this.productId, required this.productName, required this.orderedKg, required this.unitPrice, this.deliveredKg, this.differenceReason});

  final String productId;
  final String productName;
  final double orderedKg;
  final double unitPrice; // precio cotizado en la preventa (para estimar el cobro sin conexión)
  final double? deliveredKg;
  final String? differenceReason;

  factory StopItem.fromJson(Map<String, dynamic> j) => StopItem(
        productId: j['productId'] as String,
        productName: j['productName'] as String,
        orderedKg: toDouble(j['orderedKg']),
        unitPrice: toDouble(j['unitPrice']),
        deliveredKg: toDoubleOrNull(j['deliveredKg']),
        differenceReason: j['differenceReason'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'productName': productName,
        'orderedKg': orderedKg,
        'unitPrice': unitPrice,
        'deliveredKg': deliveredKg,
        'differenceReason': differenceReason,
      };
}

class RouteStop {
  RouteStop({
    required this.id,
    required this.sequence,
    required this.status,
    required this.presaleId,
    required this.presaleNumber,
    required this.customerId,
    required this.customerName,
    required this.presaleTotal,
    required this.items,
    this.customerPhone,
    this.address,
    this.receivedByName,
    this.paidAmount = 0,
    this.paymentMethod,
    this.problemType,
    this.notes,
    this.saleNumber,
    this.signed = false,
    this.syncState = SyncState.synced,
    this.error,
    this.cratesDelivered = 0,
    this.cratesPickedUp = 0,
  });

  final String id;
  final int sequence;
  final String status; // PENDING | DELIVERED | PARTIAL | FAILED
  final String presaleId;
  final String presaleNumber;
  final String customerId;
  final String customerName;
  final String? customerPhone;
  final Address? address;
  final double presaleTotal;
  final List<StopItem> items;
  final String? receivedByName;
  final double paidAmount;
  final String? paymentMethod;
  final String? problemType;
  final String? notes;
  final String? saleNumber;
  final bool signed;
  final SyncState syncState;
  final String? error;
  final int cratesDelivered;
  final int cratesPickedUp;

  bool get isPending => status == 'PENDING';
  double get orderedKg => items.fold(0, (t, i) => t + i.orderedKg);

  /// Desde la respuesta del servidor (bootstrap).
  factory RouteStop.fromServer(Map<String, dynamic> j) {
    final presale = Map<String, dynamic>.from(j['presale'] as Map);
    final prices = {for (final i in (presale['items'] as List? ?? [])) (i as Map)['productId'] as String: toDouble(i['unitPrice'])};
    final customer = Map<String, dynamic>.from(j['customer'] as Map);
    return RouteStop(
      id: j['id'] as String,
      sequence: (j['sequence'] as num).toInt(),
      status: j['status'] as String,
      presaleId: j['presaleId'] as String,
      presaleNumber: presale['presaleNumber'] as String,
      customerId: customer['id'] as String,
      customerName: customer['name'] as String,
      customerPhone: customer['phone'] as String?,
      address: j['address'] == null ? null : Address.fromJson(Map<String, dynamic>.from(j['address'] as Map)),
      presaleTotal: toDouble(presale['totalAmount']),
      items: (j['items'] as List).map((raw) {
        final i = Map<String, dynamic>.from(raw as Map);
        final product = Map<String, dynamic>.from(i['product'] as Map);
        return StopItem(
          productId: product['id'] as String,
          productName: product['name'] as String,
          orderedKg: toDouble(i['orderedWeightKg']),
          unitPrice: prices[product['id']] ?? 0,
          deliveredKg: toDoubleOrNull(i['deliveredWeightKg']),
          differenceReason: i['differenceReason'] as String?,
        );
      }).toList(),
      receivedByName: j['receivedByName'] as String?,
      paidAmount: toDouble(j['paidAmount']),
      paymentMethod: j['paymentMethod'] as String?,
      problemType: j['problemType'] as String?,
      notes: j['notes'] as String?,
      saleNumber: j['sale'] == null ? null : (j['sale'] as Map)['saleNumber'] as String?,
      signed: j['signed'] == true,
      cratesDelivered: (j['cratesDelivered'] as num?)?.toInt() ?? 0,
      cratesPickedUp: (j['cratesPickedUp'] as num?)?.toInt() ?? 0,
    );
  }

  factory RouteStop.fromJson(Map<String, dynamic> j) => RouteStop(
        id: j['id'] as String,
        sequence: (j['sequence'] as num).toInt(),
        status: j['status'] as String,
        presaleId: j['presaleId'] as String,
        presaleNumber: j['presaleNumber'] as String,
        customerId: j['customerId'] as String,
        customerName: j['customerName'] as String,
        customerPhone: j['customerPhone'] as String?,
        address: j['address'] == null ? null : Address.fromJson(Map<String, dynamic>.from(j['address'] as Map)),
        presaleTotal: toDouble(j['presaleTotal']),
        items: (j['items'] as List).map((i) => StopItem.fromJson(Map<String, dynamic>.from(i as Map))).toList(),
        receivedByName: j['receivedByName'] as String?,
        paidAmount: toDouble(j['paidAmount']),
        paymentMethod: j['paymentMethod'] as String?,
        problemType: j['problemType'] as String?,
        notes: j['notes'] as String?,
        saleNumber: j['saleNumber'] as String?,
        signed: j['signed'] == true,
        syncState: SyncState.values.byName((j['syncState'] ?? 'synced') as String),
        error: j['error'] as String?,
        cratesDelivered: (j['cratesDelivered'] as num?)?.toInt() ?? 0,
        cratesPickedUp: (j['cratesPickedUp'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'sequence': sequence,
        'cratesDelivered': cratesDelivered,
        'cratesPickedUp': cratesPickedUp,
        'status': status,
        'presaleId': presaleId,
        'presaleNumber': presaleNumber,
        'customerId': customerId,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'address': address?.toJson(),
        'presaleTotal': presaleTotal,
        'items': items.map((i) => i.toJson()).toList(),
        'receivedByName': receivedByName,
        'paidAmount': paidAmount,
        'paymentMethod': paymentMethod,
        'problemType': problemType,
        'notes': notes,
        'saleNumber': saleNumber,
        'signed': signed,
        'syncState': syncState.name,
        'error': error,
      };

  /// `reset` vuelve la parada a pendiente (al descartar una entrega rechazada).
  RouteStop copyWith({
    String? status,
    List<StopItem>? items,
    String? receivedByName,
    double? paidAmount,
    String? paymentMethod,
    String? problemType,
    String? notes,
    String? saleNumber,
    bool? signed,
    SyncState? syncState,
    String? error,
    bool clearError = false,
    bool reset = false,
    int? cratesDelivered,
    int? cratesPickedUp,
  }) =>
      RouteStop(
        id: id,
        sequence: sequence,
        status: status ?? this.status,
        presaleId: presaleId,
        presaleNumber: presaleNumber,
        customerId: customerId,
        customerName: customerName,
        customerPhone: customerPhone,
        address: address,
        presaleTotal: presaleTotal,
        items: reset ? [for (final i in this.items) StopItem(productId: i.productId, productName: i.productName, orderedKg: i.orderedKg, unitPrice: i.unitPrice)] : items ?? this.items,
        receivedByName: reset ? null : receivedByName ?? this.receivedByName,
        paidAmount: reset ? 0 : paidAmount ?? this.paidAmount,
        paymentMethod: reset ? null : paymentMethod ?? this.paymentMethod,
        problemType: reset ? null : problemType ?? this.problemType,
        notes: reset ? null : notes ?? this.notes,
        saleNumber: reset ? null : saleNumber ?? this.saleNumber,
        signed: reset ? false : signed ?? this.signed,
        syncState: syncState ?? this.syncState,
        error: clearError || reset ? null : (error ?? this.error),
        cratesDelivered: reset ? 0 : cratesDelivered ?? this.cratesDelivered,
        cratesPickedUp: reset ? 0 : cratesPickedUp ?? this.cratesPickedUp,
      );
}

class DeliveryRoute {
  DeliveryRoute({
    required this.id,
    required this.number,
    required this.date,
    required this.status,
    required this.vehiclePlate,
    required this.vehicleDescription,
    required this.stops,
    this.notes,
  });

  final String id;
  final String number;
  final String date; // AAAA-MM-DD
  final String status; // PLANNED | IN_PROGRESS | COMPLETED
  final String vehiclePlate;
  final String vehicleDescription;
  final String? notes;
  final List<RouteStop> stops;

  bool get inProgress => status == 'IN_PROGRESS';
  int get resolved => stops.where((s) => !s.isPending).length;
  double get collected => stops.fold(0, (t, s) => t + s.paidAmount);

  factory DeliveryRoute.fromServer(Map<String, dynamic> j) {
    final vehicle = Map<String, dynamic>.from(j['vehicle'] as Map);
    final stops = (j['stops'] as List).map((s) => RouteStop.fromServer(Map<String, dynamic>.from(s as Map))).toList()
      ..sort((a, b) => a.sequence.compareTo(b.sequence));
    return DeliveryRoute(
      id: j['id'] as String,
      number: j['routeNumber'] as String,
      date: (j['routeDate'] as String).substring(0, 10),
      status: j['status'] as String,
      vehiclePlate: vehicle['plate'] as String,
      vehicleDescription: vehicle['description'] as String,
      notes: j['notes'] as String?,
      stops: stops,
    );
  }

  factory DeliveryRoute.fromJson(Map<String, dynamic> j) => DeliveryRoute(
        id: j['id'] as String,
        number: j['number'] as String,
        date: j['date'] as String,
        status: j['status'] as String,
        vehiclePlate: j['vehiclePlate'] as String,
        vehicleDescription: j['vehicleDescription'] as String,
        notes: j['notes'] as String?,
        stops: (j['stops'] as List).map((s) => RouteStop.fromJson(Map<String, dynamic>.from(s as Map))).toList(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'number': number,
        'date': date,
        'status': status,
        'vehiclePlate': vehiclePlate,
        'vehicleDescription': vehicleDescription,
        'notes': notes,
        'stops': stops.map((s) => s.toJson()).toList(),
      };

  DeliveryRoute withStop(RouteStop stop) => DeliveryRoute(
        id: id,
        number: number,
        date: date,
        status: status,
        vehiclePlate: vehiclePlate,
        vehicleDescription: vehicleDescription,
        notes: notes,
        stops: [for (final s in stops) s.id == stop.id ? stop : s],
      );
}

// ── Cobrador ─────────────────────────────────────────────

/// Cobro hecho en la calle. El id lo genera el teléfono y es el del recibo en el servidor.
class Collection {
  Collection({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.amount,
    required this.paymentMethod,
    required this.collectedAt,
    this.receiptNumber,
    this.status = 'VALID',
    this.isAdvance = false,
    this.paidByName,
    this.cratesPickedUp = 0,
    this.syncState = SyncState.synced,
    this.error,
  });

  final String id;
  final String customerId;
  final String customerName;
  final double amount;
  final String paymentMethod;
  final DateTime collectedAt;
  final String? receiptNumber;
  final String status; // VALID | ANNULLED
  final bool isAdvance;
  final String? paidByName;
  final int cratesPickedUp;
  final SyncState syncState;
  final String? error;

  factory Collection.fromServer(Map<String, dynamic> j) => Collection(
        id: j['id'] as String,
        customerId: (j['customerId'] ?? '') as String,
        customerName: (j['customerName'] ?? '') as String,
        amount: toDouble(j['amount']),
        paymentMethod: j['paymentMethod'] as String,
        collectedAt: DateTime.parse(j['collectedAt'] as String).toLocal(),
        receiptNumber: j['receiptNumber'] as String?,
        status: (j['status'] ?? 'VALID') as String,
        isAdvance: j['isAdvance'] == true,
      );

  factory Collection.fromJson(Map<String, dynamic> j) => Collection(
        id: j['id'] as String,
        customerId: j['customerId'] as String,
        customerName: j['customerName'] as String,
        amount: toDouble(j['amount']),
        paymentMethod: j['paymentMethod'] as String,
        collectedAt: DateTime.parse(j['collectedAt'] as String).toLocal(),
        receiptNumber: j['receiptNumber'] as String?,
        status: (j['status'] ?? 'VALID') as String,
        isAdvance: j['isAdvance'] == true,
        paidByName: j['paidByName'] as String?,
        cratesPickedUp: (j['cratesPickedUp'] as num?)?.toInt() ?? 0,
        syncState: SyncState.values.byName((j['syncState'] ?? 'synced') as String),
        error: j['error'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'customerId': customerId,
        'customerName': customerName,
        'amount': amount,
        'paymentMethod': paymentMethod,
        'collectedAt': collectedAt.toUtc().toIso8601String(),
        'receiptNumber': receiptNumber,
        'status': status,
        'isAdvance': isAdvance,
        'paidByName': paidByName,
        'cratesPickedUp': cratesPickedUp,
        'syncState': syncState.name,
        'error': error,
      };

  Collection copyWith({String? receiptNumber, SyncState? syncState, String? error, bool clearError = false}) => Collection(
        id: id,
        customerId: customerId,
        customerName: customerName,
        amount: amount,
        paymentMethod: paymentMethod,
        collectedAt: collectedAt,
        receiptNumber: receiptNumber ?? this.receiptNumber,
        status: status,
        isAdvance: isAdvance,
        paidByName: paidByName,
        cratesPickedUp: cratesPickedUp,
        syncState: syncState ?? this.syncState,
        error: clearError ? null : (error ?? this.error),
      );
}
