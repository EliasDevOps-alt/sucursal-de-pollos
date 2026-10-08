import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// Error con respuesta del servidor (4xx/5xx).
class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  bool get isUnauthorized => status == 401;
  @override
  String toString() => message;
}

/// Sin conexión o servidor inalcanzable: la operación queda en la cola.
class OfflineException implements Exception {
  OfflineException([this.detail = '']);
  final String detail;
  @override
  String toString() => 'Sin conexión con el servidor';
}

class ApiClient {
  ApiClient({required this.baseUrl, this.token, http.Client? client}) : _http = client ?? http.Client();

  String baseUrl; // ej. http://192.168.1.10:3000/api
  String? token;
  final http.Client _http;
  static const _timeout = Duration(seconds: 20);

  Uri _uri(String path) => Uri.parse('${baseUrl.replaceAll(RegExp(r'/+$'), '')}$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request().timeout(_timeout);
    } on SocketException catch (e) {
      throw OfflineException(e.message);
    } on TimeoutException {
      throw OfflineException('tiempo de espera agotado');
    } on http.ClientException catch (e) {
      throw OfflineException(e.message);
    }
    final body = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    final msg = body is Map ? body['message'] : null;
    throw ApiException(res.statusCode, msg is List ? msg.join('. ') : (msg?.toString() ?? 'Error ${res.statusCode}'));
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    final data = await _send(() => _http.post(_uri('/auth/login'),
        headers: _headers, body: jsonEncode({'username': username, 'password': password, 'client': 'mobile'})));
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> bootstrap() async =>
      Map<String, dynamic>.from(await _send(() => _http.get(_uri('/mobile/bootstrap'), headers: _headers)) as Map);

  /// Comprobante armado por el servidor (entrega o cobro ya sincronizados).
  Future<Map<String, dynamic>> receipt(String slug, String id) async =>
      Map<String, dynamic>.from(await _send(() => _http.get(_uri('/receipts/$slug/$id'), headers: _headers)) as Map);

  Future<Map<String, dynamic>> sync(String deviceUuid, String appVersion, List<Map<String, dynamic>> operations) async {
    final data = await _send(() => _http.post(_uri('/mobile/sync'),
        headers: _headers, body: jsonEncode({'deviceUuid': deviceUuid, 'appVersion': appVersion, 'operations': operations})));
    return Map<String, dynamic>.from(data as Map);
  }
}
