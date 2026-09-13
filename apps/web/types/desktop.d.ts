interface Window {
  healthManagerDesktop?: {
    exportPdf(filename: string): Promise<{ cancelled: boolean; filePath?: string }>;
  };
}
