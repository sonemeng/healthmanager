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
    genericName?: string | null;
    category?: string | null;
    dosage?: string | null;
    frequency?: string | null;
    route?: string | null;
    prescriber?: string | null;
    indication?: string | null;
    startDate?: string | null;
    isActive?: boolean;
    endDate?: string | null;
    notes?: string | null;
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

// 用药变化分段记录：旧段结束（end_date=changeDate + 停用），同事务新开一段。
// 新段复制药名/类别/途径/开方医生/profile 归属，用量/频次/用途/备注取新值。
export async function recordMedicationChange(
  db: Database,
  params: {
    id: string;
    userId: string;
    dosage?: string | null;
    frequency?: string | null;
    indication?: string | null;
    changeDate: string;
    notes?: string | null;
  },
) {
  const [existing] = await db
    .select()
    .from(medications)
    .where(and(eq(medications.id, params.id), eq(medications.userId, params.userId)))
    .limit(1);
  if (!existing) return null;

  return db.transaction(async (tx) => {
    await tx
      .update(medications)
      .set({ isActive: false, endDate: params.changeDate, updatedAt: new Date() })
      .where(eq(medications.id, existing.id));

    const [row] = await tx
      .insert(medications)
      .values({
        userId: existing.userId,
        profileId: existing.profileId,
        name: existing.name,
        genericName: existing.genericName,
        category: existing.category,
        route: existing.route,
        prescriber: existing.prescriber,
        indication: params.indication ?? existing.indication,
        dosage: params.dosage ?? null,
        frequency: params.frequency ?? null,
        startDate: params.changeDate,
        notes: params.notes ?? null,
        status: 'manual',
        isActive: true,
      })
      .returning();

    return row!;
  });
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
