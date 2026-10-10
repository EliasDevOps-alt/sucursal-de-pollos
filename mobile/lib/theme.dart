import 'package:flutter/material.dart';

/// Tema de la app: siempre claro y con color (barra superior naranja, fondo gris muy claro, tarjetas blancas).
/// Es el mismo estilo que el panel web.
const brandOrange = Color(0xFFFF7A1A);
const brandAmber = Color(0xFFFFB020);
const appBackground = Color(0xFFF5F7FB);

ThemeData appTheme({String? fontFamily}) {
  final scheme = ColorScheme.fromSeed(
    seedColor: brandOrange,
    brightness: Brightness.light,
  ).copyWith(
    primary: const Color(0xFFF76707),
    onPrimary: Colors.white,
    secondary: const Color(0xFF228BE6),
    onSecondary: Colors.white,
    tertiary: const Color(0xFF12B886),
    surface: Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: fontFamily,
    scaffoldBackgroundColor: appBackground,
    appBarTheme: const AppBarTheme(
      backgroundColor: brandOrange,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 2,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 1,
      shadowColor: Colors.black26,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: const Color(0xFFFFE8CC),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? const Color(0xFFE8590C) : const Color(0xFF495057)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFFF76707),
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFFE8590C),
        side: const BorderSide(color: Color(0xFFFFA94D)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: Color(0xFF228BE6),
      foregroundColor: Colors.white,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    chipTheme: ChipThemeData(
      selectedColor: const Color(0xFFFFE8CC),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
