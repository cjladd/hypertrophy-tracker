"""
generate_synthetic_data.py — bootstrap synthetic training data for the progression model.

Implements context-notes/synthetic_data_spec.md:
  - §3 simulated-lifter model (latent e1RM + fatigue, scaled Epley, non-linear RPE)
  - the REAL rule engine (context-notes/prog_engine.md §4–8) drives weight choices
  - §6 / §6.1 Option B outcome-aware labeling with the durability guard
  - §4 injected failure modes
  - §7 validation report (--report)

This data is MANUFACTURED, not collected. Its validity == the realism of the
assumptions below. It is a cold-start bootstrap; real signal comes from
personalizing on the user's logged data later (ai_engine_plan §1.1).

Usage:
  python scripts/train_progression_model/generate_synthetic_data.py --rows 10000 --report
  python scripts/train_progression_model/generate_synthetic_data.py --rows 50000 --out data/progression_synth.csv
"""

from __future__ import annotations

import argparse
import csv
import os
import random
from dataclasses import dataclass, field
from statistics import mean

import numpy as np

# =============================================================================
# Rule-engine constants (MUST match context-notes/prog_engine.md §2)
# =============================================================================
WEIGHT_JUMP_LB = 5.0
RPE_SOFT_GATE = 9.5
RATIO_THRESHOLD = 0.10
CEILING_STEP1 = 15
CEILING_STEP2 = 20
STALL_THRESHOLD = 3
RESET_PCT = 0.90
RESET_ROUND_LB = 5

INCREASE_REASONS = {"INCREASE", "INCREASE_AFTER_20"}
HOLD_REASONS = {"EXPAND_CEILING_15", "EXPAND_CEILING_20",
                "HOLD_NOT_AT_CEILING", "HOLD_RPE_TOO_HIGH", "HOLD_NOT_ENOUGH_SETS"}
RESET_REASONS = {"RESET_10PCT", "RESET_AFTER_DROP"}

# =============================================================================
# Simulated-lifter TUNABLE constants (spec §3) — expect to tune these after the
# first --report run; they are deliberately grouped here for that reason.
# =============================================================================
# adaptation (lb of e1RM gained per productive session at full headroom)
ADAPT_RATE = {"beginner": 12.0, "intermediate": 6.0, "advanced": 3.0}
# starting e1RM as a multiple of starting working weight (so initial reps land in range)
E1RM_START_MULT = {"compound": (1.35, 1.55), "isolation": (1.30, 1.50)}
# headroom from start e1RM to genetic ceiling (beginners have more room left)
CEILING_HEADROOM = {"beginner": (1.35, 1.7), "intermediate": (1.12, 1.35), "advanced": (1.04, 1.15)}
# scaled-Epley rep-curve steepness per exercise type (spec §3; isolations rep-tolerant)
K_TYPE = {"compound": 30.0, "isolation": 40.0}
# fatigue model
FATIGUE_PER_SET = 0.15            # fatigue added per working set
FATIGUE_DECAY_PER_DAY = 0.55      # multiplicative decay per rest day
FATIGUE_SCALE = 2.0               # divisor to normalize fatigue -> ~[0,1]
FATIGUE_REP_PENALTY = 0.25        # max fractional rep loss at fatigue_norm=1
RPE_FATIGUE_K = 0.8               # how much fatigue compresses perceived RIR (non-linearity)
# noise
SIGMA_REPS = 1.0
SIGMA_RPE = 0.4
# recovery_score (spec §3: varied, weakly anti-correlated with fatigue — NOT constant).
# Base 85 so a normal day (fatigue_norm ~0.3) reads ~75; only affects the recovery_score
# column, never the fatigue dynamics or labels.
RECOVERY_BASE = 85.0
RECOVERY_FATIGUE_BETA = 35.0      # recovery_score = N(85 - beta*fatigue_norm, sd)
RECOVERY_SD = 10.0
# detraining on layoffs
DETRAIN_THRESHOLD_DAYS = 10
DETRAIN_PER_DAY = 0.997           # e1RM multiplier per layoff day beyond threshold

# archetype mixes (spec §2, post-review)
TRAINING_AGE_MIX = {"beginner": 0.20, "intermediate": 0.55, "advanced": 0.25}
GOAL_MIX = {"hypertrophy": 0.60, "strength": 0.25, "endurance": 0.15}
REP_RANGE = {"hypertrophy": (8, 12), "strength": (4, 6), "endurance": (12, 20)}
EXERCISE_MIX = {"compound": 0.50, "isolation": 0.50}
CONSISTENCY_MIX = {"3x": 0.40, "2x": 0.25, "5x": 0.20, "irregular": 0.15}
REST_DAYS = {"3x": (2, 3), "2x": (3, 4), "5x": (1, 2), "irregular": (1, 9)}
START_WEIGHT = {"compound": (95, 315), "isolation": (15, 70)}

