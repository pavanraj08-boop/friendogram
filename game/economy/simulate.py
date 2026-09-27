"""Friendogram daily-economy simulation. All amounts in RF. Deterministic seed.
Flows per canvas (SDK reference ChanceGame): 1 RF into prize stake, relics pay back EV 0.90, edge 0.10.
Proposal: edge split -> Daily Pot / burn / developer. Lens 0.1 RF -> pot / burn.
Pot is paid out only from what it holds (always funded). Shares = task points x streak weight, only for players
who opened >= 1 canvas that day (skin in the game, blocks free farming)."""
import random, statistics as st, json, sys
random.seed(42)
CANVAS, EV, LENS = 1.0, 0.90, 0.10
OUTCOMES = [(0.23, 0), (0.35, .5), (0.25, 1), (0.10, 2), (0.05, 3.5), (0.02, 5)]

def streak_weight(s):  # s = streak days including today
    for d, w in [(30, 3.0), (14, 2.5), (7, 2.0), (5, 1.6), (3, 1.3), (2, 1.15)]:
        if s >= d: return w
    return 1.0

TASKS = {"daily": 3, "stamp": 2, "canvas": 3, "solve_canvas": 2, "lens": 1}
ALL_BONUS = 2
SEGMENTS = {  # share of players, p(play a day), canvases/day, lenses/day, task completion probs
    "casual":  dict(share=.55, p=.25, canv=(0, 2), lens=(0, 1), t=dict(daily=.6, stamp=.3, solve_canvas=.3, lens=.2)),
    "regular": dict(share=.30, p=.60, canv=(1, 3), lens=(0, 2), t=dict(daily=.8, stamp=.5, solve_canvas=.5, lens=.4)),
    "daily":   dict(share=.15, p=.97, canv=(1, 3), lens=(1, 3), t=dict(daily=.95, stamp=.7, solve_canvas=.7, lens=.7)),
}

def relic():
    r, acc = random.random(), 0
    for p, v in OUTCOMES:
        acc += p
        if r < acc: return v
    return 0

def cap_pct(s):  # max pot claim as a share of that day's own CANVAS spend; always below the 10% canvas edge
    for d, c in [(30, .09), (14, .075), (7, .06), (3, .045)]:
        if s >= d: return c
    return .03

def run(pot_edge=0.5, burn_edge=0.2, lens_pot=0.5, days=60, players=2000, weights=True, capped=True, overflow_days=2):
    seg_of = []
    for name, s in SEGMENTS.items(): seg_of += [name] * int(players * s["share"])
    streak = [0] * len(seg_of)
    stats = {n: dict(spent=0., relic=0., pot=0., days=0) for n in SEGMENTS}
    pot = 0.; burned = 0.; dev = 0.; carry = 0.; wpts_total = [0.]; pot_total = [0.]
    for day in range(days):
        got = [0.] * len(seg_of); pts = [0.] * len(seg_of); inflow = 0.; spend_today = [0.] * len(seg_of)
        for i, n in enumerate(seg_of):
            s = SEGMENTS[n]
            if random.random() > s["p"]:
                streak[i] = streak[i] // 2  # miss halves the streak
                continue
            streak[i] += 1; stats[n]["days"] += 1
            c = random.randint(*s["canv"]); l = random.randint(*s["lens"])
            stats[n]["spent"] += c * CANVAS + l * LENS; spend_today[i] = c * CANVAS; stats[n]["canvas"] = stats[n].get("canvas", 0) + c * CANVAS
            stats[n]["relic"] += c * EV  # expected value keeps the comparison noise-free
            edge = c * (CANVAS - EV)  # expected edge per canvas
            inflow += edge * pot_edge + l * LENS * lens_pot
            burned += edge * burn_edge + l * LENS * (1 - lens_pot)
            dev += edge * (1 - pot_edge - burn_edge)
            if c == 0: continue  # pot eligibility: open >= 1 canvas
            done = {"canvas"} | {k for k, pr in s["t"].items() if random.random() < pr and (k != "lens" or l > 0) and (k != "solve_canvas" or c > 0)}
            base = sum(TASKS[k] for k in done) + (ALL_BONUS if len(done) == len(TASKS) else 0)
            pts[i] = base * (streak_weight(streak[i]) if weights else 1); wpts_total[0] += pts[i]
        pot = carry + inflow; total = sum(pts); paid = 0.; pot_total[0] += inflow
        # Water-filling: split by weighted points; anyone hitting their cap passes the excess to the rest.
        active = [i for i, p in enumerate(pts) if p]; left = pot
        for _ in range(8):
            if not active or left <= 1e-12: break
            tp = sum(pts[i] for i in active); nxt = []; spent_round = 0.
            for i in active:
                share = left * pts[i] / tp
                room = (spend_today[i] * cap_pct(streak[i]) - got[i]) if capped else share
                take = min(share, room); got[i] += take; spent_round += take
                if take < share - 1e-12: pass
                else: nxt.append(i)
            left -= spent_round; active = [i for i in nxt if not capped or got[i] < spend_today[i] * cap_pct(streak[i]) - 1e-12]
        for i in range(len(seg_of)):
            if got[i]: stats[seg_of[i]]["pot"] += got[i]; paid += got[i]
        carry = pot - paid
        if carry > inflow * overflow_days: burned += carry - inflow * overflow_days; carry = inflow * overflow_days
    out = {}
    for n, v in stats.items():
        rtp = (v["relic"] + v["pot"]) / v["spent"] if v["spent"] else 0
        out[n] = dict(rtp=round(rtp, 4), canvas_rtp=round((v["relic"] + v["pot"]) / v.get("canvas", 1) if v.get("canvas") else 0, 4), pot_per_rf=round(v["pot"] / v.get("canvas", 1), 4) if v.get("canvas") else 0, pot_per_day=round(v["pot"] / max(v["days"], 1), 4), spent_per_day=round(v["spent"] / max(v["days"], 1), 3))
    spent = sum(v["spent"] for v in stats.values())
    out["rate"] = dict(pot_inflow_per_weighted_point=round(pot_total[0] / max(wpts_total[0], 1), 5))
    out["house"] = dict(burned=round(burned, 1), burn_pct_of_spend=round(100 * burned / spent, 2), dev_pct=round(100 * dev / spent, 2),
                        paid_back_pct=round(100 * sum(v["relic"] + v["pot"] for v in stats.values()) / spent, 2))
    return out

if __name__ == "__main__":
    SEGMENTS["grinder"] = dict(share=.10, p=1.0, canv=(1, 1), lens=(0, 0), t=dict(daily=1, stamp=1, solve_canvas=1, lens=1))
    SEGMENTS["casual"]["share"] = .45
    for label, cfg in [("no pot (baseline)", dict(pot_edge=0, burn_edge=0, lens_pot=0, capped=False)),
                       ("pot, uncapped (exploitable)", dict(pot_edge=.6, burn_edge=.2, lens_pot=0, capped=False)),
                       ("CHOSEN: pot 60% / burn 20% / dev 20%, streak caps", dict(pot_edge=.6, burn_edge=.2, lens_pot=0))]:
        print("==", label); [print("  ", k, json.dumps(v)) for k, v in run(days=45, players=1500, **cfg).items()]
