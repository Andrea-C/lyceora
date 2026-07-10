import { z } from "zod";
import { topicSchema, dependencySchema } from "./schema.js";
import type { Topic, Dependency } from "./types.js";

export class TaxonomyValidationError extends Error {}

const topicsFileSchema = z.object({ topics: z.array(z.unknown()) });
const depsFileSchema = z.object({ dependencies: z.array(z.unknown()) });

export function loadTaxonomy(topicsJson: unknown, depsJson: unknown): { topics: Topic[]; dependencies: Dependency[] } {
  const rawTopics = topicsFileSchema.parse(topicsJson).topics;
  const topics = rawTopics.map((t) => {
    const r = topicSchema.safeParse(t);
    if (!r.success) {
      const id = (t as { id?: string })?.id ?? "<no id>";
      throw new TaxonomyValidationError(`Invalid topic ${id}: ${r.error.issues[0]?.message ?? "unknown"} at ${r.error.issues[0]?.path.join(".")}`);
    }
    return r.data as Topic;
  });
  const ids = new Set(topics.map((t) => t.id));
  const rawDeps = depsFileSchema.parse(depsJson).dependencies;
  const dependencies = rawDeps.map((d) => {
    const r = dependencySchema.safeParse(d);
    if (!r.success) throw new TaxonomyValidationError(`Invalid dependency: ${JSON.stringify(d)}`);
    for (const ref of [r.data.topicId, r.data.prerequisiteId]) {
      if (!ids.has(ref)) throw new TaxonomyValidationError(`Dependency references unknown topic ${ref}`);
    }
    return r.data as Dependency;
  });
  return { topics, dependencies };
}
