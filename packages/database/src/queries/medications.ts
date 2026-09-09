import { and, desc, eq, type SQL } from 'drizzle-orm';
import { medications, medicationLogs } from '../schema/medications';
import type { Database } from '../client';

export async function listMedications(
  db: Database,
  params: {
    userId: string;
    profileId?: string | null;
    isActive?: boolean;
    category?: string;
  },
) {
  const conditions: SQL[] = [eq(medications.userId, params.userId)];
  if (params.profileId) conditions.push(eq(medications.profileId, params.profileId));
  if (params.isActive !== undefined) conditions.push(eq(medications.isActive, params.isActive));
  if (params.category) conditions.push(eq(medications.category, params.category));

  return db
    .select()
    .from(medications)
    .where(and(...conditions))
    .orderBy(desc(medications.isActive), desc(medications.createdAt));
}

export async function createMedication(
  db: Database,
  params: {
    userId: string;
    profileId?: string | null;
    name: string;
    genericName?: string;
    category?: string;
    dosage?: string;
    frequency?: string;
    route?: string;
    prescriber?: string;
    indication?: string;
    startDate?: string;
    notes?: string;
  },
) {
  const [row] = await db
    .insert(medications)
    .values({
      userId: params.userId,
      profileId: params.profileId ?? null,
      name: params.name,
      genericName: params.genericName,
      category: params.category ?? 'prescription',
      dosage: params.dosage,
      frequency: params.frequency,
      route: params.route,
      prescriber: params.prescriber,
      indication: params.indication,
      startDate: params.startDate,
      notes: params.notes,
    })
    .returning();

  return row!;
}

export async function updateMedication(
  db: Database,
  params: {
    id: string;
    userId: string;
    name?: string;
    dosage?: string;
    frequency?: string;
    isActive?: boolean;
    endDate?: string;
    notes?: string;
  },
) {
  const { id, userId, ...fields } = params;
  const result = await db
    .update(medications)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(medications.id, id), eq(medications.userId, userId)))
    .returning();

  return result[0] ?? null;
}

export async function getAdherenceLogs(
  db: Database,
  params: {
    userId: string;
    dateFrom: string;
    dateTo: string;
  },
) {
  const { gte, lte } = await import('drizzle-orm');
  return db
    .select()
    .from(medicationLogs)
    .where(
      and(
        eq(medicationLogs.userId, params.userId),
        gte(medicationLogs.logDate, params.dateFrom),
        lte(medicationLogs.logDate, params.dateTo),
      ),
    )
    .orderBy(desc(medicationLogs.logDate));
}

export async function logMedicationAdherence(
  db: Database,
  params: {
    userId: string;
    medicationId: string;
    logDate: string;
    taken: boolean;
    timeOfDay?: string;
    notes?: string;
  },
) {
  const [row] = await db
    .insert(medicationLogs)
    .values({
      userId: params.userId,
      medicationId: params.medicationId,
      logDate: params.logDate,
      taken: params.taken,
      timeOfDay: params.timeOfDay,
      notes: params.notes,
    })
    .returning();

  return row!;
}
