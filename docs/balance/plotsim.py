"""
Balance check for docs/jerusalem-plot.md: a greedy player builds the plot hour by
hour, buying missing materials at the Market. Prints the day each house level is
reached for four player types. Edit the tables here and in the doc together.

    python3 docs/balance/plotsim.py
"""
PRICE = dict(wood=4, bricks=3, stone=5, wool=6, oil=8, cedar=30, gold=80)
# name: levels in order; each = (materials, build hours, requirements, effects)
B = {
 'house': [
  ({}, 0, {}, {}),
  ({'bricks': 15, 'wood': 5}, 0.167, {}, {}),
  ({'stone': 20, 'bricks': 15, 'wood': 10}, 2, {'well': 1, 'wall': 1}, {}),
  ({'stone': 40, 'wood': 20, 'wool': 10}, 6, {'workshop': 2, 'fold': 1}, {}),
  ({'stone': 75, 'wood': 40, 'bricks': 20, 'oil': 10}, 12, {'store': 2, 'grove': 2}, {}),
  ({'stone': 125, 'wood': 60, 'wool': 30, 'oil': 20, 'cedar': 5}, 24, {'wall': 3, 'well': 3}, {}),
  ({'stone': 150, 'cedar': 30, 'wool': 50, 'oil': 30, 'gold': 5}, 48, {'workshop': 4, 'fold': 4, 'grove': 4, 'kiln': 4, 'store': 4, 'well': 4, 'wall': 4}, {}),
 ],
 'well': [
  ({'stone': 10}, 0.083, {}, {'water': 2}),
  ({'stone': 20, 'wood': 5}, 1, {'house': 2}, {'water': 4}),
  ({'stone': 40, 'wood': 15, 'wool': 5}, 4, {'house': 3}, {'water': 7}),
  ({'stone': 80, 'bricks': 20}, 12, {'house': 4}, {'water': 10}),
  ({'stone': 125, 'bricks': 30, 'cedar': 10}, 24, {'house': 5}, {'water': 14}),
 ],
 'wall': [
  ({'wood': 5}, 0.083, {}, {}),
  ({'wood': 15}, 0.5, {'house': 2}, {}),
  ({'stone': 40}, 3, {'house': 3}, {}),
  ({'stone': 75, 'wood': 15, 'cedar': 2}, 8, {'house': 4}, {}),
  ({'stone': 125, 'wood': 30, 'cedar': 5}, 20, {'house': 6}, {}),
 ],
 'store': [
  ({'bricks': 10}, 0.167, {'house': 2}, {'cap': 20}),
  ({'bricks': 25, 'wood': 10}, 1, {'house': 3}, {'cap': 40}),
  ({'wood': 40, 'bricks': 30}, 4, {'house': 4}, {'cap': 80}),
  ({'stone': 60, 'wood': 40}, 10, {'house': 5}, {'cap': 150}),
  ({'stone': 100, 'cedar': 10}, 20, {'house': 6}, {'cap': 300}),
 ],
 'workshop': [
  ({'wood': 10, 'bricks': 5}, 0.167, {}, {'make': ('wood', 2)}),
  ({'wood': 20, 'bricks': 15}, 1, {'house': 2}, {'make': ('wood', 3)}),
  ({'stone': 30, 'wood': 30}, 4, {'house': 3}, {'make': ('wood', 4)}),
  ({'stone': 60, 'wood': 40, 'wool': 10}, 10, {'house': 4}, {'make': ('wood', 6)}),
  ({'stone': 100, 'cedar': 10, 'oil': 10}, 20, {'house': 6}, {'make': ('wood', 8)}),
 ],
 'fold': [
  ({'wood': 10}, 0.167, {'house': 2}, {'make': ('wool', 0.5), 'water': 1}),
  ({'wood': 20, 'stone': 10}, 1, {'house': 3}, {'make': ('wool', 1), 'water': 2}),
  ({'wood': 40, 'stone': 30}, 4, {'house': 4}, {'make': ('wool', 1.5), 'water': 3}),
  ({'stone': 60, 'wood': 40, 'oil': 10}, 10, {'house': 5}, {'make': ('wool', 2.5), 'water': 4}),
  ({'stone': 100, 'wood': 60, 'cedar': 10}, 20, {'house': 6}, {'make': ('wool', 3.5), 'water': 5}),
 ],
 'grove': [
  ({'wood': 10}, 0.167, {'house': 2}, {'make': ('oil', 0.25), 'water': 1}),
  ({'wood': 20, 'bricks': 10}, 1, {'house': 3}, {'make': ('oil', 0.5), 'water': 1}),
  ({'stone': 40, 'wood': 20}, 4, {'house': 4}, {'make': ('oil', 1), 'water': 2}),
  ({'stone': 60, 'wood': 30, 'wool': 10}, 10, {'house': 5}, {'make': ('oil', 1.5), 'water': 3}),
  ({'stone': 100, 'wood': 40, 'cedar': 10}, 20, {'house': 6}, {'make': ('oil', 2), 'water': 4}),
 ],
 'kiln': [
  ({'stone': 5}, 0.167, {'house': 2}, {'make': ('bricks', 2), 'water': 1}),
  ({'stone': 20, 'wood': 10}, 1, {'house': 3}, {'make': ('bricks', 4), 'water': 1}),
  ({'stone': 40, 'wood': 20}, 4, {'house': 4}, {'make': ('bricks', 6), 'water': 2}),
  ({'stone': 75, 'wood': 30}, 10, {'house': 5}, {'make': ('bricks', 9), 'water': 3}),
 ],
}
def coin(c): return sum(PRICE[k]*v for k,v in c.items())

