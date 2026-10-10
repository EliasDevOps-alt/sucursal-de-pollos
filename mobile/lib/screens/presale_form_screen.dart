import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../core/models.dart';
import '../state/app_state.dart';
import 'customer_form_screen.dart';
import 'format.dart';

class _Line {
  _Line(this.product, {this.quotedPrice, double? weight, int? units, int crates = 0})
      : kg = TextEditingController(text: weight == null ? '' : _num(weight)),
        units = TextEditingController(text: units?.toString() ?? ''),
        crates = TextEditingController(text: crates > 0 ? '$crates' : '');
  final Product product;
  /// Precio cotizado al tomar el pedido; al editar se conserva para no cambiar la cotización sin aviso.
  final double? quotedPrice;
  final TextEditingController kg;
  final TextEditingController units;
  /// Pedido por canastillo (solo productos con peso por canastillo); los kilos quedan como estimación.
  final TextEditingController crates;
  bool get byCrate => product.kgPerCrate != null;
  int get crateCount => byCrate ? int.tryParse(crates.text) ?? 0 : 0;
  double get weight => double.tryParse(kg.text.replaceAll(',', '.')) ?? 0;

  /// Al cambiar los canastillos se estiman los kilos (canastillos × peso aproximado de uno lleno).
  void cratesChanged() {
    if (crateCount > 0) kg.text = _num(double.parse((crateCount * product.kgPerCrate!).toStringAsFixed(3)));
  }
  double get price => quotedPrice ?? product.referencePrice ?? 0;

  static String _num(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString().replaceAll('.', ',');
}

class PresaleFormScreen extends StatefulWidget {
  const PresaleFormScreen({super.key, this.initialCustomer, this.editing});

  /// Cliente ya elegido (por ejemplo, desde su ficha).
  final Customer? initialCustomer;

  /// Pedido a editar; si es null, se crea uno nuevo.
  final Presale? editing;

  @override
  State<PresaleFormScreen> createState() => _PresaleFormScreenState();
}

class _PresaleFormScreenState extends State<PresaleFormScreen> {
  Customer? _customer;
  Address? _address;
  final List<_Line> _lines = [];
  late DateTime _delivery = context.read<AppState>().now().add(const Duration(days: 1));
  final _notes = TextEditingController();
  bool _saving = false;

  double get _total => _lines.fold(0, (s, l) => s + l.weight * l.price);

  bool get _isEdit => widget.editing != null;

  @override
  void initState() {
    super.initState();
    final s = context.read<AppState>();
    final e = widget.editing;
    if (e != null) {
      _customer = s.customers.where((c) => c.id == e.customerId).firstOrNull ??
          Customer(id: e.customerId, name: e.customerName, customerTypeId: '');
      _address = _customer!.addresses.where((a) => a.id == e.addressId).firstOrNull;
      if (e.scheduledDeliveryDate != null) _delivery = DateTime.parse(e.scheduledDeliveryDate!);
      _notes.text = e.notes ?? '';
      for (final i in e.items) {
        final product = s.products.where((p) => p.id == i.productId).firstOrNull ??
            Product(id: i.productId, code: '', name: i.productName, category: '', referencePrice: i.unitPrice, availableKg: 0);
        _lines.add(_Line(product, quotedPrice: i.unitPrice, weight: i.weightKg, units: i.quantity, crates: i.crates));
      }
    } else if (widget.initialCustomer != null) {
      _customer = widget.initialCustomer;
      _address = widget.initialCustomer!.primaryAddress;
    }
  }

  Future<void> _pickCustomer() async {
    final picked = await showModalBottomSheet<Customer>(context: context, isScrollControlled: true, builder: (_) => const _CustomerPicker());
    if (picked != null) {
      setState(() {
        _customer = picked;
        _address = picked.primaryAddress;
      });
    }
  }

  Future<void> _addProduct() async {
    final picked = await showModalBottomSheet<Product>(context: context, isScrollControlled: true, builder: (_) => const _ProductPicker());
    if (picked != null && !_lines.any((l) => l.product.id == picked.id)) setState(() => _lines.add(_Line(picked)));
  }