# failure-mode injection
P_TRAJECTORY_HAS_FAILURE = 0.25   # fraction of trajectories carrying a deliberate mode
P_OVERRIDE_PER_SESSION = 0.10     # user logs a different weight than suggested


# =============================================================================
# Helpers
# =============================================================================
def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def round_to(nearest, x):
    return round(x / float(nearest)) * nearest


def pick(mix: dict[str, float]) -> str:
    keys, weights = list(mix.keys()), list(mix.values())
    return random.choices(keys, weights=weights, k=1)[0]


def impute_rpe(rpe, reps, rep_min):
    """prog_engine.md §4."""
    if rpe is None:
        return 8.0 if reps >= rep_min else 10.0
    return rpe


def weekly_volume_slope(history, day_now):
    """volume_trend_4wk: least-squares slope (sets/week) over the trailing 28 days.
    history: list of (day, n_sets). Matches features.ts intent."""
    buckets = [0, 0, 0, 0]  # week 0 = most recent
    for day, n_sets in history:
        age = day_now - day
        if 0 <= age < 28:
            buckets[int(age // 7)] += n_sets
    # regress sets vs week index (x=3 oldest .. 0 newest -> use chronological x)
    xs, ys = [], []
    for wk in range(4):
        x = 3 - wk  # chronological week index
        xs.append(x)
        ys.append(buckets[wk])
    if len(set(ys)) <= 1:
        return 0.0
    xm, ym = mean(xs), mean(ys)
    num = sum((x - xm) * (y - ym) for x, y in zip(xs, ys))
    den = sum((x - xm) ** 2 for x in xs)
    return num / den if den else 0.0


# =============================================================================
# Rule engine (port of prog_engine.md §5–8). Drives the lifter's weight choices
# AND provides the base action label. State persists across a trajectory.
# =============================================================================
class ProgressionEngine:
    def __init__(self, rep_min, rep_max):
        self.rep_min = rep_min
        self.rep_max = rep_max
        self.ceiling = rep_max
        self.stall = 0
        self.watch = False

    def next_suggestion(self, last_weight, top_reps, top_rpe_raw, n_sets):
        """Returns (next_weight, reason). Mutates state. last_weight = top-set weight."""
        rpe = impute_rpe(top_rpe_raw, top_reps, self.rep_min)

        # §8 watch mode: false-positive after an RPE-10 progression
        if self.watch:
            self.watch = False
            if top_reps < self.rep_min:
                return self._reset(last_weight, "RESET_AFTER_DROP")

        # §5 success evaluation (top-set driven)
        A = top_reps >= self.ceiling
        B = rpe <= RPE_SOFT_GATE
        C = n_sets >= 2
        success = A and B and C
        conditional = A and C and (rpe == 10) and not success  # RPE-10 trap

        if last_weight <= 0:
            return (last_weight, "HOLD_NOT_AT_CEILING")  # invalid ratio guard (§6)

        if success or conditional:
            if conditional:
                self.watch = True
            ratio = WEIGHT_JUMP_LB / last_weight
            if ratio < RATIO_THRESHOLD:  # §6.1 Case 1
                self.stall = 0
                self.ceiling = self.rep_max
                return (last_weight + WEIGHT_JUMP_LB, "INCREASE")
            # §6.1 Case 2 — triple progression (expand ceiling before load)
            if self.ceiling < CEILING_STEP1:
                self.ceiling = CEILING_STEP1
                return (last_weight, "EXPAND_CEILING_15")
            if self.ceiling < CEILING_STEP2:
                self.ceiling = CEILING_STEP2
                return (last_weight, "EXPAND_CEILING_20")
            self.stall = 0
            self.ceiling = self.rep_max
            return (last_weight + WEIGHT_JUMP_LB, "INCREASE_AFTER_20")

        # §6.2 non-success -> hold + stall, reset on triple flatline (§7)
        self.stall += 1
        if self.stall >= STALL_THRESHOLD:
            return self._reset(last_weight, "RESET_10PCT")
        if top_reps < self.ceiling:
            reason = "HOLD_NOT_AT_CEILING"
        elif n_sets < 2:
            reason = "HOLD_NOT_ENOUGH_SETS"
        else:
            reason = "HOLD_RPE_TOO_HIGH"
        return (last_weight, reason)

    def _reset(self, last_weight, reason):
        self.stall = 0
        self.ceiling = self.rep_max
        self.watch = False
        return (round_to(RESET_ROUND_LB, last_weight * RESET_PCT), reason)


# =============================================================================
# Simulated lifter (spec §3)
# =============================================================================
@dataclass
class Lifter:
    training_age: str
    goal: str
    exercise_type: str
    consistency: str
    rep_min: int
    rep_max: int
    k_type: float
    true_e1rm: float
    genetic_ceiling: float
    adapt_rate: float
    fatigue: float = 0.0
    detrain_boost: float = 1.0  # muscle-memory adaptation boost after a layoff

    def fatigue_norm(self):
        return clamp(self.fatigue / FATIGUE_SCALE, 0.0, 1.0)

    def rest(self, days):
        """Decay fatigue; detrain (and prime muscle memory) on long layoffs."""
        self.fatigue *= FATIGUE_DECAY_PER_DAY ** days
        if days > DETRAIN_THRESHOLD_DAYS:
            self.true_e1rm *= DETRAIN_PER_DAY ** (days - DETRAIN_THRESHOLD_DAYS)
            self.detrain_boost = 1.5

    def perform(self, weight, n_sets, target):
        """Simulate one exposure at `weight`, training toward `target` reps (the engine's
        current ceiling). Double progression: stop AT the target if reached (RPE reflects
        reps-in-reserve), otherwise grind to failure below it. Returns (top_reps, rpe)."""
        fn = self.fatigue_norm()
        reps_max = self.k_type * (self.true_e1rm / weight - 1.0)  # scaled Epley inverse
        reps_eff = reps_max * (1.0 - FATIGUE_REP_PENALTY * fn)
        reps_capable = reps_eff + np.random.normal(0, SIGMA_REPS)  # what they could do to failure

        if reps_capable >= target:
            top_reps = int(target)
            if random.random() < 0.15:          # occasional extra rep (AMRAP-ish)
                top_reps += 1
        else:                                    # can't reach target -> grind to failure
            top_reps = int(max(0, round(reps_capable)))

        # non-linear, fatigue-sensitive RPE from reps-in-reserve (perceived RIR compresses under fatigue)
        rir = max(0.0, reps_capable - top_reps)
        perceived_rir = rir / (1.0 + RPE_FATIGUE_K * fn)
        rpe = 10.0 - perceived_rir + np.random.normal(0, SIGMA_RPE)
        rpe = clamp(round(rpe * 2) / 2, 6.0, 10.0)  # nearest 0.5

        # accrue fatigue + adaptation from this session
        self.fatigue += FATIGUE_PER_SET * n_sets
        headroom = max(0.0, 1.0 - self.true_e1rm / self.genetic_ceiling)
        stimulus = clamp(top_reps / self.rep_max, 0.3, 1.5)
        self.true_e1rm += self.adapt_rate * self.detrain_boost * stimulus * headroom
        self.detrain_boost = max(1.0, self.detrain_boost * 0.7)  # boost fades
        return top_reps, rpe


def make_lifter() -> Lifter:
    age = pick(TRAINING_AGE_MIX)
    goal = pick(GOAL_MIX)
    ex = pick(EXERCISE_MIX)
    consistency = pick(CONSISTENCY_MIX)
    rmin, rmax = REP_RANGE[goal]
    w0 = round_to(5, random.uniform(*START_WEIGHT[ex]))
    e1rm = w0 * random.uniform(*E1RM_START_MULT[ex])
    ceiling = e1rm * random.uniform(*CEILING_HEADROOM[age])
    return Lifter(
        training_age=age, goal=goal, exercise_type=ex, consistency=consistency,
        rep_min=rmin, rep_max=rmax, k_type=K_TYPE[ex],
        true_e1rm=e1rm, genetic_ceiling=ceiling, adapt_rate=ADAPT_RATE[age],
    ), w0


# =============================================================================
# Trajectory simulation
# =============================================================================
@dataclass
class Session:
    day: int
    weight: float
    top_reps: int
    rpe: float
    n_sets: int
    days_since_last: int
    stall_after: int          # engine stall_count after processing this session
    ceiling_after: int        # engine progression_ceiling after this session
    reason: str               # engine reason for the NEXT session's weight
    recovery_score: float


def simulate_trajectory(traj_id: int):
    lifter, weight = make_lifter()
    engine = ProgressionEngine(lifter.rep_min, lifter.rep_max)
    has_failure = random.random() < P_TRAJECTORY_HAS_FAILURE
    n_sessions = random.randint(24, 60)
    day = 0
    sessions: list[Session] = []
    vol_history: list[tuple[int, int]] = []

    for i in range(n_sessions):
        rest_days = 0
        if i > 0:
            lo, hi = REST_DAYS[lifter.consistency]
            rest_days = random.randint(lo, hi)
            # comeback failure mode: occasional long layoff
            if has_failure and random.random() < 0.04:
                rest_days = random.randint(11, 21)
            day += rest_days
            lifter.rest(rest_days)

        n_sets = random.choices([1, 2, 3, 4], weights=[0.05, 0.2, 0.5, 0.25])[0]
        # overtraining mode: 5x lifters carrying a failure push extra volume
        if has_failure and lifter.consistency == "5x":
            n_sets = max(n_sets, random.choice([4, 5]))

        top_reps, rpe = lifter.perform(weight, n_sets, engine.ceiling)
        vol_history.append((day, n_sets))

        next_weight, reason = engine.next_suggestion(weight, top_reps, rpe, n_sets)

        rec = clamp(np.random.normal(RECOVERY_BASE - RECOVERY_FATIGUE_BETA * lifter.fatigue_norm(),
                                     RECOVERY_SD), 0, 100)
        sessions.append(Session(
            day=day, weight=weight, top_reps=top_reps, rpe=rpe, n_sets=n_sets,
            days_since_last=rest_days, stall_after=engine.stall, ceiling_after=engine.ceiling,
            reason=reason, recovery_score=round(rec, 1),
        ))

        # decide next session's weight (with possible user override = failure mode §4)
        if has_failure and random.random() < P_OVERRIDE_PER_SESSION:
            # override: ignore the suggestion (stay) or force an aggressive extra jump
            next_weight = random.choice([weight, next_weight + WEIGHT_JUMP_LB])
        weight = max(WEIGHT_JUMP_LB, next_weight)

    return lifter, sessions, vol_history


def base_action(reason: str) -> str:
    if reason in INCREASE_REASONS:
        return "INCREASE"
    if reason in RESET_REASONS:
        return "RESET"
    return "HOLD"


def label_rows(lifter: Lifter, sessions: list[Session], vol_history):
    """Build feature rows with Option B outcome-aware labels (spec §6.1)."""
    rows = []
    for n in range(len(sessions) - 1):  # need session n+1 to label
        s = sessions[n]
        nxt = sessions[n + 1]
        prev = sessions[n - 1] if n > 0 else None

        base = base_action(s.reason)
        action = base
        # Option B: relabel INCREASE by the observed outcome at n+1 (§6.1).
        # The increase "worked" iff the lifter HIT the new rep target at n+1 (the target in
        # force at n+1 is the ceiling the engine set after session n = s.ceiling_after).
        # RPE doesn't disqualify a target hit — hitting it at RPE 10 still progressed.
        if base == "INCREASE":
            target_next = s.ceiling_after
            r, rpe = nxt.top_reps, nxt.rpe
            if r >= target_next:
                action = "INCREASE"                                  # hit target -> worked
            elif r < lifter.rep_min and rpe >= 9.0 and _durable_failure(sessions, n):
                action = "RESET"                                     # durable sub-min failure
            else:
                action = "HOLD"                                      # fell short -> too aggressive

        if action == "INCREASE":
            weight_delta = WEIGHT_JUMP_LB
        elif action == "RESET":
            weight_delta = round_to(RESET_ROUND_LB, s.weight * RESET_PCT) - s.weight
        else:
            weight_delta = 0.0

        rows.append({
            "current_weight_lb": round(s.weight, 1),
            "top_set_reps": s.top_reps,
            "top_set_rpe": s.rpe,
            "working_set_count": s.n_sets,
            "rep_range_min": lifter.rep_min,
            "rep_range_max": lifter.rep_max,
            "weight_jump_lb": WEIGHT_JUMP_LB,
            "stall_count": s.stall_after,
            "progression_ceiling": s.ceiling_after,
            "prev_weight_lb": round(prev.weight, 1) if prev else 0.0,
            "prev_top_reps": prev.top_reps if prev else 0,
            "prev_rpe": prev.rpe if prev else 8.0,
            "days_since_last": s.days_since_last,
            "volume_trend_4wk": round(weekly_volume_slope(vol_history, s.day), 3),
            "recovery_score": s.recovery_score,
            "action": action,
            "weight_delta_lb": weight_delta,
            # metadata (audit only; trainer drops these)
            "training_age": lifter.training_age,
            "goal": lifter.goal,
            "exercise_type": lifter.exercise_type,
        })
    return rows


def _durable_failure(sessions: list[Session], n: int) -> bool:
    """§6.1 durability guard: the increase initiates a run the engine would itself
    reset within <=3 exposures (a RESET reason appears in n+1..n+3)."""
    for j in range(n + 1, min(n + 4, len(sessions))):
        if sessions[j].reason in RESET_REASONS:
            return True
    return False


# =============================================================================
# Report (spec §7)
# =============================================================================
FEATURE_COLS = [
    "current_weight_lb", "top_set_reps", "top_set_rpe", "working_set_count",
    "rep_range_min", "rep_range_max", "weight_jump_lb", "stall_count",
    "progression_ceiling", "prev_weight_lb", "prev_top_reps", "prev_rpe",
    "days_since_last", "volume_trend_4wk", "recovery_score",
]


def print_report(rows, sample_trajs):
    n = len(rows)
    print(f"\n{'='*70}\nSYNTHETIC DATA REPORT — {n} rows\n{'='*70}")

    def dist(key, subset=None):
        data = subset if subset is not None else rows
        counts = {}
        for r in data:
            counts[r[key]] = counts.get(r[key], 0) + 1
        return counts

    print("\n[1] Label distribution (target ~55/35/10 INCREASE/HOLD/RESET):")
    lab = dist("action")
    for a in ("INCREASE", "HOLD", "RESET"):
        c = lab.get(a, 0)
        print(f"    {a:9s} {c:7d}  {100*c/n:5.1f}%")

    print("\n[2] Label mix by training age:")
    for age in ("beginner", "intermediate", "advanced"):
        sub = [r for r in rows if r["training_age"] == age]
        if not sub:
            continue
        la = dist("action", sub)
        pct = {a: 100 * la.get(a, 0) / len(sub) for a in ("INCREASE", "HOLD", "RESET")}
        print(f"    {age:13s} n={len(sub):6d}  "
              f"INC {pct['INCREASE']:5.1f}%  HOLD {pct['HOLD']:5.1f}%  RESET {pct['RESET']:5.1f}%")

    print("\n[3] Feature distributions (min / mean / max):")
    for col in FEATURE_COLS:
        vals = [float(r[col]) for r in rows]
        print(f"    {col:22s} {min(vals):8.2f} / {mean(vals):8.2f} / {max(vals):8.2f}")

    print("\n[4] Sample trajectory (read like a coach — does it look real?):")
    lifter, sessions, _ = sample_trajs[0]
    print(f"    archetype: {lifter.training_age}/{lifter.goal}/{lifter.exercise_type} "
          f"reps {lifter.rep_min}-{lifter.rep_max}, e1RM {lifter.true_e1rm:.0f}->ceiling {lifter.genetic_ceiling:.0f}")
    print(f"    {'sess':>4} {'wt':>6} {'reps':>4} {'rpe':>4} {'sets':>4} {'stall':>5} {'ceil':>4} {'rest':>4}  reason")
    for i, s in enumerate(sessions[:22]):
        print(f"    {i:>4} {s.weight:>6.0f} {s.top_reps:>4} {s.rpe:>4.1f} {s.n_sets:>4} "
              f"{s.stall_after:>5} {s.ceiling_after:>4} {s.days_since_last:>4}  {s.reason}")
    print(f"{'='*70}\n")


# =============================================================================
# Main
# =============================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=10000, help="approx number of rows to emit")
    ap.add_argument("--out", default="scripts/train_progression_model/data/progression_synth.csv")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--report", action="store_true", help="print the §7 validation audit")
    args = ap.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    rows = []
    sample_trajs = []
    traj_id = 0
    while len(rows) < args.rows:
        lifter, sessions, vol = simulate_trajectory(traj_id)
        rows.extend(label_rows(lifter, sessions, vol))
        if traj_id < 3:
            sample_trajs.append((lifter, sessions, vol))
        traj_id += 1
    rows = rows[: args.rows]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    cols = FEATURE_COLS + ["action", "weight_delta_lb", "training_age", "goal", "exercise_type"]
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows from {traj_id} trajectories -> {args.out}")

    if args.report:
        print_report(rows, sample_trajs)


if __name__ == "__main__":
    main()
