"""
Balance check for docs/skill-tree.md: how long until the first skill points,
half the tree and the whole tree, for four player types. The curve and the
tree size must match shared/src/skills.ts (xpToReach, TREE_POINTS).

    python3 docs/balance/levelsim.py

XP is the points scored (arena ~6,000 per game, a Blitz race ~5,000) plus
50 XP per correct answer in Practice and the Daily Scroll. Diligent student
(+5/10/15 % XP) is assumed to be the first skill a player takes.
"""
STEP_BASE = 4_000      # level 1 -> 2
STEP_GROWTH = 2_000    # each later step costs this much more...
LATE_FROM = 20         # ...and from this level on (half the tree)
LATE_GROWTH = 4_000    # this much more, so the second half takes longer
TREE_POINTS = 37       # Scholar 14 + Builder 11 + Steward 12
POINT_FROM_LEVEL = 2   # one point per level from level 2

def step(level):
    """XP from `level` to level + 1."""
    return STEP_BASE + STEP_GROWTH * (level - 1) + (LATE_GROWTH - STEP_GROWTH) * max(0, level - LATE_FROM)

def xp_to_reach(level):
    return sum(step(l) for l in range(1, level))

def level_for_xp(xp):
    lv = 1
    while xp_to_reach(lv + 1) <= xp:
        lv += 1
    return lv

def points(level):
    return max(0, level - POINT_FROM_LEVEL + 1)

BLITZ_XP, ARENA_XP, PER_CORRECT_XP = 5_000, 6_000, 50
# per week: Blitz races, arena games, Daily Scroll days (~4/5 right), Practice right answers
PLAYERS = {
    'casual (a few races a week)': dict(blitz=3, arena=1, daily=4, practice=10),
    'regular (a race a day)':      dict(blitz=7, arena=1, daily=6, practice=30),
    'keen (2 races a day)':        dict(blitz=14, arena=2, daily=7, practice=140),
    'very keen (4 races a day)':   dict(blitz=28, arena=4, daily=7, practice=280),
}

def weekly_xp(p):
    return p['blitz'] * BLITZ_XP + p['arena'] * ARENA_XP + (p['daily'] * 4 + p['practice']) * PER_CORRECT_XP

def simulate(p, targets):
    """Days (and games) until each target point count, with Diligent student bought first."""
    per_day = weekly_xp(p) / 7
    games_per_day = (p['blitz'] + p['arena']) / 7
    xp, day, out = 0.0, 0, {}
    while len(out) < len(targets) and day < 5_000:
        day += 1
        pts = points(level_for_xp(xp))
        bonus = 0.05 * min(3, pts)  # first three points into Diligent student
        xp += per_day * (1 + bonus)
        pts = points(level_for_xp(xp))
        for t in targets:
            if t not in out and pts >= t:
                out[t] = (day, round(day * games_per_day))
    return out

if __name__ == '__main__':
    print('Curve: step L->L+1 = %d + %d x (L-1) XP, + %d more per level after level %d; %d points in the tree\n'
          % (STEP_BASE, STEP_GROWTH, LATE_GROWTH - STEP_GROWTH, LATE_FROM, TREE_POINTS))
    print('%-6s %10s %7s' % ('level', 'total XP', 'points'))
    for lv in (2, 3, 5, 10, 15, 20, 25, 30, 38):
        print('%-6d %10s %7d' % (lv, f'{xp_to_reach(lv):,}', points(lv)))
    half = (TREE_POINTS + 1) // 2
    targets = [1, 3, 5, half, 28, TREE_POINTS]
    print('\nDays (games) until N points:')
    print('%-30s %8s' % ('player', 'XP/week') + ''.join('%14s' % f'{t} pts' for t in targets))
    for name, p in PLAYERS.items():
        res = simulate(p, targets)
        cells = ''.join('%14s' % (f'{res[t][0]} d ({res[t][1]})' if t in res else '-') for t in targets)
        print('%-30s %8s' % (name, f'{weekly_xp(p):,}') + cells)
