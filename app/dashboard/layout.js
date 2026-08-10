import AdoptionSidebar from '@/components/adoption/AdoptionSidebar';

// Shared chrome for the individual adoption dashboard (Phase 1/3/4 pages).
export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <AdoptionSidebar />
      <div className="md:pl-60">{children}</div>
    </div>
  );
}
