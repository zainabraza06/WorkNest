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

  /// Render's free tier cold-starts in ~30s, so the first request needs headroom.
  static const Duration requestTimeout = Duration(seconds: 35);
}
