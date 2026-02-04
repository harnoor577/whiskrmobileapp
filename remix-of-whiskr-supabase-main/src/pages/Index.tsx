import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import whiskrTextLogo from "@/assets/whiskr-text-logo.png";
import whiskrMonogram from "@/assets/whiskr-monogram.png";
import whiskrFullLogo from "@/assets/whiskr-full-logo.png";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { AtlasAvatar } from "@/components/ui/AtlasAvatar";
import { AtlasEye } from "@/components/ui/AtlasEye";
import { ScatteredEyes, heroEyes, featuresEyes, pricingEyes } from "@/components/ui/ScatteredEyes";
import {
  Mic,
  Link2,
  Target,
  ClipboardList,
  Syringe,
  Stethoscope,
  FlaskConical,
  FileText,
  Languages,
  ShieldCheck,
  Upload,
  Keyboard,
  Send,
} from "lucide-react";

// Lazy load the EnterpriseContactForm since it's in a modal
const EnterpriseContactForm = lazy(() =>
  import("@/components/billing/EnterpriseContactForm").then((mod) => ({
    default: mod.EnterpriseContactForm,
  })),
);

const Index = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");
  const [enterpriseFormOpen, setEnterpriseFormOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  // Animated background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let nodes: Array<{ x: number; y: number; vx: number; vy: number; radius: number }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = document.documentElement.scrollHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Reduced node count for better performance
    for (let i = 0; i < 12; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        radius: Math.random() * 1.5 + 0.5,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach((node, i) => {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0) node.x = canvas.width;
        if (node.x > canvas.width) node.x = 0;
        if (node.y < 0) node.y = canvas.height;
        if (node.y > canvas.height) node.y = 0;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(28, 232, 129, 0.15)";
        ctx.fill();

        nodes.forEach((other, j) => {
          if (i >= j) return;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `rgba(28, 232, 129, ${0.03 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  const handleGetStarted = () => {
    navigate("/signup");
  };

  // Atlas Logo Component - uses AtlasAvatar orb
  const AtlasLogo = ({ size = "md", showText = true }: { size?: "sm" | "md" | "lg"; showText?: boolean }) => {
    const avatarSize: "xs" | "sm" | "md" = size === "lg" ? "sm" : "xs";
    const textSize = { sm: 12, md: 14, lg: 18 };
    return (
      <div className="flex items-center gap-2">
        <AtlasAvatar state="idle" size={avatarSize} showRings={false} />
        {showText && (
          <span className="font-bold" style={{ color: "#1ce881", fontSize: textSize[size] }}>
            Atlas
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#fafbfc] font-sans min-h-screen relative text-[#1e293b]" style={{ lineHeight: 1.6 }}>
      {/* Background Canvas - GPU accelerated */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-0 pointer-events-none opacity-50"
        style={{ willChange: "transform" }}
      />
      <div className="relative z-10">
        {/* ========== HEADER ========== */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#fafbfc]/95 backdrop-blur-[20px] border-b border-black/[0.06]">
          <div className="max-w-[1100px] mx-auto px-6 h-[70px] flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src={whiskrTextLogo} alt="whiskr.ai" className="h-6 sm:h-7 w-auto" />
            </Link>

            <nav className="hidden-mobile items-center gap-8">
              {[
                ["Features", "features"],
                ["How It Works", "how"],
                ["Pricing", "pricing"],
                ["FAQ", "faq"],
              ].map(([label, id]) => (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  className="text-[15px] font-medium text-[#101235] hover:text-[#1ce881] transition-colors bg-transparent border-none cursor-pointer tracking-wide"
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-[15px] font-medium text-[#101235] hover:text-[#1ce881] transition-colors hidden sm:block"
              >
                Log in
              </Link>
              {/* Mobile: Login button, Desktop: Get Started button */}
              <Link
                to="/login"
                className="sm:hidden px-5 py-2.5 rounded-full border-none cursor-pointer text-[#101235] font-semibold text-sm transition-all hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)",
                  boxShadow: "0 4px 15px rgba(28,232,129,0.3)",
                }}
              >
                Login
              </Link>
              <button
                onClick={handleGetStarted}
                className="hidden sm:block px-7 py-3 rounded-full border-none cursor-pointer text-[#101235] font-semibold text-sm transition-all hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)",
                  boxShadow: "0 4px 15px rgba(28,232,129,0.3)",
                }}
              >
                Get Started
              </button>
            </div>
          </div>
        </header>

        {/* ========== HERO ========== */}
        <section className="pt-[120px] pb-12 text-center relative overflow-hidden">
          {/* Gradient background */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(28, 232, 129, 0.15), transparent 70%)",
            }}
          />

          {/* Subtle grid pattern */}
          <div className="absolute inset-0 -z-10 hero-grid-pattern opacity-40" />

          {/* Atlas Avatar - Left */}
          <div className="absolute top-32 left-[10%] animate-float-slow">
            <AtlasAvatar state="idle" size="md" showRings={false} />
          </div>

          {/* Atlas Avatar - Right */}
          <div className="absolute top-48 right-[15%] animate-float-medium">
            <AtlasAvatar state="listening" size="sm" />
          </div>

          {/* Small decorative orb */}
          <div
            className="absolute bottom-32 left-[20%] w-10 h-10 rounded-full opacity-10 animate-float-slow"
            style={{ background: "#1ce881" }}
          />

          <div className="max-w-[800px] mx-auto px-6">
            {/* Badge - with animation */}
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white border border-[#1ce881]/30 mb-6 shadow-sm hero-animate">
              <AtlasLogo size="sm" showText={false} />
              <span className="text-xs sm:text-sm text-[#101235]">
                Powered by <span className="text-[#1ce881] font-semibold">Atlas AI</span>
              </span>
            </div>

            {/* Headline - with animation */}
            <h1 className="text-[clamp(36px,7vw,56px)] font-extrabold leading-[1.1] mb-4 text-[#101235] tracking-tight hero-animate-delay-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Think clearer.
            </h1>
            <p className="text-[clamp(28px,5vw,42px)] font-extrabold leading-[1.1] mb-4 tracking-tight hero-animate-delay-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <span className="text-gradient-whiskr">Chart faster. Care better.</span>
            </p>

            {/* Subheadline - with animation */}
            <p
              className="text-lg text-[#101235] max-w-[600px] mx-auto mb-8 hero-animate-delay-2"
              style={{ lineHeight: 1.6 }}
            >
              whiskr listens to your consultations and helps you think through differentials, treatment plans, and
              diagnostics — so nothing slips through the cracks.
            </p>

            {/* CTAs - with animation */}
            <div className="flex flex-wrap gap-3 justify-center mb-4 hero-animate-delay-3">
              <button
                onClick={handleGetStarted}
                className="btn-glow px-8 py-4 rounded-full border-none cursor-pointer text-[#101235] font-semibold text-base transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_35px_rgba(28,232,129,0.4)]"
                style={{
                  background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)",
                  boxShadow: "0 6px 24px rgba(28,232,129,0.3)",
                }}
              >
                Start Risk-Free
              </button>
              <button
                onClick={() => setVideoModalOpen(true)}
                className="px-8 py-4 rounded-full cursor-pointer bg-white border-2 border-[#e2e8f0] text-[#475569] font-semibold text-base flex items-center gap-2 transition-all duration-300 hover:border-[#1ce881] hover:-translate-y-1"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="#1ce881">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                </svg>
                Watch Demo
              </button>
            </div>

            <p className="text-sm text-[#101235]/70 hero-animate-delay-4">
              30-day money-back guarantee • Cancel anytime
            </p>
          </div>

          {/* Premium Demo Preview */}
          <div className="max-w-[850px] mx-auto mt-10 px-6 relative hero-animate-delay-4">
            {/* Glow effect behind */}
            <div
              className="absolute inset-4 rounded-3xl blur-2xl -z-10"
              style={{
                background: "radial-gradient(ellipse at center, rgba(28, 232, 129, 0.2), transparent 70%)",
              }}
            />

            {/* Video container */}
            <div
              onClick={() => setVideoModalOpen(true)}
              className="relative rounded-2xl overflow-hidden cursor-pointer group"
              style={{
                background: "linear-gradient(145deg, #101235 0%, #1a1d3a 100%)",
                boxShadow: "0 40px 80px -20px rgba(16, 18, 53, 0.4), 0 0 0 1px rgba(255,255,255,0.05) inset",
                aspectRatio: "16/9",
              }}
            >
              {/* Browser chrome header */}
              <div className="absolute top-0 left-0 right-0 h-10 bg-[#1e1f3a] border-b border-white/5 flex items-center px-4 gap-2 z-10">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/80"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400/80"></div>
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="flex items-center gap-2 px-4 py-1 rounded-md bg-white/5 text-[#64748b] text-xs">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0110 0v4"></path>
                    </svg>
                    app.whiskr.ai
                  </div>
                </div>
              </div>

              {/* Inner glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-white/[0.02]"></div>

              {/* Play button */}
              <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                <div className="text-center">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:shadow-[0_0_40px_rgba(28,232,129,0.5)]"
                    style={{
                      background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)",
                      boxShadow: "0 10px 40px rgba(28,232,129,0.4)",
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 20 20" fill="#101235">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                  <p className="text-white font-semibold text-base mb-1">See whiskr in action</p>
                  <p className="text-[#94a3b8] text-sm">Watch 2 min demo</p>
                </div>
              </div>

              {/* Animated border glow on hover */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ boxShadow: "inset 0 0 0 1px rgba(28,232,129,0.3)" }}
              ></div>
            </div>
          </div>
        </section>

        {/* ========== SOCIAL PROOF ========== */}
        <section className="bg-[#101235] py-5">
          <div className="max-w-[1000px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex">
                {[
                  { i: "SM", c: "#10b981" },
                  { i: "JC", c: "#0ea5e9" },
                  { i: "ER", c: "#8b5cf6" },
                  { i: "AK", c: "#f59e0b" },
                ].map((p, idx) => (
                  <div
                    key={idx}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 border-[#101235]"
                    style={{ backgroundColor: p.c, marginLeft: idx > 0 ? "-8px" : 0 }}
                  >
                    {p.i}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-white font-semibold text-sm m-0">500+ clinics</p>
                <p className="text-[#94a3b8] text-xs m-0">across North America</p>
              </div>
            </div>
            <div className="flex gap-8 flex-wrap">
              {[
                { v: "50K+", l: "Notes" },
                { v: "12hrs", l: "Saved/wk" },
                { v: "98%", l: "Accuracy" },
                { v: "4.9★", l: "Rating" },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-[#24ffc9] font-extrabold text-xl">{s.v}</div>
                  <div className="text-[#94a3b8] text-xs">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== KEY VALUE PROPS ========== */}
        <section className="py-14 bg-white">
          <div className="max-w-[1000px] mx-auto px-6">
            <AnimatedSection animation="fade-up">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-extrabold text-[#101235] mb-3">Your clinical co-pilot</h2>
                <p className="text-base text-[#101235] max-w-[550px] mx-auto" style={{ lineHeight: 1.5 }}>
                  whiskr doesn't replace your clinical judgment — it enhances it. Think of it as a second set of eyes
                  that's always paying attention.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="stagger" className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  icon: Target,
                  title: "Suggests differentials",
                  desc: "Atlas surfaces possible diagnoses based on what you discuss, so you can consider all angles.",
                  color: "#8b5cf6",
                },
                {
                  icon: ClipboardList,
                  title: "Recommends diagnostics",
                  desc: "Get prompted on tests to consider running, tailored to the case at hand.",
                  color: "#0ea5e9",
                },
                {
                  icon: Syringe,
                  title: "Reviews treatment plans",
                  desc: "Ensure your plan is complete — medications, follow-ups, client education.",
                  color: "#f59e0b",
                },
              ].map((item, i) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={i}
                    className="p-6 rounded-xl bg-[#fafbfc] border border-[#e2e8f0] transition-all hover:shadow-md hover:-translate-y-1"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: `${item.color}15` }}
                    >
                      <IconComponent className="w-6 h-6" style={{ color: item.color }} />
                    </div>
                    <h3 className="text-lg font-semibold text-[#101235] mb-2 font-sans">{item.title}</h3>
                    <p className="text-sm text-[#101235] m-0" style={{ lineHeight: 1.55 }}>
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </AnimatedSection>
          </div>
        </section>

        {/* ========== HOW IT WORKS - LAYOUT B (Large Background Numbers) ========== */}
        <section id="how" className="py-20 bg-[#101235] relative overflow-hidden">
          {/* Background glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-[100px]"
            style={{ background: "radial-gradient(circle, #1ce881 0%, transparent 70%)" }}
          />

          <div className="max-w-[1000px] mx-auto px-6 relative z-10">
            <AnimatedSection animation="fade-up">
              {/* Section Header */}
              <div className="text-center mb-12">
                {/* Badge */}
                <p className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-[#24ffc9] uppercase tracking-wider mb-3">
                  How It Works
                </p>
                {/* Title */}
                <h2 className="text-4xl font-extrabold text-white mb-2">Three simple steps</h2>
                {/* Subtitle */}
                <p className="text-[#94a3b8] text-lg font-medium">Record. Review. Finalize.</p>
              </div>
            </AnimatedSection>

            {/* Cards Grid */}
            <AnimatedSection animation="stagger" className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* ===== STEP 1 ===== */}
              <div
                className="relative rounded-[20px] p-8 border hover:-translate-y-2 transition-transform duration-300 overflow-hidden"
                style={{
                  background: "#151838",
                  borderColor: "rgba(255, 255, 255, 0.06)",
                }}
              >
                {/* Large background number */}
                <span
                  className="absolute -top-4 -left-2 font-black select-none pointer-events-none"
                  style={{
                    fontSize: "140px",
                    fontWeight: 900,
                    color: "rgba(28, 232, 129, 0.05)",
                    lineHeight: 1,
                  }}
                >
                  1
                </span>

                {/* Content */}
                <div className="relative z-10">
                  {/* Step label */}
                  <p
                    className="mb-3"
                    style={{
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      color: "#1ce881",
                      fontWeight: 600,
                    }}
                  >
                    Step One
                  </p>

                  {/* Title */}
                  <h3
                    className="mb-3"
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      color: "white",
                    }}
                  >
                    Capture your consultation
                  </h3>

                  {/* Description */}
                  <p
                    className="mb-5"
                    style={{
                      fontSize: "15px",
                      lineHeight: 1.7,
                      color: "#94a3b8",
                    }}
                  >
                    Record live with your client, upload a case summary, or type in the details. whiskr adapts to
                    however you work.
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {["Record live", "Upload", "Type"].map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full"
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#1ce881",
                          background: "rgba(28, 232, 129, 0.1)",
                          border: "1px solid rgba(28, 232, 129, 0.2)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ===== STEP 2 ===== */}
              <div
                className="relative rounded-[20px] p-8 border hover:-translate-y-2 transition-transform duration-300 overflow-hidden"
                style={{
                  background: "#151838",
                  borderColor: "rgba(255, 255, 255, 0.06)",
                }}
              >
                <span
                  className="absolute -top-4 -left-2 font-black select-none pointer-events-none"
                  style={{
                    fontSize: "140px",
                    fontWeight: 900,
                    color: "rgba(28, 232, 129, 0.05)",
                    lineHeight: 1,
                  }}
                >
                  2
                </span>

                <div className="relative z-10">
                  <p
                    className="mb-3"
                    style={{
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      color: "#1ce881",
                      fontWeight: 600,
                    }}
                  >
                    Step Two
                  </p>

                  <h3
                    className="mb-3"
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      color: "white",
                    }}
                  >
                    Atlas organizes everything
                  </h3>

                  <p
                    className="mb-5"
                    style={{
                      fontSize: "15px",
                      lineHeight: 1.7,
                      color: "#94a3b8",
                    }}
                  >
                    Your conversation becomes a structured SOAP note with suggested differentials and treatment
                    considerations.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {["SOAP", "Differentials", "Vitals"].map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full"
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#1ce881",
                          background: "rgba(28, 232, 129, 0.1)",
                          border: "1px solid rgba(28, 232, 129, 0.2)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ===== STEP 3 ===== */}
              <div
                className="relative rounded-[20px] p-8 border hover:-translate-y-2 transition-transform duration-300 overflow-hidden"
                style={{
                  background: "#151838",
                  borderColor: "rgba(255, 255, 255, 0.06)",
                }}
              >
                <span
                  className="absolute -top-4 -left-2 font-black select-none pointer-events-none"
                  style={{
                    fontSize: "140px",
                    fontWeight: 900,
                    color: "rgba(28, 232, 129, 0.05)",
                    lineHeight: 1,
                  }}
                >
                  3
                </span>

                <div className="relative z-10">
                  <p
                    className="mb-3"
                    style={{
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      color: "#1ce881",
                      fontWeight: 600,
                    }}
                  >
                    Step Three
                  </p>

                  <h3
                    className="mb-3"
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      color: "white",
                    }}
                  >
                    Push to your EHR
                  </h3>

                  <p
                    className="mb-5"
                    style={{
                      fontSize: "15px",
                      lineHeight: 1.7,
                      color: "#94a3b8",
                    }}
                  >
                    Review, make edits, and send directly to your practice management system. Done before you leave the
                    clinic.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {["EzyVet", "Idexx Neo", "Sync"].map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-full"
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#1ce881",
                          background: "rgba(28, 232, 129, 0.1)",
                          border: "1px solid rgba(28, 232, 129, 0.2)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </AnimatedSection>

            {/* CTA Pill */}
            <AnimatedSection animation="scale" className="text-center mt-10">
              <div
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm"
                style={{
                  background: "linear-gradient(135deg, #1ce881, #24ffc9)",
                  color: "#101235",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#101235">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Done before you leave
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* ========== WHY WHISKR ========== */}
        <section className="py-20 bg-[#101235]">
          <div className="max-w-[1000px] mx-auto px-6">
            <AnimatedSection animation="fade-up">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-extrabold text-white mb-3">Built different</h2>
                <p className="text-[#94a3b8] text-lg">Generic AI isn't built for veterinary medicine. whiskr is.</p>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="stagger" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Others */}
              <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:-translate-y-1 transition-transform duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
                    <span className="text-xl">🤖</span>
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg m-0">Generic AI tools</h3>
                    <p className="text-[#64748b] text-sm m-0">One-size-fits-all</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3.5">
                  {[
                    "Human medicine terminology",
                    "English only",
                    "Can't tell who's speaking",
                    "No clinical suggestions",
                    "Manual copy-paste to EHR",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-400 text-sm">✗</span>
                      </div>
                      <span className="text-[#94a3b8] text-[15px]">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* whiskr */}
              <div
                className="p-8 rounded-2xl border-2 hover:-translate-y-1 transition-transform duration-300"
                style={{
                  background: "linear-gradient(135deg, rgba(28,232,129,0.15) 0%, rgba(36,255,201,0.08) 100%)",
                  borderColor: "rgba(28,232,129,0.4)",
                }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <img src={whiskrMonogram} alt="whiskr" className="h-9 w-auto" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-bold text-lg m-0">whiskr</h3>
                      <span className="px-2 py-0.5 rounded-md bg-[#24ffc9] text-[#101235] text-[11px] font-bold">
                        + Atlas
                      </span>
                    </div>
                    <p className="text-[#24ffc9] text-sm m-0">Built for veterinary</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3.5">
                  {[
                    "Veterinary-specific terminology",
                    "Multi-language support",
                    "Knows vet vs. client voice",
                    "Suggests differentials & plans",
                    "One-click EHR sync",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#1ce881] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                      <span className="text-white text-[15px] font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* ========== FEATURES ========== */}
        <section id="features" className="py-14 bg-gradient-to-b from-white to-[#f8fafc]">
          <div className="max-w-[1000px] mx-auto px-6">
            <AnimatedSection animation="fade-up">
              <div className="text-center mb-8">
                <p className="inline-block px-4 py-1.5 rounded-full bg-[#1ce881]/10 border border-[#1ce881]/20 text-xs font-semibold text-[#1ce881] uppercase tracking-wider mb-3">
                  Capabilities
                </p>
                <h2 className="text-3xl font-extrabold text-[#101235] mb-2">Built for veterinary workflows</h2>
                <p className="text-[#101235] text-sm max-w-[450px] mx-auto">
                  Every feature designed to save you time and improve clinical accuracy.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection animation="stagger" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  icon: Mic,
                  title: "Voice-to-SOAP",
                  desc: "Speak naturally during consults. Notes structured automatically.",
                  isBlue: true,
                  iconBg: "bg-[#1ce881]",
                  iconColor: "#101235",
                },
                {
                  icon: Stethoscope,
                  title: "Breed-aware vitals",
                  desc: "Flags against breed-specific ranges. No manual lookups.",
                  isBlue: false,
                  iconBg: "bg-[#f59e0b]/10",
                  iconColor: "#f59e0b",
                },
                {
                  icon: FlaskConical,
                  title: "Lab interpretation",
                  desc: "Upload results. Atlas highlights abnormalities instantly.",
                  isBlue: true,
                  iconBg: "bg-[#ec4899]",
                  iconColor: "#fff",
                  badge: "Beta",
                },
                {
                  icon: FileText,
                  title: "Medication guides",
                  desc: "Auto-generate take-home sheets for clients.",
                  isBlue: false,
                  iconBg: "bg-[#10b981]/10",
                  iconColor: "#10b981",
                  badge: "New",
                },
                {
                  icon: Languages,
                  title: "Multilingual",
                  desc: "Dictate in any language. Notes in English.",
                  isBlue: true,
                  iconBg: "bg-[#0ea5e9]",
                  iconColor: "#fff",
                },
                {
                  icon: ShieldCheck,
                  title: "Data Privacy",
                  desc: "Your data stays yours. Never shared or used to train AI.",
                  isBlue: false,
                  iconBg: "bg-[#6366f1]/10",
                  iconColor: "#6366f1",
                },
              ].map((f, i) => {
                const IconComponent = f.icon;
                return (
                  <div
                    key={i}
                    className={`group p-4 rounded-xl ${f.isBlue ? "bg-[#101235] border-[#1e293b]" : "bg-white border-[#e2e8f0]"} border hover:shadow-lg hover:-translate-y-1 transition-all duration-300`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-9 h-9 rounded-lg ${f.iconBg} flex items-center justify-center flex-shrink-0`}>
                        <IconComponent className="w-4 h-4" style={{ color: f.iconColor }} />
                      </div>
                      <h3
                        className={`text-[15px] font-bold ${f.isBlue ? "text-white" : "text-[#101235]"} m-0 font-heading`}
                      >
                        {f.title}
                      </h3>
                      {f.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[#1ce881]/20 text-[#1ce881]">
                          {f.badge}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[13px] ${f.isBlue ? "text-[#94a3b8]" : "text-[#101235]"} m-0 leading-snug pl-12`}
                    >
                      {f.desc}
                    </p>
                  </div>
                );
              })}
            </AnimatedSection>
          </div>
        </section>

        {/* ========== MEET ATLAS ========== */}
        <section className="py-14 bg-[#fafbfc]">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <AtlasLogo size="lg" />
                <h2 className="text-3xl font-extrabold text-[#101235] mt-4 mb-3">Meet Atlas</h2>
                <p className="text-base text-[#101235] mb-5" style={{ lineHeight: 1.55 }}>
                  Atlas is your clinical intelligence layer. It listens, understands context, and offers suggestions —
                  like having a knowledgeable colleague always there to double-check your thinking.
                </p>

                <div className="flex flex-col gap-2.5 mb-6">
                  {[
                    "Detects who's speaking — vet, tech, or client",
                    "Filters background noise, focuses on medical details",
                    "Understands multiple languages simultaneously",
                    "Suggests differentials and diagnostic plans",
                    "Never replaces your judgment — just supports it",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-[#1ce881] flex items-center justify-center flex-shrink-0">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-sm text-[#475569]">{item}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleGetStarted}
                  className="px-6 py-3 rounded-full border-none cursor-pointer text-[#101235] font-semibold text-sm"
                  style={{
                    background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)",
                    boxShadow: "0 6px 24px rgba(28,232,129,0.3)",
                  }}
                >
                  Try Atlas Risk-Free
                </button>
              </div>

              {/* Console Preview */}
              <div className="rounded-2xl p-6 bg-[#101235] border border-[#334155] shadow-2xl">
                <div className="flex items-center gap-2.5 mb-5">
                  <AtlasLogo size="sm" showText={false} />
                  <span className="font-mono text-sm text-[#94a3b8]">atlas_console</span>
                </div>
                <div className="font-mono text-[13px]">
                  <p className="text-[#64748b] m-0 mb-4">// Listening to consultation...</p>

                  <div className="bg-[#1e293b] rounded-[10px] p-4 mb-3 border border-[#334155]">
                    <p className="text-[#24ffc9] m-0 mb-1 font-semibold">Speakers detected:</p>
                    <p className="text-white m-0">Dr. Chen (vet) • Maria (client) • Tech Sarah</p>
                  </div>

                  <div className="bg-[#1e293b] rounded-[10px] p-4 mb-3 border border-[#334155]">
                    <p className="text-[#24ffc9] m-0 mb-1 font-semibold">Language:</p>
                    <p className="text-white m-0">English + Spanish (bilingual conversation)</p>
                  </div>

                  <div className="bg-[#1e293b] rounded-[10px] p-4 mb-3 border border-[#334155]">
                    <p className="text-[#24ffc9] m-0 mb-2 font-semibold">Vitals (Golden Retriever, 7yr):</p>
                    <div className="grid grid-cols-2 gap-2 text-white">
                      <span>
                        HR: 88 bpm <span className="text-[#24ffc9]">✓</span>
                      </span>
                      <span>
                        RR: 22/min <span className="text-[#24ffc9]">✓</span>
                      </span>
                      <span>
                        Temp: 102°F <span className="text-[#24ffc9]">✓</span>
                      </span>
                      <span>
                        BCS: 7/9 <span className="text-[#fbbf24]">⚠</span>
                      </span>
                    </div>
                  </div>

                  <p className="text-[#24ffc9] m-0 mt-4 font-semibold">✓ SOAP ready • 3 differentials suggested</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== TESTIMONIALS ========== */}
        <section className="py-20 bg-white">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-extrabold text-[#101235] mb-3">Loved by vets</h2>
              <p className="text-[#101235] text-lg">See what clinics are saying</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  quote:
                    "I used to stay 2 hours after close doing charts. Now I'm done before I leave. It's given me my evenings back.",
                  name: "Dr. Sarah Mitchell",
                  clinic: "Companion Animal Hospital",
                  initials: "SM",
                  color: "#10b981",
                },
                {
                  quote:
                    "The suggestions are actually helpful — it caught a differential I hadn't considered. It's like having a resident looking over my shoulder.",
                  name: "Dr. James Chen",
                  clinic: "Pacific Veterinary Specialists",
                  initials: "JC",
                  color: "#0ea5e9",
                },
                {
                  quote:
                    "Half my clients speak Spanish. whiskr handles the switching seamlessly. Game changer for our practice.",
                  name: "Dr. Emily Rodriguez",
                  clinic: "Mountain View Animal Clinic",
                  initials: "ER",
                  color: "#8b5cf6",
                },
              ].map((t, i) => (
                <div key={i} className="bg-[#fafbfc] rounded-2xl p-7 border border-[#e2e8f0]">
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <svg key={j} width="20" height="20" viewBox="0 0 20 20" fill="#fbbf24">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-base text-[#475569] mb-5" style={{ lineHeight: 1.7 }}>
                    "{t.quote}"
                  </p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.initials}
                    </div>
                    <div>
                      <p className="font-semibold text-[#101235] m-0 text-[15px]">{t.name}</p>
                      <p className="text-[#101235]/70 m-0 text-sm">{t.clinic}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== PRICING ========== */}
        <section id="pricing" className="py-20 bg-[#fafbfc]">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="text-center mb-8">
              <p className="inline-block px-4 py-1.5 rounded-full bg-[#1ce881]/10 border border-[#1ce881]/30 text-[13px] font-semibold text-[#1ce881] uppercase tracking-wider mb-4">
                Pricing
              </p>
              <h2 className="text-4xl font-extrabold text-[#101235] mb-3">Simple, transparent pricing</h2>
              <p className="text-[#101235] text-lg">30-day money-back guarantee on all plans.</p>
            </div>

            {/* Toggle */}
            <div className="flex justify-center mb-12">
              <div className="inline-flex items-center gap-1 p-1.5 rounded-full bg-white border border-[#e2e8f0] shadow-sm">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-6 py-2.5 rounded-full border-none cursor-pointer font-semibold text-sm transition-all ${
                    billingPeriod === "monthly" ? "bg-[#101235] text-white" : "bg-transparent text-[#101235]"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod("yearly")}
                  className={`px-6 py-2.5 rounded-full border-none cursor-pointer font-semibold text-sm transition-all ${
                    billingPeriod === "yearly" ? "bg-[#101235] text-white" : "bg-transparent text-[#101235]"
                  }`}
                >
                  Yearly
                </button>
                {billingPeriod === "yearly" && (
                  <span
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#101235]"
                    style={{ background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)" }}
                  >
                    Launch Pricing
                  </span>
                )}
              </div>
            </div>

            {/* Cards */}
            <div className="flex gap-6 justify-center flex-wrap">
              {[
                {
                  name: "Basic",
                  monthlyPrice: "$100",
                  yearlyPrice: "$47",
                  desc: "For solo practitioners",
                  features: [
                    "SOAP, wellness & procedure notes",
                    "Atlas clinical suggestions",
                    "Multi-language support",
                    "EzyVet integration",
                    "Email support",
                  ],
                  popular: false,
                },
                {
                  name: "Pro",
                  monthlyPrice: "$200",
                  yearlyPrice: "$97",
                  desc: "For growing practices",
                  features: [
                    "Everything in Basic",
                    "Diagnostic image analysis",
                    "Speaker detection",
                    "Custom templates",
                    "Priority support",
                  ],
                  popular: true,
                },
                {
                  name: "Enterprise",
                  monthlyPrice: "Custom",
                  yearlyPrice: "Custom",
                  desc: "For hospitals & groups",
                  features: [
                    "Everything in Pro",
                    "Multi-location support",
                    "Custom integrations",
                    "Dedicated onboarding",
                    "24/7 phone support",
                  ],
                  popular: false,
                },
              ].map((plan, i) => {
                const price = billingPeriod === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
                return (
                  <div key={i} className={`flex-1 min-w-[300px] max-w-[340px] relative ${plan.popular ? "-mt-3" : ""}`}>
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                        <span
                          className="px-4 py-1.5 rounded-full text-xs font-bold text-[#101235]"
                          style={{
                            background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)",
                            boxShadow: "0 4px 15px rgba(28,232,129,0.4)",
                          }}
                        >
                          Most Popular
                        </span>
                      </div>
                    )}
                    <div
                      className={`h-full rounded-[20px] p-8 flex flex-col ${
                        plan.popular ? "bg-[#101235] border-2 border-[#1ce881]" : "bg-white border border-[#e2e8f0]"
                      }`}
                      style={{
                        boxShadow: plan.popular ? "0 20px 50px rgba(28,232,129,0.2)" : "0 2px 10px rgba(0,0,0,0.04)",
                      }}
                    >
                      <h3
                        className={`text-sm font-bold uppercase tracking-wider mb-2 ${plan.popular ? "text-[#24ffc9]" : "text-[#101235]"}`}
                      >
                        {plan.name}
                      </h3>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span
                          className={`text-[44px] font-extrabold ${plan.popular ? "text-white" : "text-[#101235]"}`}
                        >
                          {price}
                        </span>
                        {price !== "Custom" && (
                          <span className={`text-base ${plan.popular ? "text-[#94a3b8]" : "text-[#101235]"}`}>/mo</span>
                        )}
                      </div>
                      <p className={`${plan.popular ? "text-[#94a3b8]" : "text-[#101235]"} mb-1`}>{plan.desc}</p>
                      {billingPeriod === "yearly" && price !== "Custom" && (
                        <p className="text-[13px] text-[#1ce881] font-medium mb-2">Billed annually</p>
                      )}

                      <div className="flex-1 my-6">
                        {plan.features.map((feature, j) => (
                          <div key={j} className="flex items-center gap-3 mb-3.5">
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={plan.popular ? "#24ffc9" : "#1ce881"}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                            <span className={`text-[15px] ${plan.popular ? "text-[#cbd5e1]" : "text-[#101235]"}`}>
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => (plan.name === "Enterprise" ? setEnterpriseFormOpen(true) : handleGetStarted())}
                        className={`w-full py-4 rounded-xl border-none cursor-pointer font-semibold text-[15px] ${plan.popular ? "text-[#101235]" : "text-white"}`}
                        style={{
                          background: plan.popular ? "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)" : "#101235",
                        }}
                      >
                        {plan.name === "Enterprise" ? "Contact Sales" : "Start Risk-Free"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-sm text-[#101235]/70 mt-8">
              All plans include a 30-day money-back guarantee. No questions asked.
            </p>
          </div>
        </section>

        {/* ========== FAQ ========== */}
        <section id="faq" className="py-20 bg-white">
          <div className="max-w-[700px] mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-extrabold text-[#101235] mb-3">Questions & answers</h2>
            </div>

            <div className="flex flex-col gap-3">
              {[
                {
                  q: "What languages does Atlas support?",
                  a: "Atlas can understand and transcribe English, Spanish, Korean, Cantonese, Hindi, and many more. It handles bilingual conversations seamlessly — even when speakers switch mid-sentence.",
                },
                {
                  q: "How does speaker detection work?",
                  a: "Atlas uses voice recognition to distinguish between the veterinarian, technicians, and clients. This means it knows who said what, and can focus on the clinical content while filtering out small talk.",
                },
                {
                  q: "Will it replace my clinical judgment?",
                  a: "Never. whiskr is designed to support your thinking, not replace it. Atlas suggests differentials and flags things to consider, but you always make the final call. Think of it as a second set of eyes.",
                },
                {
                  q: "Is my data safe?",
                  a: "Absolutely. Your records are never shared with third parties and are never used to train AI models. All data is encrypted and stored securely. You own your data, period.",
                },
                {
                  q: "Which EHR systems do you integrate with?",
                  a: "EzyVet integration is live now. Cornerstone, AVImark, and eVetPractice are coming soon. Enterprise customers can request custom integrations.",
                },
                {
                  q: "What's your refund policy?",
                  a: "30-day money-back guarantee, no questions asked. If whiskr isn't working for you, just let us know and we'll refund you in full.",
                },
              ].map((faq, i) => (
                <div key={i} className="rounded-xl border border-[#e2e8f0] overflow-hidden bg-[#fafbfc]">
                  <button
                    onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between border-none bg-transparent cursor-pointer text-left"
                  >
                    <span className="font-semibold text-[#101235] text-base pr-4">{faq.q}</span>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1ce881"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`flex-shrink-0 transition-transform duration-200 ${activeFaq === i ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {activeFaq === i && (
                    <div className="px-6 pb-5">
                      <p className="text-[#101235] m-0 text-[15px]" style={{ lineHeight: 1.7 }}>
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== FINAL CTA ========== */}
        <section
          className="relative py-24 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #101235, #0d1a2d)" }}
        >
          {/* Background glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(28, 232, 129, 0.08) 0%, transparent 70%)" }}
          />

          <div className="relative max-w-[700px] mx-auto px-6 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium text-[#1ce881] mb-6"
              style={{
                background: "rgba(28, 232, 129, 0.1)",
                border: "1px solid rgba(28, 232, 129, 0.2)",
              }}
            >
              <Mic className="w-4 h-4" />
              Voice-first documentation
            </div>

            {/* Headline */}
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-5" style={{ lineHeight: 1.1 }}>
              Stop charting after hours.
            </h2>

            {/* Subtitle */}
            <p className="text-lg text-[#94a3b8] mb-10 max-w-[560px] mx-auto" style={{ lineHeight: 1.7 }}>
              Speak naturally during your consult — or summarize it after. Atlas handles the rest: SOAP notes,
              differentials, and EHR sync. All done before you see your next patient.
            </p>

            {/* Buttons */}
            <div className="flex flex-wrap gap-4 justify-center mb-8">
              <button
                onClick={handleGetStarted}
                className="px-10 py-[18px] rounded-full border-none cursor-pointer text-[#101235] font-semibold text-[17px] transition-all hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)",
                  boxShadow: "0 8px 30px rgba(28,232,129,0.35)",
                }}
              >
                Try whiskr Free
              </button>
              <button
                onClick={() => setVideoModalOpen(true)}
                className="flex items-center gap-2 px-10 py-[18px] rounded-full cursor-pointer bg-transparent text-white font-semibold text-[17px] transition-all hover:bg-white/5"
                style={{ border: "1px solid rgba(255, 255, 255, 0.2)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                </svg>
                See How It Works
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-6 justify-center text-sm text-[#94a3b8]">
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#1ce881">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                30-day money-back
              </span>
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#1ce881">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Cancel anytime
              </span>
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#1ce881">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                HIPAA compliant
              </span>
            </div>
          </div>
        </section>

        {/* ========== FOOTER ========== */}
        <footer className="bg-[#101235] text-white py-12 md:py-16 pb-32 md:pb-16">
          <div className="max-w-[1100px] mx-auto px-6">
            {/* Main Row: Brand + Links */}
            <div className="flex flex-col gap-10 mb-10">
              {/* Brand + Tagline */}
              <div className="flex flex-col gap-4">
                {/* Logo - same as header */}
                <Link to="/" className="flex items-center text-white no-underline">
                  <img src={whiskrTextLogo} alt="whiskr.ai" className="h-6 sm:h-7 w-auto" />
                </Link>

                {/* Tagline */}
                <p className="text-[15px] text-[#94a3b8] leading-relaxed">
                  Made with care for veterinarians,
                  <br />
                  by people who love animals.
                </p>

                {/* Email */}
                <a
                  href="mailto:support@whiskr.ai"
                  className="text-[14px] text-[#1ce881] hover:underline transition-colors"
                >
                  support@whiskr.ai
                </a>
              </div>

              {/* Links Grid - 2 columns on mobile, 3 on desktop */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-16">
                {/* Product */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748b] mb-4">Product</h4>
                  <ul className="flex flex-col gap-3 list-none p-0 m-0">
                    <li>
                      <button
                        onClick={() => scrollToSection("features")}
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0 text-left"
                      >
                        Features
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => scrollToSection("pricing")}
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0 text-left"
                      >
                        Pricing
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => scrollToSection("features")}
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0 text-left"
                      >
                        Integrations
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => setVideoModalOpen(true)}
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0 text-left"
                      >
                        Demo
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Company */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748b] mb-4">Company</h4>
                  <ul className="flex flex-col gap-3 list-none p-0 m-0">
                    <li>
                      <button
                        onClick={() => scrollToSection("how")}
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0 text-left"
                      >
                        About
                      </button>
                    </li>
                    <li>
                      <a
                        href="mailto:support@whiskr.ai"
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors no-underline"
                      >
                        Contact
                      </a>
                    </li>
                    <li>
                      <a
                        href="mailto:careers@whiskr.ai"
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors no-underline"
                      >
                        Careers
                      </a>
                    </li>
                    <li>
                      <button
                        onClick={() => scrollToSection("faq")}
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0 text-left"
                      >
                        Blog
                      </button>
                    </li>
                  </ul>
                </div>

                {/* Legal */}
                <div className="col-span-2 md:col-span-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748b] mb-4">Legal</h4>
                  <ul className="flex flex-col gap-3 list-none p-0 m-0">
                    <li>
                      <Link
                        to="/privacy"
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors no-underline"
                      >
                        Privacy Policy
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/terms"
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors no-underline"
                      >
                        Terms of Service
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/refund-policy"
                        className="text-[14px] text-[#94a3b8] hover:text-white transition-colors no-underline"
                      >
                        Refund Policy
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/10 mb-8" />

            {/* Bottom Row: Copyright + Social */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              {/* Copyright */}
              <p className="text-[13px] text-[#64748b] m-0 text-center md:text-left">
                © {new Date().getFullYear()} Whiskr Inc. All rights reserved.
              </p>

              {/* Social Icons */}
              <div className="flex items-center gap-3">
                {/* Twitter/X */}
                <a
                  href="https://twitter.com/whiskrai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-icon-link w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200"
                  aria-label="Twitter"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>

                {/* LinkedIn */}
                <a
                  href="https://linkedin.com/company/whiskrai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-icon-link w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200"
                  aria-label="LinkedIn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>

                {/* Facebook */}
                <a
                  href="https://facebook.com/whiskrai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-icon-link w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200"
                  aria-label="Facebook"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href="https://instagram.com/whiskrai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-icon-link w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200"
                  aria-label="Instagram"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* ========== MODALS ========== */}
      {videoModalOpen && (
        <div
          onClick={() => setVideoModalOpen(false)}
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[900px] rounded-2xl overflow-hidden bg-[#101235] border border-[#334155]"
          >
            <div className="flex justify-between items-center px-5 py-4 border-b border-[#334155]">
              <span className="text-white font-semibold">whiskr Demo</span>
              <button
                onClick={() => setVideoModalOpen(false)}
                className="bg-transparent border-none cursor-pointer text-[#94a3b8] p-1"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-black" style={{ aspectRatio: "16/9" }}>
              <div className="w-full h-full flex items-center justify-center text-[#64748b]">
                <p>Demo video coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {contactModalOpen && (
        <div
          onClick={() => setContactModalOpen(false)}
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[440px] rounded-[20px] overflow-hidden bg-white shadow-2xl"
          >
            <div className="p-6 bg-[#fafbfc] border-b border-[#e2e8f0]">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-[#101235] m-0 mb-1">Get Started Risk-Free</h3>
                  <p className="text-sm text-[#101235] m-0">30-day money-back guarantee</p>
                </div>
                <button
                  onClick={() => setContactModalOpen(false)}
                  className="bg-transparent border-none cursor-pointer text-[#94a3b8] p-1"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setContactModalOpen(false);
                  navigate("/signup");
                }}
              >
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#475569] mb-1.5">Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Dr. Jane Smith"
                      className="w-full px-4 py-3.5 rounded-[10px] border border-[#e2e8f0] text-[15px] outline-none focus:border-[#1ce881] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#475569] mb-1.5">Email</label>
                    <input
                      type="email"
                      required
                      placeholder="jane@clinic.com"
                      className="w-full px-4 py-3.5 rounded-[10px] border border-[#e2e8f0] text-[15px] outline-none focus:border-[#1ce881] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#475569] mb-1.5">Clinic name</label>
                    <input
                      type="text"
                      placeholder="Companion Animal Hospital"
                      className="w-full px-4 py-3.5 rounded-[10px] border border-[#e2e8f0] text-[15px] outline-none focus:border-[#1ce881] transition-colors"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full mt-6 py-4 rounded-xl border-none cursor-pointer text-[#101235] font-semibold text-base"
                  style={{ background: "linear-gradient(135deg, #1ce881 0%, #24ffc9 100%)" }}
                >
                  Start Risk-Free
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mobile CTA - floating with no background */}
      <div className="mobile-only fixed bottom-4 left-4 right-4 z-40">
        <button
          onClick={handleGetStarted}
          className="w-full py-4 rounded-2xl border-none cursor-pointer text-[#101235] font-bold text-[16px] shadow-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(28, 232, 129, 0.9) 0%, rgba(36, 255, 201, 0.9) 100%)",
            backdropFilter: "blur(10px)",
          }}
        >
          Start Risk-Free
        </button>
      </div>

      {/* Enterprise Contact Form Modal */}
      <EnterpriseContactForm open={enterpriseFormOpen} onOpenChange={setEnterpriseFormOpen} />
    </div>
  );
};

export default Index;
