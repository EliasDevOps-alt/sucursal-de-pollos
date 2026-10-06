import 'package:geolocator/geolocator.dart';

import 'workspace.dart';

/// GPS del teléfono. Nunca bloquea una operación: si no hay permiso o señal, devuelve null
/// y el pedido se guarda igual, sin ubicación.
class LocationService {
  Future<GeoPoint?> current({Duration timeout = const Duration(seconds: 10)}) async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return null;

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(accuracy: LocationAccuracy.high, timeLimit: timeout),
      );
      return GeoPoint(pos.latitude, pos.longitude, accuracy: pos.accuracy);
    } catch (_) {
      // Sin señal a tiempo: se intenta con la última posición conocida.
      try {
        final last = await Geolocator.getLastKnownPosition();
        return last == null ? null : GeoPoint(last.latitude, last.longitude, accuracy: last.accuracy);
      } catch (_) {
        return null;
      }
    }
  }
}
