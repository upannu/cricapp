import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../data/mock_players.dart';
import '../models/player.dart';

class PlayerProfileScreen extends StatelessWidget {
  final String playerId;
  const PlayerProfileScreen({super.key, required this.playerId});

  @override
  Widget build(BuildContext context) {
    final player = getPlayerById(playerId);
    if (player == null) {
      return Scaffold(
        backgroundColor: AppColors.ink,
        appBar: AppBar(title: const Text('Player Not Found')),
        body: const Center(
            child: Text('Player not found',
                style: TextStyle(color: Colors.white))),
      );
    }
    final status = Player.getStatus(player.subscription.endDate);

    return Scaffold(
      backgroundColor: AppColors.ink,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.go('/players'),
        ),
        title: const Text('Player Profile',
            style: TextStyle(color: Colors.white, fontSize: 16)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _HeaderCard(player: player, status: status),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Subscription',
              children: [
                _InfoRow('Plan', player.subscription.plan),
                _InfoRow(
                  'Status',
                  _statusLabel(status),
                  valueColor: _statusColor(status),
                ),
                _InfoRow('Start Date',
                    _fmtDate(player.subscription.startDate)),
                _InfoRow(
                  'Renewal Date',
                  _fmtDate(player.subscription.endDate) +
                      (status == SubscriptionStatus.expiring
                          ? ' — Renew now'
                          : ''),
                  valueColor: status == SubscriptionStatus.expiring
                      ? AppColors.amber
                      : status == SubscriptionStatus.expired
                          ? Colors.redAccent
                          : null,
                ),
                _InfoRow(
                  'Sessions Used',
                  player.subscription.sessionsLimit != null
                      ? '${player.subscription.sessionsUsed} / ${player.subscription.sessionsLimit}'
                      : '${player.subscription.sessionsUsed} (unlimited)',
                ),
              ],
            ),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Latest Biomechanics',
              children: [
                _InfoRow(
                  'Ball Speed',
                  '${player.biomechanics.ballSpeedKmh.toStringAsFixed(1)} km/h',
                  valueColor: AppColors.paceGreen,
                  mono: true,
                ),
                _InfoRow(
                  'Front Knee Angle',
                  '${player.biomechanics.frontKneeAngleDeg}°',
                  mono: true,
                ),
                _InfoRow('Action Type', player.biomechanics.actionType),
                _InfoRow(
                  'Injury Risk',
                  player.biomechanics.injuryRisk,
                  valueColor:
                      _injuryColor(player.biomechanics.injuryRisk),
                ),
                _InfoRow('Last Session',
                    _fmtDate(player.biomechanics.lastSession)),
              ],
            ),
            const SizedBox(height: 12),
            _AcademyCard(academy: player.academy),
            const SizedBox(height: 12),
            _SectionCard(
              title: 'Contact & Profile',
              children: [
                _InfoRow('Email', player.email),
                _InfoRow('Age Group', player.ageGroup),
                _InfoRow('Club', player.club),
                _InfoRow('Coach', player.coachAssigned),
                _InfoRow(
                  'Guardian Consent',
                  player.guardianConsentStatus,
                  valueColor:
                      player.guardianConsentStatus == 'Confirmed'
                          ? AppColors.paceGreen
                          : player.guardianConsentStatus == 'Pending'
                              ? AppColors.amber
                              : null,
                ),
              ],
            ),
            const SizedBox(height: 20),
            _ActionButtons(status: status),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  String _statusLabel(SubscriptionStatus s) => switch (s) {
        SubscriptionStatus.active => 'Active',
        SubscriptionStatus.expiring => 'Expiring',
        SubscriptionStatus.expired => 'Expired',
      };

  Color _statusColor(SubscriptionStatus s) => switch (s) {
        SubscriptionStatus.active => AppColors.paceGreen,
        SubscriptionStatus.expiring => AppColors.amber,
        SubscriptionStatus.expired => Colors.redAccent,
      };

  Color _injuryColor(String risk) => switch (risk) {
        'High' => AppColors.fire,
        'Moderate' => AppColors.amber,
        _ => AppColors.paceGreen,
      };

