import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _user = TextEditingController();
  final _pass = TextEditingController();
  late final TextEditingController _url;
  bool _busy = false;
  bool _showServer = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final s = context.read<AppState>();
    _url = TextEditingController(text: s.apiUrl);
    if (s.user != null) _user.text = s.user!.username; // sesión vencida: se reingresa con el mismo usuario
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AppState>().login(_user.text, _pass.text, _url.text);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } on OfflineException {
      setState(() => _error = 'No se pudo conectar con el servidor. Revise la red y la dirección del servidor.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Scaffold(
      // Fondo de color (como el panel web) con el formulario en una tarjeta blanca.
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [brandOrange, brandAmber, Color(0xFFFFE066)]),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Card(
                elevation: 4,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
                  child: Form(
                    key: _form,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('🐔', textAlign: TextAlign.center, style: TextStyle(fontSize: 56)),
                        Text(
                          'ERP Pollos',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        Text(
                          'Preventa · Reparto · Cobranza',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: const Color(0xFFE8590C)),
                        ),
                        const SizedBox(height: 24),
                        if (s.sessionExpired)
                          const Card(
                            child: Padding(
                              padding: EdgeInsets.all(12),
                              child: Text('Su sesión venció. Ingrese de nuevo: los pedidos guardados en el teléfono se conservan.'),
                            ),
                          ),
                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                          ),
                        TextFormField(
                          controller: _user,
                          decoration: const InputDecoration(labelText: 'Usuario', border: OutlineInputBorder()),
                          autocorrect: false,
                          validator: (v) => (v == null || v.trim().isEmpty) ? 'Ingrese su usuario' : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _pass,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: 'Contraseña', border: OutlineInputBorder()),
                          validator: (v) => (v == null || v.isEmpty) ? 'Ingrese su contraseña' : null,
                          onFieldSubmitted: (_) => _submit(),
                        ),
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: _busy ? null : _submit,
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                          child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Ingresar'),
                        ),
                        const SizedBox(height: 8),
                        TextButton(onPressed: () => setState(() => _showServer = !_showServer), child: const Text('Servidor')),
                        if (_showServer)
                          TextFormField(
                            controller: _url,
                            keyboardType: TextInputType.url,
                            decoration: const InputDecoration(
                              labelText: 'Dirección del servidor',
                              helperText: 'Emulador: http://10.0.2.2:3000/api · Teléfono: http://IP-de-la-PC:3000/api',
                              border: OutlineInputBorder(),
                            ),
                            validator: (v) => (v == null || !v.startsWith('http')) ? 'Dirección inválida' : null,
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
