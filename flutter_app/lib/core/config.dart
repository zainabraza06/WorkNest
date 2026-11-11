/// Build-time configuration.
///
/// Override per environment instead of editing code:
///   flutter run --dart-define=API_URL=http://10.0.2.2:5000   (Android emulator -> local API)
///   flutter build apk --dart-define=API_URL=https://api.worknest.pk
class AppConfig {
  AppConfig._();

  static const String apiOrigin = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://worknest-qicp.onrender.com',
  );

  static const String apiBase = '$apiOrigin/api';

  /// The web app, for the few things the phone hands off (Stripe escrow payment, disputes).
  static const String webOrigin = String.fromEnvironment(
    'WEB_URL',
    defaultValue: 'https://work-nest-z.vercel.app',
  );

  /// Render's free tier cold-starts in 30 to 50 s (measured 33 s from a warm laptop; the platform
  /// documents ~50 s), so the first request after idle needs real headroom. A shorter timeout
  /// makes the first sign-in of the day fail with "Unable to reach the server".
  static const Duration requestTimeout = Duration(seconds: 60);
}
