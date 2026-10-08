import 'dart:io';

import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'escpos.dart';

class PrinterDevice {
  const PrinterDevice(this.name, this.address);
  final String name;
  final String address; // MAC
}

class PrinterException implements Exception {
  PrinterException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Envío de bytes a la impresora. La implementación real usa Bluetooth clásico (SPP); las pruebas usan una falsa.
abstract class PrinterTransport {
  Future<void> ensurePermissions();
  Future<List<PrinterDevice>> paired();
  Future<void> send(String address, List<int> bytes);
}

class BluetoothTransport implements PrinterTransport {
  @override
  Future<void> ensurePermissions() async {
    if (!Platform.isAndroid) return;
    // Android 12+: permisos de "dispositivos cercanos"; en versiones anteriores se conceden al instalar.
    final result = await [Permission.bluetoothConnect, Permission.bluetoothScan].request();
    if (result.values.any((s) => s.isPermanentlyDenied)) {
      throw PrinterException('Falta el permiso de Bluetooth: actívelo en Ajustes > Aplicaciones > Preventa Pollos > Permisos');
    }
    if (result.values.any((s) => !s.isGranted && !s.isLimited)) throw PrinterException('Sin permiso de Bluetooth no se puede imprimir');
    if (!await PrintBluetoothThermal.bluetoothEnabled) throw PrinterException('Encienda el Bluetooth del teléfono');
  }

  @override
  Future<List<PrinterDevice>> paired() async {
    await ensurePermissions();
    final list = await PrintBluetoothThermal.pairedBluetooths;
    return [for (final d in list) PrinterDevice(d.name, d.macAdress)];
  }

  @override
  Future<void> send(String address, List<int> bytes) async {
    await ensurePermissions();
    if (!await PrintBluetoothThermal.connectionStatus) {
      final ok = await PrintBluetoothThermal.connect(macPrinterAddress: address);
      if (!ok) throw PrinterException('No se pudo conectar con la impresora. ¿Está encendida y cerca?');
    }
    // En partes: algunas térmicas pierden datos si el búfer se llena (sobre todo con la firma).
    const chunk = 1024;
    for (var i = 0; i < bytes.length; i += chunk) {
      final ok = await PrintBluetoothThermal.writeBytes(bytes.sublist(i, i + chunk > bytes.length ? bytes.length : i + chunk));
      if (!ok) {
        await PrintBluetoothThermal.disconnect;
        throw PrinterException('Se cortó la conexión con la impresora');
      }
    }
  }
}

/// Impresora elegida y ancho del papel. Se guardan en el teléfono (no se borran al cerrar sesión).
class PrinterService {
  PrinterService({PrinterTransport? transport}) : transport = transport ?? BluetoothTransport();

  final PrinterTransport transport;
  PrinterDevice? device;
  PaperWidth paper = PaperWidth.mm58;

  static const _kAddress = 'printer.address';
  static const _kName = 'printer.name';
  static const _kWidth = 'printer.width';

  bool get configured => device != null;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final address = prefs.getString(_kAddress);
    device = address == null ? null : PrinterDevice(prefs.getString(_kName) ?? address, address);
    paper = PaperWidth.fromMm(prefs.getInt(_kWidth) ?? 58);
  }

  Future<void> choose(PrinterDevice? d, PaperWidth width) async {
    final prefs = await SharedPreferences.getInstance();
    device = d;
    paper = width;
    if (d == null) {
      await prefs.remove(_kAddress);
      await prefs.remove(_kName);
    } else {
      await prefs.setString(_kAddress, d.address);
      await prefs.setString(_kName, d.name);
    }
    await prefs.setInt(_kWidth, width.mm);
  }

  Future<void> print(List<int> bytes) async {
    final d = device;
    if (d == null) throw PrinterException('Elija la impresora en "Estado y cuenta" > Impresora');
    await transport.send(d.address, bytes);
  }

  /// Página de prueba: acentos, ancho de renglón y corte.
  List<int> testPage() {
    final p = EscPos(paper)..init();
    p.align(1);
    p.bold(true);
    p.line('PRUEBA DE IMPRESIÓN');
    p.bold(false);
    p.line('Papel de ${paper.mm} mm · ${paper.columns} columnas');
    p.separator();
    p.align(0);
    p.wrapped('Acentos: á é í ó ú ñ Ñ ¿? ¡! N.º 1 · 2,5 kg × Bs 16,00');
    p.pair('Total', 'Bs 1.234,50');
    p.line('1234567890' * (paper.columns ~/ 10) + '1234567890'.substring(0, paper.columns % 10));
    p.feed(4);
    p.cut();
    return p.bytes();
  }
}
