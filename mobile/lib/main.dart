import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/local_db.dart';
import 'screens/collector/collector_home_screen.dart';
import 'screens/driver/driver_home_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'state/app_state.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es');
  final db = await LocalDb.open();
  final state = AppState(db: db);
  await state.init();
  runApp(ChangeNotifierProvider.value(value: state, child: const PreventaApp()));
}

class PreventaApp extends StatelessWidget {
  const PreventaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ERP Pollos · Preventa, entregas y cobranza',
      debugShowCheckedModeBanner: false,
      // Siempre claro, aunque el teléfono esté en modo oscuro.
      theme: appTheme(),
      themeMode: ThemeMode.light,
      home: Consumer<AppState>(
        builder: (_, s, __) => !s.loggedIn || s.sessionExpired
            ? const LoginScreen()
            : s.isDriver
                ? const DriverHomeScreen()
                : s.isCollector
                    ? const CollectorHomeScreen()
                    : const HomeScreen(),
      ),
    );
  }
}
