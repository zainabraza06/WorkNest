import 'package:flutter/material.dart';

/// Mirrors the web design tokens (frontend/src/index.css) so both clients read as one product.
class Palette {
  Palette._();

  static const ink50 = Color(0xFFFAFAFA);
  static const ink100 = Color(0xFFF4F4F5);
  static const ink200 = Color(0xFFE4E4E7);
  static const ink300 = Color(0xFFD4D4D8);
  static const ink400 = Color(0xFFA1A1AA);
  static const ink500 = Color(0xFF71717A);
  static const ink600 = Color(0xFF52525B);
  static const ink700 = Color(0xFF3F3F46);
  static const ink800 = Color(0xFF27272A);
  static const ink900 = Color(0xFF18181B);
  static const ink950 = Color(0xFF09090B);

  static const primary50 = Color(0xFFFFF4ED);
  static const primary100 = Color(0xFFFFE6D5);
  static const primary400 = Color(0xFFFF7A3C);
  static const primary500 = Color(0xFFFF5A1F);
  static const primary600 = Color(0xFFF03E00);
  static const primary700 = Color(0xFFC62F00);

  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFD97706);
  static const danger = Color(0xFFDC2626);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Palette.primary500,
    brightness: Brightness.light,
  ).copyWith(
    primary: Palette.primary500,
    onPrimary: Colors.white,
    secondary: Palette.ink950,
    surface: Colors.white,
    onSurface: Palette.ink900,
    error: Palette.danger,
  );

  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c, width: w),
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Palette.ink50,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: Palette.ink950,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: Palette.ink950,
        fontSize: 20,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
      ),
    ),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.6, color: Palette.ink950),
      titleLarge: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.3, color: Palette.ink950),
      titleMedium: TextStyle(fontWeight: FontWeight.w700, color: Palette.ink950),
      bodyMedium: TextStyle(color: Palette.ink700, height: 1.4),
      bodySmall: TextStyle(color: Palette.ink500),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Palette.ink200),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: border(Palette.ink300),
      enabledBorder: border(Palette.ink300),
      focusedBorder: border(Palette.primary500, 1.6),
      errorBorder: border(Palette.danger),
      focusedErrorBorder: border(Palette.danger, 1.6),
      labelStyle: const TextStyle(color: Palette.ink500),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Palette.ink950,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Palette.ink950,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: Palette.ink300),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: Palette.ink950,
      side: const BorderSide(color: Palette.ink200),
      labelStyle: const TextStyle(fontWeight: FontWeight.w600, color: Palette.ink950),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Palette.primary100,
      height: 66,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
          color: s.contains(WidgetState.selected) ? Palette.ink950 : Palette.ink500,
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.ink950,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    dividerTheme: const DividerThemeData(color: Palette.ink200, space: 1),
  );
}
