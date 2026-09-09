export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[1400px] mx-auto px-3 py-6 md:px-6 md:py-8">
      {children}
    </div>
  );
}
