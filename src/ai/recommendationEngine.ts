import { EngineeringSpecification } from "./engineeringSpecification";
import {
  EngineeringRules,
  EngineeringRule,
} from "../knowledge/engineeringRules";

export type Recommendation = {
  category: string;
  value: string;
  confidence: number;
  reason: string;
};

export function generateRecommendations(
  specification: EngineeringSpecification
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  const partType = specification.partType.value;

  if (!partType) {
    return recommendations;
  }

  const matchingRules = EngineeringRules.filter((rule: EngineeringRule) =>
    rule.appliesTo.includes(partType)
  );

  matchingRules.forEach((rule) => {
    recommendations.push({
      category: capitalise(rule.category),
      value: rule.recommendation,
      confidence: rule.confidence,
      reason: rule.reason,
    });
  });

  return recommendations;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}