import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/workspace.dart';
import '../state/app_state.dart';

class CustomerFormScreen extends StatefulWidget {
  const CustomerFormScreen({super.key});

  @override
  State<CustomerFormScreen> createState() => _CustomerFormScreenState();
}

class _CustomerFormScreenState extends State<CustomerFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _doc = TextEditingController();
  final _label = TextEditingController(text: 'Tienda');
  final _address = TextEditingController();
  String? _typeId;
  GeoPoint? _location;
  bool _locating = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _locate(); // el preventista suele registrar al cliente en su local: se captura la ubicación de entrada
  }

  Future<void> _locate() async {
    setState(() => _locating = true);
    final p = await context.read<AppState>().location.current();
    if (mounted) {
      setState(() {
        _location = p;
        _locating = false;
      });
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    final c = await context.read<AppState>().createCustomer(
          name: _name.text,
          customerTypeId: _typeId!,
          phone: _phone.text,
          documentId: _doc.text,
          addressLabel: _label.text.trim().isEmpty ? 'Principal' : _label.text.trim(),
          address: _address.text,
          location: _location,
        );
    if (mounted) Navigator.pop(context, c);
  }

  @override
  Widget build(BuildContext context) {
    final types = context.watch<AppState>().customerTypes;
    return Scaffold(
      appBar: AppBar(title: const Text('Nuevo cliente')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nombre o razón comercial *', border: OutlineInputBorder()),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'El nombre es obligatorio' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _typeId,
              decoration: const InputDecoration(labelText: 'Tipo de cliente *', border: OutlineInputBorder()),
              items: types.map((t) => DropdownMenuItem(value: t['id'], child: Text(t['name']!))).toList(),
              onChanged: (v) => setState(() => _typeId = v),
              validator: (v) => v == null ? 'Elija el tipo' : null,
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: TextFormField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono', border: OutlineInputBorder()))),
              const SizedBox(width: 12),
              Expanded(child: TextFormField(controller: _doc, decoration: const InputDecoration(labelText: 'CI / NIT', border: OutlineInputBorder()))),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              SizedBox(width: 120, child: TextFormField(controller: _label, decoration: const InputDecoration(labelText: 'Etiqueta', border: OutlineInputBorder()))),
              const SizedBox(width: 12),
              Expanded(child: TextFormField(controller: _address, decoration: const InputDecoration(labelText: 'Dirección', border: OutlineInputBorder()))),
            ]),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: Icon(_location == null ? Icons.location_off_outlined : Icons.location_on, color: _location == null ? null : Colors.green.shade700),
                title: Text(_locating
                    ? 'Obteniendo ubicación…'
                    : _location == null
                        ? 'Sin ubicación GPS'
                        : '${_location!.latitude.toStringAsFixed(5)}, ${_location!.longitude.toStringAsFixed(5)}'),
                subtitle: Text(_location?.accuracy == null
                    ? 'Se guarda como ubicación principal del cliente'
                    : 'Precisión ±${_location!.accuracy!.toStringAsFixed(0)} m · ubicación principal del cliente'),
                trailing: _locating ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : IconButton(onPressed: _locate, icon: const Icon(Icons.my_location)),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              icon: const Icon(Icons.save),
              label: const Text('Guardar cliente'),
            ),
          ],
        ),
      ),
    );
  }
}
