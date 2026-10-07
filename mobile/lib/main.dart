import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/local_db.dart';
import 'screens/driver/driver_home_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'state/app_state.dart';

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
    final seed = const Color(0xFFEB6834);
    return MaterialApp(
      title: 'ERP Pollos · Preventa y entregas',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: seed, useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.dark),
      home: Consumer<AppState>(
        builder: (_, s, __) => !s.loggedIn || s.sessionExpired
            ? const LoginScreen()
            : s.isDriver
                ? const DriverHomeScreen()
                : const HomeScreen(),
      ),
    );
  }
}
