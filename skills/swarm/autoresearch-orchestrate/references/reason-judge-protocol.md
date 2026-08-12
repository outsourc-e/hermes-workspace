# Reason Judge Protocol

## Adversarial Refinement Loop

```
Round N:
  1. Author-A generates candidate (or incumbent from previous round)
  2. Critic attacks candidate — MUST find weaknesses (forced adversarial)
  3. Author-B reads task + candidate-A + critique → produces candidate-B
  4. Synthesizer reads A + B → produces hybrid candidate-AB
  5. Judge panel receives 3 candidates with randomized labels → picks winner
  6. Winner becomes incumbent for round N+1
```

## Agent Isolation Rules

- Each agent (Author-A, Critic, Author-B, Synthesizer, Judges) runs COLD START
- No shared session state between agents — prevents sycophancy
- Agents receive ONLY: task description + relevant candidate(s) + critique
- Judges receive candidates with randomized labels (Label-X, Label-Y, Label-Z)
- Judges MUST compare and rank — "all are good" is not a valid verdict

## Critic Protocol

The critic MUST:
1. Identify at least 3 specific weaknesses in the candidate
2. Provide concrete evidence for each weakness
3. Suggest what a superior candidate would do differently
4. Rate candidate on domain-specific criteria (1-10 scale)
5. Never compliment the candidate — role is purely adversarial

## Judge Protocol

Each judge receives:
- Task description (identical for all judges)
- 3 candidates with randomized labels (Label-X, Label-Y, Label-Z)
- Evaluation criteria relevant to the domain

Each judge MUST:
1. Evaluate each candidate independently on all criteria
2. Produce a ranking (1st, 2nd, 3rd) with reasoning
3. Select a winner with one-paragraph justification
4. Label randomization prevents position bias

Verdict: majority vote. Tie → synthesized candidate (Label-Z) wins.

## Convergence Detection

| Mode | Stop Condition |
|---|---|
| Convergent (default) | Same incumbent wins N consecutive rounds (default N=3) |
| Creative | Never auto-stops; runs until iteration limit |
| Debate | Same as convergent but no synthesis step |

## Oscillation Guard

If the incumbent changes more than 5 times in the last 8 rounds → recommend early stop. The candidates are not converging — further rounds waste context.

## Domain-Specific Judge Criteria

| Domain | Criteria |
|---|---|
| Software architecture | Scalability, maintainability, performance, security, simplicity |
| Product strategy | Market fit, feasibility, differentiation, risk, timeline |
| Business decision | ROI, risk, alignment, resource requirements, reversibility |
| Security approach | Coverage, false positive rate, practicality, compliance |
| Research hypothesis | Testability, novelty, evidence support, explanatory power |
| Content/writing | Clarity, accuracy, engagement, completeness, actionability |

## Output Files

| File | Content |
|---|---|
| `reason-results.tsv` | Per-round: round, candidate_label, judge_verdict, convergence_count, description |
| `lineage.md` | Full history of all candidates + critiques + judge reasoning |
| `summary.md` | Final winner, convergence trajectory, key insights |
| `handoff.json` | Chain handoff with winner as primary finding |

## TSV Schema

```
round	timestamp	candidate_label	judge_verdict	convergence_count	description
1	2026-05-19T00:00:00Z	Candidate-A	winner	1	Event sourcing with CQRS
2	2026-05-19T00:05:00Z	Candidate-AB	winner	1	Hybrid: event sourcing for writes, read projections
3	2026-05-19T00:10:00Z	Candidate-AB	winner	2	Refined hybrid with materialized views
4	2026-05-19T00:15:00Z	Candidate-AB	winner	3	CONVERGED — same approach refined
```