def sim(per_day, collects_per_day, label, days=400):
    lvl = {k: 0 for k in B}; lvl['house'] = 1
    coins = 0; acc = {k: 0.0 for k in PRICE}
    inv = {k: 0 for k in PRICE}; inv.update(wood=20, bricks=20, stone=20)  # starter gift
    builders = []  # (finish_hour, building)
    milestones = {}
    for h in range(days*24):
        if h % 24 == 0: coins += per_day
        nb = 2 if lvl['house'] >= 4 else 1
        cap = B['store'][lvl['store']-1][3]['cap'] if lvl['store'] else 10
        for b in ('workshop','fold','grove','kiln'):
            if lvl[b]:
                m, r = B[b][lvl[b]-1][3]['make']
                acc[m] = min(cap, acc[m] + r)
        if h % (24 // collects_per_day) == 0:
            for m in acc:
                inv[m] += int(acc[m]); acc[m] -= int(acc[m])
        for f, b in list(builders):
            if f <= h:
                builders.remove((f, b)); lvl[b] += 1
                if b == 'house': milestones.setdefault(f'House {lvl[b]}', round(h/24, 1))
        if all(lvl[b] == len(B[b]) for b in B):
            milestones.setdefault('all done', round(h/24, 1)); break
        if h % (24 // collects_per_day): continue  # player only acts when they open the app
        busy = {b for _, b in builders}
        while len(builders) < nb:
            water = B['well'][lvl['well']-1][3]['water'] if lvl['well'] else 0
            used = sum(B[b][lvl[b]-1][3].get('water', 0) for b in B if lvl[b] and b != 'well')
            opts = []
            for b, levels in B.items():
                if b in busy or lvl[b] >= len(levels): continue
                cost, hrs, req, extra = levels[lvl[b]]
                if any(lvl[r] < v for r, v in req.items()): continue
                prev = B[b][lvl[b]-1][3].get('water', 0) if lvl[b] else 0
                if b != 'well' and extra.get('water', 0) - prev > water - used: continue
                missing = {k: max(0, v - inv[k]) for k, v in cost.items()}
                prio = coin(missing) * (0.6 if 'make' in extra or b == 'well' else 1.0)
                opts.append((prio, coin(missing), b, cost, hrs))
            opts = [o for o in opts if o[1] <= coins]
            if not opts: break
            _, pay, b, cost, hrs = min(opts)
            coins -= pay
            for k, v in cost.items(): inv[k] = max(0, inv[k] - v)
            builders.append((h + max(1, round(hrs)), b)); busy.add(b)
    print(f'{label:<34}', milestones, int(coins))

total = sum(coin(l[0]) for b in B.values() for l in b)
house = sum(coin(l[0]) for l in B['house'])
print('total plot coin-equivalent', total, '| house', house)
for per_day, c, label in [(40, 1, 'solo casual  (40/day, 1 visit)'), (70, 1, 'casual + arena (70/day, 1 visit)'), (130, 2, 'keen (130/day, 2 visits)'), (220, 2, 'very keen (220/day, 2 visits)')]:
    sim(per_day, c, label)
