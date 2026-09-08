import { type PlannerRecommendationDto } from '@lifeos/shared';

/**
 * Hard Code-Level Constraint Enforcement (P4-4.2).
 *
 * Rule: A task blocked by an incomplete dependency must NEVER be the top recommendation.
 * Enforced in TypeScript code after LLM ranking — never relies on the model to respect it unprompted.
 */
export function enforcePlannerConstraints(
  recommendations: PlannerRecommendationDto[],
): { recommendations: PlannerRecommendationDto[]; constraintEnforced: boolean } {
  if (recommendations.length <= 1) {
    return { recommendations: [...recommendations], constraintEnforced: false };
  }

  const result = [...recommendations];

  // If the top recommendation is blocked, but an unblocked candidate exists:
  if (result[0]?.isBlocked) {
    const firstUnblockedIndex = result.findIndex((r) => !r.isBlocked);

    if (firstUnblockedIndex > 0) {
      // Promote the highest-ranked unblocked task to position 0
      const [promoted] = result.splice(firstUnblockedIndex, 1);
      if (promoted) {
        promoted.rationale = `[Hard constraint enforced: promoted ahead of blocked tasks] ${promoted.rationale}`;
        result.unshift(promoted);
      }

      // Reassign rank numbers sequentially
      result.forEach((r, idx) => {
        r.rank = idx + 1;
      });

      return {
        recommendations: result,
        constraintEnforced: true,
      };
    }
  }

  // Ensure sequential ranking
  result.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return {
    recommendations: result,
    constraintEnforced: false,
  };
}
