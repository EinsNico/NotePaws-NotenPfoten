import { workshopDirectionSpans } from "./WorkshopDirectionSpans";
import { workshopTrillLineSpans } from "./WorkshopTrillLines";
import { workshopPedalDirectionSegments } from "./WorkshopPedal";

export function workshopMeasureDirectionSpans(score,partIndex,barIndex) {
  const part=score.parts[partIndex];if (!part || !part.measures[barIndex]) return [];
  const result=workshopDirectionSpans(score,partIndex)[barIndex];
  return result.concat(workshopTrillLineSpans(score,partIndex)[barIndex],workshopPedalDirectionSegments(score,partIndex,barIndex));
}
