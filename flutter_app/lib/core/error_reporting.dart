import 'package:flutter/foundation.dart';

/// Single choke point for uncaught errors, so wiring a crash reporter later (Sentry, Firebase
/// Crashlytics) is one assignment instead of a hunt through the app:
///
///     ErrorReporting.onReport = (error, stack) => Sentry.captureException(error, stackTrace: stack);
///
/// Until then errors go to the console in debug and are swallowed-with-log in release, which
/// beats the framework default of killing the isolate on an async error from a stray callback.
class ErrorReporting {
  ErrorReporting._();

  static void Function(Object error, StackTrace? stack)? onReport;

  static void install() {
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      previous?.call(details); // keeps the red-screen / console dump in debug
      _report(details.exception, details.stack);
    };
    // Errors thrown outside the widget tree: un-awaited futures, timers, platform callbacks
    PlatformDispatcher.instance.onError = (error, stack) {
      _report(error, stack);
      return true;
    };
  }

  @visibleForTesting
  static void report(Object error, StackTrace? stack) => _report(error, stack);

  static void _report(Object error, StackTrace? stack) {
    debugPrint('Unhandled error: $error');
    try {
      onReport?.call(error, stack);
    } catch (_) {
      // A broken reporter must never cause a second crash
    }
  }
}
