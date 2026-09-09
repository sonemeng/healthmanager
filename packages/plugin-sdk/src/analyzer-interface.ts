import type { DataCategory } from '@openvitals/common';

export interface AnalyzerPlugin {
  id: string;
  version: string;
  displayName: string;

  // Categories this analyzer reads from
  inputCategories: DataCategory[];

  analyze(params: {
    observations: Array<{
      metricCode: string;
      valueNumeric: number | null;
      valueText: string | null;
      unit: string;
      observedAt: Date;
      category: DataCategory;
    }>;
  }): Promise<{
    insights: Array<{
      type: 'trend' | 'alert' | 'summary';
      content: string;
      severity?: 'info' | 'warning' | 'critical';
      relatedMetrics?: string[];
    }>;
  }>;
}
