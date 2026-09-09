import { eq, ilike, sql, or, isNull, and } from 'drizzle-orm';
import { metricDefinitions, unitConversions } from '../schema/metrics';
import type { Database } from '../client';

export async function matchAlias(
  db: Database,
  params: {
    input: string;
  },
) {
  const result = await db
    .select()
    .from(metricDefinitions)
    .where(
      or(
        eq(metricDefinitions.id, params.input),
        ilike(metricDefinitions.name, params.input),
        sql`${metricDefinitions.aliases} @> ${JSON.stringify([params.input])}::jsonb`,
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

export async function convertUnit(
  db: Database,
  params: {
    fromUnit: string;
    toUnit: string;
    value: number;
    metricCode?: string;
  },
) {
  const rows = await db
    .select()
    .from(unitConversions)
    .where(
      and(
        eq(unitConversions.fromUnit, params.fromUnit),
        eq(unitConversions.toUnit, params.toUnit),
      ),
    );

  // Prefer metric-specific conversion over global
  const specific = rows.find((r) => r.metricCode === params.metricCode);
  const global = rows.find((r) => r.metricCode === null);
  const conversion = specific ?? global;

  if (!conversion) {
    return { convertedValue: params.value, conversionFound: false };
  }

  return {
    convertedValue: params.value * conversion.multiplier + conversion.offset,
    conversionFound: true,
  };
}
