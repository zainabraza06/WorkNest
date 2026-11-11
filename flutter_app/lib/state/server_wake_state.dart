import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../core/config.dart';

/// Where the free-tier server is on its way up. Mirrors the web app's `useServerWake` hook.
///
///   awake    answered within [grace]: nothing to show
///   waking   still no answer after [grace]: show "server is waking up" with a running timer
///   ready    answered after having been asleep: show "continue working"
///   failed   still nothing after [giveUpAfter]: offer a retry
enum WakeStatus { checking, awake, waking, ready, failed }

/// Detects Render's free-tier cold start and reports it to the UI.
///
/// Render sleeps a free web service after ~15 minutes without traffic, and the first request
/// afterwards waits 30 to 50 seconds. Instead of leaving the user on a spinner, the app asks the
/// readiness endpoint as soon as it opens. While the service is asleep the platform answers with a
/// page that is not our JSON (or nothing at all), so every failure counts as "not up yet" and a
/// response only counts when it is `{"status": "ready"}`.
class ServerWakeState extends ChangeNotifier {
  ServerWakeState({
    http.Client? client,
    Uri? url,
    this.grace = const Duration(milliseconds: 1500),
    this.retryEvery = const Duration(seconds: 3),
    this.giveUpAfter = const Duration(minutes: 3),
    this.checkTimeout = const Duration(seconds: 20),
    this.trustFor = const Duration(minutes: 10),
    DateTime Function()? now,
  })  : _ownsClient = client == null,
        _client = client ?? http.Client(),
        _url = url ?? Uri.parse('${AppConfig.apiBase}/health/ready'),
        _now = now ?? DateTime.now;

  final Duration grace;
  final Duration retryEvery;
  final Duration giveUpAfter;
  final Duration checkTimeout;

  /// How long an earlier answer is trusted. Render idles a service after 15 minutes, so stay inside that.
  final Duration trustFor;

  final http.Client _client;
  final bool _ownsClient;
  final Uri _url;
  final DateTime Function() _now;

  /// Remembered for the life of the process, like the web app's per-tab memory.
  static DateTime? _lastAwakeAt;

  @visibleForTesting
  static void forgetAwake() => _lastAwakeAt = null;

  WakeStatus _status = WakeStatus.checking;
  int _elapsed = 0;
  int _run = 0; // bumps on every (re)start so a superseded poll loop stops itself
  bool _slow = false;
  bool _dismissed = false;
  bool _disposed = false;
  Timer? _graceTimer;
  Timer? _clock;

  WakeStatus get status => _status;

  /// Seconds since the check started.
  int get elapsed => _elapsed;

  /// Whether a card should be on screen.
  bool get visible => _status == WakeStatus.waking || _status == WakeStatus.ready || _status == WakeStatus.failed;

  void start() {
    final last = _lastAwakeAt;
    if (last != null && _now().difference(last) < trustFor) {
      _set(WakeStatus.awake);
      return;
    }
    _begin(retrying: false);
  }

  /// "Try again": go straight back to the waiting card and finish with a confirmation.
  void retry() => _begin(retrying: true);

  /// The user chose to carry on. Don't interrupt them later with "ready".
  void dismiss() {
    _dismissed = true;
    _stopTimers();
    _set(WakeStatus.awake);
  }

  void _begin({required bool retrying}) {
    final token = ++_run;
    _stopTimers();
    _slow = retrying;
    _dismissed = false;
    _elapsed = 0;
    _set(retrying ? WakeStatus.waking : WakeStatus.checking);

    final startedAt = _now();
    // Only announce the wake-up if the answer is actually slow
    _graceTimer = Timer(grace, () {
      if (token != _run) return;
      _slow = true;
      if (_status == WakeStatus.checking) _set(WakeStatus.waking);
    });
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (token != _run) return;
      _elapsed = _now().difference(startedAt).inSeconds;
      notifyListeners();
    });
    unawaited(_poll(token, startedAt));
  }

  Future<void> _poll(int token, DateTime startedAt) async {
    while (token == _run && !_disposed) {
      if (await _isReady()) {
        if (token != _run || _disposed) return;
        _lastAwakeAt = _now();
        _elapsed = _now().difference(startedAt).inSeconds;
        _stopTimers();
        _set(_slow && !_dismissed ? WakeStatus.ready : WakeStatus.awake);
        return;
      }
      if (_now().difference(startedAt) > giveUpAfter) {
        if (token != _run || _disposed) return;
        _stopTimers();
        _set(WakeStatus.failed);
        return;
      }
      await Future<void>.delayed(retryEvery);
    }
  }

  Future<bool> _isReady() async {
    try {
      final res = await _client.get(_url).timeout(checkTimeout);
      if (res.statusCode != 200) return false;
      final body = jsonDecode(res.body);
      return body is Map && body['status'] == 'ready';
    } catch (_) {
      // No network, a timeout, the platform's wake page (not JSON): all mean "not up yet"
      return false;
    }
  }

  void _stopTimers() {
    _graceTimer?.cancel();
    _clock?.cancel();
    _graceTimer = null;
    _clock = null;
  }

  void _set(WakeStatus s) {
    if (_disposed) return;
    _status = s;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _run++;
    _stopTimers();
    if (_ownsClient) _client.close();
    super.dispose();
  }
}
