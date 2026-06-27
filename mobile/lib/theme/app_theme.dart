import 'package:flutter/material.dart';

class AppColors {
  static const ink = Color(0xFF050F1F);
  static const surface = Color(0xFF1A2E45);
  static const surfaceHover = Color(0xFF243D57);
  static const paceGreen = Color(0xFF00D4AA);
  static const fire = Color(0xFFFF6B2B);
  static const amber = Color(0xFFF59E0B);
  static const zinc400 = Color(0xFF9CA3AF);
  static const zinc600 = Color(0xFF4B5563);
  static const zinc700 = Color(0xFF374151);
}

class AppTheme {
  static ThemeData get dark {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.ink,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.paceGreen,
        secondary: AppColors.fire,
        surface: AppColors.surface,
        onSurface: Colors.white,
        onPrimary: AppColors.ink,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: const CardTheme(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.ink,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.zinc700),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.zinc700),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.paceGreen, width: 2),
        ),
        hintStyle: const TextStyle(color: AppColors.zinc600),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.paceGreen,
          foregroundColor: AppColors.ink,
          elevation: 0,
          minimumSize: const Size(double.infinity, 48),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            letterSpacing: 1.5,
          ),
        ),
      ),
    );
  }
}
