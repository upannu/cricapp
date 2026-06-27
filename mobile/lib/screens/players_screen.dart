import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../data/mock_players.dart';
import '../models/player.dart';

class PlayersScreen extends StatelessWidget {
  const PlayersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final active = mockPlayers
        .where((p) =>
            Player.getStatus(p.subscription.endDate) ==
            SubscriptionStatus.active)
        .length;
    final expiring = mockPlayers
        .where((p) =>
            Player.getStatus(p.subscription.endDate) ==
            SubscriptionStatus.expiring)
        .length;
    final activeSubs = mockPlayers
        .where((p) =>
            p.subscription.plan != 'Free' &&
            Player.getStatus(p.subscription.endDate) ==
                SubscriptionStatus.active)
        .length;

    return Scaffold(
      backgroundColor: AppColors.ink,
      appBar: AppBar(
        title: const Text(
          'PACE HQ',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            letterSpacing: 3,
            fontSize: 16,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: CircleAvatar(
              backgroundColor: AppColors.paceGreen,
              radius: 18,
              child: Text(
                'CS',
                style: TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
            ),
          ),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Players',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Manage your players and subscriptions',
                    style:
                        TextStyle(color: AppColors.zinc400, fontSize: 13),
                  ),
                  const SizedBox(height: 16),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 2.5,
                    children: [
                      _StatCard(label: 'Active Players', value: '$active'),
                      _StatCard(
                          label: 'Active Subscriptions', value: '$activeSubs'),
                      _StatCard(
                        label: 'Expiring in 7 Days',
                        value: '$expiring',
                        valueColor:
                            expiring > 0 ? AppColors.fire : null,
                      ),
                      const _StatCard(
                          label: 'Sessions This Month', value: '24'),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'ALL PLAYERS',
                    style: TextStyle(
                      color: AppColors.zinc400,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverList.separated(
              itemCount: mockPlayers.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final player = mockPlayers[i];
                return _PlayerCard(
                  player: player,
                  onTap: () => context.go('/players/${player.id}'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _StatCard({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: TextStyle(
              color: AppColors.zinc400,
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: valueColor ?? Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

class _PlayerCard extends StatelessWidget {
  final Player player;
  final VoidCallback onTap;

  const _PlayerCard({required this.player, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status = Player.getStatus(player.subscription.endDate);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
        ),
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.paceGreen.withValues(alpha: 0.2),
              child: Text(
                player.initials,
                style: const TextStyle(
                  color: AppColors.paceGreen,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    player.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    player.bowlingStyle,
                    style: TextStyle(color: AppColors.zinc400, fontSize: 12),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      _PlanBadge(plan: player.subscription.plan),
                      const SizedBox(width: 6),
                      _StatusBadge(status: status),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  _fmtDate(player.subscription.endDate),
                  style: TextStyle(
                    color: status == SubscriptionStatus.expiring
                        ? AppColors.amber
                        : status == SubscriptionStatus.expired
                            ? Colors.redAccent
                            : AppColors.zinc400,
                    fontSize: 11,
                    fontWeight: status != SubscriptionStatus.active
                        ? FontWeight.w600
                        : FontWeight.normal,
                  ),
                ),
                const SizedBox(height: 2),
                Text('Ends',
                    style:
                        TextStyle(color: AppColors.zinc600, fontSize: 10)),
                const SizedBox(height: 6),
                Icon(Icons.chevron_right, color: AppColors.zinc600, size: 18),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _fmtDate(String s) {
    final d = DateTime.parse(s);
    const m = [
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
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
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(plan,
          style: TextStyle(
              color: color, fontSize: 9, fontWeight: FontWeight.w600)),
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
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label,
          style: TextStyle(
              color: fg, fontSize: 9, fontWeight: FontWeight.w600)),
    );
  }
}
