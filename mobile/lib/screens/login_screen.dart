import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';

enum _Role { coach, player }

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  _Role _role = _Role.coach;
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 20),
                  _buildLogo(),
                  const SizedBox(height: 36),
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Sign in to your account',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 20),
                        _buildRoleToggle(),
                        const SizedBox(height: 20),
                        _fieldLabel('EMAIL'),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          style: const TextStyle(color: Colors.white),
                          decoration:
                              const InputDecoration(hintText: 'your@email.com'),
                        ),
                        const SizedBox(height: 14),
                        _fieldLabel('PASSWORD'),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _passwordCtrl,
                          obscureText: true,
                          style: const TextStyle(color: Colors.white),
                          decoration:
                              const InputDecoration(hintText: '••••••••'),
                        ),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () {},
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.paceGreen,
                              padding: EdgeInsets.zero,
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: const Text('Forgot password?',
                                style: TextStyle(fontSize: 12)),
                          ),
                        ),
                        const SizedBox(height: 8),
                        ElevatedButton(
                          onPressed: () => context.go('/players'),
                          child: const Text('SIGN IN'),
                        ),
                        const SizedBox(height: 20),
                        _buildDivider(),
                        const SizedBox(height: 16),
                        _buildSSOButtons(),
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              "Don't have an account? ",
                              style: TextStyle(
                                  color: AppColors.zinc400, fontSize: 13),
                            ),
                            GestureDetector(
                              onTap: () {},
                              child: const Text(
                                'Sign up',
                                style: TextStyle(
                                  color: AppColors.paceGreen,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogo() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CustomPaint(size: const Size(28, 28), painter: _SpeedPainter()),
            const SizedBox(width: 10),
            const Text(
              'PACE HQ',
              style: TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.bold,
                letterSpacing: 4,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Fast Bowling Performance Platform',
          style: TextStyle(color: AppColors.zinc400, fontSize: 13),
        ),
      ],
    );
  }

  Widget _buildRoleToggle() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          _toggleBtn(_Role.coach, 'COACH'),
          const SizedBox(width: 4),
          _toggleBtn(_Role.player, 'PLAYER'),
        ],
      ),
    );
  }

  Widget _toggleBtn(_Role role, String label) {
    final active = _role == role;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _role = role),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: active ? AppColors.paceGreen : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: active ? AppColors.ink : AppColors.zinc400,
              fontWeight: FontWeight.bold,
              fontSize: 12,
              letterSpacing: 1.5,
            ),
          ),
        ),
      ),
    );
  }

  Widget _fieldLabel(String text) => Text(
        text,
        style: const TextStyle(
          color: AppColors.zinc400,
          fontSize: 10,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.5,
        ),
      );

  Widget _buildDivider() => Row(
        children: [
          const Expanded(child: Divider(color: AppColors.zinc700)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'or continue with',
              style: TextStyle(color: AppColors.zinc400, fontSize: 11),
            ),
          ),
          const Expanded(child: Divider(color: AppColors.zinc700)),
        ],
      );

  Widget _buildSSOButtons() => Row(
        children: [
          Expanded(child: _ssoBtn('Google', Icons.g_mobiledata_rounded)),
          const SizedBox(width: 12),
          Expanded(child: _ssoBtn('Apple', Icons.apple)),
        ],
      );

  Widget _ssoBtn(String label, IconData icon) => OutlinedButton.icon(
        onPressed: () {},
        icon: Icon(icon, size: 18, color: Colors.black87),
        label: Text(label,
            style: const TextStyle(
                color: Colors.black87, fontWeight: FontWeight.w500)),
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white,
          side: BorderSide.none,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(vertical: 12),
        ),
      );
}

class _SpeedPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = AppColors.paceGreen
      ..strokeWidth = 2.2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final path = Path()
      ..moveTo(0, size.height)
      ..lineTo(size.width * 0.22, size.height * 0.6)
      ..lineTo(size.width * 0.44, size.height * 0.72)
      ..lineTo(size.width * 0.67, size.height * 0.2)
      ..lineTo(size.width * 0.85, size.height * 0.44);

    canvas.drawPath(path, linePaint);

    canvas.drawCircle(
      Offset(size.width * 0.85, size.height * 0.44),
      2.8,
      Paint()..color = AppColors.fire,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter _) => false;
}