  static String _fmtDate(String s) {
    final d = DateTime.parse(s);
    const m = [
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

// ─── Sub-widgets ──────────────────────────────────────────────────────────────

class _HeaderCard extends StatelessWidget {
  final Player player;
  final SubscriptionStatus status;
  const _HeaderCard({required this.player, required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: AppColors.paceGreen,
            child: Text(
              player.initials,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.bold,
                fontSize: 20,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  player.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(player.bowlingStyle,
                    style:
                        TextStyle(color: AppColors.zinc400, fontSize: 13)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _PlanBadge(plan: player.subscription.plan),
                    _StatusBadge(status: status),
                    if (player.biomechanics.injuryRisk != 'Low')
                      _InjuryBadge(risk: player.biomechanics.injuryRisk),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '⚡ ${_fmtXP(player.xp)} XP',
                  style: const TextStyle(
                    color: AppColors.paceGreen,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _fmtXP(int xp) =>
      xp >= 1000 ? '${(xp / 1000).toStringAsFixed(1)}k' : '$xp';
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(
              color: AppColors.zinc400,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _AcademyCard extends StatelessWidget {
  final AcademyProgress academy;
  const _AcademyCard({required this.academy});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ACADEMY PROGRESS',
            style: TextStyle(
              color: AppColors.zinc400,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          _InfoRow('Stage', academy.stage, valueColor: AppColors.paceGreen),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Completion',
                  style: TextStyle(color: AppColors.zinc400, fontSize: 13)),
              Text('${academy.completionPercent}%',
                  style: const TextStyle(color: Colors.white, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: academy.completionPercent / 100,
              backgroundColor: AppColors.ink,
              valueColor:
                  const AlwaysStoppedAnimation(AppColors.paceGreen),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 8),
          _InfoRow('Sessions', '${academy.totalSessions}'),
          _InfoRow('XP Earned', '⚡ ${_fmtXP(academy.xp)}', mono: true),
          _InfoRow('Articles Read', '${academy.articlesRead} / 29'),
        ],
      ),
    );
  }

  String _fmtXP(int xp) =>
      xp >= 1000 ? '${(xp / 1000).toStringAsFixed(1)}k' : '$xp';
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final bool mono;

  const _InfoRow(this.label, this.value, {this.valueColor, this.mono = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(color: AppColors.zinc400, fontSize: 13)),
          const SizedBox(width: 16),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? Colors.white,
                fontSize: 13,
                fontWeight:
                    valueColor != null ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButtons extends StatelessWidget {
  final SubscriptionStatus status;
  const _ActionButtons({required this.status});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: _OutlineBtn('View All Reports', () {})),
            const SizedBox(width: 10),
            Expanded(child: _OutlineBtn('Action Plans', () {})),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _OutlineBtn(
                'Manage Subscription',
                () {},
                color: status != SubscriptionStatus.active
                    ? AppColors.fire
                    : null,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton(
                onPressed: () {},
                child: const Text('+ NEW SESSION'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _OutlineBtn extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final Color? color;
  const _OutlineBtn(this.label, this.onTap, {this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? Colors.white;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color != null ? color!.withValues(alpha: 0.1) : AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: (color ?? AppColors.zinc600).withValues(alpha: 0.4)),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
              color: c, fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _PlanBadge extends StatelessWidget {
  final String plan;
  const _PlanBadge({required this.plan});

  @override
  Widget build(BuildContext context) {
    final color = plan == 'Coach Pro'
        ? AppColors.paceGreen
        : plan == 'Player Pro'
            ? Colors.blue[300]!
            : AppColors.zinc400;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.6)),
      ),
      child: Text(plan,
          style: TextStyle(
              color: color, fontSize: 10, fontWeight: FontWeight.w600)),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final SubscriptionStatus status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg, String label) = switch (status) {
      SubscriptionStatus.active => (
          AppColors.paceGreen.withValues(alpha: 0.15),
          AppColors.paceGreen,
          'Active'
        ),
      SubscriptionStatus.expiring => (
          AppColors.amber.withValues(alpha: 0.15),
          AppColors.amber,
          'Expiring'
        ),
      SubscriptionStatus.expired => (
          Colors.red.withValues(alpha: 0.15),
          Colors.redAccent,
          'Expired'
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label,
          style: TextStyle(
              color: fg, fontSize: 10, fontWeight: FontWeight.w600)),
    );
  }
}

class _InjuryBadge extends StatelessWidget {
  final String risk;
  const _InjuryBadge({required this.risk});

  @override
  Widget build(BuildContext context) {
    final color = risk == 'High' ? AppColors.fire : AppColors.amber;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        '⚠ $risk Risk',
        style: TextStyle(
            color: color, fontSize: 10, fontWeight: FontWeight.w600),
      ),
    );
  }
}
