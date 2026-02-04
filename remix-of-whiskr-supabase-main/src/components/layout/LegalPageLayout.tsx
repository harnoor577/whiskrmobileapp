import { Link } from "react-router-dom";
import whiskrTextLogo from "@/assets/whiskr-text-logo.png";
import { Footer } from "./Footer";

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[#fafbfc] flex flex-col">
      {/* Header - matches homepage */}
      <header className="sticky top-0 z-50 bg-[#fafbfc]/95 backdrop-blur-[20px] border-b border-black/[0.06]">
        <div className="max-w-[1100px] mx-auto px-6 h-[70px] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={whiskrTextLogo} alt="whiskr.ai" className="h-6 sm:h-7 w-auto" />
          </Link>
          
          <div className="flex items-center gap-4">
            <Link 
              to="/login"
              className="text-[15px] font-medium text-[#101235] hover:text-[#1ce881] transition-colors hidden sm:block"
            >
              Log in
            </Link>
            <Link 
              to="/signup"
              className="px-7 py-3 rounded-full border-none cursor-pointer text-[#101235] font-semibold text-sm transition-all hover:-translate-y-0.5"
              style={{ 
                background: 'linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)',
                boxShadow: '0 4px 15px rgba(28,232,129,0.3)'
              }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-[768px] mx-auto px-6">
          {/* Page Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-extrabold text-[#0f172a] mb-4 tracking-tight">
              {title}
            </h1>
            <p className="text-[#64748b] text-base">
              Last Updated: {lastUpdated}
            </p>
          </div>

          {/* Content */}
          <div className="legal-content">
            {children}
          </div>
        </div>
      </main>

      {/* Footer - same as homepage */}
      <Footer />
    </div>
  );
}
