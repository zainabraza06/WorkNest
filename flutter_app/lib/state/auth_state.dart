import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../services/api_client.dart';

enum AuthStatus { unknown, signedOut, signedIn }

/// Owns the session: token (in the platform keystore, never plain prefs), user and profile.
class AuthState extends ChangeNotifier {
  AuthState(this.api, {FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage() {
    api.onUnauthorized = () => signOut(sessionExpired: true);
  }

  final ApiClient api;
  final FlutterSecureStorage _storage;
  static const _tokenKey = 'worknest.token';

  AuthStatus status = AuthStatus.unknown;
  Json? user;
  Json? profile;
  String? notice;

  bool get isWorker => user?['role'] == 'worker';
  bool get isClient => user?['role'] == 'client';
  String get name => (user?['name'] as String?) ?? '';
  String get userId => (user?['_id'] ?? user?['id'] ?? '') as String;

  /// Restores a saved session. Validates it against the server so a revoked/expired token
  /// lands on the login screen rather than on a shell full of 401s.
  Future<void> bootstrap() async {
    try {
      final saved = await _storage.read(key: _tokenKey);
      if (saved == null) return _set(AuthStatus.signedOut);
      api.token = saved;
      final me = await api.get('/auth/me') as Json;
      user = me['user'] as Json?;
      profile = me['profile'] as Json?;
      _set(AuthStatus.signedIn);
    } on ApiException catch (e) {
      // Offline at launch should not log the user out; only a real auth failure does
      if (e.status == 401 || e.status == 403) {
        await _clear();
        _set(AuthStatus.signedOut);
      } else {
        _set(user != null ? AuthStatus.signedIn : AuthStatus.signedOut);
      }
    } catch (_) {
      _set(AuthStatus.signedOut);
    }
  }

  Future<void> login(String email, String password) async {
    final data = await api.post('/auth/login', {'email': email.trim(), 'password': password}) as Json;
    await _accept(data);
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    required String role,
    String? phone,
  }) async {
    final data = await api.post('/auth/register', {
      'name': name.trim(),
      'email': email.trim(),
      'password': password,
      'role': role,
      if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
    }) as Json;
    await _accept(data);
  }

  Future<void> _accept(Json data) async {
    api.token = data['token'] as String;
    user = data['user'] as Json?;
    profile = data['profile'] as Json?;
    notice = null;
    await _storage.write(key: _tokenKey, value: api.token);
    _set(AuthStatus.signedIn);
  }

  /// Changing the password revokes every other session server-side and returns a fresh token
  /// for this one, which must replace the stored token or the next request signs us out.
  Future<void> changePassword(String current, String next) async {
    final data = await api.patch('/auth/password', {'currentPassword': current, 'newPassword': next}) as Json;
    api.token = data['token'] as String;
    await _storage.write(key: _tokenKey, value: api.token);
  }

  /// Revokes every token for this account (all devices), then returns to the login screen.
  Future<void> signOutEverywhere() async {
    await api.post('/auth/logout-all');
    await signOut();
  }

  Future<void> refreshMe() async {
    final me = await api.get('/auth/me') as Json;
    user = me['user'] as Json?;
    profile = me['profile'] as Json?;
    notifyListeners();
  }

  Future<void> signOut({bool sessionExpired = false}) async {
    if (status == AuthStatus.signedOut) return;
    await _clear();
    notice = sessionExpired ? 'Your session expired. Please sign in again.' : null;
    _set(AuthStatus.signedOut);
  }

  Future<void> _clear() async {
    api.token = null;
    user = null;
    profile = null;
    try {
      await _storage.delete(key: _tokenKey);
    } catch (_) {}
  }

  void _set(AuthStatus s) {
    status = s;
    notifyListeners();
  }
}
