'use client';

import { trpc } from '@/lib/trpc/client';
import { TitleActionHeader } from '@/components/title-action-header';
import { MedicationCard } from '@/components/health/medication-card';
import { AnimatedEmptyState } from '@/components/animated-empty-state';
import { AddMedicationModal } from '@/components/health/add-medication-modal';
import { useModal } from '@/components/modal/provider';
import { Button } from '@/components/button';
import { formatDate } from '@/lib/utils';
import { Pill, Plus, Syringe, Tablets, Heart, ShieldCheck, Stethoscope, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export';
import { AdherenceTracker } from '@/components/health/adherence-tracker';

const emptyIcons = [Pill, Syringe, Tablets, Heart, ShieldCheck, Stethoscope];

export default function MedicationsPage() {
  const modal = useModal();
  const { data, isLoading } = trpc.medications.list.useQuery({});
  const items = data?.items ?? [];

  const openAddModal = () => modal.show(<AddMedicationModal />);

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="用药记录" subtitle="Loading..." />
        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card h-36 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        <TitleActionHeader title="用药记录" subtitle="管理你的药物、补剂与服药依从性。" onAddButtonClick={openAddModal} addButtonText="添加药物" />
        <div className="mt-7">
          <AnimatedEmptyState
            title="尚未添加药物"
            description="Add a medication to start tracking your prescriptions, supplements, and adherence."
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
            addButton={
              <Button text="添加药物" icon={<Plus className="h-4 w-4" />} onClick={openAddModal} />
            }
          />
        </div>
      </div>
    );
  }

  const active = items.filter((m) => m.isActive);
  const discontinued = items.filter((m) => !m.isActive);

  return (
    <div>
      <TitleActionHeader
        title="用药记录"
        subtitle="管理你的药物、补剂与服药依从性。"
        onAddButtonClick={openAddModal}
        addButtonText="添加药物"
        actions={
          items.length > 0 ? (
            <Button
              variant="outline-subtle"
              size="sm"
              icon={<Download />}
              text="导出 CSV"
              onClick={() => {
                downloadCsv(
                  'healthmanager-medications',
                  ['Name', 'Generic Name', 'Category', 'Dosage', 'Frequency', 'Route', 'Prescriber', 'Indication', 'Status', 'Start Date', 'End Date'],
                  items.map((m) => [
                    m.name,
                    m.genericName,
                    m.category,
                    m.dosage,
                    m.frequency,
                    m.route,
                    m.prescriber,
                    m.indication,
                    m.isActive ? '在用' : '已停用',
                    m.startDate ? new Date(m.startDate).toISOString().split('T')[0] : null,
                    m.endDate ? new Date(m.endDate).toISOString().split('T')[0] : null,
                  ]),
                );
              }}
            />
          ) : undefined
        }
      />

      {/* Adherence tracker */}
      <AdherenceTracker medications={items} />

      {active.length > 0 && (
        <div className="mt-7 mb-6">
          <h2 className="mb-4 text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
            Active
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {active.map((med) => (
              <MedicationCard
                key={med.id}
                name={med.name}
                dose={med.dosage ?? '—'}
                frequency={med.frequency ?? '—'}
                indication={med.indication ?? '—'}
                status="active"
                startDate={med.startDate ? formatDate(med.startDate) : '—'}
              />
            ))}
          </div>
        </div>
      )}

      {discontinued.length > 0 && (
        <div className={active.length === 0 ? 'mt-7' : ''}>
          <h2 className="mb-4 text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
            Discontinued
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {discontinued.map((med) => (
              <MedicationCard
                key={med.id}
                name={med.name}
                dose={med.dosage ?? '—'}
                frequency={med.frequency ?? '—'}
                indication={med.indication ?? '—'}
                status="discontinued"
                startDate={med.startDate ? formatDate(med.startDate) : '—'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
