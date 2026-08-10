import AdoptionSidebar from '@/components/adoption/AdoptionSidebar';

// Shared chrome for the organisation dashboard (Phase 2 pages).
export default function OrgLayout({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <AdoptionSidebar />
      <div className="md:pl-60">{children}</div>
    </div>
  );
}