  Future<void> _save() async {
    final valid = _lines.where((l) => l.weight > 0).toList();
    if (_customer == null || valid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Elija el cliente y al menos un producto con kilos')));
      return;
    }
    setState(() => _saving = true);
    final s = context.read<AppState>();
    final items = valid
        .map((l) => PresaleItem(
            productId: l.product.id,
            productName: l.product.name,
            weightKg: l.weight,
            unitPrice: l.price,
            quantity: l.byCrate ? null : int.tryParse(l.units.text),
            crates: l.crateCount))
        .toList();
    if (_isEdit) {
      await s.updatePresale(widget.editing!,
          items: items, address: _address, scheduledDeliveryDate: DateFormat('yyyy-MM-dd').format(_delivery), notes: _notes.text);
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pedido actualizado')));
      return;
    }
    // El GPS no bloquea: si no hay señal en unos segundos, el pedido se guarda sin ubicación.
    final location = await s.location.current(timeout: const Duration(seconds: 8));
    await s.createPresale(
      customer: _customer!,
      address: _address,
      items: items,
      scheduledDeliveryDate: DateFormat('yyyy-MM-dd').format(_delivery),
      notes: _notes.text,
      location: location,
    );
    if (!mounted) return;
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(s.online ? 'Pedido guardado y enviándose' : 'Pedido guardado en el teléfono. Se enviará al recuperar señal.'),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Editar pedido ${widget.editing!.number ?? ''}' : 'Nuevo pedido')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.storefront),
              title: Text(_customer?.name ?? 'Elegir cliente'),
              subtitle: _customer == null
                  ? null
                  : Text([
                      if (_customer!.rank != null) 'Rango ${_customer!.rank} (${_customer!.discountPercentage.toStringAsFixed(0)} % desc.)',
                      _customer!.creditEnabled ? 'Crédito disp. ${fmtBob(_customer!.creditAvailable)}' : 'Sin crédito',
                    ].join(' · ')),
              trailing: _isEdit ? null : const Icon(Icons.chevron_right),
              onTap: _isEdit ? null : _pickCustomer,
            ),
          ),
          if (_customer != null && _customer!.addresses.length > 1)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: DropdownButtonFormField<String>(
                initialValue: _address?.id,
                decoration: const InputDecoration(labelText: 'Dirección de entrega', border: OutlineInputBorder()),
                items: _customer!.addresses.map((a) => DropdownMenuItem(value: a.id, child: Text('${a.label}: ${a.address}', overflow: TextOverflow.ellipsis))).toList(),
                onChanged: (id) => setState(() => _address = _customer!.addresses.firstWhere((a) => a.id == id)),
              ),
            ),
          const SizedBox(height: 16),
          Text('Productos', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final l in _lines)
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 4, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(child: Text(l.product.name, style: const TextStyle(fontWeight: FontWeight.w600))),
                      IconButton(onPressed: () => setState(() => _lines.remove(l)), icon: const Icon(Icons.delete_outline), tooltip: 'Quitar'),
                    ]),
                    Text(
                      l.product.referencePrice == null
                          ? 'Sin precio de referencia (sin stock)'
                          : '${fmtBob(l.price)}/kg · disponible ${fmtKg(l.product.availableKg)}${l.byCrate ? ' · canastillo ≈ ${fmtKg(l.product.kgPerCrate!)}' : ''}',
                      style: TextStyle(color: l.product.availableKg <= 0 ? cs.error : null, fontSize: 12),
                    ),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                        child: TextField(
                          controller: l.kg,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                          decoration: const InputDecoration(labelText: 'Kg', border: OutlineInputBorder(), isDense: true),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: l.byCrate
                            ? TextField(
                                controller: l.crates,
                                keyboardType: TextInputType.number,
                                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                decoration: const InputDecoration(labelText: 'Canastillos', border: OutlineInputBorder(), isDense: true),
                                onChanged: (_) => setState(l.cratesChanged),
                              )
                            : TextField(
                                controller: l.units,
                                keyboardType: TextInputType.number,
                                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                decoration: const InputDecoration(labelText: 'Unidades', border: OutlineInputBorder(), isDense: true),
                              ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(width: 92, child: Text(fmtBob(l.weight * l.price), textAlign: TextAlign.right)),
                      const SizedBox(width: 8),
                    ]),
                    if (l.weight > l.product.availableKg && l.product.availableKg > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text('Supera el stock actual; Administración lo revisará al atender.', style: TextStyle(color: Colors.orange.shade800, fontSize: 12)),
                      ),
                  ],
                ),
              ),
            ),
          OutlinedButton.icon(onPressed: _addProduct, icon: const Icon(Icons.add), label: const Text('Agregar producto')),
          const SizedBox(height: 16),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event),
            title: const Text('Entrega programada'),
            subtitle: Text(DateFormat("EEEE d 'de' MMMM", 'es').format(_delivery)),
            onTap: () async {
              final today = context.read<AppState>().now();
              final d = await showDatePicker(context: context, initialDate: _delivery, firstDate: today, lastDate: today.add(const Duration(days: 30)));
              if (d != null) setState(() => _delivery = d);
            },
          ),
          TextField(controller: _notes, maxLines: 2, decoration: const InputDecoration(labelText: 'Observaciones', border: OutlineInputBorder())),
          const SizedBox(height: 16),
          Row(children: [
            Text('Total cotizado', style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            Text(fmtBob(_total), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          ]),
          const Text('El precio final lo define la venta según los lotes que se despachen.', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save),
            label: Text(_saving ? (_isEdit ? 'Guardando…' : 'Guardando (obteniendo GPS)…') : (_isEdit ? 'Guardar cambios' : 'Guardar pedido')),
          ),
        ],
      ),
    );
  }
}

class _CustomerPicker extends StatefulWidget {
  const _CustomerPicker();

  @override
  State<_CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends State<_CustomerPicker> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final customers = context.watch<AppState>().customers.where((c) => _q.isEmpty || c.name.toLowerCase().contains(_q.toLowerCase())).toList();
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.8,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              autofocus: true,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Buscar cliente', border: OutlineInputBorder()),
              onChanged: (v) => setState(() => _q = v),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.person_add_alt),
            title: const Text('Registrar cliente nuevo'),
            onTap: () async {
              final created = await Navigator.push<Customer>(context, MaterialPageRoute(builder: (_) => const CustomerFormScreen()));
              if (created != null && context.mounted) Navigator.pop(context, created);
            },
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView.builder(
              itemCount: customers.length,
              itemBuilder: (_, i) => ListTile(
                title: Text(customers[i].name),
                subtitle: Text(customers[i].primaryAddress?.address ?? customers[i].code ?? ''),
                onTap: () => Navigator.pop(context, customers[i]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class _ProductPicker extends StatelessWidget {
  const _ProductPicker();

  @override
  Widget build(BuildContext context) {
    final products = context.watch<AppState>().products;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: ListView(children: [
          const ListTile(title: Text('Catálogo', style: TextStyle(fontWeight: FontWeight.bold))),
          for (final p in products)
            ListTile(
              title: Text(p.name),
              subtitle: Text('${p.category} · disponible ${fmtKg(p.availableKg)}'),
              trailing: Text(p.referencePrice == null ? 'Sin stock' : '${fmtBob(p.referencePrice!)}/kg'),
              onTap: () => Navigator.pop(context, p),
            ),
        ]),
      ),
    );
  }
}
