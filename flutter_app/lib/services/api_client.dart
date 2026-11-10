import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../core/config.dart';

typedef Json = Map<String, dynamic>;

/// A failed API call, normalised so screens never parse raw responses.
/// Mirrors ApiRequestError on the web client.
class ApiException implements Exception {
  ApiException(this.message, {this.status = 0, this.details = const []});

  final String message;
  final int status;
  final List<dynamic> details;

  bool get isNetwork => status == 0;

  /// { 'budget.max': 'Maximum must be…' } — for mapping onto form fields.
  Map<String, String> get fieldErrors => {
        for (final d in details)
          if (d is Map && d['path'] != null) '${d['path']}': '${d['message']}',
      };

  @override
  String toString() => message;
}

/// Thin JSON client over the WorkNest API.
///
/// - Unwraps the `{ success, data }` envelope.
/// - Attaches the bearer token.
/// - Retries idempotent GETs once on transient failures (Render cold starts, flaky mobile data).
/// - Reports a 401 on an authenticated session so the app can sign the user out.
class ApiClient {
  ApiClient({http.Client? client}) : _http = client ?? http.Client();

  final http.Client _http;
  String? token;
  void Function()? onUnauthorized;

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final params = <String, String>{
      for (final e in (query ?? {}).entries)
        if (e.value != null && '${e.value}'.isNotEmpty) e.key: '${e.value}',
    };
    return Uri.parse('${AppConfig.apiBase}$path').replace(queryParameters: params.isEmpty ? null : params);
  }

  Map<String, String> get _headers => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send('GET', path, query: query, retry: true);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body: body);
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body: body);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? query,
    Object? body,
    bool retry = false,
  }) async {
    final request = http.Request(method, _uri(path, query))..headers.addAll(_headers);
    if (body != null) request.body = jsonEncode(body);

    try {
      final streamed = await _http.send(request).timeout(AppConfig.requestTimeout);
      final response = await http.Response.fromStream(streamed);

      if (retry && const [502, 503, 504].contains(response.statusCode)) {
        return await _send(method, path, query: query, body: body);
      }
      return await _handle(response, path);
    } on TimeoutException {
      if (retry) return _send(method, path, query: query, body: body);
      throw ApiException('The server took too long to respond.');
    } on SocketException {
      if (retry) return _send(method, path, query: query, body: body);
      throw ApiException('Unable to reach the server. Check your connection.');
    } on http.ClientException {
      throw ApiException('Unable to reach the server. Check your connection.');
    }
  }

  dynamic _handle(http.Response response, String path) {
    dynamic decoded;
    try {
      decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    } on FormatException {
      decoded = null;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded is Map ? decoded['data'] : decoded;
    }

    // A rejected login is a 401 too, but it is not an expired session
    if (response.statusCode == 401 && token != null && !path.startsWith('/auth/login')) {
      onUnauthorized?.call();
    }
    final map = decoded is Map ? decoded : const {};
    throw ApiException(
      (map['message'] as String?) ?? 'Something went wrong. Please try again.',
      status: response.statusCode,
      details: (map['details'] as List?) ?? const [],
    );
  }

  void close() => _http.close();
}
